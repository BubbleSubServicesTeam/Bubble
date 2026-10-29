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
    const path = url.pathname.replace("/functions/v1/bubble-api", "");
    const body = await req.json().catch(() => ({}));

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
