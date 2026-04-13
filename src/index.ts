// MSM — Multi Small Models
// Core exports

export type {
  LayerStatus,
  LayerMeta,
  MSMInput,
  ContextAnnotation,
  TranslationMode,
  TranslationOutput,
  ClassificationOutput,
  OrchestrationMode,
  OrchestrationAction,
  OrchestrationOutput,
  ExecutionOutput,
  Tone,
  GenerationOutput,
  ValidationOutput,
  FinalOutput,
  PlanStep,
  MSMPayload,
  LayerName,
  MSMLayer,
  ToolResult,
  ValidationAction,
  HookPoint,
  HookOutput,
  MSMHook,
} from "./core/types.js";

export { STANDARD_ACTIONS } from "./core/types.js";

export { Pipeline } from "./core/pipeline.js";
export type {
  PipelineTrace,
  TraceEntry,
  PipelineOptions,
} from "./core/pipeline.js";
export { loadManifest, validateManifest } from "./core/manifest.js";
export type { MSMManifest, LayerConfig, HookConfig } from "./core/manifest.js";
export { HttpLayer } from "./core/http-layer.js";

// Registry — build pipelines from manifests (like docker compose)
export {
  LayerRegistry,
  getDefaultRegistry,
  resetDefaultRegistry,
  createPipeline,
} from "./core/registry.js";
export type { LayerFactory, HookFactory } from "./core/registry.js";

// Dummy models — for testing, prototyping, and offline use
export {
  DummyTranslationLayer,
  DummyClassificationLayer,
  DummyOrchestrationLayer,
  DummyExecutionLayer,
  DummyGenerationLayer,
  DummyValidationLayer,
} from "./dummy-models/index.js";

// Ollama models — real LLM layers via local Ollama server
export {
  OllamaTranslationLayer,
  OllamaClassificationLayer,
  OllamaOrchestrationLayer,
  OllamaGenerationLayer,
} from "./ollama-layers/index.js";
