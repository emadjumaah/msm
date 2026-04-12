import type {
  MSMLayer,
  MSMPayload,
  OrchestrationOutput,
} from "../core/types.js";

/**
 * Dummy Orchestration Layer
 * Returns hardcoded workflows by intent.
 * Real implementation would use Qwen 2.5 3B.
 */

const WORKFLOWS: Record<string, { steps: string[]; tools: string[] }> = {
  place_order: {
    steps: [
      "get_location",
      "find_restaurant",
      "check_menu",
      "place_order",
      "confirm_order",
    ],
    tools: ["location_api", "restaurant_api", "menu_api", "order_api"],
  },
  track_order: {
    steps: ["lookup_order", "get_delivery_status", "estimate_eta"],
    tools: ["order_api", "delivery_api"],
  },
  cancel: {
    steps: [
      "lookup_order",
      "check_cancel_policy",
      "cancel_order",
      "confirm_cancellation",
    ],
    tools: ["order_api", "policy_api"],
  },
  inquiry: {
    steps: ["identify_subject", "fetch_information", "format_answer"],
    tools: ["knowledge_api"],
  },
  complaint: {
    steps: [
      "log_complaint",
      "lookup_order",
      "assess_issue",
      "propose_resolution",
    ],
    tools: ["order_api", "support_api"],
  },
  greeting: {
    steps: ["generate_greeting"],
    tools: [],
  },
};

const DEFAULT_WORKFLOW = {
  steps: ["analyze_request", "fetch_data", "generate_response"],
  tools: ["knowledge_api"],
};

export class DummyOrchestrationLayer implements MSMLayer<OrchestrationOutput> {
  name = "orchestration" as const;

  async process(payload: MSMPayload): Promise<OrchestrationOutput> {
    const start = performance.now();
    const intent = payload.classification?.intent ?? "inquiry";
    const wf = WORKFLOWS[intent] ?? DEFAULT_WORKFLOW;

    return {
      workflow_steps: wf.steps,
      tool_selections: wf.tools,
      estimated_steps: wf.steps.length,
      model_id: "dummy-orchestration-v1",
      model_ver: "1.0.0",
      latency_ms: Math.round(performance.now() - start),
      confidence: 0.7,
      status: "ok",
    };
  }
}
