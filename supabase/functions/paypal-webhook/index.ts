import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const eventType = body?.event_type ?? body?.event_type ?? "";

    // Only process payment capture completed events
    if (eventType !== "PAYMENT.CAPTURE.COMPLETED") {
      return new Response(JSON.stringify({ received: true, event_type: eventType, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resource = body?.resource ?? {};
    const amount = parseFloat(resource?.amount?.total ?? resource?.amount?.value ?? "0");
    const currency = resource?.amount?.currency ?? "USD";
    const senderEmail = resource?.payer?.email_address ?? resource?.payer_email_address ?? null;
    const paypalTxId = resource?.id ?? body?.id ?? null;
    const note = resource?.note_to_payer ?? null;

    // Find the recipient by matching the PayPal email in custom fields or receiver
    const receiverEmail =
      resource?.payee?.email_address ??
      body?.custom_data?.recipient_email ??
      null;

    if (!receiverEmail || amount <= 0) {
      return new Response(JSON.stringify({ received: true, error: "missing receiver or amount" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the user by their connected PayPal email
    const { data: conn, error: connErr } = await supabase
      .from("paypal_connections")
      .select("user_id, wallet_balance")
      .eq("paypal_email", receiverEmail)
      .maybeSingle();

    if (connErr || !conn) {
      return new Response(JSON.stringify({ received: true, error: "no user for this paypal email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for duplicate transaction
    if (paypalTxId) {
      const { data: existing } = await supabase
        .from("paypal_transactions")
        .select("id")
        .eq("paypal_transaction_id", paypalTxId)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Insert transaction and update balance
    const { error: txErr } = await supabase.from("paypal_transactions").insert({
      user_id: conn.user_id,
      sender_paypal_email: senderEmail,
      amount,
      currency,
      paypal_transaction_id: paypalTxId,
      status: "completed",
      note,
    });

    if (txErr) {
      return new Response(JSON.stringify({ received: true, error: txErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newBalance = (conn.wallet_balance ?? 0) + amount;
    await supabase
      .from("paypal_connections")
      .update({ wallet_balance: newBalance })
      .eq("user_id", conn.user_id);

    return new Response(JSON.stringify({ received: true, processed: true, new_balance: newBalance }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
