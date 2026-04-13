#!/usr/bin/env tsx
/**
 * Agent Integration Example — Single-Pass Brain
 *
 * Shows how an agent framework (dalil, langchain, custom) uses
 * MSM as a structured brain. The brain is a pure decision layer:
 *
 *   1. Agent sends user message to MSM brain
 *   2. Brain returns either:
 *      - action="use_tool"  → agent executes tool, calls brain again with tool_results
 *      - action="respond"   → brain generated a response, agent delivers it
 *      - action="escalate"  → agent routes to human
 *      - any custom action  → agent handles it
 *   3. The agent controls the loop — the brain never executes tools
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
  type MSMInput,
  type ToolResult,
} from "../src/index.js";

// ─── 1. Build the Brain ──────────────────────────────────────

function buildBrain(): Pipeline {
  const pipeline = new Pipeline();
  pipeline.register(new DummyTranslationLayer());
  pipeline.register(new DummyClassificationLayer());
  pipeline.register(new DummyOrchestrationLayer());
  pipeline.register(new DummyExecutionLayer());
  pipeline.register(new DummyGenerationLayer());
  pipeline.register(new DummyValidationLayer());
  pipeline.freeze(); // safe for concurrent requests
  return pipeline;
}

// ─── 2. Agent Loop — the agent controls everything ──────────

/**
 * Simulates an agent that uses MSM as its brain.
 *
 * The brain NEVER executes tools — it only decides what to do.
 * The agent executes tools, then feeds results back to the brain.
 */
async function agentLoop(brain: Pipeline, userMessage: string): Promise<void> {
  console.log(`\n  User: "${userMessage}"`);

  let input: MSMInput = { raw: userMessage, modality: "text" };
  let iteration = 0;
  const maxIterations = 5;

  while (iteration < maxIterations) {
    iteration++;
    const trace = await brain.run(input);
    const orch = trace.payload.orchestration;
    const action = orch?.action ?? "respond";

    if (action === STANDARD_ACTIONS.USE_TOOL) {
      // Brain wants a tool — agent executes it
      const toolName = orch?.tool_name ?? "unknown";
      const toolParams = orch?.tool_params ?? {};
      const plan = orch?.plan;

      console.log(`  Brain [${iteration}]: use_tool → ${toolName}`);
      console.log(`    Params: ${JSON.stringify(toolParams)}`);
      if (plan) {
        console.log(`    Plan: ${plan.map((s) => `[${s.status}] ${s.description}`).join(" → ")}`);
      }

      // Agent executes the tool (simulated)
      const toolResult = await executeToolSimulated(toolName, toolParams);
      console.log(`    Result: ${JSON.stringify(toolResult.result)}`);

      // Feed results back to the brain
      input = {
        raw: userMessage,
        modality: "text",
        tool_results: [toolResult],
      };
      continue;
    }

    // Any other action (respond, escalate, clarify, custom) — terminal
    const text = trace.payload.final_output?.text ?? "";
    const language = trace.payload.final_output?.language ?? "en";
    const actionRequired = trace.payload.final_output?.action_required;

    console.log(`  Brain [${iteration}]: ${action}`);
    console.log(`    Response: "${text.substring(0, 100)}${text.length > 100 ? "..." : ""}"`);
    console.log(`    Language: ${language}`);

    if (action === STANDARD_ACTIONS.ESCALATE) {
      console.log(`    → Agent routes to human support`);
    }
    if (action === STANDARD_ACTIONS.CLARIFY) {
      console.log(`    → Agent asks user for more info`);
    }
    if (!Object.values(STANDARD_ACTIONS).includes(action as any)) {
      console.log(`    → Custom action: agent handles "${action}" internally`);
    }
    break;
  }

  if (iteration >= maxIterations) {
    console.log(`  ⚠ Max iterations (${maxIterations}) reached`);
  }
}

// ─── 3. Simulated Tool Execution ─────────────────────────────

async function executeToolSimulated(
  toolName: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  // In a real agent, this would call actual APIs
  const results: Record<string, unknown> = {
    menu_api: { items: ["Classic Burger", "Pepsi"], prices: [25, 8] },
    order_api: { order_id: "ORD-7742", status: "confirmed", eta: "30 min" },
    tracking_api: { status: "out_for_delivery", eta: "15 min" },
    knowledge_api: { answer: "Our hours are 10am-11pm daily" },
  };

  return {
    tool: toolName,
    status: "ok",
    result: results[toolName] ?? { message: `${toolName} executed` },
  };
}

// ─── 4. Run Demo ─────────────────────────────────────────────

async function main() {
  const brain = buildBrain();

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  MSM Agent Integration — Single-Pass Brain      ║");
  console.log("║  Brain decides, Agent executes, Brain responds  ║");
  console.log("╚══════════════════════════════════════════════════╝");

  // ── Simple greeting → respond directly ──
  console.log("\n── Simple: greeting ─────────────────────────");
  await agentLoop(brain, "Hello!");

  // ── FAQ → respond directly ──
  console.log("\n── Simple: FAQ ─────────────────────────────");
  await agentLoop(brain, "What are your hours?");

  // ── Order → use_tool → respond ──
  console.log("\n── Complex: food order (tool loop) ─────────");
  await agentLoop(brain, "I want to order a burger and pepsi");

  // ── Tracking → use_tool → respond ──
  console.log("\n── Complex: order tracking ─────────────────");
  await agentLoop(brain, "Where is my delivery?");

  // ── Arabic greeting → respond (with outbound translation) ──
  console.log("\n── Arabic: greeting ────────────────────────");
  await agentLoop(brain, "مرحبا");

  // ── Arabic order → use_tool → respond ──
  console.log("\n── Arabic: food order ──────────────────────");
  await agentLoop(brain, "ابي اطلب برغر");

  // ── Show standard vs custom actions ──
  console.log("\n────────────────────────────────────────────────────");
  console.log("Standard actions (STANDARD_ACTIONS):");
  console.log(`  USE_TOOL  = "${STANDARD_ACTIONS.USE_TOOL}"  → brain wants a tool`);
  console.log(`  RESPOND   = "${STANDARD_ACTIONS.RESPOND}"   → brain has a response`);
  console.log(`  CLARIFY   = "${STANDARD_ACTIONS.CLARIFY}"   → brain needs more info`);
  console.log(`  ESCALATE  = "${STANDARD_ACTIONS.ESCALATE}"  → hand to human`);
  console.log(`  DELEGATE  = "${STANDARD_ACTIONS.DELEGATE}"  → pass to another agent`);
  console.log();
  console.log("Custom actions → any string your agent needs:");
  console.log('  "require_approval", "wait_for_payment", "schedule_callback", ...');
  console.log();
  console.log("Only use_tool triggers early return (action_required=true).");
  console.log("Every other action → brain generates a response for the agent to deliver.");
  console.log();
}

main().catch(console.error);
