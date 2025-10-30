export interface Payload {
  name: string;
  email: string;
  topic: "billing" | "tech" | "sales";
  details: string;
}

export function validatePayload(o: any): { ok: true; value: Payload } | { ok: false; error: string } {
  if (o == null || typeof o !== "object") return { ok: false, error: "payload must be an object" };
  const name = (o as any).name;
  const email = (o as any).email;
  const topic = (o as any).topic;
  const details = (o as any).details;
  if (!name || typeof name !== "string" || name.trim().length < 2) return { ok: false, error: "name is required" };
  if (!email || typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "email is invalid" };
  if (topic !== "billing" && topic !== "tech" && topic !== "sales") return { ok: false, error: "topic must be billing, tech, or sales" };
  if (!details || typeof details !== "string" || details.trim().length < 3) return { ok: false, error: "details are required" };
  return { ok: true, value: { name: name.trim(), email: email.trim(), topic, details: details.trim() } };
}


