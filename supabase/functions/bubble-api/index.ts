import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
  });
}

function mcpResponse(id: unknown, result: unknown) {
  return json({ jsonrpc: "2.0", id, result });
}

function mcpError(id: unknown, code: number, message: string) {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, 200);
}

function textResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const apiKey = authHeader.replace("Bearer ", "").trim();

    if (!apiKey || !apiKey.startsWith("bub_")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid API key. Use 'Authorization: Bearer bub_...'" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash the incoming key and look it up
    const keyHash = await hashKey(apiKey);
    const { data: keyRow, error: keyError } = await supabase
      .from("api_keys")
      .select("id, user_id, permissions, revoked_at")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (keyError || !keyRow) {
      return new Response(
        JSON.stringify({ error: "Invalid or revoked API key." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update last_used_at
    supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id)
      .then(() => {});

    const url = new URL(req.url);
    const path = url.pathname.replace("/functions/v1/bubble-api", "").replace(/\/$/, "") || "/";
    const body = await req.json().catch(() => ({}));

    if (req.method === "GET" && path === "/mcp") {
      return json({
        name: "Bubble MCP connector",
        protocol: "MCP Streamable HTTP",
        endpoint: "/functions/v1/bubble-api/mcp",
        authentication: "Bearer API key",
        tools: ["bubble_list_conversations", "bubble_read_messages", "bubble_send_message"].filter((tool) =>
          tool === "bubble_send_message" ? keyRow.permissions.includes("send_message") : keyRow.permissions.includes("read_messages")
        ),
      });
    }

    if (req.method === "POST" && path === "/mcp") {
      const request = body as { id?: unknown; method?: unknown; params?: Record<string, unknown> };
      const id = request.id ?? null;
      const method = typeof request.method === "string" ? request.method : "";

      if (method === "notifications/initialized") return new Response(null, { status: 202, headers: corsHeaders });
      if (method === "initialize") {
        return mcpResponse(id, {
          protocolVersion: typeof request.params?.protocolVersion === "string" ? request.params.protocolVersion : "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "bubble-mcp", version: "1.0.0" },
        });
      }
      if (method === "ping") return mcpResponse(id, {});
      if (method === "tools/list") {
        const tools = [];
        if (keyRow.permissions.includes("read_messages")) {
          tools.push({
            name: "bubble_list_conversations",
            description: "List the authenticated Bubble user's conversations.",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
          }, {
            name: "bubble_read_messages",
            description: "Read recent messages from a Bubble conversation the user belongs to.",
            inputSchema: {
              type: "object",
              properties: {
                conversation_id: { type: "string", description: "Bubble conversation ID" },
                limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
              },
              required: ["conversation_id"],
              additionalProperties: false,
            },
          });
        }
        if (keyRow.permissions.includes("send_message")) {
          tools.push({
            name: "bubble_send_message",
            description: "Send a message to a Bubble conversation the user belongs to.",
            inputSchema: {
              type: "object",
              properties: {
                conversation_id: { type: "string", description: "Bubble conversation ID" },
                content: { type: "string", minLength: 1, maxLength: 10000 },
                message_type: { type: "string", enum: ["text", "code"] },
              },
              required: ["conversation_id", "content"],
              additionalProperties: false,
            },
          });
        }
        return mcpResponse(id, { tools });
      }
      if (method === "tools/call") {
        const params = request.params ?? {};
        const toolName = typeof params.name === "string" ? params.name : "";
        const args = params.arguments && typeof params.arguments === "object" ? params.arguments as Record<string, unknown> : {};

        if (toolName === "bubble_list_conversations") {
          if (!keyRow.permissions.includes("read_messages")) return mcpError(id, -32003, "Read permission is required.");
          const { data: convos, error: convErr } = await supabase
            .from("conversation_members")
            .select("conversation:conversations(id, name, is_group, is_self_chat, created_at)")
            .eq("user_id", keyRow.user_id)
            .is("trashed_at", null);
          if (convErr) return mcpError(id, -32000, "Could not load conversations.");
          const conversations = (convos ?? []).map((c: { conversation: unknown }) => c.conversation).filter(Boolean);
          return mcpResponse(id, textResult({ conversations }));
        }

        if (toolName === "bubble_read_messages") {
          if (!keyRow.permissions.includes("read_messages")) return mcpError(id, -32003, "Read permission is required.");
          const conversationId = typeof args.conversation_id === "string" ? args.conversation_id : "";
          const rawLimit = typeof args.limit === "number" ? args.limit : 20;
          const limit = Math.min(50, Math.max(1, Math.floor(rawLimit)));
          if (!conversationId) return mcpError(id, -32602, "conversation_id is required.");
          const { data: membership } = await supabase
            .from("conversation_members")
            .select("conversation_id")
            .eq("conversation_id", conversationId)
            .eq("user_id", keyRow.user_id)
            .maybeSingle();
          if (!membership) return mcpError(id, -32003, "You are not a member of that conversation.");
          const { data: messages, error: msgErr } = await supabase
            .from("messages")
            .select("id, sender_id, content, message_type, created_at")
            .eq("conversation_id", conversationId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (msgErr) return mcpError(id, -32000, "Could not load messages.");
          return mcpResponse(id, textResult({ messages: (messages ?? []).reverse() }));
        }

        if (toolName === "bubble_send_message") {
          if (!keyRow.permissions.includes("send_message")) return mcpError(id, -32003, "Send permission is required.");
          const conversationId = typeof args.conversation_id === "string" ? args.conversation_id : "";
          const content = typeof args.content === "string" ? args.content.trim() : "";
          const messageType = args.message_type === "code" ? "code" : "text";
          if (!conversationId || !content) return mcpError(id, -32602, "conversation_id and content are required.");
          const { data: membership } = await supabase
            .from("conversation_members")
            .select("conversation_id")
            .eq("conversation_id", conversationId)
            .eq("user_id", keyRow.user_id)
            .maybeSingle();
          if (!membership) return mcpError(id, -32003, "You are not a member of that conversation.");
          const { data: message, error: msgError } = await supabase
            .from("messages")
            .insert({ conversation_id: conversationId, sender_id: keyRow.user_id, message_type: messageType, content })
            .select("id, created_at")
            .maybeSingle();
          if (msgError || !message) return mcpError(id, -32000, "Could not send the message.");
          return mcpResponse(id, textResult({ success: true, message_id: message.id, created_at: message.created_at }));
        }

        return mcpError(id, -32601, "Unknown tool.");
      }
      return mcpError(id, -32601, "Unsupported MCP method.");
    }

    // POST /send — send a message to a conversation
    if (req.method === "POST" && (path === "/send" || path === "/messages/send")) {
      const { conversation_id, content, message_type } = body;
      if (!conversation_id || !content) {
        return new Response(
          JSON.stringify({ error: "conversation_id and content are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!keyRow.permissions.includes("send_message")) {
        return new Response(
          JSON.stringify({ error: "This API key does not have permission to send messages." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify the key owner is a member of the conversation
      const { data: membership } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("conversation_id", conversation_id)
        .eq("user_id", keyRow.user_id)
        .maybeSingle();

      if (!membership) {
        return new Response(
          JSON.stringify({ error: "You are not a member of this conversation." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: message, error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id,
          sender_id: keyRow.user_id,
          message_type: message_type ?? "text",
          content,
        })
        .select("id, created_at")
        .single();

      if (msgError) {
        return new Response(
          JSON.stringify({ error: "Failed to send message: " + msgError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message_id: message.id, created_at: message.created_at }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /conversations — list user's conversations
    if (req.method === "GET" && (path === "/conversations" || path === "/")) {
      if (!keyRow.permissions.includes("read_messages")) {
        return new Response(
          JSON.stringify({ error: "This API key does not have permission to read conversations." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: convos, error: convErr } = await supabase
        .from("conversation_members")
        .select(`
          conversation:conversations(
            id, name, is_group, is_self_chat, created_at
          )
        `)
        .eq("user_id", keyRow.user_id)
        .is("trashed_at", null);

      if (convErr) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch conversations." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const conversations = (convos ?? [])
        .map((c: any) => c.conversation)
        .filter(Boolean);

      return new Response(
        JSON.stringify({ conversations }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /messages?conversation_id=... — read recent messages
    if (req.method === "GET" && path === "/messages") {
      const conversation_id = url.searchParams.get("conversation_id");
      const limit = Math.min(50, parseInt(url.searchParams.get("limit") ?? "20"));

      if (!conversation_id) {
        return new Response(
          JSON.stringify({ error: "conversation_id query parameter is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!keyRow.permissions.includes("read_messages")) {
        return new Response(
          JSON.stringify({ error: "This API key does not have permission to read messages." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: membership } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("conversation_id", conversation_id)
        .eq("user_id", keyRow.user_id)
        .maybeSingle();

      if (!membership) {
        return new Response(
          JSON.stringify({ error: "You are not a member of this conversation." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("id, sender_id, content, message_type, created_at")
        .eq("conversation_id", conversation_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (msgErr) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch messages." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ messages: (messages ?? []).reverse() }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Unknown endpoint. Available: POST /send, GET /conversations, GET /messages",
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
