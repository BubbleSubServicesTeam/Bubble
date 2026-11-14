import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

if (Deno.env.get("DENO_ENV") === "development") {
  // noop
}

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Consume the token (single-use, atomic)
    const { data: userId, error: consumeError } = await adminClient
      .rpc("consume_qr_login_token", { p_token: token });

    if (consumeError || !userId) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired login code" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get the user's email from admin API
    const { data: userRecord, error: userError } = await adminClient.auth.admin.getUserById(userId);

    if (userError || !userRecord?.user?.email) {
      return new Response(
        JSON.stringify({ error: "Account not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const email = userRecord.user.email;

    // Generate a magic link (OTP) for this user that the frontend can use to sign in
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError || !linkData?.properties?.action_link) {
      return new Response(
        JSON.stringify({ error: "Could not generate login session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract the token_hash from the action link — the frontend can use verifyOtp with this
    const actionLink = linkData.properties.action_link;
    const linkUrl = new URL(actionLink);
    const tokenHash = linkUrl.searchParams.get("token_hash") || linkUrl.searchParams.get("token");
    const linkType = linkData.properties.type || "magiclink";

    return new Response(
      JSON.stringify({
        email,
        token_hash: tokenHash,
        type: linkType,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
};
