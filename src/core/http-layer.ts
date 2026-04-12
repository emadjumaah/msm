import type { MSMLayer, MSMPayload, LayerMeta, LayerName } from "./types.js";

/**
 * HttpLayer — Base class for layers backed by a remote model server.
 *
 * Subclass this and implement `parseResponse` to map the server's JSON
 * response to the layer's output contract. The HTTP call, timing, and
 * error handling are handled for you.
 *
 * Works with any model serving backend: vLLM, Ollama, TGI, ONNX Runtime
 * Server, or a custom Flask/FastAPI endpoint.
 *
 * @example
 * ```ts
 * class RealTranslationLayer extends HttpLayer<TranslationOutput> {
 *   name = "translation" as const;
 *   constructor() { super("http://localhost:8000/translate"); }
 *
 *   protected buildRequestBody(payload: MSMPayload) {
 *     return { text: payload.input.raw };
 *   }
 *
 *   protected parseResponse(json: unknown, latency: number): TranslationOutput {
 *     const res = json as { text: string; source: string; confidence: number };
 *     return {
 *       translated_text: res.text,
 *       source_language: res.source,
 *       target_language: "en",
 *       layer_invoked: true,
 *       model_id: "nllb-200-600m",
 *       model_ver: "2.1",
 *       latency_ms: latency,
 *       confidence: res.confidence,
 *       status: "ok",
 *     };
 *   }
 * }
 * ```
 */
export abstract class HttpLayer<T extends LayerMeta> implements MSMLayer<T> {
  abstract name: LayerName;

  constructor(
    protected readonly endpoint: string,
    protected readonly timeoutMs: number = 10_000,
    protected readonly maxRetries: number = 2,
  ) {}

  /** Build the JSON body sent to the model server. Override in subclass. */
  protected abstract buildRequestBody(
    payload: MSMPayload,
  ): Record<string, unknown>;

  /** Map the server's response JSON to the layer output contract. */
  protected abstract parseResponse(json: unknown, latencyMs: number): T;

  async process(payload: MSMPayload): Promise<T> {
    const start = performance.now();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-MSM-Trace-ID": payload.trace_id,
            "X-MSM-Layer": this.name,
          },
          body: JSON.stringify(this.buildRequestBody(payload)),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!res.ok) {
          const body = await res.text();
          throw new Error(
            `HTTP ${res.status}: ${body.length > 200 ? body.slice(0, 200) + "…" : body}`,
          );
        }

        const json: unknown = await res.json();
        const latency = Math.round(performance.now() - start);
        return this.parseResponse(json, latency);
      } catch (err) {
        clearTimeout(timer);
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on abort (timeout) or if we've exhausted attempts
        if (attempt >= this.maxRetries || controller.signal.aborted) break;
      }
    }

    throw new Error(
      `HttpLayer(${this.endpoint}) failed after ${this.maxRetries + 1} attempt(s): ${lastError!.message}`,
    );
  }
}
