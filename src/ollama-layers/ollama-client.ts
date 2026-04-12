/**
 * Minimal Ollama HTTP client — zero dependencies.
 * Calls the Ollama /api/generate endpoint.
 */

export interface OllamaRequest {
  model: string;
  prompt: string;
  system?: string;
  format?: "json";
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}

export interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  eval_count: number;
  eval_duration: number;
}

const DEFAULT_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

const DEFAULT_TIMEOUT_MS = 30_000; // 30s per request
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 500;

/** Check if an error is transient and worth retrying */
function isTransient(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export async function ollamaGenerate(
  req: OllamaRequest,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<OllamaResponse> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, stream: false }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (isTransient(res.status) && attempt < MAX_RETRIES) {
          lastError = new Error(`Ollama error ${res.status}`);
          continue;
        }
        throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
      }

      return (await res.json()) as OllamaResponse;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Retry on network errors (e.g. ECONNRESET, AbortError from timeout)
      if (attempt < MAX_RETRIES) continue;
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("ollamaGenerate: unexpected retry exhaustion");
}
