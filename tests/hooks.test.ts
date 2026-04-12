import { describe, it, expect } from "vitest";
import { Pipeline } from "../src/core/pipeline.js";
import type {
  MSMHook,
  MSMPayload,
  HookOutput,
  LayerMeta,
  MSMLayer,
} from "../src/core/types.js";
import { LayerRegistry, createPipeline } from "../src/core/registry.js";

// ─── Helper: minimal layer stub ──────────────────────────────

function stubLayer(name: string): MSMLayer {
  return {
    name: name as MSMLayer["name"],
    async process(): Promise<LayerMeta> {
      return {
        model_id: `stub-${name}`,
        model_ver: "1.0",
        latency_ms: 0,
        confidence: 0.9,
        status: "ok",
      };
    },
  };
}

// ─── Hook unit tests ─────────────────────────────────────────

describe("Pipeline hooks", () => {
  it("runs a before-hook before the target layer", async () => {
    const callOrder: string[] = [];

    const pipeline = new Pipeline();
    const layers = [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ];
    for (const name of layers) {
      pipeline.register({
        name: name as MSMLayer["name"],
        async process() {
          callOrder.push(name);
          return {
            model_id: name,
            model_ver: "1.0",
            latency_ms: 0,
            confidence: 0.9,
            status: "ok",
          } as LayerMeta;
        },
      });
    }

    const hook: MSMHook = {
      name: "image_analysis",
      point: "before:classification",
      async process() {
        callOrder.push("hook:image_analysis");
        return {
          model_id: "medclip",
          model_ver: "1.0",
          latency_ms: 50,
          confidence: 0.85,
          status: "ok",
          data: { findings: "No fracture detected" },
        };
      },
    };
    pipeline.addHook(hook);

    await pipeline.run({ raw: "test", modality: "text" });

    // Hook should run between translation and classification
    const hookIdx = callOrder.indexOf("hook:image_analysis");
    const classIdx = callOrder.indexOf("classification");
    const transIdx = callOrder.indexOf("translation");
    expect(hookIdx).toBeGreaterThan(transIdx);
    expect(hookIdx).toBeLessThan(classIdx);
  });

  it("runs an after-hook after the target layer", async () => {
    const callOrder: string[] = [];

    const pipeline = new Pipeline();
    const layers = [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ];
    for (const name of layers) {
      pipeline.register({
        name: name as MSMLayer["name"],
        async process() {
          callOrder.push(name);
          return {
            model_id: name,
            model_ver: "1.0",
            latency_ms: 0,
            confidence: 0.9,
            status: "ok",
          } as LayerMeta;
        },
      });
    }

    const hook: MSMHook = {
      name: "drug_check",
      point: "after:generation",
      async process() {
        callOrder.push("hook:drug_check");
        return {
          model_id: "drugcheck",
          model_ver: "1.0",
          latency_ms: 30,
          confidence: 0.95,
          status: "ok",
          data: { safe: true },
        };
      },
    };
    pipeline.addHook(hook);

    await pipeline.run({ raw: "test", modality: "text" });

    const hookIdx = callOrder.indexOf("hook:drug_check");
    const genIdx = callOrder.indexOf("generation");
    const valIdx = callOrder.indexOf("validation");
    expect(hookIdx).toBeGreaterThan(genIdx);
    expect(hookIdx).toBeLessThan(valIdx);
  });

  it("stores hook output in payload.hooks", async () => {
    const pipeline = new Pipeline();
    for (const name of [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ]) {
      pipeline.register(stubLayer(name));
    }

    pipeline.addHook({
      name: "fraud_detector",
      point: "after:classification",
      async process() {
        return {
          model_id: "fraud-v1",
          model_ver: "1.0",
          latency_ms: 10,
          confidence: 0.99,
          status: "ok",
          data: { is_fraud: false, risk_score: 0.02 },
        };
      },
    });

    const trace = await pipeline.run({ raw: "test", modality: "text" });

    expect(trace.payload.hooks).toBeDefined();
    expect(trace.payload.hooks!["fraud_detector"]).toBeDefined();
    expect(trace.payload.hooks!["fraud_detector"].data.is_fraud).toBe(false);
    expect(trace.payload.hooks!["fraud_detector"].data.risk_score).toBe(0.02);
  });

  it("records hooks in trace entries", async () => {
    const pipeline = new Pipeline();
    for (const name of [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ]) {
      pipeline.register(stubLayer(name));
    }

    pipeline.addHook({
      name: "image_scan",
      point: "before:translation",
      async process() {
        return {
          model_id: "medclip",
          model_ver: "1.0",
          latency_ms: 100,
          confidence: 0.88,
          status: "ok",
          data: { text: "X-ray shows normal chest" },
        };
      },
    });

    const trace = await pipeline.run({ raw: "test", modality: "text" });

    const hookEntry = trace.entries.find((e) => e.layer === "hook:image_scan");
    expect(hookEntry).toBeDefined();
    expect(hookEntry!.model_id).toBe("medclip");
    expect(hookEntry!.latency_ms).toBe(100);
  });

  it("gracefully handles hook failures", async () => {
    const pipeline = new Pipeline();
    for (const name of [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ]) {
      pipeline.register(stubLayer(name));
    }

    pipeline.addHook({
      name: "broken_hook",
      point: "before:classification",
      async process() {
        throw new Error("Connection refused");
      },
    });

    // Pipeline should not crash
    const trace = await pipeline.run({ raw: "test", modality: "text" });

    const hookEntry = trace.entries.find((e) => e.layer === "hook:broken_hook");
    expect(hookEntry).toBeDefined();
    expect(hookEntry!.status).toBe("failed");
    expect(hookEntry!.error).toBe("Connection refused");

    // All 6 core layers should still run
    const coreLayers = trace.entries.filter(
      (e) => !e.layer.startsWith("hook:"),
    );
    expect(coreLayers).toHaveLength(6);
    expect(coreLayers.every((e) => e.status === "ok")).toBe(true);
  });

  it("allows multiple hooks at the same point", async () => {
    const pipeline = new Pipeline();
    for (const name of [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ]) {
      pipeline.register(stubLayer(name));
    }

    pipeline.addHook({
      name: "hook_a",
      point: "before:classification",
      async process() {
        return {
          model_id: "a",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
          data: { a: true },
        };
      },
    });

    pipeline.addHook({
      name: "hook_b",
      point: "before:classification",
      async process() {
        return {
          model_id: "b",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
          data: { b: true },
        };
      },
    });

    const trace = await pipeline.run({ raw: "test", modality: "text" });

    expect(trace.payload.hooks!["hook_a"].data.a).toBe(true);
    expect(trace.payload.hooks!["hook_b"].data.b).toBe(true);
  });

  it("hook can read earlier layer output from payload", async () => {
    const pipeline = new Pipeline();
    for (const name of [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ]) {
      pipeline.register(stubLayer(name));
    }

    let sawClassification = false;
    pipeline.addHook({
      name: "post_classify",
      point: "after:classification",
      async process(payload) {
        sawClassification = payload.classification !== undefined;
        return {
          model_id: "x",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 1,
          status: "ok",
          data: { sawClassification },
        };
      },
    });

    await pipeline.run({ raw: "test", modality: "text" });
    expect(sawClassification).toBe(true);
  });
});

// ─── Registry hook wiring tests ──────────────────────────────

describe("Registry hook factories", () => {
  it("registerHook + createHook works", () => {
    const registry = new LayerRegistry();
    registry.registerHook("test-provider", (name, config) => ({
      name,
      point: config.point as MSMHook["point"],
      async process() {
        return {
          model_id: config.model,
          model_ver: config.version,
          latency_ms: 0,
          confidence: 1,
          status: "ok",
          data: {},
        };
      },
    }));

    const hook = registry.createHook("my_hook", {
      provider: "test-provider",
      model: "test-model",
      version: "1.0",
      point: "before:classification",
      fine_tuned: false,
    });

    expect(hook.name).toBe("my_hook");
    expect(hook.point).toBe("before:classification");
  });

  it("createPipeline wires hooks from manifest", async () => {
    const registry = new LayerRegistry();

    // Register dummy layers
    for (const name of [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ]) {
      registry.register(name, "dummy", () => stubLayer(name));
    }

    // Register a hook provider
    registry.registerHook("test-hook", (name, config) => ({
      name,
      point: config.point as MSMHook["point"],
      async process() {
        return {
          model_id: config.model,
          model_ver: config.version,
          latency_ms: 5,
          confidence: 0.99,
          status: "ok",
          data: { checked: true },
        };
      },
    }));

    const manifest = {
      msm_version: "1.0",
      manifest_id: "test-hooks",
      domain: "test",
      created: "2026-01-01",
      layers: {
        translation: {
          provider: "dummy",
          model: "m",
          version: "1.0",
          fine_tuned: false,
        },
        classification: {
          provider: "dummy",
          model: "m",
          version: "1.0",
          fine_tuned: false,
        },
        orchestration: {
          provider: "dummy",
          model: "m",
          version: "1.0",
          fine_tuned: false,
        },
        execution: {
          provider: "dummy",
          model: "m",
          version: "1.0",
          fine_tuned: false,
        },
        generation: {
          provider: "dummy",
          model: "m",
          version: "1.0",
          fine_tuned: false,
        },
        validation: {
          provider: "dummy",
          model: "m",
          version: "1.0",
          fine_tuned: false,
        },
      },
      hooks: {
        safety_check: {
          provider: "test-hook",
          model: "safety-v1",
          version: "1.0",
          point: "after:generation",
          fine_tuned: false,
        },
      },
    };

    const pipeline = await createPipeline(manifest, { registry });
    const trace = await pipeline.run({ raw: "test", modality: "text" });

    // Hook should appear in trace
    const hookEntry = trace.entries.find(
      (e) => e.layer === "hook:safety_check",
    );
    expect(hookEntry).toBeDefined();
    expect(hookEntry!.model_id).toBe("safety-v1");

    // Hook output should be in payload
    expect(trace.payload.hooks!["safety_check"].data.checked).toBe(true);
  });
});
