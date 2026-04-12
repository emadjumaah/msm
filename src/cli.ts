#!/usr/bin/env node
/**
 * MSM CLI
 *
 * Commands:
 *   msm demo                   Run the pipeline demo with dummy models
 *   msm validate <manifest>    Validate a manifest YAML file
 *   msm trace <manifest> <input>  Run pipeline and print full JSON trace
 */

import { resolve } from "node:path";
import { loadManifest } from "./core/manifest.js";
import { Pipeline } from "./core/pipeline.js";
import {
  DummyTranslationLayer,
  DummyClassificationLayer,
  DummyOrchestrationLayer,
  DummyExecutionLayer,
  DummyGenerationLayer,
  DummyValidationLayer,
} from "./dummy-models/index.js";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

// ─── Commands ────────────────────────────────────────────────

async function cmdDemo() {
  // Dynamic import to reuse demo logic
  await import("./demo.js");
}

async function cmdValidate(manifestPath: string) {
  const absPath = resolve(manifestPath);
  try {
    const manifest = await loadManifest(absPath);
    console.log(`${c.green}${c.bold}✓ Valid manifest${c.reset}`);
    console.log(`  ${c.dim}ID:      ${manifest.manifest_id}${c.reset}`);
    console.log(`  ${c.dim}Version: ${manifest.msm_version}${c.reset}`);
    console.log(`  ${c.dim}Domain:  ${manifest.domain}${c.reset}`);
    console.log(`  ${c.dim}Region:  ${manifest.region ?? "—"}${c.reset}`);
    console.log(`  ${c.dim}Layers:${c.reset}`);
    for (const [name, cfg] of Object.entries(manifest.layers)) {
      console.log(
        `    ${c.cyan}${name.padEnd(16)}${c.reset}${cfg.model}@${cfg.version}${cfg.fine_tuned ? ` ${c.yellow}(fine-tuned)${c.reset}` : ""}`,
      );
    }
  } catch (err) {
    console.error(`${c.red}${c.bold}✗ Invalid manifest${c.reset}`);
    console.error(
      `  ${c.dim}${err instanceof Error ? err.message : String(err)}${c.reset}`,
    );
    process.exit(1);
  }
}

async function cmdTrace(manifestPath: string, inputText: string) {
  const absPath = resolve(manifestPath);
  const manifest = await loadManifest(absPath);

  const pipeline = new Pipeline();
  pipeline.setManifest(manifest);
  pipeline.register(new DummyTranslationLayer());
  pipeline.register(new DummyClassificationLayer());
  pipeline.register(new DummyOrchestrationLayer());
  pipeline.register(new DummyExecutionLayer());
  pipeline.register(new DummyGenerationLayer());
  pipeline.register(new DummyValidationLayer());

  const trace = await pipeline.run({ raw: inputText, modality: "text" });
  console.log(JSON.stringify(trace.payload, null, 2));
}

function printUsage() {
  console.log(`
${c.bold}${c.magenta}MSM${c.reset} — Multi Small Models CLI

${c.bold}Usage:${c.reset}
  msm demo                              Run pipeline demo with dummy models
  msm validate <manifest.yaml>          Validate a manifest file
  msm trace <manifest.yaml> "<input>"   Run pipeline, print full JSON trace

${c.bold}Examples:${c.reset}
  msm demo
  msm validate examples/food-commerce-gulf-dummy.yaml
  msm trace examples/food-commerce-gulf-dummy.yaml "ابي اطلب برغر"
`);
}

// ─── Main ────────────────────────────────────────────────────

const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case "demo":
      await cmdDemo();
      break;
    case "validate":
      if (!args[0]) {
        console.error("Usage: msm validate <manifest.yaml>");
        process.exit(1);
      }
      await cmdValidate(args[0]);
      break;
    case "trace":
      if (!args[0] || !args[1]) {
        console.error('Usage: msm trace <manifest.yaml> "<input text>"');
        process.exit(1);
      }
      await cmdTrace(args[0], args[1]);
      break;
    default:
      printUsage();
      break;
  }
}

// Signal handling for graceful shutdown
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

main().catch((err) => {
  console.error(`${c.red}${c.bold}Error:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
