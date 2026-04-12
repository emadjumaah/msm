import { randomUUID } from "node:crypto";
import type {
  MSMPayload,
  MSMLayer,
  MSMInput,
  LayerName,
  LayerMeta,
  LayerStatus,
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
  status: LayerStatus;
  error?: string;
  /** Retry attempt number (present only on entries produced during a retry pass) */
  retry_attempt?: number;
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
  /** AbortSignal for pipeline-level cancellation / timeout */
  signal?: AbortSignal;
}

// ─── Fallback response when pipeline cannot produce output ───

const FALLBACK_RESPONSE =
  "I'm sorry, I wasn't able to process your request. Please try again.";

// ─── Typed fallbacks per layer (downstream layers get valid shapes) ───

function getLayerFallback(
  name: "translation",
  error: string,
): TranslationOutput;
function getLayerFallback(
  name: "classification",
  error: string,
): ClassificationOutput;
function getLayerFallback(
  name: "orchestration",
  error: string,
): OrchestrationOutput;
function getLayerFallback(name: "execution", error: string): ExecutionOutput;
function getLayerFallback(name: "generation", error: string): GenerationOutput;
function getLayerFallback(name: "validation", error: string): ValidationOutput;
function getLayerFallback(name: LayerName, error: string): LayerMeta;
function getLayerFallback(
  name: LayerName,
  error: string,
):
  | TranslationOutput
  | ClassificationOutput
  | OrchestrationOutput
  | ExecutionOutput
  | GenerationOutput
  | ValidationOutput {
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
      } satisfies TranslationOutput;
    case "classification":
      return {
        ...base,
        intent: "unknown",
        domain: "general",
        urgency: "normal",
        routing_target: "unknown_workflow",
      } satisfies ClassificationOutput;
    case "orchestration":
      return {
        ...base,
        workflow_steps: ["fallback_response"],
        tool_selections: [],
        estimated_steps: 1,
        mode: "rules",
      } satisfies OrchestrationOutput;
    case "execution":
      return {
        ...base,
        tool_results: [],
        execution_status: "failed",
        errors: [error],
      } satisfies ExecutionOutput;
    case "generation":
      return {
        ...base,
        response_text: FALLBACK_RESPONSE,
        tone: "neutral",
        word_count: FALLBACK_RESPONSE.split(/\s+/).length,
      } satisfies GenerationOutput;
    case "validation":
      return {
        ...base,
        passed: true, // don't block on validation failure
        quality_score: 0,
        policy_violations: [],
        action: "release",
      } satisfies ValidationOutput;
  }
}

// ─── Typed payload setter (avoids `as unknown` casts) ────────

function setLayerResult(
  payload: MSMPayload,
  name: LayerName,
  result: LayerMeta,
): void {
  switch (name) {
    case "translation":
      payload.translation = result as TranslationOutput;
      break;
    case "classification":
      payload.classification = result as ClassificationOutput;
      break;
    case "orchestration":
      payload.orchestration = result as OrchestrationOutput;
      break;
    case "execution":
      payload.execution = result as ExecutionOutput;
      break;
    case "generation":
      payload.generation = result as GenerationOutput;
      break;
    case "validation":
      payload.validation = result as ValidationOutput;
      break;
  }
}

// ─── Pipeline Engine ─────────────────────────────────────────

export class Pipeline {
  private layers = new Map<LayerName, MSMLayer>();
  private hooks: MSMHook[] = [];
  private hookNames = new Set<string>();
  private manifest: MSMManifest | null = null;
  private frozen = false;
  private options: Required<Pick<PipelineOptions, "maxRetries">> & {
    signal?: AbortSignal;
  };

  constructor(options?: PipelineOptions) {
    this.options = {
      maxRetries: options?.maxRetries ?? 1,
      signal: options?.signal,
    };
  }

  /**
   * Freeze the pipeline — no further register(), swap(), or addHook() calls allowed.
   * Call this before sharing a pipeline instance across concurrent requests.
   * run() itself is safe to call concurrently: it snapshots layers/hooks at the start.
   */
  freeze(): void {
    this.frozen = true;
  }

  private assertMutable(): void {
    if (this.frozen) {
      throw new Error(
        "Pipeline is frozen. No further register/swap/addHook calls allowed.",
      );
    }
  }

  /** Register a layer implementation */
  register(layer: MSMLayer): void {
    this.assertMutable();
    this.layers.set(layer.name, layer);
  }

  /** Swap a single layer at runtime */
  swap(layer: MSMLayer): void {
    this.assertMutable();
    this.layers.set(layer.name, layer);
  }

  /** Add a hook — runs before or after a core layer. Throws on duplicate name. */
  addHook(hook: MSMHook): void {
    this.assertMutable();
    if (this.hookNames.has(hook.name)) {
      throw new Error(
        `Duplicate hook name "${hook.name}". Each hook must have a unique name.`,
      );
    }
    this.hookNames.add(hook.name);
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
    direction: "inbound" | "outbound" = "inbound",
  ): Promise<void> {
    const matching = hooks.filter((h) => {
      if (h.point !== point) return false;
      const hookDir = h.direction ?? "inbound";
      return hookDir === direction || hookDir === "both";
    });
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
    const signal = this.options.signal;

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
    let startIdx = 0;
    let done = false;
    let usedFallbackGeneration = false;

    while (!done) {
      done = true; // assume we'll finish this pass

      for (let i = startIdx; i < order.length; i++) {
        // Check for pipeline-level cancellation
        if (signal?.aborted) {
          throw new Error("Pipeline aborted");
        }

        const name = order[i];
        const layer = layers.get(name);

        if (!layer) {
          // Graceful degradation: typed fallback so downstream layers get valid shapes
          const fallback = getLayerFallback(
            name,
            `Layer "${name}" not registered`,
          );
          setLayerResult(payload, name, fallback);
          if (name === "generation") usedFallbackGeneration = true;
          entries.push({
            layer: name,
            model_id: fallback.model_id,
            latency_ms: 0,
            confidence: 0,
            status: "failed",
            error: fallback.error,
            ...(retries > 0 ? { retry_attempt: retries } : {}),
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
          if (name === "generation") usedFallbackGeneration = true;
        }

        setLayerResult(payload, name, result);

        entries.push({
          layer: name,
          model_id: result.model_id,
          latency_ms: result.latency_ms,
          confidence: result.confidence,
          status: result.status,
          error: result.error,
          ...(retries > 0 ? { retry_attempt: retries } : {}),
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
            startIdx = order.indexOf("generation");
            done = false;
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
      }
    }

    // ── Outbound Translation ─────────────────────────────────
    // If the inbound translation was invoked (non-English input),
    // translate the generated response back to the user's language.
    //
    // NOTE: Outbound translation runs AFTER validation intentionally.
    // Validation checks the English generation output (consistent language
    // for policy rules). Re-validating after translation would require
    // language-specific policy rules — a future enhancement if needed.
    const inbound = payload.translation as TranslationOutput | undefined;
    const generation = payload.generation as GenerationOutput | undefined;
    const responseText = generation?.response_text ?? FALLBACK_RESPONSE;

    if (inbound?.layer_invoked && inbound.source_language !== "en") {
      const translationLayer = layers.get("translation");
      if (translationLayer) {
        // Run before:translation hooks for outbound pass
        await this.runHooks(
          "before:translation",
          payload,
          entries,
          hooks,
          "outbound",
        );

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
          );
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
        await this.runHooks(
          "after:translation",
          payload,
          entries,
          hooks,
          "outbound",
        );
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

    // Compute aggregate pipeline status from core layer entries
    // "ok"       — all layers succeeded
    // "degraded" — some layers failed but generation produced real output
    // "failed"   — generation itself used fallback (output is not meaningful)
    const coreStatuses = entries
      .filter(
        (e) =>
          !e.layer.startsWith("hook:") && e.layer !== "outbound_translation",
      )
      .map((e) => e.status);
    const hasFailed = coreStatuses.some((s) => s === "failed");
    const hasDegraded = coreStatuses.some((s) => s === "degraded");
    const pipelineStatus: "ok" | "degraded" | "failed" = usedFallbackGeneration
      ? "failed"
      : hasFailed || hasDegraded
        ? "degraded"
        : "ok";

    payload.final_output = {
      text: finalText,
      language: inbound?.source_language ?? input.language ?? "en",
      total_latency_ms: totalLatency,
      pipeline_status: pipelineStatus,
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
