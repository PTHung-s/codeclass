/**
 * Shared LLM client — OpenAI-compatible chat completions with provider fallback.
 *
 * Provider config comes from the system settings service (DB overrides, admin-editable)
 * with environment variables as fallback:
 *   Primary : vilao.ai   (VILAO_API_KEY / VILAO_BASE_URL / VILAO_MODEL)
 *   Fallback: DeepSeek   (DEEPSEEK_API_KEY / DEEPSEEK_API_URL / DEEPSEEK_FALLBACK_MODEL)
 *
 * Every call tries the primary first. On any failure — network error, HTTP
 * error, or an empty completion — it automatically retries once against the
 * fallback provider.
 */
import axios from "axios";
import { getCachedLlmConfig } from "../services/systemSettings";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMChatOptions {
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" } | { type: "text" };
  timeoutMs?: number;
  /** Override the primary provider's model for this call only. */
  model?: string;
}

export interface LLMChatResult {
  content: string;
  provider: "primary" | "fallback";
  model: string;
}

interface Provider {
  label: "primary" | "fallback";
  url: string;
  apiKey: string;
  model: string;
}

function getProviders(): Provider[] {
  const cfg = getCachedLlmConfig();
  const providers: Provider[] = [];

  const ordered = cfg.primary === "deepseek"
    ? [cfg.deepseek, cfg.vilao]
    : [cfg.vilao, cfg.deepseek];

  const [first, second] = ordered;
  if (first?.apiKey) {
    providers.push({
      label: "primary",
      url: first.baseUrl,
      apiKey: first.apiKey,
      model: first.model,
    });
  }
  if (second?.apiKey) {
    providers.push({
      label: "fallback",
      url: second.baseUrl,
      apiKey: second.apiKey,
      model: second.model,
    });
  }

  return providers;
}

/** True when at least one LLM provider is configured. */
export function hasLLM(): boolean {
  return getProviders().length > 0;
}

/**
 * Chat completion with automatic provider fallback.
 * Returns null only when every configured provider fails.
 */
export async function chatCompletion(
  messages: LLMMessage[],
  opts: LLMChatOptions = {},
): Promise<LLMChatResult | null> {
  const providers = getProviders();
  if (providers.length === 0) return null;

  let lastError: unknown = null;
  for (const provider of providers) {
    const model = provider.label === "primary" && opts.model ? opts.model : provider.model;
    try {
      const response = await axios.post(
        provider.url,
        {
          model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.max_tokens ?? 1024,
          ...(opts.response_format ? { response_format: opts.response_format } : {}),
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          timeout: opts.timeoutMs ?? 30000,
        },
      );
      const content = response.data?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim().length > 0) {
        return { content, provider: provider.label, model };
      }
      lastError = new Error(`${provider.label} returned empty content`);
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[llm] ${provider.label} provider failed:`,
        err?.response?.status || err?.message,
      );
    }
  }

  console.error("[llm] all providers failed:", (lastError as any)?.message || lastError);
  return null;
}
