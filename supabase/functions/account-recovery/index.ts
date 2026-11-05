import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPPORT_USER_ID = "712e43e1-6b80-4ab8-b8ec-985192e85df0";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function resolveAccountId(email: string): Promise<string | null> {
  const { data, error } = await admin.rpc("find_auth_user_by_email", { p_email: email });
  if (error) throw error;
  return (data as string | null) ?? null;
}

async function resolveRecipientId(identifier: string): Promise<string | null> {
  if (UUID_PATTERN.test(identifier)) return identifier.toLowerCase();
  if (identifier.includes("@")) return resolveAccountId(identifier);
  const { data, error } = await admin
    .from("profiles")
    .select("user_id")
    .ilike("display_name", identifier)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.user_id ?? null;
}

async function hasTrustedContacts(ownerId: string): Promise<boolean> {
  const { count, error } = await admin
    .from("trusted_contacts")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function findOrCreateSupportConversation(recipientId: string): Promise<string> {
  const { data: supportRows, error: supportErr } = await admin
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", SUPPORT_USER_ID);
  if (supportErr) throw supportErr;

  const supportConvIds = (supportRows ?? []).map((r) => r.conversation_id);
  if (supportConvIds.length > 0) {
    const { data: shared, error: sharedErr } = await admin
      .from("conversation_members")
      .select("conversation_id, conversations!inner(is_group, is_self_chat)")
      .eq("user_id", recipientId)
      .in("conversation_id", supportConvIds);
    if (sharedErr) throw sharedErr;
    const direct = (shared ?? []).find((row: any) => !row.conversations.is_group && !row.conversations.is_self_chat);
    if (direct) return direct.conversation_id;
  }

  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .insert({ created_by: SUPPORT_USER_ID, is_group: false })
    .select("id")
    .single();
  if (convErr) throw convErr;

  const { error: memErr } = await admin.from("conversation_members").insert([
    { conversation_id: conv.id, user_id: SUPPORT_USER_ID },
    { conversation_id: conv.id, user_id: recipientId },
  ]);
  if (memErr) throw memErr;
  return conv.id;
}

function isSafeRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body?.action;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 320 || !email.includes("@")) {
      return json({ error: "Enter the email address for the account." }, 400);
    }

    const ownerId = await resolveAccountId(email);

    if (action === "trusted_status") {
      const available = ownerId ? await hasTrustedContacts(ownerId) : false;
      return json({ hasTrustedContacts: available });
    }

    if (action !== "send_reset") {
      return json({ error: "Unknown request." }, 400);
    }

    const recipientInput = typeof body?.recipient === "string" ? body.recipient.trim() : "";
    const redirectTo = typeof body?.redirectTo === "string" ? body.redirectTo : "";
    if (!recipientInput || recipientInput.length > 200) {
      return json({ error: "Enter the username, email, or user ID of a trusted person." }, 400);
    }
    if (!isSafeRedirect(redirectTo)) {
      return json({ error: "Could not build the reset link." }, 400);
    }

    if (!ownerId) {
      return json({ ok: true });
    }

    const recipientId = await resolveRecipientId(recipientInput);
    if (!recipientId) {
      return json({ error: "No Bubble user matches that username, email, or user ID." }, 404);
    }

    const { data: trust, error: trustErr } = await admin
      .from("trusted_contacts")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("trusted_user_id", recipientId)
      .maybeSingle();
    if (trustErr) throw trustErr;
    if (!trust) {
      return json({ error: "That person is not one of this account's trusted people." }, 403);
    }

    const { data: owner, error: ownerErr } = await admin
      .from("profiles")
      .select("display_name, first_name")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (ownerErr) throw ownerErr;
    const ownerName = owner?.first_name || owner?.display_name || "a Bubble user";

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr) throw linkErr;
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) throw new Error("Reset link was not generated");

    const conversationId = await findOrCreateSupportConversation(recipientId);
    const content =
      `${ownerName} forgot their Bubble password and chose you as a trusted person to help them recover the account.\n\n` +
      `Please send this reset link to the email address ${ownerName} used for Bubble:\n${actionLink}\n\n` +
      `Only share it with that person. Anyone who opens the link can set a new password for the account.`;

    const { error: msgErr } = await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: SUPPORT_USER_ID,
      message_type: "text",
      content,
    });
    if (msgErr) throw msgErr;

    return json({ ok: true });
  } catch (err) {
    console.error("account-recovery failed", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
