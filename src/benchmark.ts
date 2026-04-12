#!/usr/bin/env tsx
/**
 * MSM Benchmark Suite
 *
 * Runs a golden test set through one or more providers and measures:
 * - Per-layer latency (ms)
 * - Classification accuracy (intent + domain match)
 * - Translation quality (skip detection, annotation presence)
 * - Validation pass rate
 * - Overall pipeline latency
 *
 * Usage:
 *   pnpm benchmark               # dummy only
 *   pnpm benchmark:ollama        # dummy + ollama side-by-side
 */

import { createPipeline, getDefaultRegistry } from "./core/registry.js";
import type { PipelineTrace } from "./core/pipeline.js";

// ─── Golden Test Set ─────────────────────────────────────────

interface GoldenCase {
  label: string;
  input: string;
  expected: {
    intent: string;
    domain: string;
    language: string; // expected source_language
    should_translate: boolean;
    urgency?: "low" | "normal" | "high" | "critical";
  };
}

const GOLDEN_SET: GoldenCase[] = [
  {
    label: "Arabic food order",
    input: "ابي اطلب برغر وبيبسي",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "English food order",
    input: "I want to order a pizza",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "Arabic order tracking",
    input: "وين طلبي؟",
    expected: {
      intent: "track_order",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "English cancellation",
    input: "Cancel my order please",
    expected: {
      intent: "cancel",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "Arabic cultural context (snack)",
    input: "اريد شي خفيف",
    expected: {
      intent: "inquiry",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "Arabic greeting",
    input: "مرحبا",
    expected: {
      intent: "greeting",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "English complaint",
    input: "The food arrived cold and late",
    expected: {
      intent: "complaint",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "Arabic mixed code-switch",
    input: "ابي pizza مع extra cheese",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "English inquiry",
    input: "What are your opening hours?",
    expected: {
      intent: "inquiry",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "Arabic urgent complaint",
    input: "الاكل فيه مشكلة كبيرة ابي اكلم المدير",
    expected: {
      intent: "complaint",
      domain: "food",
      language: "ar",
      should_translate: true,
      urgency: "high",
    },
  },
];

// ─── Scoring ─────────────────────────────────────────────────

interface LayerScore {
  layer: string;
  avg_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  success_rate: number;
}

interface BenchmarkResult {
  provider: string;
  manifest: string;
  cases: number;
  total_latency_ms: number;
  avg_latency_ms: number;
  intent_accuracy: number;
  domain_accuracy: number;
  translation_skip_accuracy: number;
  annotation_rate: number;
  validation_pass_rate: number;
  layers: LayerScore[];
}

function scoreTrace(
  trace: PipelineTrace,
  golden: GoldenCase,
): {
  intent_match: boolean;
  domain_match: boolean;
  skip_correct: boolean;
  has_annotations: boolean;
  validation_passed: boolean;
} {
  const classification = trace.payload.classification;
  const translation = trace.payload.translation;
  const validation = trace.payload.validation;

  return {
    intent_match: classification?.intent === golden.expected.intent,
    domain_match: classification?.domain === golden.expected.domain,
    skip_correct: golden.expected.should_translate
      ? translation?.layer_invoked === true
      : translation?.layer_invoked === false,
    has_annotations:
      golden.expected.should_translate &&
      (translation?.context_annotations?.length ?? 0) > 0,
    validation_passed: validation?.passed === true,
  };
}

// ─── Runner ──────────────────────────────────────────────────

async function runBenchmark(
  manifestPath: string,
  label: string,
): Promise<BenchmarkResult> {
  const pipeline = await createPipeline(manifestPath);

  const traces: PipelineTrace[] = [];
  const scores: ReturnType<typeof scoreTrace>[] = [];

  for (const golden of GOLDEN_SET) {
    const trace = await pipeline.run(
      { raw: golden.input, modality: "text" },
      `bench-${Date.now()}`,
    );
    traces.push(trace);
    scores.push(scoreTrace(trace, golden));
  }

  // Per-layer aggregation
  const layerNames = [
    "translation",
    "classification",
    "orchestration",
    "execution",
    "generation",
    "validation",
  ];
  const layers: LayerScore[] = layerNames.map((name) => {
    const entries = traces.flatMap((t) =>
      t.entries.filter((e) => e.layer === name),
    );
    const latencies = entries.map((e) => e.latency_ms);
    const successes = entries.filter((e) => e.status === "ok").length;
    return {
      layer: name,
      avg_latency_ms: Math.round(avg(latencies)),
      min_latency_ms: Math.min(...latencies),
      max_latency_ms: Math.max(...latencies),
      success_rate: entries.length > 0 ? successes / entries.length : 0,
    };
  });

  const totalLatencies = traces.map((t) => t.total_latency_ms);

  return {
    provider: label,
    manifest: manifestPath,
    cases: GOLDEN_SET.length,
    total_latency_ms: Math.round(totalLatencies.reduce((a, b) => a + b, 0)),
    avg_latency_ms: Math.round(avg(totalLatencies)),
    intent_accuracy: scores.filter((s) => s.intent_match).length / scores.length,
    domain_accuracy: scores.filter((s) => s.domain_match).length / scores.length,
    translation_skip_accuracy:
      scores.filter((s) => s.skip_correct).length / scores.length,
    annotation_rate:
      scores.filter((s) => s.has_annotations).length /
      scores.filter((_, i) => GOLDEN_SET[i].expected.should_translate).length,
    validation_pass_rate:
      scores.filter((s) => s.validation_passed).length / scores.length,
    layers,
  };
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ─── Display ─────────────────────────────────────────────────

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function printResult(r: BenchmarkResult) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${r.provider}`);
  console.log(`  Manifest: ${r.manifest}`);
  console.log(`${"═".repeat(60)}`);

  console.log(`\n  Pipeline Metrics (${r.cases} test cases)`);
  console.log(`  ${"─".repeat(50)}`);
  console.log(`  Total time:               ${r.total_latency_ms}ms`);
  console.log(`  Avg latency per request:  ${r.avg_latency_ms}ms`);
  console.log(`  Intent accuracy:          ${pct(r.intent_accuracy)}`);
  console.log(`  Domain accuracy:          ${pct(r.domain_accuracy)}`);
  console.log(`  Translation skip correct: ${pct(r.translation_skip_accuracy)}`);
  console.log(`  Annotation rate:          ${pct(r.annotation_rate)}`);
  console.log(`  Validation pass rate:     ${pct(r.validation_pass_rate)}`);

  console.log(`\n  Per-Layer Latency`);
  console.log(`  ${"─".repeat(50)}`);
  console.log(
    `  ${"Layer".padEnd(18)} ${"Avg".padStart(8)} ${"Min".padStart(8)} ${"Max".padStart(8)}  Success`,
  );
  for (const l of r.layers) {
    console.log(
      `  ${l.layer.padEnd(18)} ${(l.avg_latency_ms + "ms").padStart(8)} ${(l.min_latency_ms + "ms").padStart(8)} ${(l.max_latency_ms + "ms").padStart(8)}  ${pct(l.success_rate)}`,
    );
  }
}

function printComparison(results: BenchmarkResult[]) {
  if (results.length < 2) return;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  COMPARISON`);
  console.log(`${"═".repeat(60)}`);

  const header = `  ${"Metric".padEnd(28)} ${results.map((r) => r.provider.padStart(12)).join("")}`;
  console.log(`\n${header}`);
  console.log(`  ${"─".repeat(28 + results.length * 12)}`);

  const rows: [string, (r: BenchmarkResult) => string][] = [
    ["Avg latency/request", (r) => r.avg_latency_ms + "ms"],
    ["Intent accuracy", (r) => pct(r.intent_accuracy)],
    ["Domain accuracy", (r) => pct(r.domain_accuracy)],
    ["Translation skip", (r) => pct(r.translation_skip_accuracy)],
    ["Annotation rate", (r) => pct(r.annotation_rate)],
    ["Validation pass rate", (r) => pct(r.validation_pass_rate)],
  ];

  for (const [label, fn] of rows) {
    console.log(
      `  ${label.padEnd(28)} ${results.map((r) => fn(r).padStart(12)).join("")}`,
    );
  }

  // Per-layer latency comparison
  console.log(`\n  Per-Layer Avg Latency`);
  console.log(`  ${"─".repeat(28 + results.length * 12)}`);
  console.log(
    `  ${"Layer".padEnd(28)} ${results.map((r) => r.provider.padStart(12)).join("")}`,
  );
  const layerNames = results[0].layers.map((l) => l.layer);
  for (const name of layerNames) {
    console.log(
      `  ${name.padEnd(28)} ${results.map((r) => ((r.layers.find((l) => l.layer === name)?.avg_latency_ms ?? 0) + "ms").padStart(12)).join("")}`,
    );
  }
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const useOllama = process.argv.includes("--ollama");

  console.log("\n  MSM Benchmark Suite");
  console.log(`  Golden test set: ${GOLDEN_SET.length} cases`);
  console.log(`  Providers: dummy${useOllama ? " + ollama" : ""}`);

  const results: BenchmarkResult[] = [];

  // Always run dummy
  console.log("\n  Running dummy benchmark...");
  results.push(
    await runBenchmark("./examples/food-commerce-gulf-dummy.yaml", "Dummy"),
  );

  // Optionally run Ollama
  if (useOllama) {
    console.log("  Running Ollama benchmark...");
    results.push(
      await runBenchmark("./examples/food-commerce-gulf-ollama.yaml", "Ollama"),
    );
  }

  // Print individual results
  for (const r of results) {
    printResult(r);
  }

  // Print comparison
  printComparison(results);

  // Output JSON for programmatic use
  const jsonPath = "./benchmark-results.json";
  const { writeFile } = await import("node:fs/promises");
  await writeFile(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\n  Results saved to ${jsonPath}\n`);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
