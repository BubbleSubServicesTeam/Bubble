import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAYPAL_BASE = Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET") ?? "";

async function getAccessToken(): Promise<string> {
  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const resp = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PayPal auth failed: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return data.access_token;
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

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ─── STATUS CHECK (no auth needed) ───
    if (action === "status") {
      const configured = PAYPAL_CLIENT_ID !== "" && PAYPAL_CLIENT_SECRET !== "";
      return new Response(JSON.stringify({
        configured,
        mode: PAYPAL_BASE.includes("sandbox") ? "sandbox" : "live",
        clientId: PAYPAL_CLIENT_ID || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── AUTHENTICATE USER ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? null;

    // ─── VERIFY PAYPAL EMAIL ───
    // Checks if the email is a valid PayPal account by attempting to look it up
    if (action === "verify-email") {
      const body = await req.json();
      const paypalEmail = body.paypalEmail?.trim().toLowerCase();

      if (!paypalEmail || !paypalEmail.includes("@")) {
        return new Response(JSON.stringify({ error: "Valid email required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If PayPal API is not configured, do NOT save — reject the connection
      if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        return new Response(JSON.stringify({
          verified: false,
          error: "PayPal API is not configured. The app owner needs to add PayPal credentials before you can link your account.",
        }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const token = await getAccessToken();
        // Use PayPal's v2/checkout/orders to verify the payee email is valid
        // by creating a minimal order and checking if the payee is accepted
        const verifyResp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            intent: "AUTHORIZE",
            purchase_units: [{
              amount: { currency_code: "USD", value: "0.01" },
              payee: { email_address: paypalEmail },
            }],
            application_context: {
              brand_name: "Bubble",
              shipping_preference: "NO_SHIPPING",
            },
          }),
        });

        const verifyData = await verifyResp.json();

        if (verifyResp.ok) {
          // The payee email was accepted — void the test order
          if (verifyData.id) {
            await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${verifyData.id}`, {
              method: "DELETE",
              headers: { "Authorization": `Bearer ${token}` },
            }).catch(() => {});
          }

          // Save as verified
          await supabase.from("paypal_connections").upsert({
            user_id: userId,
            paypal_email: paypalEmail,
            paypal_verified: true,
          }, { onConflict: "user_id" });

          return new Response(JSON.stringify({
            verified: true,
            message: "PayPal account verified and connected.",
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          // The email might not be a valid PayPal account
          const errorMsg = verifyData.message ?? "Could not verify this PayPal email";
          return new Response(JSON.stringify({
            verified: false,
            error: errorMsg,
            details: verifyData,
          }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({
          verified: false,
          error: err.message,
        }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── GET CONNECTION STATUS ───
    if (action === "connection") {
      const { data: conn } = await supabase
        .from("paypal_connections")
        .select("paypal_email, paypal_verified, wallet_balance, connected_at")
        .eq("user_id", userId)
        .maybeSingle();

      return new Response(JSON.stringify({
        connected: !!conn?.paypal_email,
        verified: conn?.paypal_verified ?? false,
        email: conn?.paypal_email ?? null,
        balance: conn?.wallet_balance ?? 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DISCONNECT ───
    if (action === "disconnect") {
      await supabase.from("paypal_connections").delete().eq("user_id", userId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CREATE ORDER (send money) ───
    if (action === "create-order") {
      const body = await req.json();
      const amount = parseFloat(body.amount);
      const recipientPaypalEmail = body.recipientPaypalEmail?.trim().toLowerCase();
      const note = body.note ?? "";
      const currency = body.currency ?? "USD";
      const returnUrl = body.returnUrl ?? `${url.origin}/`;
      const cancelUrl = body.cancelUrl ?? `${url.origin}/`;

      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid amount" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!recipientPaypalEmail) {
        return new Response(JSON.stringify({ error: "Recipient PayPal email required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If API not configured, return demo response
      if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        return new Response(JSON.stringify({
          error: "PayPal API not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET as edge function secrets to enable real payments.",
          demo: true,
        }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = await getAccessToken();

      const orderPayload: any = {
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
          payee: {
            email_address: recipientPaypalEmail,
          },
          description: note || "Payment via Bubble",
          custom_id: `bubble_${userId}_${Date.now()}`,
        }],
        application_context: {
          brand_name: "Bubble",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      };

      const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderPayload),
      });

      const orderData = await resp.json();
      if (!resp.ok) {
        return new Response(JSON.stringify({ error: orderData.message ?? "PayPal order creation failed", details: orderData }), {
          status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Store pending transaction — sender_user_id is the sender, user_id is the recipient (will be updated on capture)
      await supabase.from("paypal_transactions").insert({
        user_id: userId, // will be updated to recipient on capture
        sender_user_id: userId,
        sender_paypal_email: userEmail,
        recipient_paypal_email: recipientPaypalEmail,
        amount,
        currency,
        paypal_transaction_id: orderData.id,
        status: "pending",
        note: note || null,
      });

      const approveLink = orderData.links?.find((l: any) => l.rel === "approve")?.href;
      return new Response(JSON.stringify({
        orderId: orderData.id,
        approveUrl: approveLink,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CAPTURE ORDER ───
    if (action === "capture-order") {
      const body = await req.json();
      const orderId = body.orderId;

      if (!orderId) {
        return new Response(JSON.stringify({ error: "Order ID required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = await getAccessToken();
      const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const captureData = await resp.json();
      if (!resp.ok) {
        await supabase.from("paypal_transactions")
          .update({ status: "failed" })
          .eq("paypal_transaction_id", orderId);
        return new Response(JSON.stringify({ error: captureData.message ?? "Capture failed", details: captureData }), {
          status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract capture details
      const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
      const capturedAmount = parseFloat(capture?.amount?.value ?? "0");
      const capturedCurrency = capture?.amount?.currency_code ?? "USD";
      const captureId = capture?.id ?? null;
      const payeeEmail = capture?.payee?.email_address
        ?? captureData.purchase_units?.[0]?.payee?.email_address;

      // Find the recipient by payee email
      let recipientUserId = userId;
      if (payeeEmail) {
        const { data: conn } = await supabase
          .from("paypal_connections")
          .select("user_id")
          .eq("paypal_email", payeeEmail)
          .maybeSingle();
        if (conn) recipientUserId = conn.user_id;
      }

      // Update transaction to completed with correct recipient
      await supabase.from("paypal_transactions")
        .update({
          status: "completed",
          user_id: recipientUserId,
          capture_id: captureId,
        })
        .eq("paypal_transaction_id", orderId);

      // Update recipient's wallet balance
      if (recipientUserId !== userId && capturedAmount > 0) {
        const { data: recipientConn } = await supabase
          .from("paypal_connections")
          .select("wallet_balance")
          .eq("user_id", recipientUserId)
          .maybeSingle();

        if (recipientConn) {
          const newBalance = (recipientConn.wallet_balance ?? 0) + capturedAmount;
          await supabase.from("paypal_connections")
            .update({ wallet_balance: newBalance })
            .eq("user_id", recipientUserId);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        amount: capturedAmount,
        currency: capturedCurrency,
        captureId,
        recipientEmail: payeeEmail,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET TRANSACTION HISTORY ───
    if (action === "transactions") {
      const { data: txs } = await supabase
        .from("paypal_transactions")
        .select("id, sender_paypal_email, recipient_paypal_email, amount, currency, status, note, created_at, capture_id")
        .or(`user_id.eq.${userId},sender_user_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(20);

      return new Response(JSON.stringify({ transactions: txs ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
