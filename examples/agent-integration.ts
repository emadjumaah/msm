#!/usr/bin/env tsx
/**
 * Agent Integration Example — Dual-Brain MSM
 *
 * Shows how an agent framework (dalil, langchain, custom) uses
 * two MSM pipeline instances as its structured brain:
 *
 *   System 1 (fast brain)  — linear pipeline for simple messages
 *   System 2 (full brain)  — iterative pipeline for complex multi-tool tasks
 *
 * Run:
 *   npx tsx examples/agent-integration.ts
 */

import {
  Pipeline,
  DummyTranslationLayer,
  DummyClassificationLayer,
  DummyOrchestrationLayer,
  DummyExecutionLayer,
  DummyGenerationLayer,
  DummyValidationLayer,
  STANDARD_ACTIONS,
  type PipelineTrace,
  type MSMLayer,
  type MSMPayload,
  type OrchestrationOutput,
  type ExecutionOutput,
  type GenerationOutput,
  type Tone,
} from "../src/index.js";

// ─── 1. Build Two Brains ─────────────────────────────────────

/** System 1: Fast path — linear, 6 layers, one pass */
function buildFastBrain(): Pipeline {
  const pipeline = new Pipeline({ mode: "linear" });
  pipeline.register(new DummyTranslationLayer());
  pipeline.register(new DummyClassificationLayer());
  pipeline.register(new DummyOrchestrationLayer());
  pipeline.register(new DummyExecutionLayer());
  pipeline.register(new DummyGenerationLayer());
  pipeline.register(new DummyValidationLayer());
  pipeline.freeze(); // safe for concurrent requests
  return pipeline;
}

/** System 2: Full brain — iterative, orchestrate→execute loop */
function buildFullBrain(): Pipeline {
  const pipeline = new Pipeline({
    mode: "iterative",
    maxIterations: 6,
  });
  pipeline.register(new DummyTranslationLayer());
  pipeline.register(new DummyClassificationLayer());

  // Custom orchestration that makes multi-step decisions
  pipeline.register({
    name: "orchestration",
    async process(payload: MSMPayload): Promise<OrchestrationOutput> {
      const intent = payload.classification?.intent ?? "unknown";
      const pastIterations = payload.iterations?.length ?? 0;

      // First iteration: check if we need tools
      if (pastIterations === 0 && intent === "place_order") {
        return {
          action: STANDARD_ACTIONS.USE_TOOL,
          workflow_steps: ["find_restaurant", "check_menu", "place_order"],
          tool_selections: ["restaurant_api", "menu_api"],
          tool_params: { cuisine: "burgers", location: "Doha" },
          estimated_steps: 3,
          mode: "llm",
          reasoning:
            "User wants to order food — need restaurant + menu lookup first",
          model_id: "orchestration-v1",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 0.92,
          status: "ok",
        };
      }

      // Second iteration: place the actual order using results from first iteration
      if (pastIterations === 1 && intent === "place_order") {
        return {
          action: STANDARD_ACTIONS.USE_TOOL,
          workflow_steps: ["place_order", "confirm_order"],
          tool_selections: ["order_api"],
          tool_params: {
            items: ["Classic Burger", "Pepsi"],
            restaurant:
              payload.iterations![0].execution?.tool_results[0]?.result,
          },
          estimated_steps: 2,
          mode: "llm",
          reasoning: "Got restaurant info, now placing the order",
          model_id: "orchestration-v1",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 0.95,
          status: "ok",
        };
      }

      // Complaints → escalate to human agent
      if (intent === "complaint") {
        return {
          action: STANDARD_ACTIONS.ESCALATE,
          workflow_steps: ["escalate_to_human"],
          tool_selections: [],
          estimated_steps: 0,
          mode: "llm",
          reasoning: "Customer complaint — escalating to human support",
          model_id: "orchestration-v1",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 0.98,
          status: "ok",
        };
      }

      // Custom agent action (not in MSM standard — agent-defined)
      if (intent === "cancel") {
        return {
          action: "require_approval", // ← custom action! Agent handles it
          workflow_steps: ["check_policy", "request_approval"],
          tool_selections: ["policy_api"],
          estimated_steps: 2,
          mode: "llm",
          reasoning: "Cancellation requires manager approval per policy",
          model_id: "orchestration-v1",
          model_ver: "1.0",
          latency_ms: 0,
          confidence: 0.9,
          status: "ok",
        };
      }

      // Default: respond directly
      return {
        action: STANDARD_ACTIONS.RESPOND,
        workflow_steps: ["direct_response"],
        tool_selections: [],
        estimated_steps: 0,
        mode: "rules",
        model_id: "orchestration-v1",
        model_ver: "1.0",
        latency_ms: 0,
        confidence: 0.85,
        status: "ok",
      };
    },
  });

  pipeline.register(new DummyExecutionLayer());
  pipeline.register(new DummyGenerationLayer());
  pipeline.register(new DummyValidationLayer());
  pipeline.freeze();
  return pipeline;
}

// ─── 2. Agent Router — decides which brain to use ────────────

interface AgentResponse {
  brain: "fast" | "full";
  text: string;
  action?: string;
  iterations?: number;
  latency_ms: number;
  trace_id: string;
}

async function agentProcess(
  text: string,
  fastBrain: Pipeline,
  fullBrain: Pipeline,
): Promise<AgentResponse> {
  // Step 1: Quick classify with fast brain
  const quickTrace = await fastBrain.run({ raw: text, modality: "text" });
  const intent = quickTrace.payload.classification?.intent;
  const action = quickTrace.payload.orchestration?.action;

  // Step 2: Route based on complexity
  const needsFullBrain =
    action === STANDARD_ACTIONS.USE_TOOL || // needs tool calls
    intent === "place_order" || // multi-step
    intent === "cancel" || // needs approval
    intent === "complaint"; // needs escalation

  if (!needsFullBrain) {
    // Fast brain handled it — return directly
    return {
      brain: "fast",
      text: quickTrace.payload.final_output?.text ?? "",
      latency_ms: quickTrace.total_latency_ms,
      trace_id: quickTrace.trace_id,
    };
  }

  // Step 3: Full brain for complex tasks
  const fullTrace = await fullBrain.run({ raw: text, modality: "text" });

  return {
    brain: "full",
    text: fullTrace.payload.final_output?.text ?? "",
    action: fullTrace.payload.orchestration?.action,
    iterations: fullTrace.payload.final_output?.iterations_used,
    latency_ms: fullTrace.total_latency_ms,
    trace_id: fullTrace.trace_id,
  };
}

// ─── 3. Run Demo ─────────────────────────────────────────────

async function main() {
  const fastBrain = buildFastBrain();
  const fullBrain = buildFullBrain();

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  MSM Dual-Brain Agent Integration Demo          ║");
  console.log("║  System 1 (fast) + System 2 (full)              ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const messages = [
    // Simple → fast brain
    { text: "Hello!", expected: "fast" },
    { text: "What's on your menu?", expected: "fast" },

    // Complex → full brain
    { text: "I want to order a burger and pepsi", expected: "full" },
    { text: "I want to cancel my order", expected: "full" },
    { text: "The food was cold and terrible!", expected: "full" },

    // Arabic → fast brain (simple greeting)
    { text: "مرحبا", expected: "fast" },
  ];

  for (const msg of messages) {
    const result = await agentProcess(msg.text, fastBrain, fullBrain);

    const brain = result.brain === "fast" ? "⚡ System 1" : "🧠 System 2";
    const match = result.brain === msg.expected ? "✓" : "✗";

    console.log(`${match} "${msg.text}"`);
    console.log(`  Brain:      ${brain} (${result.brain})`);
    console.log(`  Response:   ${result.text.substring(0, 80)}...`);

    if (result.action) {
      console.log(`  Action:     ${result.action}`);
    }
    if (result.iterations !== undefined) {
      console.log(`  Iterations: ${result.iterations}`);
    }
    console.log(`  Latency:    ${result.latency_ms}ms`);
    console.log();
  }

  // ── Show what custom actions look like ──
  console.log("────────────────────────────────────────────────────");
  console.log("Custom Action Example:");
  console.log();

  const cancelTrace = await fullBrain.run({
    raw: "Cancel my order",
    modality: "text",
  });

  const orchAction = cancelTrace.payload.orchestration?.action;
  console.log(`  Orchestration action: "${orchAction}"`);
  console.log(`  (not a standard action — agent handles it)`);
  console.log();

  if (orchAction === "require_approval") {
    console.log("  → Agent triggers approval workflow:");
    console.log("    1. Check cancellation policy");
    console.log("    2. Send approval request to manager");
    console.log("    3. Wait for approval");
    console.log("    4. Execute cancellation or deny");
  }

  console.log();
  console.log("────────────────────────────────────────────────────");
  console.log("Standard actions (STANDARD_ACTIONS):");
  console.log(`  USE_TOOL  = "${STANDARD_ACTIONS.USE_TOOL}"`);
  console.log(`  RESPOND   = "${STANDARD_ACTIONS.RESPOND}"`);
  console.log(`  CLARIFY   = "${STANDARD_ACTIONS.CLARIFY}"`);
  console.log(`  ESCALATE  = "${STANDARD_ACTIONS.ESCALATE}"`);
  console.log(`  DELEGATE  = "${STANDARD_ACTIONS.DELEGATE}"`);
  console.log();
  console.log("Custom actions → any string your agent needs:");
  console.log(
    '  "require_approval", "wait_for_payment", "schedule_callback", ...',
  );
  console.log();
}

main().catch(console.error);
