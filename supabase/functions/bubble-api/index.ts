import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
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

function mcpJsonResponse(id: unknown, result: unknown, headers: Record<string, string> = {}) {
  return json({ jsonrpc: "2.0", id, result }, 200, headers);
}

function mcpJsonError(id: unknown, code: number, message: string, headers: Record<string, string> = {}) {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, 200, headers);
}

function textResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/** SSE-formatted response for a single JSON-RPC message */
function sseResponse(id: unknown, result: unknown, headers: Record<string, string> = {}) {
  const body = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result })}\n\n`;
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...headers,
    },
  });
}

function sseErrorResponse(id: unknown, code: number, message: string, headers: Record<string, string> = {}) {
  const body = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n\n`;
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...headers,
    },
  });
}

/** Empty SSE stream that stays open briefly for Grok to detect the transport */
function sseOpenStream(headers: Record<string, string> = {}) {
  const body = new ReadableStream({
    start(controller) {
      // Send a keep-alive comment and close — Grok expects the stream to be available
      controller.enqueue(new TextEncoder().encode(`: keep-alive\n\n`));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...headers,
    },
  });
}

interface AuthContext {
  userId: string;
  permissions: string[];
  keyId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
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
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid API key. Use 'Authorization: Bearer bub_...'" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const keyHash = await hashKey(apiKey);
    const { data: keyRow, error: keyError } = await supabase
      .from("api_keys")
      .select("id, user_id, permissions, revoked_at")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (keyError || !keyRow) {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Invalid or revoked API key." } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update last_used_at (fire and forget)
    supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id)
      .then(() => {});

    const ctx: AuthContext = { userId: keyRow.user_id, permissions: keyRow.permissions, keyId: keyRow.id };

    const url = new URL(req.url);
    const path = url.pathname.replace("/functions/v1/bubble-api", "").replace(/\/$/, "") || "/";

    // ─── MCP Streamable HTTP endpoint ───
    if (path === "/mcp") {
      // GET opens a persistent SSE stream (for server-to-client notifications)
      if (req.method === "GET") {
        return sseOpenStream();
      }

      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const request = body as { id?: unknown; method?: unknown; params?: Record<string, unknown> };
        const id = request.id ?? null;
        const method = typeof request.method === "string" ? request.method : "";
        const acceptHeader = req.headers.get("Accept") ?? "";

        // Determine response format: SSE if client accepts event-stream, otherwise JSON
        const wantsSse = acceptHeader.includes("text/event-stream");

        // Generate session ID for initialize
        const sessionId = crypto.randomUUID();
        const sessionHeaders = { "Mcp-Session-Id": sessionId };

        // notifications/initialized — just acknowledge
        if (method === "notifications/initialized") {
          return new Response(null, { status: 202, headers: { ...corsHeaders, ...sessionHeaders } });
        }

        // initialize — return protocol version, capabilities, server info
        if (method === "initialize") {
          const protocolVersion = typeof request.params?.protocolVersion === "string"
            ? request.params.protocolVersion
            : "2025-06-18";
          const result = {
            protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: "bubble-mcp", version: "1.0.0" },
          };
          if (wantsSse) return sseResponse(id, result, sessionHeaders);
          return mcpJsonResponse(id, result, sessionHeaders);
        }

        // ping
        if (method === "ping") {
          if (wantsSse) return sseResponse(id, {}, sessionHeaders);
          return mcpJsonResponse(id, {}, sessionHeaders);
        }

        // tools/list
        if (method === "tools/list") {
          const tools: unknown[] = [];
          if (ctx.permissions.includes("read_messages")) {
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
          if (ctx.permissions.includes("send_message")) {
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
          if (wantsSse) return sseResponse(id, { tools }, sessionHeaders);
          return mcpJsonResponse(id, { tools }, sessionHeaders);
        }

        // tools/call
        if (method === "tools/call") {
          const params = request.params ?? {};
          const toolName = typeof params.name === "string" ? params.name : "";
          const args = params.arguments && typeof params.arguments === "object"
            ? params.arguments as Record<string, unknown>
            : {};

          const sendResult = (result: unknown) => wantsSse ? sseResponse(id, result, sessionHeaders) : mcpJsonResponse(id, result, sessionHeaders);
          const sendError = (code: number, message: string) => wantsSse ? sseErrorResponse(id, code, message, sessionHeaders) : mcpJsonError(id, code, message, sessionHeaders);

          if (toolName === "bubble_list_conversations") {
            if (!ctx.permissions.includes("read_messages")) return sendError(-32003, "Read permission is required.");
            const { data: convos, error: convErr } = await supabase
              .from("conversation_members")
              .select("conversation:conversations(id, name, is_group, is_self_chat, created_at)")
              .eq("user_id", ctx.userId)
              .is("trashed_at", null);
            if (convErr) return sendError(-32000, "Could not load conversations.");
            const conversations = (convos ?? []).map((c: { conversation: unknown }) => c.conversation).filter(Boolean);
            return sendResult(textResult({ conversations }));
          }

          if (toolName === "bubble_read_messages") {
            if (!ctx.permissions.includes("read_messages")) return sendError(-32003, "Read permission is required.");
            const conversationId = typeof args.conversation_id === "string" ? args.conversation_id : "";
            const rawLimit = typeof args.limit === "number" ? args.limit : 20;
            const limit = Math.min(50, Math.max(1, Math.floor(rawLimit)));
            if (!conversationId) return sendError(-32602, "conversation_id is required.");
            const { data: membership } = await supabase
              .from("conversation_members")
              .select("conversation_id")
              .eq("conversation_id", conversationId)
              .eq("user_id", ctx.userId)
              .maybeSingle();
            if (!membership) return sendError(-32003, "You are not a member of that conversation.");
            const { data: messages, error: msgErr } = await supabase
              .from("messages")
              .select("id, sender_id, content, message_type, created_at")
              .eq("conversation_id", conversationId)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(limit);
            if (msgErr) return sendError(-32000, "Could not load messages.");
            return sendResult(textResult({ messages: (messages ?? []).reverse() }));
          }

          if (toolName === "bubble_send_message") {
            if (!ctx.permissions.includes("send_message")) return sendError(-32003, "Send permission is required.");
            return sendError(-32000, "Sending messages through the connector is turned off because chat messages are encrypted on each person's devices. Send from the Bubble app instead.");
          }

          return sendError(-32601, "Unknown tool.");
        }

        // Unknown method
        const sendError = wantsSse
          ? sseErrorResponse(id, -32601, "Unsupported MCP method.", sessionHeaders)
          : mcpJsonError(id, -32601, "Unsupported MCP method.", sessionHeaders);
        return sendError;
      }

      // DELETE — terminate session (no-op for stateless)
      if (req.method === "DELETE") {
        return new Response(null, { status: 200, headers: corsHeaders });
      }
    }

    // ─── REST API endpoints (legacy) ───
    if (req.method === "POST" && (path === "/send" || path === "/messages/send")) {
      return json({ error: "Sending messages through the API is turned off because chat messages are encrypted on each person's devices. Send from the Bubble app instead." }, 403);
    }

    if (req.method === "GET" && (path === "/conversations" || path === "/")) {
      if (!ctx.permissions.includes("read_messages")) return json({ error: "This API key does not have permission to read conversations." }, 403);
      const { data: convos, error: convErr } = await supabase
        .from("conversation_members")
        .select(`conversation:conversations(id, name, is_group, is_self_chat, created_at)`)
        .eq("user_id", ctx.userId)
        .is("trashed_at", null);
      if (convErr) return json({ error: "Failed to fetch conversations." }, 500);
      const conversations = (convos ?? []).map((c: any) => c.conversation).filter(Boolean);
      return json({ conversations });
    }

    if (req.method === "GET" && path === "/messages") {
      const conversation_id = url.searchParams.get("conversation_id");
      const limit = Math.min(50, parseInt(url.searchParams.get("limit") ?? "20"));
      if (!conversation_id) return json({ error: "conversation_id query parameter is required" }, 400);
      if (!ctx.permissions.includes("read_messages")) return json({ error: "This API key does not have permission to read messages." }, 403);
      const { data: membership } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("conversation_id", conversation_id)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (!membership) return json({ error: "You are not a member of this conversation." }, 403);
      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("id, sender_id, content, message_type, created_at")
        .eq("conversation_id", conversation_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (msgErr) return json({ error: "Failed to fetch messages." }, 500);
      return json({ messages: (messages ?? []).reverse() });
    }

    return json({ error: "Unknown endpoint. Available: POST /mcp, GET /mcp, POST /send, GET /conversations, GET /messages" }, 404);
  } catch (err: any) {
    return json({ error: err.message ?? "Internal error" }, 500);
  }
});
