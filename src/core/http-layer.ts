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
  ) {}

  /** Build the JSON body sent to the model server. Override in subclass. */
  protected abstract buildRequestBody(
    payload: MSMPayload,
  ): Record<string, unknown>;

  /** Map the server's response JSON to the layer output contract. */
  protected abstract parseResponse(json: unknown, latencyMs: number): T;

  async process(payload: MSMPayload): Promise<T> {
    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.buildRequestBody(payload)),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const json: unknown = await res.json();
      const latency = Math.round(performance.now() - start);
      return this.parseResponse(json, latency);
    } catch (err) {
      const latency = Math.round(performance.now() - start);
      return {
        model_id: "http-error",
        model_ver: "0.0.0",
        latency_ms: latency,
        confidence: 0,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      } as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
