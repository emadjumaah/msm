import { describe, it, expect } from "vitest";
import { Pipeline } from "../src/core/pipeline.js";
import {
  DummyTranslationLayer,
  DummyClassificationLayer,
  DummyOrchestrationLayer,
  DummyExecutionLayer,
  DummyGenerationLayer,
  DummyValidationLayer,
} from "../src/dummy-models/index.js";
import type {
  MSMLayer,
  MSMPayload,
  ValidationOutput,
  GenerationOutput,
  OrchestrationOutput,
  ExecutionOutput,
  OrchestrationAction,
  MSMHook,
  HookOutput,
} from "../src/core/types.js";

function buildPipeline() {
  const pipeline = new Pipeline();
  pipeline.register(new DummyTranslationLayer());
  pipeline.register(new DummyClassificationLayer());
  pipeline.register(new DummyOrchestrationLayer());
  pipeline.register(new DummyExecutionLayer());
  pipeline.register(new DummyGenerationLayer());
  pipeline.register(new DummyValidationLayer());
  return pipeline;
}

// ─── Pipeline ────────────────────────────────────────────────

describe("Pipeline", () => {
  it("runs all 6 layers end-to-end", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "I want to order a burger",
      modality: "text",
    });

    expect(trace.entries).toHaveLength(6);
    expect(trace.payload.translation).toBeDefined();
    expect(trace.payload.classification).toBeDefined();
    expect(trace.payload.orchestration).toBeDefined();
    expect(trace.payload.execution).toBeDefined();
    expect(trace.payload.generation).toBeDefined();
    expect(trace.payload.validation).toBeDefined();
    expect(trace.payload.final_output).toBeDefined();
  });

  it("produces a valid trace with IDs and timing", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({ raw: "hello", modality: "text" });

    expect(trace.trace_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(trace.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(trace.total_latency_ms).toBeGreaterThanOrEqual(0);
    expect(trace.timestamp).toBeTruthy();
  });

  it("uses provided session ID", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run(
      { raw: "test", modality: "text" },
      "my-session-123",
    );

    expect(trace.session_id).toBe("my-session-123");
  });

  it("all layer entries have ok status with dummy models", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({ raw: "order pizza", modality: "text" });

    for (const entry of trace.entries) {
      expect(entry.status).toBe("ok");
      expect(entry.model_id).toBeTruthy();
      expect(entry.latency_ms).toBeGreaterThanOrEqual(0);
      expect(entry.confidence).toBeGreaterThan(0);
    }
  });
});

// ─── Translation Layer ───────────────────────────────────────

describe("Translation Layer", () => {
  it("skips translation for English input", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "I want a burger",
      modality: "text",
    });

    expect(trace.payload.translation?.layer_invoked).toBe(false);
    expect(trace.payload.translation?.source_language).toBe("en");
    expect(trace.payload.translation?.translated_text).toBeNull();
    expect(trace.payload.translation?.confidence).toBe(1.0);
  });

  it("translates Arabic input to English", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "ابي اطلب برغر",
      modality: "text",
    });

    expect(trace.payload.translation?.layer_invoked).toBe(true);
    expect(trace.payload.translation?.source_language).toBe("ar-gulf");
    expect(trace.payload.translation?.translated_text).toContain("order");
  });

  it("detects output language correctly", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "مرحبا",
      modality: "text",
    });

    expect(trace.payload.final_output?.language).toBe("ar-gulf");
  });
});

// ─── Classification Layer ────────────────────────────────────

describe("Classification Layer", () => {
  it("classifies food order intent", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "I want to order a pizza",
      modality: "text",
    });

    expect(trace.payload.classification?.intent).toBe("place_order");
    expect(trace.payload.classification?.domain).toBe("food");
  });

  it("classifies cancel intent", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "Cancel my order please",
      modality: "text",
    });

    expect(trace.payload.classification?.intent).toBe("cancel");
  });

  it("classifies tracking intent", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "Where is my delivery?",
      modality: "text",
    });

    expect(trace.payload.classification?.intent).toBe("track_order");
  });
});

// ─── Orchestration Layer ─────────────────────────────────────

describe("Orchestration Layer", () => {
  it("produces workflow steps for order intent", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "order a burger",
      modality: "text",
    });

    expect(trace.payload.orchestration?.workflow_steps.length).toBeGreaterThan(
      0,
    );
    expect(trace.payload.orchestration?.tool_selections.length).toBeGreaterThan(
      0,
    );
    expect(trace.payload.orchestration?.estimated_steps).toBe(
      trace.payload.orchestration?.workflow_steps.length,
    );
  });
});

// ─── Execution Layer ─────────────────────────────────────────

describe("Execution Layer", () => {
  it("returns tool results for each selected tool", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "order a burger",
      modality: "text",
    });

    const tools = trace.payload.orchestration?.tool_selections ?? [];
    const results = trace.payload.execution?.tool_results ?? [];

    expect(results.length).toBe(tools.length);
    for (const r of results) {
      expect(r.status).toBe("ok");
      expect(r.result).toBeDefined();
    }
  });
});

// ─── Generation Layer ────────────────────────────────────────

describe("Generation Layer", () => {
  it("produces non-empty response text", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "order a pizza",
      modality: "text",
    });

    expect(trace.payload.generation?.response_text.length).toBeGreaterThan(0);
    expect(trace.payload.generation?.word_count).toBeGreaterThan(0);
  });
});

// ─── Validation Layer ────────────────────────────────────────

describe("Validation Layer", () => {
  it("passes valid responses", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "order a burger",
      modality: "text",
    });

    expect(trace.payload.validation?.passed).toBe(true);
    expect(trace.payload.validation?.action).toBe("release");
    expect(trace.payload.validation?.policy_violations).toHaveLength(0);
  });
});

// ─── Payload Accumulation ────────────────────────────────────

describe("Payload Accumulation", () => {
  it("payload accumulates all layer results", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "ابي اطلب برغر وبيبسي",
      modality: "text",
    });
    const p = trace.payload;

    // Every layer should have model metadata
    expect(p.translation?.model_id).toBeTruthy();
    expect(p.classification?.model_id).toBeTruthy();
    expect(p.orchestration?.model_id).toBeTruthy();
    expect(p.execution?.model_id).toBeTruthy();
    expect(p.generation?.model_id).toBeTruthy();
    expect(p.validation?.model_id).toBeTruthy();

    // Final output should exist
    expect(p.final_output?.text.length).toBeGreaterThan(0);
    expect(p.final_output?.total_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("each layer has confidence between 0 and 1", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({ raw: "hello", modality: "text" });

    for (const entry of trace.entries) {
      expect(entry.confidence).toBeGreaterThanOrEqual(0);
      expect(entry.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Graceful Degradation ────────────────────────────────────

describe("Graceful Degradation", () => {
  it("continues when a layer is missing (records failure)", async () => {
    const pipeline = new Pipeline();
    // Only register some layers — skip classification
    pipeline.register(new DummyTranslationLayer());
    // skip classification
    pipeline.register(new DummyOrchestrationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register(new DummyValidationLayer());

    const trace = await pipeline.run({ raw: "hello", modality: "text" });

    // Pipeline should still complete
    expect(trace.entries).toHaveLength(6);
    const classEntry = trace.entries.find((e) => e.layer === "classification");
    expect(classEntry?.status).toBe("failed");
    expect(classEntry?.error).toContain("not registered");
  });

  it("continues when a layer throws an error", async () => {
    const pipeline = buildPipeline();

    // Swap in a broken layer
    const brokenLayer: MSMLayer = {
      name: "orchestration",
      async process(): Promise<never> {
        throw new Error("model server down");
      },
    };
    pipeline.swap(brokenLayer);

    const trace = await pipeline.run({ raw: "order food", modality: "text" });

    expect(trace.entries).toHaveLength(6);
    const orchEntry = trace.entries.find((e) => e.layer === "orchestration");
    expect(orchEntry?.status).toBe("failed");
    expect(orchEntry?.error).toContain("model server down");

    // Pipeline still produced output
    expect(trace.payload.final_output).toBeDefined();
  });
});

// ─── Validation Gate ─────────────────────────────────────────

describe("Validation Gate", () => {
  it("blocks response and uses fallback when validation blocks", async () => {
    const pipeline = buildPipeline();

    // Swap in a validator that always blocks
    const blockingValidator: MSMLayer<ValidationOutput> = {
      name: "validation",
      async process(): Promise<ValidationOutput> {
        return {
          passed: false,
          quality_score: 0.1,
          policy_violations: ["test_violation"],
          action: "block",
          model_id: "test-blocker",
          model_ver: "1.0.0",
          latency_ms: 0,
          confidence: 0.9,
          status: "ok",
        };
      },
    };
    pipeline.swap(blockingValidator);

    const trace = await pipeline.run({ raw: "order food", modality: "text" });

    // Final output should be the fallback message
    expect(trace.payload.final_output?.text).toContain("sorry");
  });

  it("retries generation when validation returns retry", async () => {
    let callCount = 0;

    const pipeline = new Pipeline({ maxRetries: 2 });
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyOrchestrationLayer());
    pipeline.register(new DummyExecutionLayer());

    // Custom generation that counts calls
    const countingGen: MSMLayer<GenerationOutput> = {
      name: "generation",
      async process(): Promise<GenerationOutput> {
        callCount++;
        return {
          response_text: `Response attempt ${callCount}`,
          tone: "warm",
          word_count: 3,
          model_id: "counting-gen",
          model_ver: "1.0.0",
          latency_ms: 0,
          confidence: 0.7,
          status: "ok",
        };
      },
    };
    pipeline.register(countingGen);

    // Validator that retries once then passes
    let validationCalls = 0;
    const retryValidator: MSMLayer<ValidationOutput> = {
      name: "validation",
      async process(): Promise<ValidationOutput> {
        validationCalls++;
        const shouldPass = validationCalls > 1;
        return {
          passed: shouldPass,
          quality_score: shouldPass ? 0.9 : 0.2,
          policy_violations: shouldPass ? [] : ["needs_retry"],
          action: shouldPass ? "release" : "retry",
          model_id: "retry-validator",
          model_ver: "1.0.0",
          latency_ms: 0,
          confidence: 0.9,
          status: "ok",
        };
      },
    };
    pipeline.register(retryValidator);

    const trace = await pipeline.run({ raw: "hello", modality: "text" });

    // Generation should have been called more than once
    expect(callCount).toBeGreaterThan(1);
    expect(trace.payload.final_output?.text).toContain("Response attempt");
  });
});

// ─── Swap Mechanism ──────────────────────────────────────────

describe("Swap Mechanism", () => {
  it("replaces a layer at runtime", async () => {
    const pipeline = buildPipeline();

    // Run once with dummy
    const trace1 = await pipeline.run({ raw: "hello", modality: "text" });
    expect(trace1.payload.generation?.model_id).toBe("dummy-generation-v1");

    // Swap generation layer
    const custom: MSMLayer<GenerationOutput> = {
      name: "generation",
      async process(): Promise<GenerationOutput> {
        return {
          response_text: "Custom response from swapped model",
          tone: "formal",
          word_count: 5,
          model_id: "custom-gen-v1",
          model_ver: "2.0.0",
          latency_ms: 1,
          confidence: 0.95,
          status: "ok",
        };
      },
    };
    pipeline.swap(custom);

    const trace2 = await pipeline.run({ raw: "hello", modality: "text" });
    expect(trace2.payload.generation?.model_id).toBe("custom-gen-v1");
    expect(trace2.payload.final_output?.text).toBe(
      "Custom response from swapped model",
    );
  });
});

// ─── Context Annotations (Option C) ─────────────────────────

describe("Context Annotations", () => {
  it("produces context annotations for Arabic input with cultural terms", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "ابي اطلب برغر",
      modality: "text",
    });

    const annotations = trace.payload.translation?.context_annotations;
    expect(annotations).toBeDefined();
    expect(annotations!.length).toBeGreaterThan(0);

    // Should have annotation for "ابي" (Gulf dialect)
    const abiAnnotation = annotations!.find((a) => a.original_term === "ابي");
    expect(abiAnnotation).toBeDefined();
    expect(abiAnnotation!.intent_hints).toContain("place_order");
    expect(abiAnnotation!.cultural_meaning).toBeTruthy();
  });

  it("produces no annotations for English input", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "I want to order a burger",
      modality: "text",
    });

    expect(trace.payload.translation?.context_annotations).toBeUndefined();
  });

  it("annotates culturally ambiguous terms like خفيف", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "اريد شي خفيف",
      modality: "text",
    });

    const annotations = trace.payload.translation?.context_annotations;
    expect(annotations).toBeDefined();

    const lightAnnotation = annotations!.find(
      (a) => a.original_term === "خفيف",
    );
    expect(lightAnnotation).toBeDefined();
    expect(lightAnnotation!.translated_term).toBe("light");
    expect(lightAnnotation!.intent_hints).toContain("snack");
    expect(lightAnnotation!.intent_hints).toContain("quick_meal");
  });

  it("classification uses annotations to boost confidence", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "ابي اطلب برغر",
      modality: "text",
    });

    // When annotations are present, classification confidence should be higher
    expect(trace.payload.classification?.confidence).toBe(0.8);
  });
});

// ─── Translation Mode ────────────────────────────────────────

describe("Translation Mode", () => {
  it("sets mode to 'native' for English input", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "I want a burger",
      modality: "text",
    });

    expect(trace.payload.translation?.mode).toBe("native");
  });

  it("sets mode to 'translated' for Arabic input", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "ابي اطلب برغر",
      modality: "text",
    });

    expect(trace.payload.translation?.mode).toBe("translated");
  });
});

// ─── Outbound Translation ────────────────────────────────────

describe("Outbound Translation", () => {
  it("translates response back for Arabic input", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "ابي اطلب برغر",
      modality: "text",
    });

    // Should have 7 entries: 6 core + 1 outbound translation
    expect(trace.entries).toHaveLength(7);
    expect(trace.payload.outbound_translation).toBeDefined();
    expect(trace.payload.outbound_translation?.layer_invoked).toBe(true);
    expect(trace.payload.outbound_translation?.target_language).toBe("ar-gulf");
    // Outbound entry appears in trace
    const outboundEntry = trace.entries.find(
      (e) => e.layer === "outbound_translation",
    );
    expect(outboundEntry).toBeDefined();
    expect(outboundEntry?.status).toBe("ok");
  });

  it("skips outbound translation for English input", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "I want a burger",
      modality: "text",
    });

    // Should have 6 entries: no outbound translation needed
    expect(trace.entries).toHaveLength(6);
    expect(trace.payload.outbound_translation).toBeUndefined();
  });

  it("final_output uses outbound translated text for Arabic", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({
      raw: "ابي اطلب برغر",
      modality: "text",
    });

    // Final output should be in the user's language
    expect(trace.payload.final_output?.language).toBe("ar-gulf");
    // Outbound translation should produce non-empty Arabic text
    expect(trace.payload.outbound_translation?.translated_text).toEqual(
      expect.any(String),
    );
    expect(
      trace.payload.outbound_translation!.translated_text!.length,
    ).toBeGreaterThan(0);
  });
});

// ─── Typed Fallbacks ─────────────────────────────────────────

describe("Typed Fallbacks", () => {
  it("produces typed classification fallback when layer is missing", async () => {
    const pipeline = new Pipeline();
    pipeline.register(new DummyTranslationLayer());
    // Skip classification — don't register it
    pipeline.register(new DummyOrchestrationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register(new DummyValidationLayer());

    const trace = await pipeline.run({ raw: "order food", modality: "text" });

    // Classification should have typed fallback fields
    expect(trace.payload.classification?.intent).toBe("unknown");
    expect(trace.payload.classification?.domain).toBe("general");
    expect(trace.payload.classification?.urgency).toBe("normal");
    expect(trace.payload.classification?.status).toBe("failed");
  });

  it("produces typed orchestration fallback when layer throws", async () => {
    const pipeline = buildPipeline();
    const broken: MSMLayer = {
      name: "orchestration",
      async process(): Promise<never> {
        throw new Error("model crashed");
      },
    };
    pipeline.swap(broken);

    const trace = await pipeline.run({ raw: "order food", modality: "text" });

    expect(trace.payload.orchestration?.workflow_steps).toEqual([
      "fallback_response",
    ]);
    expect(trace.payload.orchestration?.tool_selections).toEqual([]);
    expect(trace.payload.orchestration?.status).toBe("failed");
    // Pipeline still completes
    expect(trace.payload.final_output).toBeDefined();
  });
});

// ─── Session History ─────────────────────────────────────────

describe("Session History", () => {
  it("passes history through to layers via input", async () => {
    const pipeline = buildPipeline();
    const history = [
      { role: "user" as const, content: "What's on your menu?" },
      {
        role: "assistant" as const,
        content: "We have burgers, pizza, and more.",
      },
    ];

    const trace = await pipeline.run({
      raw: "I'll have a burger",
      modality: "text",
      history,
    });

    expect(trace.payload.input.history).toHaveLength(2);
    expect(trace.payload.input.history?.[0].role).toBe("user");
    expect(trace.payload.input.history?.[1].role).toBe("assistant");
  });
});

// ─── Sequential Hooks (spec compliance) ─────────────────────

describe("Sequential Hook Execution", () => {
  it("runs multiple hooks at the same point in declaration order", async () => {
    const pipeline = buildPipeline();
    const executionOrder: string[] = [];

    const hookA: MSMHook = {
      name: "hook_a",
      point: "before:classification",
      async process(): Promise<HookOutput> {
        executionOrder.push("a_start");
        // Simulate async work
        await new Promise((r) => setTimeout(r, 10));
        executionOrder.push("a_end");
        return {
          model_id: "hook-a",
          model_ver: "1.0",
          latency_ms: 10,
          confidence: 1,
          status: "ok",
          data: { source: "a" },
        };
      },
    };

    const hookB: MSMHook = {
      name: "hook_b",
      point: "before:classification",
      async process(): Promise<HookOutput> {
        executionOrder.push("b_start");
        await new Promise((r) => setTimeout(r, 10));
        executionOrder.push("b_end");
        return {
          model_id: "hook-b",
          model_ver: "1.0",
          latency_ms: 10,
          confidence: 1,
          status: "ok",
          data: { source: "b" },
        };
      },
    };

    pipeline.addHook(hookA);
    pipeline.addHook(hookB);

    const trace = await pipeline.run({ raw: "test", modality: "text" });

    // Both hooks should have run
    expect(trace.payload.hooks?.["hook_a"]).toBeDefined();
    expect(trace.payload.hooks?.["hook_b"]).toBeDefined();
    // Sequential: a completes before b starts (declaration order per spec)
    expect(executionOrder).toEqual(["a_start", "a_end", "b_start", "b_end"]);
  });
});

// ─── Hook Isolation ──────────────────────────────────────────

describe("Hook Isolation", () => {
  it("hooks receive a snapshot — cannot mutate the live payload", async () => {
    const pipeline = buildPipeline();

    const mutatingHook: MSMHook = {
      name: "mutator",
      point: "after:translation",
      async process(payload: MSMPayload): Promise<HookOutput> {
        // Attempt to corrupt the payload
        (payload as Record<string, unknown>).input = {
          raw: "HACKED",
          modality: "text",
        };
        return {
          model_id: "mutator",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
          data: {},
        };
      },
    };
    pipeline.addHook(mutatingHook);

    const trace = await pipeline.run({
      raw: "ابي اطلب برغر",
      modality: "text",
    });

    // The real payload input should be untouched
    expect(trace.payload.input.raw).toBe("ابي اطلب برغر");
  });
});

// ─── Retry Feedback ──────────────────────────────────────────

describe("Retry Feedback", () => {
  it("injects validation violations on retry so generation can adapt", async () => {
    let feedbackSeen: unknown = undefined;

    const pipeline = new Pipeline({ maxRetries: 1 });
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyOrchestrationLayer());
    pipeline.register(new DummyExecutionLayer());

    const spyGen: MSMLayer<GenerationOutput> = {
      name: "generation",
      async process(payload: MSMPayload): Promise<GenerationOutput> {
        feedbackSeen = payload._validation_feedback;
        return {
          response_text: "Generated response",
          tone: "warm",
          word_count: 2,
          model_id: "spy-gen",
          model_ver: "1.0.0",
          latency_ms: 0,
          confidence: 0.9,
          status: "ok",
        };
      },
    };
    pipeline.register(spyGen);

    let validationCalls = 0;
    const retryValidator: MSMLayer<ValidationOutput> = {
      name: "validation",
      async process(): Promise<ValidationOutput> {
        validationCalls++;
        const pass = validationCalls > 1;
        return {
          passed: pass,
          quality_score: pass ? 0.9 : 0.1,
          policy_violations: pass ? [] : ["toxic_content"],
          action: pass ? "release" : "retry",
          model_id: "retry-val",
          model_ver: "1.0.0",
          latency_ms: 0,
          confidence: 0.9,
          status: "ok",
        };
      },
    };
    pipeline.register(retryValidator);

    await pipeline.run({ raw: "hello", modality: "text" });

    // On the retry call, generation should have seen the feedback
    expect(feedbackSeen).toBeDefined();
    expect((feedbackSeen as { violations: string[] }).violations).toContain(
      "toxic_content",
    );
    expect((feedbackSeen as { attempt: number }).attempt).toBe(1);
  });
});

// ─── Pipeline Status ─────────────────────────────────────────

describe("Pipeline Status", () => {
  it("reports 'ok' when all layers succeed", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({ raw: "hello", modality: "text" });

    expect(trace.payload.final_output?.pipeline_status).toBe("ok");
  });

  it("reports 'degraded' when a layer is missing", async () => {
    const pipeline = new Pipeline();
    pipeline.register(new DummyTranslationLayer());
    // skip classification
    pipeline.register(new DummyOrchestrationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register(new DummyValidationLayer());

    const trace = await pipeline.run({ raw: "hello", modality: "text" });

    expect(trace.payload.final_output?.pipeline_status).toBe("degraded");
  });

  it("reports 'degraded' when a layer throws", async () => {
    const pipeline = buildPipeline();
    const broken: MSMLayer = {
      name: "orchestration",
      async process(): Promise<never> {
        throw new Error("model down");
      },
    };
    pipeline.swap(broken);

    const trace = await pipeline.run({ raw: "test", modality: "text" });

    expect(trace.payload.final_output?.pipeline_status).toBe("degraded");
  });
});

// ─── Hook Direction Filtering ────────────────────────────────

describe("Hook Direction Filtering", () => {
  it("inbound hooks do not fire during outbound translation pass", async () => {
    const pipeline = buildPipeline();
    let hookCallCount = 0;

    const inboundOnlyHook: MSMHook = {
      name: "inbound_hook",
      point: "before:translation",
      // direction defaults to "inbound"
      async process(): Promise<HookOutput> {
        hookCallCount++;
        return {
          model_id: "inbound-hook",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
          data: {},
        };
      },
    };
    pipeline.addHook(inboundOnlyHook);

    // Arabic input triggers outbound translation
    await pipeline.run({ raw: "ابي اطلب برغر", modality: "text" });

    // Hook should fire once (inbound pass only), not twice
    expect(hookCallCount).toBe(1);
  });

  it("outbound hooks fire only during outbound translation pass", async () => {
    const pipeline = buildPipeline();
    let hookCallCount = 0;

    const outboundHook: MSMHook = {
      name: "outbound_hook",
      point: "after:translation",
      direction: "outbound",
      async process(): Promise<HookOutput> {
        hookCallCount++;
        return {
          model_id: "outbound-hook",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
          data: {},
        };
      },
    };
    pipeline.addHook(outboundHook);

    // Arabic input triggers outbound translation
    await pipeline.run({ raw: "ابي اطلب برغر", modality: "text" });

    // Hook should fire once (outbound pass only)
    expect(hookCallCount).toBe(1);
  });

  it("'both' direction hooks fire on inbound and outbound passes", async () => {
    const pipeline = buildPipeline();
    let hookCallCount = 0;

    const bothHook: MSMHook = {
      name: "both_hook",
      point: "before:translation",
      direction: "both",
      async process(): Promise<HookOutput> {
        hookCallCount++;
        return {
          model_id: "both-hook",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
          data: {},
        };
      },
    };
    pipeline.addHook(bothHook);

    await pipeline.run({ raw: "ابي اطلب برغر", modality: "text" });

    // Hook should fire twice (once inbound, once outbound)
    expect(hookCallCount).toBe(2);
  });
});

// ─── Pipeline Status: "failed" ──────────────────────────────

describe("Pipeline Status: failed", () => {
  it("reports 'failed' when generation layer is missing", async () => {
    const pipeline = new Pipeline();
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyOrchestrationLayer());
    pipeline.register(new DummyExecutionLayer());
    // no generation layer
    pipeline.register(new DummyValidationLayer());

    const trace = await pipeline.run({ raw: "hello", modality: "text" });
    expect(trace.payload.final_output?.pipeline_status).toBe("failed");
  });

  it("reports 'failed' when generation layer throws", async () => {
    const pipeline = buildPipeline();
    pipeline.swap({
      name: "generation",
      async process(): Promise<never> {
        throw new Error("model crashed");
      },
    });

    const trace = await pipeline.run({ raw: "hello", modality: "text" });
    expect(trace.payload.final_output?.pipeline_status).toBe("failed");
  });
});

// ─── TraceEntry: retry_attempt ──────────────────────────────

describe("TraceEntry retry_attempt", () => {
  it("includes retry_attempt on entries produced during retry pass", async () => {
    let attempts = 0;
    const pipeline = new Pipeline({ maxRetries: 1 });
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyOrchestrationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register({
      name: "validation",
      async process(): Promise<ValidationOutput> {
        attempts++;
        if (attempts === 1) {
          return {
            passed: false,
            quality_score: 0.2,
            policy_violations: ["test"],
            action: "retry",
            model_id: "val",
            model_ver: "1.0",
            latency_ms: 0,
            confidence: 1,
            status: "ok",
          };
        }
        return {
          passed: true,
          quality_score: 0.9,
          policy_violations: [],
          action: "release",
          model_id: "val",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
        };
      },
    });

    const trace = await pipeline.run({ raw: "test", modality: "text" });

    // First-pass entries should NOT have retry_attempt
    const firstGen = trace.entries.find(
      (e) => e.layer === "generation" && !e.retry_attempt,
    );
    expect(firstGen).toBeDefined();

    // Retry-pass entries SHOULD have retry_attempt
    const retryEntries = trace.entries.filter((e) => e.retry_attempt === 1);
    expect(retryEntries.length).toBeGreaterThan(0);
  });
});

// ─── Duplicate Hook Name ─────────────────────────────────────

describe("Duplicate hook names", () => {
  it("throws on duplicate hook name", () => {
    const pipeline = buildPipeline();
    const hook1: MSMHook = {
      name: "my_hook",
      point: "before:generation",
      async process(): Promise<HookOutput> {
        return {
          model_id: "h",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
          data: {},
        };
      },
    };
    const hook2: MSMHook = {
      name: "my_hook",
      point: "after:generation",
      async process(): Promise<HookOutput> {
        return {
          model_id: "h",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
          data: {},
        };
      },
    };
    pipeline.addHook(hook1);
    expect(() => pipeline.addHook(hook2)).toThrow("Duplicate hook name");
  });
});

// ─── AbortSignal Cancellation ────────────────────────────────

describe("AbortSignal", () => {
  it("throws 'Pipeline aborted' when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const pipeline = new Pipeline({ signal: controller.signal });
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyOrchestrationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register(new DummyValidationLayer());

    await expect(
      pipeline.run({ raw: "hello", modality: "text" }),
    ).rejects.toThrow("Pipeline aborted");
  });

  it("aborts mid-pipeline when signal is triggered", async () => {
    const controller = new AbortController();
    let layersRun = 0;

    const pipeline = new Pipeline({ signal: controller.signal });
    for (const name of [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ] as const) {
      pipeline.register({
        name,
        async process() {
          layersRun++;
          // Abort after first layer
          if (layersRun === 1) controller.abort();
          return {
            model_id: name,
            model_ver: "1.0",
            latency_ms: 0,
            confidence: 1,
            status: "ok",
          } as any;
        },
      });
    }

    await expect(
      pipeline.run({ raw: "hello", modality: "text" }),
    ).rejects.toThrow("Pipeline aborted");
    // Only 1 layer should have run before abort was checked
    expect(layersRun).toBe(1);
  });
});

// ─── Pipeline freeze() ──────────────────────────────────────

describe("Pipeline freeze", () => {
  it("prevents register/swap/addHook after freeze()", () => {
    const pipeline = buildPipeline();
    pipeline.freeze();

    expect(() => pipeline.register(new DummyTranslationLayer())).toThrow(
      "frozen",
    );
    expect(() => pipeline.swap(new DummyTranslationLayer())).toThrow("frozen");
    expect(() =>
      pipeline.addHook({
        name: "x",
        point: "before:generation",
        async process(): Promise<HookOutput> {
          return {
            model_id: "x",
            model_ver: "1.0",
            latency_ms: 0,
            confidence: 1,
            status: "ok",
            data: {},
          };
        },
      }),
    ).toThrow("frozen");
  });

  it("allows run() after freeze()", async () => {
    const pipeline = buildPipeline();
    pipeline.freeze();

    const trace = await pipeline.run({ raw: "hello", modality: "text" });
    expect(trace.payload.final_output).toBeDefined();
  });
});

// ─── Tone type constraint ────────────────────────────────────

describe("Tone type", () => {
  it("generation output uses valid Tone value", async () => {
    const pipeline = buildPipeline();
    const trace = await pipeline.run({ raw: "hello", modality: "text" });

    const validTones = ["warm", "neutral", "formal", "apologetic"];
    expect(validTones).toContain(trace.payload.generation?.tone);
  });
});

// ─── Iterative Mode ──────────────────────────────────────────

function buildIterativePipeline() {
  const pipeline = new Pipeline({ mode: "iterative", maxIterations: 6 });
  pipeline.register(new DummyTranslationLayer());
  pipeline.register(new DummyClassificationLayer());
  pipeline.register(new DummyOrchestrationLayer());
  pipeline.register(new DummyExecutionLayer());
  pipeline.register(new DummyGenerationLayer());
  pipeline.register(new DummyValidationLayer());
  return pipeline;
}

describe("Iterative Mode", () => {
  it("runs translate → classify → [orchestrate → execute] → generate → validate", async () => {
    const pipeline = buildIterativePipeline();
    const trace = await pipeline.run({
      raw: "I want to order a burger",
      modality: "text",
    });

    // Should have all outputs
    expect(trace.payload.translation).toBeDefined();
    expect(trace.payload.classification).toBeDefined();
    expect(trace.payload.orchestration).toBeDefined();
    expect(trace.payload.execution).toBeDefined();
    expect(trace.payload.generation).toBeDefined();
    expect(trace.payload.validation).toBeDefined();
    expect(trace.payload.final_output).toBeDefined();
    expect(trace.payload.final_output?.iterations_used).toBeGreaterThan(0);
  });

  it("records iterations in payload.iterations", async () => {
    const pipeline = buildIterativePipeline();
    const trace = await pipeline.run({
      raw: "I want to order a burger",
      modality: "text",
    });

    // place_order intent → action "use_tool" → 1 iteration recorded, then "respond"
    expect(trace.payload.iterations).toBeDefined();
    expect(trace.payload.iterations!.length).toBeGreaterThanOrEqual(1);
    expect(trace.payload.iterations![0].orchestration).toBeDefined();
    expect(trace.payload.iterations![0].execution).toBeDefined();
  });

  it("stops iterating when action is 'respond'", async () => {
    const pipeline = new Pipeline({ mode: "iterative", maxIterations: 6 });
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register(new DummyValidationLayer());

    // Custom orchestration: respond immediately (no tools)
    pipeline.register({
      name: "orchestration",
      async process(): Promise<OrchestrationOutput> {
        return {
          action: "respond",
          workflow_steps: ["direct_response"],
          tool_selections: [],
          estimated_steps: 1,
          mode: "rules",
          model_id: "test",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
        };
      },
    });

    const trace = await pipeline.run({ raw: "hello", modality: "text" });

    // No iterations — went straight to respond
    expect(trace.payload.iterations).toEqual([]);
    expect(trace.payload.final_output?.iterations_used).toBe(1);
  });

  it("loops multiple times when orchestration keeps saying use_tool", async () => {
    let orchCalls = 0;
    const pipeline = new Pipeline({ mode: "iterative", maxIterations: 4 });
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register(new DummyValidationLayer());

    pipeline.register({
      name: "orchestration",
      async process(): Promise<OrchestrationOutput> {
        orchCalls++;
        // First 2 calls: use_tool. Third call: respond.
        const action: OrchestrationAction =
          orchCalls < 3 ? "use_tool" : "respond";
        return {
          action,
          workflow_steps: [`step_${orchCalls}`],
          tool_selections: orchCalls < 3 ? ["test_api"] : [],
          estimated_steps: 1,
          mode: "llm",
          model_id: "test",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 0.9,
          status: "ok",
          reasoning: `iteration ${orchCalls}`,
        };
      },
    });

    const trace = await pipeline.run({ raw: "complex task", modality: "text" });

    expect(orchCalls).toBe(3); // 2 tool iterations + 1 final respond
    expect(trace.payload.iterations!.length).toBe(2); // 2 recorded iterations
    expect(trace.payload.final_output?.iterations_used).toBe(3);
  });

  it("respects maxIterations limit", async () => {
    let orchCalls = 0;
    const pipeline = new Pipeline({ mode: "iterative", maxIterations: 2 });
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register(new DummyValidationLayer());

    pipeline.register({
      name: "orchestration",
      async process(): Promise<OrchestrationOutput> {
        orchCalls++;
        return {
          action: "use_tool", // always wants more tools
          workflow_steps: [`step_${orchCalls}`],
          tool_selections: ["test_api"],
          estimated_steps: 1,
          mode: "llm",
          model_id: "test",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 0.9,
          status: "ok",
        };
      },
    });

    const trace = await pipeline.run({
      raw: "infinite task",
      modality: "text",
    });

    // Should stop at maxIterations even though orchestration keeps requesting tools
    expect(orchCalls).toBe(2);
    expect(trace.payload.generation).toBeDefined();
    expect(trace.payload.final_output).toBeDefined();
  });

  it("handles escalate action from orchestration", async () => {
    const pipeline = new Pipeline({ mode: "iterative" });
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register(new DummyValidationLayer());

    pipeline.register({
      name: "orchestration",
      async process(): Promise<OrchestrationOutput> {
        return {
          action: "escalate",
          workflow_steps: ["escalate_to_human"],
          tool_selections: [],
          estimated_steps: 0,
          mode: "llm",
          model_id: "test",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 0.95,
          status: "ok",
          reasoning: "User is angry, escalating to human",
        };
      },
    });

    const trace = await pipeline.run({
      raw: "I want my money back NOW",
      modality: "text",
    });

    // Should NOT have any execution (no tool calls needed)
    // iterations should be empty (didn't loop)
    expect(trace.payload.iterations).toEqual([]);
    expect(trace.payload.orchestration?.action).toBe("escalate");
    expect(trace.payload.generation).toBeDefined();
    expect(trace.payload.final_output).toBeDefined();
  });

  it("AbortSignal works in iterative mode", async () => {
    const controller = new AbortController();
    controller.abort();

    const pipeline = new Pipeline({
      mode: "iterative",
      signal: controller.signal,
    });
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyOrchestrationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register(new DummyValidationLayer());

    await expect(
      pipeline.run({ raw: "hello", modality: "text" }),
    ).rejects.toThrow("Pipeline aborted");
  });

  it("greeting in iterative mode skips tool loop (action=respond)", async () => {
    const pipeline = buildIterativePipeline();
    const trace = await pipeline.run({ raw: "hello", modality: "text" });

    // Greeting → orchestration says "respond" → no iterations
    expect(trace.payload.classification?.intent).toBe("greeting");
    expect(trace.payload.orchestration?.action).toBe("respond");
    expect(trace.payload.iterations).toEqual([]);
  });

  it("tool_params passed through orchestration", async () => {
    const pipeline = new Pipeline({ mode: "iterative" });
    pipeline.register(new DummyTranslationLayer());
    pipeline.register(new DummyClassificationLayer());
    pipeline.register(new DummyExecutionLayer());
    pipeline.register(new DummyGenerationLayer());
    pipeline.register(new DummyValidationLayer());

    let callCount = 0;
    pipeline.register({
      name: "orchestration",
      async process(): Promise<OrchestrationOutput> {
        callCount++;
        if (callCount === 1) {
          return {
            action: "use_tool",
            workflow_steps: ["book_appointment"],
            tool_selections: ["booking_api"],
            tool_params: { date: "2026-04-15", service: "haircut" },
            estimated_steps: 1,
            mode: "llm",
            model_id: "test",
            model_ver: "1.0",
            latency_ms: 0,
            confidence: 0.9,
            status: "ok",
          };
        }
        return {
          action: "respond",
          workflow_steps: [],
          tool_selections: [],
          estimated_steps: 0,
          mode: "llm",
          model_id: "test",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 0.9,
          status: "ok",
        };
      },
    });

    const trace = await pipeline.run({ raw: "book haircut", modality: "text" });

    // First iteration should have tool_params
    expect(trace.payload.iterations![0].orchestration.tool_params).toEqual({
      date: "2026-04-15",
      service: "haircut",
    });
  });
});
