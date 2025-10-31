import { formatForSms } from "./utils";
import { sendTelegramMessage, parseTelegramUpdate, type TelegramUpdate } from "./telegram";
import { responsesToolCall, type TranscriptMessage } from "./openai";
import { validatePayload } from "./schema";
import { callExternalApi } from "./external";

// KVNamespace type definition for Cloudflare Workers
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

type Env = {
  OPENAI_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  EXTERNAL_API_URL: string;
  EXTERNAL_API_KEY?: string;
  DEDICATED_PROMPT: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  SESSIONS: KVNamespace;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Mock route for testing external API
      if (url.pathname === "/test/external-api") {
        const pdfURL = "https://www.google.com/pdf";
        return json({ ok: true, value: pdfURL });
      }

      if (request.method !== "POST" || url.pathname !== "/telegram/webhook") {
        return new Response("Not Found", { status: 404 });
      }

      const header = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (header !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }

      // Parse Telegram update
      const body = await request.json();
      const update = parseTelegramUpdate(body);

      if (!update || !update.message || !update.message.text) {
        return json({ ok: true });
      }

      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text!.trim();

      // Load chat history from KV
      const raw = await env.SESSIONS.get(`chat:${chatId}`);
      let convo: TranscriptMessage[] = raw ? JSON.parse(raw) : [];

      // Append new user message
      convo.push({ role: "user", content: text });

      // console.log("transcript", convo);

      // OpenAI tool call
      const toolResult = await responsesToolCall(
        { OPENAI_API_KEY: env.OPENAI_API_KEY, DEDICATED_PROMPT: env.DEDICATED_PROMPT },
        convo
      );

      // console.log("toolResult", toolResult);

      let responseText = "";

      if (toolResult.tool === "ask_user") {
        responseText = clamp(toolResult.args.question);
        convo.push({ role: "assistant", content: responseText });
      } else if (toolResult.tool === "submit_if_ready") {
        const validation = validatePayload(toolResult.args);
        if (!validation.ok) {
          responseText = clamp(validation.error);
          convo.push({ role: "assistant", content: responseText });
        } else {
          // Uncomment to call external API
          // const result = await callExternalApi({ EXTERNAL_API_URL: env.EXTERNAL_API_URL, EXTERNAL_API_KEY: env.EXTERNAL_API_KEY }, validation.value);
          // responseText = clamp(formatForSms(result.value));
          responseText = "https://www.google.com/pdf";
          convo = [];
        }
      } else if (toolResult.tool === null && toolResult.text) {
        responseText = clamp(toolResult.text);
        convo.push({ role: "assistant", content: responseText });
      }

      // Save updated conversation back to KV
      await env.SESSIONS.put(`chat:${chatId}`, JSON.stringify(convo));

      // console.log("responseText", responseText);
      //console.log("chatId", chatId)

      // Send response via Telegram
      if (responseText) {
        const res = await sendTelegramMessage(env, chatId, responseText);
        //console.log("res", res);
      }

      return json({ ok: true });
    } catch (err: any) {
      console.error(err);
      // Best-effort notify user if chatId is available
      try {
        const body = await request.json();
        const update = parseTelegramUpdate(body);
        if (update?.message?.chat?.id) {
          await sendTelegramMessage(
            env,
            update.message.chat.id,
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
