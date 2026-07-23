import "server-only";
import type { GatewayRequest } from "@/lib/ai-gateway/types";

/**
 * Real "text" adapters (Priority 5 — real AI generation).
 *
 * These are the concrete bodies for the AI Gateway's live extension point. The
 * gateway already selects the provider, resolves the tenant's credential from
 * the Vault, and applies retry/timeout/failover — an adapter only maps the
 * request onto ONE provider's API and returns `{ output, costUsd }`.
 *
 * They live behind the gateway, so callers (story generation) are unchanged and
 * never learn a provider-specific detail. No mock output is produced here: if
 * the provider call fails the adapter throws, and the gateway fails over or
 * surfaces the error — it never invents a story.
 */

/** Opaque, provider-independent text request the gateway carries in `input`. */
export interface TextGenerationInput {
  system: string;
  prompt: string;
  /** Ask the provider for a JSON object response. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface TextGenerationOutput {
  text: string;
  provider: string;
  model: string;
}

const TIMEOUT_MS = 60_000;

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function providerError(provider: string, status: number, body: string): Error {
  // Never echo the raw body verbatim to callers — trim and strip anything that
  // might contain an echoed key. The gateway records the message on
  // provider_health; keep it short and non-sensitive.
  const snippet = body.slice(0, 200).replace(/sk-[A-Za-z0-9-_]+/g, "sk-***");
  return new Error(`${provider} responded ${status}: ${snippet}`);
}

/**
 * OpenAI Chat Completions. Uses a small, cheap default model; the cost figure
 * is a conservative estimate recorded for the cost governor (the gateway does
 * the actual api_usage write).
 */
async function executeOpenAI(
  input: TextGenerationInput,
  credential: string
): Promise<{ output: TextGenerationOutput; costUsd: number }> {
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
  const res = await withTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
      temperature: input.temperature ?? 0.8,
      max_tokens: input.maxTokens ?? 2000,
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) throw providerError("openai", res.status, await res.text());
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("openai returned an empty completion");

  // gpt-4o-mini pricing ($0.15/1M in, $0.60/1M out) — an estimate for the
  // cost governor, not billing.
  const inTok = data.usage?.prompt_tokens ?? 0;
  const outTok = data.usage?.completion_tokens ?? 0;
  const costUsd = (inTok * 0.15 + outTok * 0.6) / 1_000_000;

  return { output: { text, provider: "openai", model }, costUsd };
}

/** Google Gemini generateContent. */
async function executeGemini(
  input: TextGenerationInput,
  credential: string
): Promise<{ output: TextGenerationOutput; costUsd: number }> {
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-1.5-flash";
  const res = await withTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": credential, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: {
          temperature: input.temperature ?? 0.8,
          maxOutputTokens: input.maxTokens ?? 2000,
          ...(input.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    }
  );

  if (!res.ok) throw providerError("gemini", res.status, await res.text());
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("gemini returned an empty completion");

  // gemini-1.5-flash pricing (~$0.075/1M in, $0.30/1M out) — estimate.
  const inTok = data.usageMetadata?.promptTokenCount ?? 0;
  const outTok = data.usageMetadata?.candidatesTokenCount ?? 0;
  const costUsd = (inTok * 0.075 + outTok * 0.3) / 1_000_000;

  return { output: { text, provider: "gemini", model }, costUsd };
}

/**
 * Executes a live text request for a provider. Returns null for a provider that
 * has no real text adapter yet, so the gateway can fall through to its gated
 * error rather than pretend.
 */
export async function executeLiveText(
  provider: string,
  request: GatewayRequest,
  credential: string
): Promise<{ output: unknown; costUsd: number } | null> {
  const input = request.input as TextGenerationInput;
  switch (provider) {
    case "openai":
      return executeOpenAI(input, credential);
    case "gemini":
      return executeGemini(input, credential);
    default:
      return null;
  }
}
