import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { webpush } from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0CgjvFHAZGRMKjWV-2shrmZ-dJVfTY7AaJRmCiGZrAs2oMnLc_EYwkf4BhWrujgdPuAS8djOtGkjMK5vi7osQA";
const VAPID_PRIVATE_KEY = "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg0hc8xqJA7lwgOWNGE7s2cHpGYFHkbn5av6YoycXDAPmhRANCAATQKCO8UcBkZEwqNZX7ayGuZn50lV9NjsBolGYKIZmsCzagyctz8RjCR_gGFau6OB0-4BLx2M60aSMwrm-LuixA";

webpush.setVapidDetails(
  "mailto:support@bubble.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

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

    const url = new URL(req.url);
    const path = url.pathname.replace("/functions/v1/send-push", "");

    // GET /vapid-key — return the public VAPID key so the browser can subscribe
    if (req.method === "GET" && path === "/vapid-key") {
      return new Response(
        JSON.stringify({ publicKey: VAPID_PUBLIC_KEY }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /send — send a push notification to all of a user's devices
    if (req.method === "POST" && (path === "/send" || path === "")) {
      const { recipient_id, sender_id, title, body, tag, data } = await req.json();

      if (!recipient_id || !title) {
        return new Response(
          JSON.stringify({ error: "recipient_id and title are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (sender_id) {
        const { data: pref } = await supabase
          .from("contact_preferences")
          .select("priority")
          .eq("user_id", recipient_id)
          .eq("contact_id", sender_id)
          .maybeSingle();
        if (pref?.priority === "silenced") {
          return new Response(
            JSON.stringify({ sent: 0, reason: "silenced" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const { data: subs, error: subErr } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh_key, auth_key, device_type")
        .eq("user_id", recipient_id);

      if (subErr || !subs || subs.length === 0) {
        return new Response(
          JSON.stringify({ sent: 0, reason: "no_subscriptions" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: privacy } = await supabase
        .from("profiles")
        .select("push_show_preview, push_show_sender")
        .eq("user_id", recipient_id)
        .maybeSingle();
      const showPreview = privacy?.push_show_preview !== false;
      const showSender = privacy?.push_show_sender !== false;

      const payload = JSON.stringify({
        title: showSender ? title : "Bubble",
        body: showPreview ? (body ?? "") : "New message",
        tag: tag ?? "bubble-notification",
        data: data ?? {},
      });

      const results: { endpoint: string; success: boolean; error?: string }[] = [];
      const deadEndpoints: string[] = [];

      for (const sub of subs) {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh_key,
            auth: sub.auth_key,
          },
        };

        try {
          await webpush.sendNotification(pushSub, payload, {
            TTL: 86400,
            urgency: "high",
          });
          results.push({ endpoint: sub.endpoint, success: true });
        } catch (err: any) {
          const status = err?.statusCode ?? 0;
          // 404 = subscription expired, 410 = subscription gone — clean these up
          if (status === 404 || status === 410) {
            deadEndpoints.push(sub.endpoint);
          }
          results.push({ endpoint: sub.endpoint, success: false, error: err?.message ?? "unknown" });
        }
      }

      // Clean up dead subscriptions
      if (deadEndpoints.length > 0) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .in("endpoint", deadEndpoints);
      }

      const sent = results.filter((r) => r.success).length;
      return new Response(
        JSON.stringify({ sent, total: subs.length, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown endpoint. Available: GET /vapid-key, POST /send" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
