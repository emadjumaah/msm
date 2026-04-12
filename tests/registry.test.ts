import { describe, it, expect } from "vitest";
import {
  LayerRegistry,
  getDefaultRegistry,
  createPipeline,
} from "../src/core/registry.js";
import type { LayerConfig } from "../src/core/manifest.js";
import type { MSMLayer, MSMPayload, LayerMeta } from "../src/core/types.js";

// ─── LayerRegistry unit tests ────────────────────────────────

describe("LayerRegistry", () => {
  it("registers and creates layers", () => {
    const registry = new LayerRegistry();
    const mockLayer: MSMLayer = {
      name: "translation",
      async process() {
        return {} as LayerMeta;
      },
    };

    registry.register("translation", "test", () => mockLayer);

    const config: LayerConfig = {
      provider: "test",
      model: "test-model",
      version: "1.0",
      fine_tuned: false,
    };
    const created = registry.create("translation", config);
    expect(created).toBe(mockLayer);
  });

  it("throws for unregistered provider", () => {
    const registry = new LayerRegistry();
    const config: LayerConfig = {
      provider: "nonexistent",
      model: "x",
      version: "1.0",
      fine_tuned: false,
    };

    expect(() => registry.create("translation", config)).toThrow(
      /No provider "nonexistent" registered for layer "translation"/,
    );
  });

  it("passes config to factory", () => {
    const registry = new LayerRegistry();
    let receivedConfig: LayerConfig | null = null;

    registry.register("classification", "custom", (config) => {
      receivedConfig = config;
      return {
        name: "classification",
        async process() {
          return {} as LayerMeta;
        },
      };
    });

    const config: LayerConfig = {
      provider: "custom",
      model: "my-model-7b",
      version: "2.0",
      fine_tuned: true,
      dataset: "my-dataset",
    };
    registry.create("classification", config);

    expect(receivedConfig).not.toBeNull();
    expect(receivedConfig!.model).toBe("my-model-7b");
    expect(receivedConfig!.dataset).toBe("my-dataset");
  });

  it("lists providers for a layer", () => {
    const registry = new LayerRegistry();
    const stub = () => ({
      name: "translation" as const,
      async process() {
        return {} as LayerMeta;
      },
    });

    registry.register("translation", "dummy", stub);
    registry.register("translation", "ollama", stub);
    registry.register("translation", "openai", stub);
    registry.register("classification", "dummy", stub);

    const providers = registry.listProviders("translation");
    expect(providers).toContain("dummy");
    expect(providers).toContain("ollama");
    expect(providers).toContain("openai");
    expect(providers).toHaveLength(3);
  });

  it("listAll returns all registrations", () => {
    const registry = new LayerRegistry();
    const stub = () => ({
      name: "translation" as const,
      async process() {
        return {} as LayerMeta;
      },
    });

    registry.register("translation", "dummy", stub);
    registry.register("classification", "ollama", stub);

    const all = registry.listAll();
    expect(all).toHaveLength(2);
    expect(all).toContainEqual({ layer: "translation", provider: "dummy" });
    expect(all).toContainEqual({ layer: "classification", provider: "ollama" });
  });

  it("throws on duplicate registration", () => {
    const registry = new LayerRegistry();
    const stub = () => ({
      name: "translation" as const,
      async process() {
        return {} as LayerMeta;
      },
    });

    registry.register("translation", "dummy", stub);
    expect(() => registry.register("translation", "dummy", stub)).toThrow(
      /Duplicate registration/,
    );
  });

  it("verifies factory produces correct layer name", () => {
    const registry = new LayerRegistry();
    registry.register("translation", "bad", () => ({
      name: "classification", // wrong name!
      async process() {
        return {} as LayerMeta;
      },
    }));

    const config: LayerConfig = {
      provider: "bad",
      model: "x",
      version: "1.0",
      fine_tuned: false,
    };
    expect(() => registry.create("translation", config)).toThrow(
      /produced a layer with name "classification"/,
    );
  });
});

// ─── Default Registry ────────────────────────────────────────

describe("getDefaultRegistry", () => {
  it("has dummy and ollama providers for all layers", async () => {
    const registry = await getDefaultRegistry();
    const layers = [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ];

    for (const layer of layers) {
      const providers = registry.listProviders(layer);
      expect(providers).toContain("dummy");
      expect(providers).toContain("ollama");
    }
  });
});

// ─── createPipeline from manifest file ───────────────────────

describe("createPipeline", () => {
  it("builds a working pipeline from a dummy manifest file", async () => {
    const pipeline = await createPipeline(
      "./examples/food-commerce-gulf-dummy.yaml",
    );

    const trace = await pipeline.run({
      raw: "ابي اطلب برغر وبيبسي",
      modality: "text",
    });

    expect(trace.payload.final_output).toBeDefined();
    // 6 core layers + 1 outbound translation for Arabic input
    expect(trace.entries).toHaveLength(7);
    expect(trace.entries.every((e) => e.status === "ok")).toBe(true);
    // Verify outbound translation was performed
    expect(trace.payload.outbound_translation).toBeDefined();
    expect(trace.payload.outbound_translation?.layer_invoked).toBe(true);
  });

  it("builds from a manifest object", async () => {
    const manifest = {
      msm_version: "1.0",
      manifest_id: "test-v1",
      domain: "test",
      created: "2026-01-01",
      layers: {
        translation: {
          provider: "dummy",
          model: "dummy-translation-v1",
          version: "1.0.0",
          fine_tuned: false,
        },
        classification: {
          provider: "dummy",
          model: "dummy-classification-v1",
          version: "1.0.0",
          fine_tuned: false,
        },
        orchestration: {
          provider: "dummy",
          model: "dummy-orchestration-v1",
          version: "1.0.0",
          fine_tuned: false,
        },
        execution: {
          provider: "dummy",
          model: "dummy-execution-v1",
          version: "1.0.0",
          fine_tuned: false,
        },
        generation: {
          provider: "dummy",
          model: "dummy-generation-v1",
          version: "1.0.0",
          fine_tuned: false,
        },
        validation: {
          provider: "dummy",
          model: "dummy-validation-v1",
          version: "1.0.0",
          fine_tuned: false,
        },
      },
    };

    const pipeline = await createPipeline(manifest);
    const trace = await pipeline.run({ raw: "hello", modality: "text" });

    expect(trace.payload.final_output).toBeDefined();
    expect(trace.entries).toHaveLength(6);
  });

  it("allows custom registry with custom provider", async () => {
    const registry = new LayerRegistry();

    // Register a custom provider for all layers
    const layerNames = [
      "translation",
      "classification",
      "orchestration",
      "execution",
      "generation",
      "validation",
    ] as const;
    for (const name of layerNames) {
      registry.register(name, "mock", () => ({
        name,
        async process(): Promise<LayerMeta> {
          return {
            model_id: "mock-model",
            model_ver: "1.0",
            latency_ms: 0,
            confidence: 0.99,
            status: "ok",
          };
        },
      }));
    }

    const manifest = {
      msm_version: "1.0",
      manifest_id: "mock-test",
      domain: "test",
      created: "2026-01-01",
      layers: {
        translation: {
          provider: "mock",
          model: "mock",
          version: "1.0",
          fine_tuned: false,
        },
        classification: {
          provider: "mock",
          model: "mock",
          version: "1.0",
          fine_tuned: false,
        },
        orchestration: {
          provider: "mock",
          model: "mock",
          version: "1.0",
          fine_tuned: false,
        },
        execution: {
          provider: "mock",
          model: "mock",
          version: "1.0",
          fine_tuned: false,
        },
        generation: {
          provider: "mock",
          model: "mock",
          version: "1.0",
          fine_tuned: false,
        },
        validation: {
          provider: "mock",
          model: "mock",
          version: "1.0",
          fine_tuned: false,
        },
      },
    };

    const pipeline = await createPipeline(manifest, { registry });
    const trace = await pipeline.run({ raw: "test", modality: "text" });

    expect(trace.entries.every((e) => e.model_id === "mock-model")).toBe(true);
  });
});
