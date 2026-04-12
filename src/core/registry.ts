/**
 * LayerRegistry — maps (layerName, provider) → layer factory.
 *
 * This is the bridge between manifests and running pipelines.
 * A manifest declares WHAT should run; the registry knows HOW to create it.
 *
 * Think of it like Docker:
 *   docker-compose.yml says "image: nginx:1.25"  → Docker pulls nginx
 *   manifest.yaml says "provider: ollama, model: qwen2.5:3b" → Registry creates OllamaLayer
 *
 * Built-in providers: "dummy", "ollama"
 * Add your own: registry.register("translation", "openai", (config) => new MyOpenAILayer(config))
 */

import type { MSMLayer, LayerName, MSMHook, HookPoint } from "./types.js";
import type { LayerConfig, HookConfig, MSMManifest } from "./manifest.js";
import { Pipeline } from "./pipeline.js";
import type { PipelineOptions } from "./pipeline.js";

// ─── Types ───────────────────────────────────────────────────

export type LayerFactory = (config: LayerConfig) => MSMLayer;
export type HookFactory = (name: string, config: HookConfig) => MSMHook;

// ─── Registry ────────────────────────────────────────────────

export class LayerRegistry {
  private factories = new Map<string, LayerFactory>();
  private hookFactories = new Map<string, HookFactory>();

  /** Register a factory for a (layer, provider) pair. */
  register(layerName: string, provider: string, factory: LayerFactory): void {
    this.factories.set(`${layerName}:${provider}`, factory);
  }

  /** Register a hook factory for a provider name. */
  registerHook(provider: string, factory: HookFactory): void {
    this.hookFactories.set(provider, factory);
  }

  /** Create a layer instance from a layer config. */
  create(layerName: string, config: LayerConfig): MSMLayer {
    const key = `${layerName}:${config.provider}`;
    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(
        `No provider "${config.provider}" registered for layer "${layerName}". ` +
          `Available: ${this.listProviders(layerName).join(", ") || "none"}`,
      );
    }
    return factory(config);
  }

  /** Create a hook instance from a hook config. */
  createHook(hookName: string, config: HookConfig): MSMHook {
    const factory = this.hookFactories.get(config.provider);
    if (!factory) {
      throw new Error(
        `No hook provider "${config.provider}" registered. ` +
          `Available: ${[...this.hookFactories.keys()].join(", ") || "none"}`,
      );
    }
    return factory(hookName, config);
  }

  /** List registered providers for a layer. */
  listProviders(layerName: string): string[] {
    const prefix = `${layerName}:`;
    const providers: string[] = [];
    for (const key of this.factories.keys()) {
      if (key.startsWith(prefix)) {
        providers.push(key.slice(prefix.length));
      }
    }
    return providers;
  }

  /** List all registered (layer, provider) pairs. */
  listAll(): Array<{ layer: string; provider: string }> {
    return [...this.factories.keys()].map((key) => {
      const [layer, provider] = key.split(":");
      return { layer, provider };
    });
  }
}

// ─── Default Registry (pre-loaded with built-in providers) ───

let _default: LayerRegistry | null = null;

export async function getDefaultRegistry(): Promise<LayerRegistry> {
  if (_default) return _default;

  const registry = new LayerRegistry();

  // ── Dummy provider (always available, zero dependencies) ───
  const dummy = await import("../dummy-models/index.js");

  registry.register(
    "translation",
    "dummy",
    () => new dummy.DummyTranslationLayer(),
  );
  registry.register(
    "classification",
    "dummy",
    () => new dummy.DummyClassificationLayer(),
  );
  registry.register(
    "orchestration",
    "dummy",
    () => new dummy.DummyOrchestrationLayer(),
  );
  registry.register(
    "execution",
    "dummy",
    () => new dummy.DummyExecutionLayer(),
  );
  registry.register(
    "generation",
    "dummy",
    () => new dummy.DummyGenerationLayer(),
  );
  registry.register(
    "validation",
    "dummy",
    () => new dummy.DummyValidationLayer(),
  );

  // ── Ollama provider (real LLM via local Ollama server) ─────
  const ollama = await import("../ollama-layers/index.js");

  registry.register(
    "translation",
    "ollama",
    (c) => new ollama.OllamaTranslationLayer(c.model),
  );
  registry.register(
    "classification",
    "ollama",
    (c) => new ollama.OllamaClassificationLayer(c.model),
  );
  registry.register(
    "orchestration",
    "ollama",
    (c) => new ollama.OllamaOrchestrationLayer(c.model),
  );
  registry.register(
    "execution",
    "ollama",
    () => new ollama.DummyExecutionLayer(),
  );
  registry.register(
    "generation",
    "ollama",
    (c) => new ollama.OllamaGenerationLayer(c.model),
  );
  registry.register(
    "validation",
    "ollama",
    () => new ollama.DummyValidationLayer(),
  );

  _default = registry;
  return registry;
}

// ─── Create Pipeline from Manifest ───────────────────────────

/**
 * Build a ready-to-run pipeline from a manifest file.
 *
 * This is the MSM equivalent of `docker compose up`:
 *   - Manifest declares which provider + model for each layer
 *   - Registry knows how to create each layer
 *   - You get a running pipeline
 *
 * @example
 * ```ts
 * const pipeline = await createPipeline("./examples/food-commerce-gulf-ollama.yaml");
 * const trace = await pipeline.run({ raw: "ابي اطلب برغر", modality: "text" });
 * ```
 */
export async function createPipeline(
  manifestOrPath: MSMManifest | string,
  options?: { registry?: LayerRegistry; pipelineOptions?: PipelineOptions },
): Promise<Pipeline> {
  // Load manifest if given a path
  let manifest: MSMManifest;
  if (typeof manifestOrPath === "string") {
    const { loadManifest } = await import("./manifest.js");
    manifest = await loadManifest(manifestOrPath);
  } else {
    manifest = manifestOrPath;
  }

  const registry = options?.registry ?? (await getDefaultRegistry());
  const pipeline = new Pipeline(options?.pipelineOptions);
  pipeline.setManifest(manifest);

  const layerOrder: LayerName[] = [
    "translation",
    "classification",
    "orchestration",
    "execution",
    "generation",
    "validation",
  ];

  for (const name of layerOrder) {
    const config = manifest.layers[name];
    const layer = registry.create(name, config);
    pipeline.register(layer);
  }

  // Wire up hooks from manifest
  if (manifest.hooks) {
    for (const [hookName, hookConfig] of Object.entries(manifest.hooks)) {
      const hook = registry.createHook(hookName, hookConfig);
      pipeline.addHook(hook);
    }
  }

  return pipeline;
}
