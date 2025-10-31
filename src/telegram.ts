export type Env = {
  TELEGRAM_BOT_TOKEN: string;
};

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    date: number;
    text?: string;
  };
}

export async function sendTelegramMessage(
  env: Env,
  chatId: number,
  text: string
): Promise<Response> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text,
  };
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export function parseTelegramUpdate(body: unknown): TelegramUpdate | null {
  try {
    const update = body as TelegramUpdate;
    if (update && typeof update.update_id === "number") {
      return update;
    }
    return null;
  } catch {
    return null;
  }
}

