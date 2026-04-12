import type {
  MSMLayer,
  MSMPayload,
  OrchestrationOutput,
  OrchestrationAction,
} from "../core/types.js";

/**
 * Dummy Orchestration Layer — rules-based workflow resolver.
 *
 * This is intentionally deterministic. For structured domain tasks,
 * rules are more reliable than LLM planning. The real production
 * pattern is "hybrid": rules for known intents, LLM fallback for unknown.
 *
 * Real implementation options:
 *   - "rules" (this): fastest, most deterministic, best for known domains
 *   - "llm": Qwen 2.5 3B or similar for open-ended planning
 *   - "hybrid": rules first, LLM fallback when no rule matches
 */

interface WorkflowRule {
  steps: string[];
  tools: string[];
  action: OrchestrationAction;
}

const WORKFLOWS: Record<string, WorkflowRule> = {
  place_order: {
    steps: [
      "get_location",
      "find_restaurant",
      "check_menu",
      "place_order",
      "confirm_order",
    ],
    tools: ["location_api", "restaurant_api", "menu_api", "order_api"],
    action: "use_tool",
  },
  track_order: {
    steps: ["lookup_order", "get_delivery_status", "estimate_eta"],
    tools: ["order_api", "delivery_api"],
    action: "use_tool",
  },
  cancel: {
    steps: [
      "lookup_order",
      "check_cancel_policy",
      "cancel_order",
      "confirm_cancellation",
    ],
    tools: ["order_api", "policy_api"],
    action: "use_tool",
  },
  inquiry: {
    steps: ["identify_subject", "fetch_information", "format_answer"],
    tools: ["knowledge_api"],
    action: "use_tool",
  },
  complaint: {
    steps: [
      "log_complaint",
      "lookup_order",
      "assess_issue",
      "propose_resolution",
    ],
    tools: ["order_api", "support_api"],
    action: "use_tool",
  },
  greeting: {
    steps: ["generate_greeting"],
    tools: [],
    action: "respond",
  },
};

const DEFAULT_WORKFLOW: WorkflowRule = {
  steps: ["analyze_request", "fetch_data", "generate_response"],
  tools: ["knowledge_api"],
  action: "use_tool",
};

export class DummyOrchestrationLayer implements MSMLayer<OrchestrationOutput> {
  name = "orchestration" as const;

  async process(payload: MSMPayload): Promise<OrchestrationOutput> {
    const start = performance.now();
    const intent = payload.classification?.intent ?? "inquiry";
    const matched = WORKFLOWS[intent];
    const wf = matched ?? DEFAULT_WORKFLOW;

    // In iterative mode with prior iterations, switch to "respond" after first tool execution
    const hasIterations = (payload.iterations?.length ?? 0) > 0;
    const action = hasIterations
      ? ("respond" as OrchestrationAction)
      : wf.action;

    return {
      action,
      workflow_steps: wf.steps,
      tool_selections: wf.tools,
      estimated_steps: wf.steps.length,
      mode: matched ? "rules" : "rules", // dummy always uses rules
      model_id: "dummy-orchestration-v1",
      model_ver: "1.0.0",
      latency_ms: Math.round(performance.now() - start),
      confidence: matched ? 0.9 : 0.5, // higher confidence when rule matched
      status: "ok",
    };
  }
}
