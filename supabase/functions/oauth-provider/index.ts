import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_SCOPES = ["openid", "profile", "email", "chats.read", "chats.write"]; 

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await req.text()));
  }
  const body: unknown = await req.json().catch(() => ({}));
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

function readBasicCredentials(req: Request): { clientId: string; clientSecret: string } | null {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 1) return null;
    return { clientId: decoded.slice(0, separator), clientSecret: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const path = "/" + (url.pathname.split("/").filter(Boolean).pop() ?? "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // GET /oauth/client — public details shown on the consent page
    if (path === "/client" && req.method === "GET") {
      const clientId = url.searchParams.get("client_id");
      const redirectUri = url.searchParams.get("redirect_uri");
      if (!clientId || !redirectUri) return json({ error: "invalid_request" }, 400);

      const { data: client } = await supabase
        .from("oauth_clients")
        .select("name, website_url, redirect_uris, scopes")
        .eq("client_id", clientId)
        .is("revoked_at", null)
        .maybeSingle();

      if (!client) return json({ error: "invalid_client" }, 404);
      return json({
        name: client.name,
        website_url: client.website_url,
        redirect_uri_valid: client.redirect_uris.includes(redirectUri),
        requested_redirect_uri: redirectUri,
        scopes: client.scopes.filter((scope: string) => ALLOWED_SCOPES.includes(scope)),
      });
    }

    // POST /oauth/authorize — creates an authorization code for the authenticated user
    if (path === "/authorize" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "missing_token" }, 401);

      const token = authHeader.slice(7);
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData.user) return json({ error: "invalid_token" }, 401);
      const userId = userData.user.id;

      const body = await req.json();
      const clientId: string = body.client_id;
      const redirectUri: string = body.redirect_uri;
      const requestedScopes: string[] = Array.isArray(body.scopes) ? body.scopes : ALLOWED_SCOPES;

      if (!clientId || !redirectUri) return json({ error: "invalid_request" }, 400);

      const { data: client } = await supabase
        .from("oauth_clients")
        .select("id, client_id, redirect_uris, scopes, revoked_at")
        .eq("client_id", clientId)
        .is("revoked_at", null)
        .maybeSingle();

      if (!client) return json({ error: "invalid_client" }, 404);
      if (!client.redirect_uris.includes(redirectUri)) return json({ error: "invalid_redirect_uri" }, 400);
      const scopes = requestedScopes.filter((scope) => ALLOWED_SCOPES.includes(scope) && client.scopes.includes(scope));

      const rawCode = crypto.randomUUID() + crypto.randomUUID();
      const codeHash = await sha256Hex(rawCode);

      const { error: insertErr } = await supabase.from("oauth_authorization_codes").insert({
        client_id: clientId,
        user_id: userId,
        code_hash: codeHash,
        redirect_uri: redirectUri,
        scopes,
      });

      if (insertErr) return json({ error: "server_error" }, 500);

      return json({ code: rawCode, redirect_uri: redirectUri, scopes });
    }

    // POST /oauth/token — exchanges an authorization code for an access token
    if (path === "/token" && req.method === "POST") {
      const body = await readBody(req);
      const basicCredentials = readBasicCredentials(req);
      const code = typeof body.code === "string" ? body.code : "";
      const clientId = basicCredentials?.clientId ?? (typeof body.client_id === "string" ? body.client_id : "");
      const clientSecret = basicCredentials?.clientSecret ?? (typeof body.client_secret === "string" ? body.client_secret : "");
      const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
      const grantType = typeof body.grant_type === "string" ? body.grant_type : "authorization_code";

      if (grantType !== "authorization_code" || !code || !clientId || !clientSecret || !redirectUri)
        return json({ error: "invalid_request" }, 400);

      const { data: client } = await supabase
        .from("oauth_clients")
        .select("client_id, client_secret_hash, redirect_uris, revoked_at")
        .eq("client_id", clientId)
        .is("revoked_at", null)
        .maybeSingle();

      if (!client) return json({ error: "invalid_client" }, 404);

      const secretHash = await sha256Hex(clientSecret);
      if (secretHash !== client.client_secret_hash) return json({ error: "invalid_client_secret" }, 401);
      if (!client.redirect_uris.includes(redirectUri)) return json({ error: "invalid_redirect_uri" }, 400);

      const codeHash = await sha256Hex(code);
      const { data: authCode, error: codeErr } = await supabase
        .from("oauth_authorization_codes")
        .select("id, user_id, scopes, expires_at, used_at, redirect_uri")
        .eq("code_hash", codeHash)
        .eq("client_id", clientId)
        .maybeSingle();

      if (codeErr || !authCode) return json({ error: "invalid_code" }, 400);
      if (authCode.used_at) return json({ error: "code_already_used" }, 400);
      if (new Date(authCode.expires_at) < new Date()) return json({ error: "code_expired" }, 400);
      if (authCode.redirect_uri !== redirectUri) return json({ error: "redirect_uri_mismatch" }, 400);

      await supabase.from("oauth_authorization_codes").update({ used_at: new Date().toISOString() }).eq("id", authCode.id);

      const rawToken = "bub_token_" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");
      const tokenHash = await sha256Hex(rawToken);

      await supabase.from("oauth_access_tokens").insert({
        client_id: clientId,
        user_id: authCode.user_id,
        token_hash: tokenHash,
        scopes: authCode.scopes,
      });

      return json({
        access_token: rawToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: authCode.scopes.join(" "),
      });
    }

    async function getAccessToken(requiredScope: string) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return null;
      const tokenHash = await sha256Hex(authHeader.slice(7));
      const { data: tokenRow } = await supabase
        .from("oauth_access_tokens")
        .select("user_id, scopes, expires_at, revoked_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (!tokenRow || tokenRow.revoked_at || new Date(tokenRow.expires_at) < new Date()) return null;
      if (!(tokenRow.scopes as string[]).includes(requiredScope)) return null;
      return tokenRow;
    }

    // GET /oauth/conversations — lists conversations allowed by the OAuth token
    if (path === "/conversations" && req.method === "GET") {
      const tokenRow = await getAccessToken("chats.read");
      if (!tokenRow) return json({ error: "missing_or_insufficient_scope" }, 401);
      const { data: memberships, error } = await supabase
        .from("conversation_members")
        .select("conversation:conversations(id, name, is_group, is_self_chat, created_at)")
        .eq("user_id", tokenRow.user_id)
        .is("trashed_at", null);
      if (error) return json({ error: "server_error" }, 500);
      return json({ conversations: (memberships ?? []).map((row: { conversation: unknown }) => row.conversation).filter(Boolean) });
    }

    // GET /oauth/messages — reads messages from a conversation allowed by the OAuth token
    if (path === "/messages" && req.method === "GET") {
      const tokenRow = await getAccessToken("chats.read");
      if (!tokenRow) return json({ error: "missing_or_insufficient_scope" }, 401);
      const conversationId = url.searchParams.get("conversation_id");
      const requestedLimit = Number(url.searchParams.get("limit") ?? "20");
      const limit = Math.min(50, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 20));
      if (!conversationId) return json({ error: "conversation_id_required" }, 400);
      const { data: membership } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", tokenRow.user_id)
        .maybeSingle();
      if (!membership) return json({ error: "conversation_not_available" }, 403);
      const { data: messages, error } = await supabase
        .from("messages")
        .select("id, sender_id, content, message_type, created_at")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return json({ error: "server_error" }, 500);
      return json({ messages: (messages ?? []).reverse() });
    }

    // POST /oauth/messages/send — sends a message allowed by the OAuth token
    if (path === "/messages/send" && req.method === "POST") {
      const tokenRow = await getAccessToken("chats.write");
      if (!tokenRow) return json({ error: "missing_or_insufficient_scope" }, 401);
      const body = await req.json().catch(() => ({}));
      const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
      const content = typeof body.content === "string" ? body.content.trim() : "";
      const messageType = body.message_type === "code" ? "code" : "text";
      if (!conversationId || !content || content.length > 10000) return json({ error: "invalid_message" }, 400);
      const { data: membership } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", tokenRow.user_id)
        .maybeSingle();
      if (!membership) return json({ error: "conversation_not_available" }, 403);
      const { data: message, error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: tokenRow.user_id, message_type: messageType, content })
        .select("id, created_at")
        .maybeSingle();
      if (error || !message) return json({ error: "server_error" }, 500);
      return json({ message_id: message.id, created_at: message.created_at });
    }

    // GET /oauth/userinfo — returns user info for a given access token
    if (path === "/userinfo" && req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "missing_token" }, 401);

      const token = authHeader.slice(7);
      const tokenHash = await sha256Hex(token);

      const { data: tokenRow } = await supabase
        .from("oauth_access_tokens")
        .select("user_id, scopes, expires_at, revoked_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (!tokenRow) return json({ error: "invalid_token" }, 401);
      if (tokenRow.revoked_at) return json({ error: "token_revoked" }, 401);
      if (new Date(tokenRow.expires_at) < new Date()) return json({ error: "token_expired" }, 401);

      const scopes: string[] = tokenRow.scopes;
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, avatar_url")
        .eq("user_id", tokenRow.user_id)
        .maybeSingle();

      if (!profile) return json({ error: "user_not_found" }, 404);

      const userInfo: Record<string, unknown> = { sub: profile.user_id };
      if (scopes.includes("profile")) {
        userInfo.name = profile.display_name;
        userInfo.given_name = profile.first_name;
        userInfo.family_name = profile.last_name;
        userInfo.picture = profile.avatar_url;
      }

      if (scopes.includes("email")) {
        const { data: authUser } = await supabase.auth.admin.getUserById(tokenRow.user_id);
        if (authUser?.user?.email) userInfo.email = authUser.user.email;
      }

      return json(userInfo);
    }

    // GET /oauth/.well-known/openid-configuration — discovery document for OIDC clients
    if (path === "/openid-configuration" && req.method === "GET") {
      const appOrigin = Deno.env.get("APP_ORIGIN") ?? "https://advanced-communicati-vwct.bolt.host";

      const issuer = `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-provider`;
      return json({
        issuer,
        authorization_endpoint: `${appOrigin.replace(/\/$/, "")}/oauth/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        scopes_supported: ALLOWED_SCOPES,
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
        claims_supported: ["sub", "name", "given_name", "family_name", "picture", "email"],
      });
    }

    // GET /oauth/jwks — no signing keys are published because tokens are opaque
    if (path === "/jwks" && req.method === "GET") return json({ keys: [] });

    return json({ error: "not_found" }, 404);
  } catch {
    return json({ error: "server_error" }, 500);
  }
});
