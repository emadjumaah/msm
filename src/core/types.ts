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
  /** Conversation history for multi-turn context */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Translation direction hint: "outbound" signals EN→user-language translation */
  direction?: "inbound" | "outbound";
  /** Target language for outbound translation (e.g. "ar-gulf") */
  target_language?: string;
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

export type OrchestrationMode = "rules" | "llm" | "hybrid";

/**
 * Standard orchestration actions.
 *
 * MSM defines 5 standard actions that the pipeline understands natively:
 *   - "use_tool"  — call a tool, then re-enter orchestration (iterative mode)
 *   - "respond"   — stop iterating, proceed to generation
 *   - "clarify"   — ask the user for more information, proceed to generation
 *   - "escalate"  — hand off to a human, proceed to generation
 *   - "delegate"  — hand off to another agent/role, proceed to generation
 *
 * The type is `string` (not a union) — agents can define custom actions
 * beyond the standard set. Only "use_tool" triggers another iteration;
 * any other action is treated as terminal (proceed to generation).
 */
export type OrchestrationAction = string;

/** The 5 standard actions — use these constants for type safety */
export const STANDARD_ACTIONS = {
  USE_TOOL: "use_tool" as OrchestrationAction,
  RESPOND: "respond" as OrchestrationAction,
  CLARIFY: "clarify" as OrchestrationAction,
  ESCALATE: "escalate" as OrchestrationAction,
  DELEGATE: "delegate" as OrchestrationAction,
} as const;

export interface OrchestrationOutput extends LayerMeta {
  /** Next action — required in iterative mode, optional in linear */
  action?: OrchestrationAction;
  workflow_steps: string[];
  tool_selections: string[];
  /** Parameters for the current tool call (iterative mode) */
  tool_params?: Record<string, unknown>;
  estimated_steps: number;
  /** How the workflow was resolved: rules, llm, or hybrid (rules + llm fallback) */
  mode: OrchestrationMode;
  /** Chain-of-thought reasoning for the decision */
  reasoning?: string;
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

export type Tone = "warm" | "neutral" | "formal" | "apologetic";

export interface GenerationOutput extends LayerMeta {
  response_text: string;
  /** Bilingual response — secondary language (e.g. Arabic) */
  response_text_ar?: string;
  tone: Tone;
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
  /** Bilingual text — secondary language, if generation provided it */
  text_ar?: string;
  language: string;
  total_latency_ms: number;
  /** Aggregate pipeline health: "ok" if all layers succeeded, "degraded" if any failed but output was produced, "failed" if pipeline could not produce output */
  pipeline_status: "ok" | "degraded" | "failed";
  /** Number of orchestrate→execute iterations (iterative mode only) */
  iterations_used?: number;
}

// ─── Iteration Record (iterative pipelines) ─────────────────

export interface PipelineIteration {
  orchestration: OrchestrationOutput;
  execution?: ExecutionOutput;
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
  /** Outbound translation: English response → user's language */
  outbound_translation?: TranslationOutput;
  final_output?: FinalOutput;

  /** Past orchestrate→execute iterations (iterative mode) */
  iterations?: PipelineIteration[];

  /** Hook outputs keyed by hook name (domain-specific extensions) */
  hooks?: Record<string, HookOutput>;

  /** Validation feedback injected on retry — tells generation WHY the previous attempt failed */
  _validation_feedback?: {
    violations: string[];
    quality_score: number;
    attempt: number;
  };
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
  /** Which translation pass this hook applies to (default: "inbound") */
  direction?: "inbound" | "outbound" | "both";
  /** Process the payload and return structured output */
  process(payload: MSMPayload): Promise<HookOutput>;
}
