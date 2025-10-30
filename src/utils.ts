export type FormParseResult = { map: Map<string, string>; obj: Record<string, string> };

export async function parseFormUrlEncoded(request: Request): Promise<FormParseResult> {
  const text = await request.text();
  const map = new Map<string, string>();
  const obj: Record<string, string> = {};
  if (!text) return { map, obj };
  const pairs = text.split("&");
  for (const pair of pairs) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    const key = decodeURIComponent(k.replace(/\+/g, "%20"));
    const val = decodeURIComponent(v.replace(/\+/g, "%20"));
    map.set(key, val);
    obj[key] = val;
  }
  return { map, obj };
}

export async function hmacSha1Base64(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return arrayBufferToBase64(sig);
}

export function timingSafeEqual(a: string, b: string): boolean {
  const lenA = a.length;
  const lenB = b.length;
  let diff = lenA ^ lenB;
  const max = Math.max(lenA, lenB);
  for (let i = 0; i < max; i++) {
    const ca = i < lenA ? a.charCodeAt(i) : 0;
    const cb = i < lenB ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

export function formatForSms(value: unknown): string {
  let s: string;
  if (typeof value === "string") s = value;
  else s = JSON.stringify(value, replacerCompact, 0) ?? "";
  if (s.length > 800) s = s.slice(0, 797) + "...";
  return s;
}

export function shortError(message: string): string {
  const s = `Error: ${message}`;
  return s.length > 800 ? s.slice(0, 797) + "..." : s;
}

function replacerCompact(_key: string, val: unknown): unknown {
  if (typeof val === "string") return val;
  return val;
}

function arrayBufferToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa is available in Workers
  return btoa(binary);
}


