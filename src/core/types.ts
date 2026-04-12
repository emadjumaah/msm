/**
 * MSM Layer Contracts — the core types that define the standard.
 * Every MSM-compliant layer must produce output matching these types.
 */

// ─── Base ────────────────────────────────────────────────────

export type LayerStatus = "ok" | "degraded" | "failed";

export interface LayerMeta {
  model_id: string;
  model_ver: string;
  latency_ms: number;
  confidence: number;
  status: LayerStatus;
  error?: string;
}

// ─── Input ───────────────────────────────────────────────────

export interface MSMInput {
  raw: string;
  modality: "text" | "voice" | "image";
  language?: string;
}

// ─── Context Annotation (Option C: Cultural Context) ─────────

export interface ContextAnnotation {
  original_term: string;
  translated_term: string;
  cultural_meaning: string;
  intent_hints: string[];
}

// ─── Layer 1: Translation ────────────────────────────────────

export type TranslationMode = "translated" | "native";

export interface TranslationOutput extends LayerMeta {
  translated_text: string | null;
  source_language: string;
  target_language: string;
  layer_invoked: boolean;
  mode: TranslationMode;
  context_annotations?: ContextAnnotation[];
}

// ─── Layer 2: Classification ─────────────────────────────────

export interface ClassificationOutput extends LayerMeta {
  intent: string;
  domain: string;
  urgency: "low" | "normal" | "high" | "critical";
  routing_target: string;
}

// ─── Layer 3: Orchestration ──────────────────────────────────

export interface OrchestrationOutput extends LayerMeta {
  workflow_steps: string[];
  tool_selections: string[];
  estimated_steps: number;
}

// ─── Layer 4: Execution ──────────────────────────────────────

export interface ToolResult {
  tool: string;
  status: LayerStatus;
  result: Record<string, unknown>;
}

export interface ExecutionOutput extends LayerMeta {
  tool_results: ToolResult[];
  execution_status: LayerStatus;
  errors: string[];
}

// ─── Layer 5: Generation ─────────────────────────────────────

export interface GenerationOutput extends LayerMeta {
  response_text: string;
  tone: string;
  word_count: number;
}

// ─── Layer 6: Validation ─────────────────────────────────────

export type ValidationAction = "release" | "block" | "retry";

export interface ValidationOutput extends LayerMeta {
  passed: boolean;
  quality_score: number;
  policy_violations: string[];
  action: ValidationAction;
}

// ─── Final Output ────────────────────────────────────────────

export interface FinalOutput {
  text: string;
  language: string;
  total_latency_ms: number;
}

// ─── Full Payload ────────────────────────────────────────────

export interface MSMPayload {
  msm_version: string;
  session_id: string;
  trace_id: string;
  timestamp: string;

  input: MSMInput;
  translation?: TranslationOutput;
  classification?: ClassificationOutput;
  orchestration?: OrchestrationOutput;
  execution?: ExecutionOutput;
  generation?: GenerationOutput;
  validation?: ValidationOutput;
  final_output?: FinalOutput;

  /** Hook outputs keyed by hook name (domain-specific extensions) */
  hooks?: Record<string, HookOutput>;
}

// ─── Layer Interface ─────────────────────────────────────────

export type LayerName =
  | "translation"
  | "classification"
  | "orchestration"
  | "execution"
  | "generation"
  | "validation";

export interface MSMLayer<T extends LayerMeta = LayerMeta> {
  name: LayerName;
  process(payload: MSMPayload): Promise<T>;
}

// ─── Hooks — Domain-specific extensions between layers ───────

/**
 * Hook points: run custom logic before/after any core layer.
 *
 * Examples:
 *   "before:translation"   → image-to-text, voice-to-text
 *   "after:classification"  → fraud detection, priority override
 *   "after:generation"      → drug interaction check, compliance
 *
 * Hooks do NOT replace layers. They enrich the payload.
 * The 6 core layers remain the standard.
 */
export type HookPoint = `before:${LayerName}` | `after:${LayerName}`;

export interface HookOutput extends LayerMeta {
  /** Arbitrary structured data added to payload.hooks[hookName] */
  data: Record<string, unknown>;
}

export interface MSMHook {
  /** Unique name for this hook (e.g. "image_recognition", "drug_check") */
  name: string;
  /** When to run relative to the 6 core layers */
  point: HookPoint;
  /** Process the payload and return structured output */
  process(payload: MSMPayload): Promise<HookOutput>;
}
