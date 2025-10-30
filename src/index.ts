import { parseFormUrlEncoded, formatForSms, shortError } from "./utils";
import { verifyTwilioSignature, sendSms, fetchRecentMessages } from "./twilio";
import { responsesToolCall, type TranscriptMessage } from "./openai";
import { validatePayload } from "./schema";
import { callExternalApi } from "./external";

type Env = {
  OPENAI_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_NUMBER: string;
  EXTERNAL_API_URL: string;
  EXTERNAL_API_KEY?: string;
  DEDICATED_PROMPT: string;
  VERIFY_TWILIO_SIGNATURE?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method !== "POST" || url.pathname !== "/api/sms") {
        return new Response("Not Found", { status: 404 });
      }

      // Parse form preserving insertion order
      const form = await parseFormUrlEncoded(request);
      const from = form.obj["From"] || "";
      const to = form.obj["To"] || "";
      const body = (form.obj["Body"] || "").trim();

      // Optional Twilio signature verification
      if ((env.VERIFY_TWILIO_SIGNATURE || "false").toLowerCase() === "true") {
        const sig = request.headers.get("X-Twilio-Signature");
        const ok = await verifyTwilioSignature(request.url, form.map, sig, env.TWILIO_AUTH_TOKEN);
        if (!ok) return new Response("Forbidden", { status: 403 });
      }

      // STOP/CANCEL handling
      if (/^(stop|cancel)$/i.test(body)) {
        await sendSms({ TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_NUMBER: env.TWILIO_NUMBER }, from, "You have been unsubscribed. Reply START to opt back in.");
        return json({ ok: true });
      }

      // Build transcript from recent messages
      const recent = await fetchRecentMessages(
        { TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_NUMBER: env.TWILIO_NUMBER },
        from,
        env.TWILIO_NUMBER,
        10
      );
      const transcript: TranscriptMessage[] = recent.map((m) => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.body,
      }));
      transcript.push({ role: "user", content: body });

      // OpenAI tool call
      const toolResult = await responsesToolCall({ OPENAI_API_KEY: env.OPENAI_API_KEY, DEDICATED_PROMPT: env.DEDICATED_PROMPT }, transcript);

      if (toolResult.tool === "ask_user") {
        const q = toolResult.args.question;
        await sendSms({ TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_NUMBER: env.TWILIO_NUMBER }, from, clamp(q));
        return json({ ok: true, action: "asked_user" });
      }

      if (toolResult.tool === "submit_if_ready") {
        const validation = validatePayload(toolResult.args.payload);
        if (!validation.ok) {
          await sendSms({ TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_NUMBER: env.TWILIO_NUMBER }, from, clamp(validation.error));
          return json({ ok: true, action: "needs_more_info" });
        }
        const result = await callExternalApi({ EXTERNAL_API_URL: env.EXTERNAL_API_URL, EXTERNAL_API_KEY: env.EXTERNAL_API_KEY }, validation.value);
        const msg = clamp(formatForSms(result));
        await sendSms({ TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_NUMBER: env.TWILIO_NUMBER }, from, msg);
        return json({ ok: true, action: "submitted" });
      }

      // No tool call - fallback
      const fallback = toolResult.text?.trim() || "I did not get that. What is the main detail I should know?";
      await sendSms({ TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_NUMBER: env.TWILIO_NUMBER }, from, clamp(fallback));
      return json({ ok: true, action: "fallback" });
    } catch (err: any) {
      console.error(err);
      // Best-effort notify user if From is available
      try {
        const form = await parseFormUrlEncoded(request);
        const from = form.obj["From"];
        if (from) {
          await sendSms(
            { TWILIO_ACCOUNT_SID: (env as any).TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: (env as any).TWILIO_AUTH_TOKEN, TWILIO_NUMBER: (env as any).TWILIO_NUMBER },
            from,
            clamp("Something went wrong. Please try again.")
          );
        }
      } catch (_e) {}
      return json({ ok: false });
    }
  },
};

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function clamp(s: string): string {
  return s.length > 800 ? s.slice(0, 797) + "..." : s;
}


