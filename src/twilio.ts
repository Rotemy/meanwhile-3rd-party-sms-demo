import { hmacSha1Base64, timingSafeEqual } from "./utils";

export type Env = {
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_NUMBER: string;
};

export async function verifyTwilioSignature(
  requestUrl: string,
  formMap: Map<string, string>,
  headerSignature: string | null,
  authToken: string
): Promise<boolean> {
  if (!headerSignature) return false;
  let base = requestUrl;
  for (const [k, v] of formMap.entries()) base += k + v;
  const computed = await hmacSha1Base64(authToken, base);
  return timingSafeEqual(computed, headerSignature);
}

export async function sendSms(env: Env, to: string, body: string): Promise<Response> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams();
  form.set("From", env.TWILIO_NUMBER);
  form.set("To", to);
  form.set("Body", body);
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
}

export type TwilioMessage = { direction: "in" | "out"; body: string; date: string };

export async function fetchRecentMessages(
  env: Env,
  userNumber: string,
  ourNumber: string,
  limit: number
): Promise<TwilioMessage[]> {
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`);
  url.searchParams.set("PageSize", "20");
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const items: any[] = data.messages ?? data.sms_messages ?? [];
  const filtered = items.filter((m) => {
    const from: string = m.from;
    const to: string = m.to;
    return (
      (from === userNumber && to === ourNumber) || (from === ourNumber && to === userNumber)
    );
  });
  filtered.sort((a, b) => new Date(a.date_created).getTime() - new Date(b.date_created).getTime());
  const mapped: TwilioMessage[] = filtered.map((m) => ({
    direction: m.from === userNumber ? "in" : "out",
    body: m.body ?? "",
    date: m.date_created ?? "",
  }));
  const last = mapped.slice(-limit);
  return last;
}


