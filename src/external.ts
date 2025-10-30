export async function callExternalApi(
  env: { EXTERNAL_API_URL: string; EXTERNAL_API_KEY?: string },
  payload: unknown
): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.EXTERNAL_API_KEY) headers["Authorization"] = `Bearer ${env.EXTERNAL_API_KEY}`;
  const res = await fetch(env.EXTERNAL_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch (_e) {
    data = { ok: false, error: `Non-JSON response (${res.status})` };
  }
  if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? data };
  return data;
}


