#!/usr/bin/env tsx
/**
 * MSM Ollama Demo — Run the full pipeline with real Qwen 2.5 3B via Ollama.
 *
 * Prerequisites:
 *   1. Install Ollama: https://ollama.com
 *   2. Pull model:     ollama pull qwen2.5:3b
 *   3. Run:            pnpm demo:ollama
 *
 * This replaces 4 of 6 dummy layers with real LLM calls.
 * Execution & Validation remain rule-based (no LLM needed).
 */

import { Pipeline } from "./core/pipeline.js";
import {
  OllamaTranslationLayer,
  OllamaClassificationLayer,
  OllamaOrchestrationLayer,
  OllamaGenerationLayer,
  DummyExecutionLayer,
  DummyValidationLayer,
} from "./ollama-layers/index.js";

// ─── Colors (no deps) ───────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function header(text: string) {
  console.log(`\n${c.bold}${c.cyan}${"─".repeat(60)}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  ${text}${c.reset}`);
  console.log(`${c.bold}${c.cyan}${"─".repeat(60)}${c.reset}`);
}

function layerLine(name: string, detail: string, conf: number, ms: number) {
  const confStr = (conf * 100).toFixed(0).padStart(3) + "%";
  const msStr = String(ms).padStart(6) + "ms";
  console.log(
    `  ${c.green}[✓]${c.reset} ${c.bold}${name.padEnd(16)}${c.reset}${c.dim}${detail}${c.reset}  ${c.yellow}${confStr}${c.reset}  ${c.gray}${msStr}${c.reset}`,
  );
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n${c.bold}${c.magenta}  ╔════════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}${c.magenta}  ║   MSM — Multi Small Models v1.0        ║${c.reset}`,
  );
  console.log(
    `${c.bold}${c.magenta}  ║   Ollama Demo (Qwen 2.5 3B · Real LLM) ║${c.reset}`,
  );
  console.log(
    `${c.bold}${c.magenta}  ╚════════════════════════════════════════╝${c.reset}`,
  );

  // Check Ollama is running
  try {
    const health = await fetch("http://localhost:11434/api/tags");
    if (!health.ok) throw new Error("not ok");
  } catch {
    console.error(
      `\n  ${c.red}Error: Ollama is not running at http://localhost:11434${c.reset}`,
    );
    console.error(`  ${c.dim}Start it with: ollama serve${c.reset}`);
    process.exit(1);
  }

  // Build pipeline — 4 real Ollama layers + 2 rule-based
  const pipeline = new Pipeline();
  pipeline.register(new OllamaTranslationLayer());
  pipeline.register(new OllamaClassificationLayer());
  pipeline.register(new OllamaOrchestrationLayer());
  pipeline.register(new DummyExecutionLayer()); // Rule-based: calls mock APIs
  pipeline.register(new OllamaGenerationLayer());
  pipeline.register(new DummyValidationLayer()); // Rule-based: policy checks

  console.log(`\n  ${c.dim}Model:  qwen2.5:3b (1.9GB)${c.reset}`);
  console.log(`  ${c.dim}Layers: 4 real (Ollama) + 2 rule-based${c.reset}`);
  console.log(
    `  ${c.dim}Note:   First call is slower (model loading)${c.reset}\n`,
  );

  // Test cases
  const testCases = [
    { raw: "ابي اطلب برغر وبيبسي", label: "Arabic food order" },
    { raw: "I want to order a pizza", label: "English food order" },
    { raw: "اريد شي خفيف", label: "Arabic cultural context (snack)" },
    { raw: "Where is my delivery?", label: "English order tracking" },
  ];

  for (const tc of testCases) {
    header(tc.label);
    console.log(`  ${c.dim}Input: "${tc.raw}"${c.reset}\n`);

    const trace = await pipeline.run({ raw: tc.raw, modality: "text" });
    const p = trace.payload;

    // Translation
    layerLine(
      "Translation",
      p.translation?.layer_invoked
        ? `→ "${p.translation.translated_text}"`
        : "→ [skipped: English input]",
      p.translation?.confidence ?? 0,
      p.translation?.latency_ms ?? 0,
    );

    if (p.translation?.context_annotations?.length) {
      for (const ann of p.translation.context_annotations) {
        console.log(
          `  ${c.dim}     ⤷ "${ann.original_term}" → "${ann.translated_term}" · ${ann.cultural_meaning.slice(0, 70)}${c.reset}`,
        );
      }
    }

    // Classification
    layerLine(
      "Classification",
      `intent=${p.classification?.intent} domain=${p.classification?.domain} urgency=${p.classification?.urgency}`,
      p.classification?.confidence ?? 0,
      p.classification?.latency_ms ?? 0,
    );

    // Orchestration
    layerLine(
      "Orchestration",
      `steps=[${p.orchestration?.workflow_steps.join(", ")}]`,
      p.orchestration?.confidence ?? 0,
      p.orchestration?.latency_ms ?? 0,
    );

    // Execution
    layerLine(
      "Execution",
      `tools=[${p.execution?.tool_results.map((t) => `${t.tool}✓`).join(", ")}]`,
      p.execution?.confidence ?? 0,
      p.execution?.latency_ms ?? 0,
    );

    // Generation
    layerLine(
      "Generation",
      `→ "${p.generation?.response_text}"`,
      p.generation?.confidence ?? 0,
      p.generation?.latency_ms ?? 0,
    );

    // Validation
    layerLine(
      "Validation",
      `passed=${p.validation?.passed} score=${p.validation?.quality_score}`,
      p.validation?.confidence ?? 0,
      p.validation?.latency_ms ?? 0,
    );

    console.log(`\n  ${c.bold}Output:${c.reset} "${p.final_output?.text}"`);
    console.log(
      `  ${c.dim}Language: ${p.final_output?.language} · Total: ${trace.total_latency_ms}ms · Trace: ${trace.trace_id.slice(0, 8)}...${c.reset}`,
    );
  }

  // Summary
  header("Summary");
  console.log(
    `  ${c.green}✓${c.reset} ${testCases.length} requests processed with real Qwen 2.5 3B`,
  );
  console.log(
    `  ${c.dim}Each layer called Ollama independently — no prompt chaining${c.reset}`,
  );
  console.log(
    `  ${c.dim}Swap models by changing the constructor: new OllamaTranslationLayer("llama3:8b")${c.reset}\n`,
  );
}

main().catch((err) => {
  console.error(`${c.red}Fatal: ${err.message}${c.reset}`);
  process.exit(1);
});
