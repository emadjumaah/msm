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

export async function ollamaGenerate(
  req: OllamaRequest,
  baseUrl = DEFAULT_BASE_URL,
): Promise<OllamaResponse> {
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, stream: false }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as OllamaResponse;
}
