import { randomUUID } from "node:crypto";
import type {
  MSMPayload,
  MSMLayer,
  MSMInput,
  LayerName,
  LayerMeta,
  TranslationOutput,
  ClassificationOutput,
  OrchestrationOutput,
  ExecutionOutput,
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

// ─── Typed fallbacks per layer (downstream layers get valid shapes) ───

function getLayerFallback(name: LayerName, error: string): LayerMeta {
  const base: LayerMeta = {
    model_id: "fallback",
    model_ver: "0.0.0",
    latency_ms: 0,
    confidence: 0,
    status: "failed",
    error,
  };

  switch (name) {
    case "translation":
      return {
        ...base,
        translated_text: null,
        source_language: "unknown",
        target_language: "en",
        layer_invoked: false,
        mode: "native",
      } as unknown as LayerMeta;
    case "classification":
      return {
        ...base,
        intent: "unknown",
        domain: "general",
        urgency: "normal",
        routing_target: "unknown_workflow",
      } as unknown as LayerMeta;
    case "orchestration":
      return {
        ...base,
        workflow_steps: ["fallback_response"],
        tool_selections: [],
        estimated_steps: 1,
        mode: "rules",
      } as unknown as LayerMeta;
    case "execution":
      return {
        ...base,
        tool_results: [],
        execution_status: "failed",
        errors: [error],
      } as unknown as LayerMeta;
    case "generation":
      return {
        ...base,
        response_text: FALLBACK_RESPONSE,
        tone: "neutral",
        word_count: FALLBACK_RESPONSE.split(/\s+/).length,
      } as unknown as LayerMeta;
    case "validation":
      return {
        ...base,
        passed: true, // don't block on validation failure
        quality_score: 0,
        policy_violations: [],
        action: "release",
      } as unknown as LayerMeta;
  }
}

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

  /** Run all hooks for a given point sequentially (declaration order per spec) */
  private async runHooks(
    point: HookPoint,
    payload: MSMPayload,
    entries: TraceEntry[],
    hooks: MSMHook[],
  ): Promise<void> {
    const matching = hooks.filter((h) => h.point === point);
    if (matching.length === 0) return;

    // Run hooks sequentially in declaration order (spec §5.1)
    for (const hook of matching) {
      let result: HookOutput;
      try {
        // Deep-clone so hooks cannot mutate the live payload
        const snapshot = structuredClone(payload);
        result = await hook.process(snapshot);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        result = {
          model_id: "hook-error",
          model_ver: "0.0.0",
          latency_ms: 0,
          confidence: 0,
          status: "failed",
          error: errMsg,
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

    // Snapshot layers at the start for atomic execution —
    // mid-flight swap() calls won't affect this run
    const layers = new Map(this.layers);
    const hooks = [...this.hooks];

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
        const layer = layers.get(name);

        if (!layer) {
          // Graceful degradation: typed fallback so downstream layers get valid shapes
          const fallback = getLayerFallback(
            name,
            `Layer "${name}" not registered`,
          );
          (payload as unknown as Record<string, unknown>)[name] = fallback;
          entries.push({
            layer: name,
            model_id: fallback.model_id,
            latency_ms: 0,
            confidence: 0,
            status: "failed",
            error: fallback.error,
          });
          continue;
        }

        // Run before-hooks (sequential, declaration order per spec)
        await this.runHooks(`before:${name}`, payload, entries, hooks);

        let result: LayerMeta;
        try {
          result = await layer.process(payload);
        } catch (err) {
          // Graceful degradation: typed fallback preserves downstream contracts
          const errMsg = err instanceof Error ? err.message : String(err);
          result = getLayerFallback(name, errMsg);
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

        // Run after-hooks (sequential, declaration order per spec)
        await this.runHooks(`after:${name}`, payload, entries, hooks);

        // Handle validation gate
        if (name === "validation") {
          const v = result as ValidationOutput;
          if (
            !v.passed &&
            v.action === "retry" &&
            retries < this.options.maxRetries
          ) {
            retries++;
            // Feed validation feedback to generation on retry —
            // so the model knows WHY the previous attempt was rejected
            payload._validation_feedback = {
              violations: v.policy_violations,
              quality_score: v.quality_score,
              attempt: retries,
            };
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

    // ── Outbound Translation ─────────────────────────────────
    // If the inbound translation was invoked (non-English input),
    // translate the generated response back to the user's language.
    const inbound = payload.translation as TranslationOutput | undefined;
    const generation = payload.generation as GenerationOutput | undefined;
    const responseText = generation?.response_text ?? FALLBACK_RESPONSE;

    if (inbound?.layer_invoked && inbound.source_language !== "en") {
      const translationLayer = layers.get("translation");
      if (translationLayer) {
        // Run before:translation hooks for outbound pass
        await this.runHooks("before:translation", payload, entries, hooks);

        let outboundResult: TranslationOutput;
        try {
          // Create a synthetic payload for outbound translation
          const outboundPayload: MSMPayload = {
            ...payload,
            input: {
              raw: responseText,
              modality: "text",
              language: "en",
              direction: "outbound",
              target_language: inbound.source_language,
            },
          };
          outboundResult = (await translationLayer.process(
            outboundPayload,
          )) as TranslationOutput;
        } catch (err) {
          outboundResult = getLayerFallback(
            "translation",
            err instanceof Error ? err.message : String(err),
          ) as TranslationOutput;
        }

        payload.outbound_translation = outboundResult;
        entries.push({
          layer: "outbound_translation",
          model_id: outboundResult.model_id,
          latency_ms: outboundResult.latency_ms,
          confidence: outboundResult.confidence,
          status: outboundResult.status,
          error: outboundResult.error,
        });

        // Run after:translation hooks for outbound pass
        await this.runHooks("after:translation", payload, entries, hooks);
      }
    }

    // Build final output
    const totalLatency = Math.round(performance.now() - startTime);
    const outbound = payload.outbound_translation;

    // Use outbound translation if available, otherwise use generation directly
    const finalText =
      outbound?.layer_invoked && outbound.translated_text
        ? outbound.translated_text
        : responseText;

    payload.final_output = {
      text: finalText,
      language: inbound?.source_language ?? input.language ?? "en",
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
