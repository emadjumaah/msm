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
  // ── Food Domain — Arabic ──────────────────────────────────
  {
    label: "AR: food order (burger)",
    input: "ابي اطلب برغر وبيبسي",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: food order (coffee)",
    input: "ابي قهوة عربية",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: food order tracking",
    input: "وين طلبي؟",
    expected: {
      intent: "track_order",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: food cultural context (snack)",
    input: "اريد شي خفيف",
    expected: {
      intent: "inquiry",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: greeting",
    input: "مرحبا",
    expected: {
      intent: "greeting",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: urgent complaint",
    input: "الاكل فيه مشكلة كبيرة ابي اكلم المدير",
    expected: {
      intent: "complaint",
      domain: "food",
      language: "ar",
      should_translate: true,
      urgency: "high",
    },
  },
  {
    label: "AR: code-switch order",
    input: "ابي pizza مع extra cheese",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: delivery ETA",
    input: "متى يوصل الطلب؟",
    expected: {
      intent: "track_order",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: menu inquiry",
    input: "عندكم شي حلويات؟",
    expected: {
      intent: "inquiry",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: cancel order",
    input: "الغي الطلب لو سمحت",
    expected: {
      intent: "cancel",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: late delivery complaint",
    input: "الطلب متأخر وايد",
    expected: {
      intent: "complaint",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: reorder",
    input: "ابي نفس الطلب اللي قبل",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },

  // ── Food Domain — English ─────────────────────────────────
  {
    label: "EN: food order (pizza)",
    input: "I want to order a pizza",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: food cancellation",
    input: "Cancel my order please",
    expected: {
      intent: "cancel",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: food complaint (cold)",
    input: "The food arrived cold and late",
    expected: {
      intent: "complaint",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: opening hours inquiry",
    input: "What are your opening hours?",
    expected: {
      intent: "inquiry",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: delivery order",
    input: "I need a delivery to my office, two burgers and fries",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: track delivery",
    input: "Where is my delivery? It's been 45 minutes",
    expected: {
      intent: "track_order",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: menu pricing",
    input: "How much is the family meal?",
    expected: {
      intent: "inquiry",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: greeting",
    input: "Hello, good evening",
    expected: {
      intent: "greeting",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: missing item complaint",
    input: "My order is missing the drink I paid for",
    expected: {
      intent: "complaint",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: multiple items order",
    input: "Can I get two coffees and a croissant?",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },

  // ── Retail / Support Domain — English ─────────────────────
  {
    label: "EN: product return",
    input: "I want to return this product, it's defective",
    expected: {
      intent: "complaint",
      domain: "retail",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: shipping inquiry",
    input: "When will my shipping arrive?",
    expected: {
      intent: "track_order",
      domain: "retail",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: product availability",
    input: "Is this item available in the store?",
    expected: {
      intent: "inquiry",
      domain: "retail",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: buy product",
    input: "I want to buy this product and ship it to Dubai",
    expected: {
      intent: "place_order",
      domain: "retail",
      language: "en",
      should_translate: false,
    },
  },

  // ── Retail / Support Domain — Arabic ──────────────────────
  {
    label: "AR: product return",
    input: "ابي ارجع المنتج فيه عيب",
    expected: {
      intent: "complaint",
      domain: "retail",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: shipping tracking",
    input: "وين الشحنة حقتي؟",
    expected: {
      intent: "track_order",
      domain: "retail",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: price inquiry",
    input: "كم سعر هالمنتج؟",
    expected: {
      intent: "inquiry",
      domain: "retail",
      language: "ar",
      should_translate: true,
    },
  },

  // ── Support / Help Domain ─────────────────────────────────
  {
    label: "EN: general help",
    input: "I need help with my account",
    expected: {
      intent: "inquiry",
      domain: "support",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: service complaint",
    input: "Your service has been terrible, I want to speak to a manager",
    expected: {
      intent: "complaint",
      domain: "support",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "AR: account help",
    input: "ابي مساعدة في حسابي",
    expected: {
      intent: "inquiry",
      domain: "support",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: service complaint",
    input: "خدمتكم سيئة جدا",
    expected: {
      intent: "complaint",
      domain: "support",
      language: "ar",
      should_translate: true,
    },
  },

  // ── Edge Cases ────────────────────────────────────────────
  {
    label: "EDGE: empty-ish input",
    input: "...",
    expected: {
      intent: "place_order", // ambiguous input — default classification
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EDGE: single word order",
    input: "burger",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EDGE: very long English input",
    input:
      "I placed an order about two hours ago for three large pizzas, a family bucket of chicken wings, two liters of Pepsi, and a chocolate cake for my daughter's birthday party, and none of it has arrived yet, can you please check what happened?",
    expected: {
      intent: "track_order",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EDGE: polite cancel",
    input: "Sorry but I changed my mind, please cancel everything",
    expected: {
      intent: "cancel",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EDGE: ambiguous (could be order or inquiry)",
    input: "Do you have pasta?",
    expected: {
      intent: "inquiry",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EDGE: numbers and specifics",
    input: "3 shawarma, 2 falafel, 1 hummus",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },

  // ── Multi-domain Arabic ───────────────────────────────────
  {
    label: "AR: restaurant recommendation",
    input: "وش افضل مطعم عندكم؟",
    expected: {
      intent: "inquiry",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: payment issue",
    input: "ماقدرت ادفع، فيه مشكلة في الدفع",
    expected: {
      intent: "complaint",
      domain: "support",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: order modification",
    input: "ابي اغير الطلب واضيف عصير",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },
  {
    label: "AR: gratitude",
    input: "شكرا، الطلب وصل تمام",
    expected: {
      intent: "greeting",
      domain: "food",
      language: "ar",
      should_translate: true,
    },
  },

  // ── Multi-domain English ──────────────────────────────────
  {
    label: "EN: dietary inquiry",
    input: "Do you have any gluten-free options on the menu?",
    expected: {
      intent: "inquiry",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: bulk order",
    input: "I need to order food for 20 people for a meeting tomorrow",
    expected: {
      intent: "place_order",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: wrong order complaint",
    input: "You sent me the wrong order, I ordered chicken not beef",
    expected: {
      intent: "complaint",
      domain: "food",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: store location",
    input: "Where is your nearest store?",
    expected: {
      intent: "inquiry",
      domain: "retail",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: cancel subscription",
    input: "I want to cancel my subscription",
    expected: {
      intent: "cancel",
      domain: "support",
      language: "en",
      should_translate: false,
    },
  },
  {
    label: "EN: order status via number",
    input: "What's the status of order #12345?",
    expected: {
      intent: "track_order",
      domain: "food",
      language: "en",
      should_translate: false,
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
    intent_accuracy:
      scores.filter((s) => s.intent_match).length / scores.length,
    domain_accuracy:
      scores.filter((s) => s.domain_match).length / scores.length,
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
  console.log(
    `  Translation skip correct: ${pct(r.translation_skip_accuracy)}`,
  );
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
