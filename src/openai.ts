export type TranscriptMessage = { role: "system" | "user" | "assistant"; content: string };

export type OpenAIToolResult =
  | { tool: "ask_user"; args: { question: string } }
  | { tool: "submit_if_ready"; args: { payload: any } }
  | { tool: null; text: string };

export async function responsesToolCall(
  env: { OPENAI_API_KEY: string; DEDICATED_PROMPT: string },
  transcript: TranscriptMessage[]
): Promise<OpenAIToolResult> {
  const input = [
    { role: "system", content: env.DEDICATED_PROMPT },
    ...transcript,
  ];
  const body = {
    model: "gpt-4.1-mini",
    input,
    tools: [
      {
        type: "function",
        function: {
          name: "ask_user",
          description: "Ask a single short clarification question",
          parameters: {
            type: "object",
            properties: { question: { type: "string" } },
            required: ["question"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "submit_if_ready",
          description: "Submit final structured payload",
          parameters: {
            type: "object",
            properties: { payload: { type: "object" } },
            required: ["payload"],
          },
        },
      },
    ],
    temperature: 0.2,
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { tool: null, text: `OpenAI error ${res.status}: ${errText}` };
  }
  const data: any = await res.json();

  // Responses API shapes can vary; handle tool calls and plain text.
  // Prefer explicit tool calls in data.output items.
  const output = data.output ?? data.response ?? data; // be defensive
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item.type === "tool_call" && item.name && item.arguments) {
        try {
          const args = typeof item.arguments === "string" ? JSON.parse(item.arguments) : item.arguments;
          if (item.name === "ask_user" && typeof args?.question === "string") {
            return { tool: "ask_user", args: { question: args.question } };
          }
          if (item.name === "submit_if_ready" && args?.payload != null) {
            return { tool: "submit_if_ready", args: { payload: args.payload } };
          }
        } catch (_e) {
          // fallthrough
        }
      }
    }
  }
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return { tool: null, text: data.output_text.trim() };
  }
  // Fallback plain text from message-like structures
  const text = (data?.choices?.[0]?.message?.content as string) || "";
  return { tool: null, text: (text ?? "").toString() };
}


