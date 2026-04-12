import { randomUUID } from "node:crypto";
import type {
  MSMPayload,
  MSMLayer,
  MSMInput,
  LayerName,
  LayerMeta,
  TranslationOutput,
  GenerationOutput,
  ValidationOutput,
  FinalOutput,
  MSMHook,
  HookPoint,
  HookOutput,
} from "./types.js";
import type { MSMManifest } from "./manifest.js";

// ─── Trace ───────────────────────────────────────────────────

export interface TraceEntry {
  layer: LayerName | string; // string for hooks (e.g. "hook:image_recognition")
  model_id: string;
  latency_ms: number;
  confidence: number;
  status: string;
  error?: string;
}

export interface PipelineTrace {
  trace_id: string;
  session_id: string;
  timestamp: string;
  total_latency_ms: number;
  entries: TraceEntry[];
  payload: MSMPayload;
}

// ─── Pipeline Options ────────────────────────────────────────

export interface PipelineOptions {
  /** Max retries when validation returns action "retry" (default: 1) */
  maxRetries?: number;
}

// ─── Fallback response when pipeline cannot produce output ───

const FALLBACK_RESPONSE =
  "I'm sorry, I wasn't able to process your request. Please try again.";

// ─── Pipeline Engine ─────────────────────────────────────────

export class Pipeline {
  private layers = new Map<LayerName, MSMLayer>();
  private hooks: MSMHook[] = [];
  private manifest: MSMManifest | null = null;
  private options: Required<PipelineOptions>;

  constructor(options?: PipelineOptions) {
    this.options = { maxRetries: options?.maxRetries ?? 1 };
  }

  /** Register a layer implementation */
  register(layer: MSMLayer): void {
    this.layers.set(layer.name, layer);
  }

  /** Swap a single layer at runtime */
  swap(layer: MSMLayer): void {
    this.layers.set(layer.name, layer);
  }

  /** Add a hook — runs before or after a core layer */
  addHook(hook: MSMHook): void {
    this.hooks.push(hook);
  }

  /** Attach a manifest for metadata */
  setManifest(manifest: MSMManifest): void {
    this.manifest = manifest;
  }

  /** Run all hooks for a given point, recording results in payload and trace */
  private async runHooks(
    point: HookPoint,
    payload: MSMPayload,
    entries: TraceEntry[],
  ): Promise<void> {
    const matching = this.hooks.filter((h) => h.point === point);
    for (const hook of matching) {
      let result: HookOutput;
      try {
        result = await hook.process(payload);
      } catch (err) {
        result = {
          model_id: "hook-error",
          model_ver: "0.0.0",
          latency_ms: 0,
          confidence: 0,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          data: {},
        };
      }
      // Store hook output in payload
      if (!payload.hooks) payload.hooks = {};
      payload.hooks[hook.name] = result;

      entries.push({
        layer: `hook:${hook.name}`,
        model_id: result.model_id,
        latency_ms: result.latency_ms,
        confidence: result.confidence,
        status: result.status,
        error: result.error,
      });
    }
  }

  /** Run the full pipeline */
  async run(input: MSMInput, sessionId?: string): Promise<PipelineTrace> {
    const traceId = randomUUID();
    const sid = sessionId ?? randomUUID();
    const startTime = performance.now();
    const entries: TraceEntry[] = [];

    const payload: MSMPayload = {
      msm_version: this.manifest?.msm_version ?? "1.0",
      session_id: sid,
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      input,
    };

    // Layer execution order
    const order: LayerName[] = [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ];

    let retries = 0;
    let runFrom = 0; // index in order to start/restart from

    while (runFrom < order.length) {
      for (let i = runFrom; i < order.length; i++) {
        const name = order[i];
        const layer = this.layers.get(name);

        if (!layer) {
          // Graceful degradation: missing layer is recorded as failed, pipeline continues
          const fallback: LayerMeta = {
            model_id: "missing",
            model_ver: "0.0.0",
            latency_ms: 0,
            confidence: 0,
            status: "failed",
            error: `Layer "${name}" not registered`,
          };
          (payload as unknown as Record<string, unknown>)[name] = fallback;
          entries.push({
            layer: name,
            model_id: "missing",
            latency_ms: 0,
            confidence: 0,
            status: "failed",
            error: fallback.error,
          });
          continue;
        }

        // Run before-hooks
        await this.runHooks(`before:${name}`, payload, entries);

        let result: LayerMeta;
        try {
          result = await layer.process(payload);
        } catch (err) {
          // Graceful degradation: layer threw, record failure and continue
          result = {
            model_id: "error",
            model_ver: "0.0.0",
            latency_ms: 0,
            confidence: 0,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          };
        }

        (payload as unknown as Record<string, unknown>)[name] = result;

        entries.push({
          layer: name,
          model_id: result.model_id,
          latency_ms: result.latency_ms,
          confidence: result.confidence,
          status: result.status,
          error: result.error,
        });

        // Run after-hooks
        await this.runHooks(`after:${name}`, payload, entries);

        // Handle validation gate
        if (name === "validation") {
          const v = result as ValidationOutput;
          if (
            !v.passed &&
            v.action === "retry" &&
            retries < this.options.maxRetries
          ) {
            retries++;
            // Re-run from generation layer
            runFrom = order.indexOf("generation");
            break;
          }
          if (!v.passed && v.action === "block") {
            // Blocked: replace generation output with fallback
            payload.generation = {
              response_text: FALLBACK_RESPONSE,
              tone: "neutral",
              word_count: FALLBACK_RESPONSE.split(/\s+/).length,
              model_id: "fallback",
              model_ver: "1.0.0",
              latency_ms: 0,
              confidence: 1.0,
              status: "degraded",
            };
          }
        }

        // If we've finished the last layer, exit
        if (i === order.length - 1) {
          runFrom = order.length; // exit while loop
        }
      }
      // If the for-loop ran to completion for a retry, just break
      if (runFrom < order.length && runFrom !== order.indexOf("generation")) {
        break;
      }
    }

    // Build final output
    const translation = payload.translation as TranslationOutput | undefined;
    const generation = payload.generation as GenerationOutput | undefined;
    const totalLatency = Math.round(performance.now() - startTime);

    payload.final_output = {
      text: generation?.response_text ?? FALLBACK_RESPONSE,
      language: translation?.source_language ?? input.language ?? "en",
      total_latency_ms: totalLatency,
    } satisfies FinalOutput;

    return {
      trace_id: traceId,
      session_id: sid,
      timestamp: payload.timestamp,
      total_latency_ms: totalLatency,
      entries,
      payload,
    };
  }
}
