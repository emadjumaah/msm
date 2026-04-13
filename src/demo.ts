#!/usr/bin/env tsx
/**
 * MSM Demo — Run the full pipeline with dummy models.
 *
 * Usage:  pnpm demo
 *    or:  npx tsx src/demo.ts
 */

import { Pipeline } from "./core/pipeline.js";
import { loadManifest } from "./core/manifest.js";
import {
  DummyTranslationLayer,
  DummyClassificationLayer,
  DummyOrchestrationLayer,
  DummyGenerationLayer,
  DummyValidationLayer,
} from "./dummy-models/index.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Colors (no deps) ───────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

function header(text: string) {
  console.log(`\n${c.bold}${c.cyan}${"─".repeat(60)}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  ${text}${c.reset}`);
  console.log(`${c.bold}${c.cyan}${"─".repeat(60)}${c.reset}`);
}

function layerLine(name: string, detail: string, conf: number, ms: number) {
  const confStr = (conf * 100).toFixed(0).padStart(3) + "%";
  const msStr = String(ms).padStart(4) + "ms";
  console.log(
    `  ${c.green}[✓]${c.reset} ${c.bold}${name.padEnd(16)}${c.reset}${c.dim}${detail}${c.reset}  ${c.yellow}${confStr}${c.reset}  ${c.gray}${msStr}${c.reset}`,
  );
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n${c.bold}${c.magenta}  ╔══════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}${c.magenta}  ║   MSM — Multi Small Models v1.0  ║${c.reset}`,
  );
  console.log(
    `${c.bold}${c.magenta}  ║   Pipeline Demo (Dummy Models)   ║${c.reset}`,
  );
  console.log(
    `${c.bold}${c.magenta}  ╚══════════════════════════════════╝${c.reset}`,
  );

  // Load manifest
  const manifestPath = resolve(
    __dirname,
    "../examples/food-commerce-gulf-dummy.yaml",
  );
  const manifest = await loadManifest(manifestPath);
  console.log(`\n  ${c.dim}Manifest: ${manifest.manifest_id}${c.reset}`);
  console.log(
    `  ${c.dim}Domain:   ${manifest.domain} · ${manifest.region}${c.reset}`,
  );

  // Build pipeline with dummy layers
  const pipeline = new Pipeline();
  pipeline.setManifest(manifest);
  pipeline.register(new DummyTranslationLayer());
  pipeline.register(new DummyClassificationLayer());
  pipeline.register(new DummyOrchestrationLayer());
  pipeline.register(new DummyGenerationLayer());
  pipeline.register(new DummyValidationLayer());

  // Test cases
  const testCases = [
    { raw: "ابي اطلب برغر وبيبسي", label: "Arabic food order" },
    { raw: "I want to order a pizza", label: "English food order" },
    { raw: "وين طلبي؟", label: "Arabic order tracking" },
    { raw: "Cancel my order please", label: "English cancellation" },
    { raw: "اريد شي خفيف", label: "Arabic cultural context (snack)" },
    { raw: "مرحبا", label: "Arabic greeting" },
  ];

  for (const tc of testCases) {
    header(`${tc.label}`);
    console.log(`  ${c.dim}Input: "${tc.raw}"${c.reset}\n`);

    const trace = await pipeline.run({ raw: tc.raw, modality: "text" });
    const p = trace.payload;

    // Display each layer
    layerLine(
      "Translation",
      p.translation?.layer_invoked
        ? `→ "${p.translation.translated_text}"`
        : "→ [skipped: English input]",
      p.translation?.confidence ?? 0,
      p.translation?.latency_ms ?? 0,
    );

    // Show cultural context annotations when present
    if (p.translation?.context_annotations?.length) {
      for (const ann of p.translation.context_annotations) {
        console.log(
          `  ${c.dim}     ⤷ "${ann.original_term}" → "${ann.translated_term}" (${ann.cultural_meaning.slice(0, 60)}...)${c.reset}`,
        );
      }
    }

    layerLine(
      "Classification",
      `intent=${p.classification?.intent} domain=${p.classification?.domain}`,
      p.classification?.confidence ?? 0,
      p.classification?.latency_ms ?? 0,
    );

    layerLine(
      "Orchestration",
      `steps=[${p.orchestration?.workflow_steps.join(", ")}]`,
      p.orchestration?.confidence ?? 0,
      p.orchestration?.latency_ms ?? 0,
    );

    layerLine(
      "Generation",
      `→ "${p.generation?.response_text}"`,
      p.generation?.confidence ?? 0,
      p.generation?.latency_ms ?? 0,
    );

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

  // Full trace dump for last request
  header("Full Trace (last request)");
  console.log(
    c.dim +
      JSON.stringify(testCases.at(-1), null, 2)
        .split("\n")
        .map((l) => "  " + l)
        .join("\n") +
      c.reset,
  );

  header("Pipeline Summary");
  console.log(`  ${c.bold}MSM Version:${c.reset}  ${manifest.msm_version}`);
  console.log(`  ${c.bold}Layers:${c.reset}       5 (all dummy)`);
  console.log(`  ${c.bold}Test Cases:${c.reset}   ${testCases.length} passed`);
  console.log(
    `  ${c.bold}Status:${c.reset}       ${c.green}Pipeline operational${c.reset}`,
  );
  console.log(
    `\n  ${c.dim}Models are dummies — swap in real models via manifest to get real results.${c.reset}`,
  );
  console.log(
    `  ${c.dim}See: examples/food-commerce-gulf-dummy.yaml${c.reset}\n`,
  );
}

main().catch(console.error);
