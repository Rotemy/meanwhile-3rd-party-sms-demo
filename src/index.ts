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

      // Parse form preserving insertion order
      const form = await parseFormUrlEncoded(request);
      const from = form.obj["From"] || "";
      const body = (form.obj["Body"] || "").trim();

      // Mock route for testing external API
      if (url.pathname === "/test/external-api") {
        const pdfURL = "https://www.google.com/pdf";
        return json({ ok: true, value:pdfURL });
      }

      if (request.method !== "POST" || url.pathname !== "/api/sms") {
        return new Response("Not Found", { status: 404 });
      }

      // Optional Twilio signature verification
      if ((env.VERIFY_TWILIO_SIGNATURE || "false").toLowerCase() === "true") {
        const sig = request.headers.get("X-Twilio-Signature");
        const ok = await verifyTwilioSignature(request.url, form.map, sig, env.TWILIO_AUTH_TOKEN);
        if (!ok) return new Response("Forbidden", { status: 403 });
      }

      // Build transcript from recent messages
      const recent = await fetchRecentMessages(
        { TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_NUMBER: env.TWILIO_NUMBER },
        from,
        env.TWILIO_NUMBER,
        100
      );
      let transcript: TranscriptMessage[] = recent.map((m) => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.body,
      }));
      transcript.push({ role: "user", content: body });

      // transcript = [
      //   { role: 'user', content: 'Hello' },
      //   { role: 'user', content: 'Hello' },
      //   { role: 'user', content: 'Hi' },
      //   { role: 'user', content: "I'm 28" },
      //   { role: 'user', content: 'From Israel' },
      //   { role: 'user', content: 'Hello' },
      //   { role: 'assistant', content: 'OK' },
      //   { role: 'user', content: 'Hello' },
      //   {
      //     role: 'assistant',
      //     content: 'Sent from your Twilio trial account - What is your gender? Please answer male or female.'
      //   },
      //   { role: 'user', content: 'Hello' },
      //   {
      //     role: 'assistant',
      //     content: 'Sent from your Twilio trial account - What is your gender? Please answer male or female.'
      //   },
      //   { role: 'user', content: 'Male' },
      //   {
      //     role: 'assistant',
      //     content: 'Sent from your Twilio trial account - OK'
      //   },
      //   {
      //     role: 'assistant',
      //     content: 'Sent from your Twilio trial account - Do you smoke? Please answer yes or no.'
      //   },
      //   { role: 'user', content: 'No' }
      // ];

      console.log("transcript", transcript);

      // OpenAI tool call
      const toolResult = await responsesToolCall({ OPENAI_API_KEY: env.OPENAI_API_KEY, DEDICATED_PROMPT: env.DEDICATED_PROMPT }, transcript);

      console.log("toolResult", toolResult);

      if (toolResult.tool === "ask_user") {
        const q = toolResult.args.question;
        await sendSms({ TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_NUMBER: env.TWILIO_NUMBER }, from, clamp(q));
      }

      if (toolResult.tool === "submit_if_ready") {
        const validation = validatePayload(toolResult.args);
        if (!validation.ok) {
          await sendSms({ TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_NUMBER: env.TWILIO_NUMBER }, from, clamp(validation.error));
        }
        else {
          const result = await callExternalApi({ EXTERNAL_API_URL: env.EXTERNAL_API_URL, EXTERNAL_API_KEY: env.EXTERNAL_API_KEY }, validation.value);
          const msg = clamp(formatForSms(result.value));
          await sendSms({ TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN, TWILIO_NUMBER: env.TWILIO_NUMBER }, from, msg);
        }
      }

      return new Response("", { status: 200 });

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


