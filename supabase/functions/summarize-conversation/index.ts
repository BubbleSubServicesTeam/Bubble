import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

    // Authenticate via JWT from the Authorization header
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, start_date, end_date } = await req.json();
    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify membership
    const { data: membership } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("conversation_id", conversation_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "You are not a member of this conversation." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch messages in date range
    let query = supabase
      .from("messages")
      .select(`
        id, sender_id, content, message_type, gif_url, file_name, created_at,
        sender:profiles!messages_profile_sender_id_fkey(display_name, first_name, last_name)
      `)
      .eq("conversation_id", conversation_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (start_date) query = query.gte("created_at", start_date);
    if (end_date) query = query.lte("created_at", end_date);

    const { data: messages, error: msgError } = await query;

    if (msgError) {
      return new Response(JSON.stringify({ error: "Failed to fetch messages" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({
        summary: "No messages were sent in this time period.",
        messageCount: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format messages for the AI
    const formattedMessages = messages.map((m: any) => {
      const name = m.sender?.display_name
        || [m.sender?.first_name, m.sender?.last_name].filter(Boolean).join(" ")
        || "Someone";
      let text = "";
      switch (m.message_type) {
        case "text": text = m.content ?? ""; break;
        case "gif": text = "[Sent a GIF]"; break;
        case "image": text = "[Sent a photo]"; break;
        case "voicemail": text = "[Left a voicemail]"; break;
        case "file": text = `[Sent a file: ${m.file_name ?? "file"}]`; break;
        case "poll": text = "[Sent a poll]"; break;
        case "form": text = "[Sent a form]"; break;
        case "money": text = `[Sent money: ${m.content}]`; break;
        case "code": text = `[Shared code]`; break;
        case "iframe": text = `[Shared an embed: ${m.file_name ?? "link"}]`; break;
        default: text = m.content ?? `[${m.message_type}]`;
      }
      const time = new Date(m.created_at).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      return `${time} - ${name}: ${text}`;
    }).join("\n");

    // Get conversation info
    const { data: conv } = await supabase
      .from("conversations")
      .select("name, is_group, is_self_chat")
      .eq("id", conversation_id)
      .maybeSingle();

    const convName = conv?.is_self_chat ? "My Notes" : conv?.is_group ? (conv.name || "Group Chat") : "Direct Chat";

    const dateRangeLabel = start_date && end_date
      ? `${new Date(start_date).toLocaleDateString()} to ${new Date(end_date).toLocaleDateString()}`
      : start_date
        ? `since ${new Date(start_date).toLocaleDateString()}`
        : "all time";

    // Build prompt
    const systemPrompt = `You are a thoughtful assistant that summarizes chat conversations into a narrative summary. Write it like a short story recap that someone could read to understand what happened — not a list.

Tell the story of what went on. Mention specific people by name and what they said, felt, or did. Capture the emotional tone, important events, and how things developed over the conversation.

For example, instead of writing "Discussed family and finances," write something like: "Sarah's aunt passed away and she's been really struggling. She opened up about how hard it's been emotionally and mentioned she needs help covering the funeral costs. Jake and Maria rallied around her, offering to help organize a fundraiser and chip in what they can. The conversation was heavy but full of love and support."

Rules:
- Write 2-4 natural paragraphs in plain text — no markdown, no bullet points, no headers
- Use real names, real details, and real emotions from the messages
- Capture the narrative arc — what happened, how people reacted, where things stand
- Start directly with the story — no "Here's a summary:" or preamble
- Keep it conversational and human, like you're telling a friend what they missed`;

    const userPrompt = `Conversation: ${convName}
Time period: ${dateRangeLabel}
Total messages: ${messages.length}

Messages:
${formattedMessages}

Summarize this conversation:`;

    // Call AI API - try multiple providers
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    let summary = "";

    if (openaiKey) {
      try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 600,
            temperature: 0.3,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          summary = data.choices?.[0]?.message?.content?.trim() ?? "";
        }
      } catch { /* fall through */ }
    }

    if (!summary && geminiKey) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
            generationConfig: { maxOutputTokens: 600, temperature: 0.3 },
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        }
      } catch { /* fall through */ }
    }

    if (!summary) {
      // Fallback: generate a basic local summary
      const senders = new Map<string, number>();
      let textCount = 0;
      let mediaCount = 0;
      for (const m of messages as any[]) {
        const name = m.sender?.display_name
          || [m.sender?.first_name, m.sender?.last_name].filter(Boolean).join(" ")
          || "Someone";
        senders.set(name, (senders.get(name) ?? 0) + 1);
        if (m.message_type === "text") textCount++;
        else mediaCount++;
      }

      const senderList = [...senders.entries()].map(([name, count]) => `${name} (${count})`).join(", ");
      const firstMsg = new Date(messages[0].created_at).toLocaleDateString();
      const lastMsg = new Date(messages[messages.length - 1].created_at).toLocaleDateString();

      summary = `Between ${firstMsg} and ${lastMsg}, ${messages.length} messages were exchanged in "${convName}" by ${senderList}. ${textCount} were text messages and ${mediaCount} included photos, GIFs, files, or voicemails. Read the full conversation below to see what everyone talked about.`;
    }

    return new Response(JSON.stringify({
      summary,
      messageCount: messages.length,
      dateRange: { start: start_date, end: end_date },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
