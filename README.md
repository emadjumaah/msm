# MSM — Multi Small Models

> **The product is the standard and the pipeline. The models inside are interchangeable commodities.**

MSM is an open standard for building commercial AI systems using a coordinated pipeline of small, specialized models instead of a single large language model.

Each model masters one task. Together they deliver results that match large LLMs on structured, domain-specific tasks — at a fraction of the cost, latency, and infrastructure.

```
User Input (any language)
       ↓
  [L1] Translation        → English text (skipped if input is already English)
       ↓
  [L2] Classification     → Intent + Domain + Urgency
       ↓
  [L3] Orchestration      → Workflow Steps + Tool Selection
       ↓
  [L4] Execution          → Tool Results (API calls, DB queries)
       ↓
  [L5] Generation         → English Response
       ↓
  [L6] Validation         → Quality Gate (release / block / retry)
       ↓
  [L7] Outbound Translation → User's language (auto if inbound was translated)
       ↓
  Final Output
```

## Why MSM — and not LangChain / LlamaIndex?

LangChain and LlamaIndex are **orchestration libraries** — they help you call one large model in flexible ways. MSM is a **pipeline standard** — it replaces the one large model with six small specialized ones.

|                  | LangChain / LlamaIndex | MSM                                        |
| ---------------- | ---------------------- | ------------------------------------------ |
| Core idea        | Orchestrate one LLM    | Replace LLM with specialized pipeline      |
| Model coupling   | Tied to provider APIs  | Any model behind a standard contract       |
| Swap a model     | Change code + prompts  | Change one line in manifest YAML           |
| Language support | Depends on the LLM     | Dedicated Translation Layer (any language) |
| Auditability     | Prompt chains          | Per-layer trace with confidence scores     |
| Cost             | LLM pricing            | 10-20x cheaper (small models)              |

If your problem is "I need GPT-4 to do X" → use LangChain. If your problem is "I need a production AI system that's cheap, fast, auditable, and works in Arabic" → use MSM.

## Cost Comparison

|                   | LLM Approach       | MSM Approach                       |
| ----------------- | ------------------ | ---------------------------------- |
| Cost per call     | High               | 10–20x lower                       |
| Latency           | 2–5 seconds        | Under 1 second (GPU)               |
| Domain accuracy   | ~80% general       | 90%+ specialized (domain-tuned)    |
| Language support  | English-first      | Any language via Translation Layer |
| On-premise deploy | Impractical        | Single GPU or CPU                  |
| Layer upgrades    | Replace everything | Swap one model                     |
| Auditability      | Black box          | Per-layer trace                    |

---

## When to Use MSM (and When Not To)

**MSM is best for:**

- Structured, repeatable domain tasks (ordering, triage, booking, support)
- Multi-language deployments where cultural context matters
- On-premise / air-gapped environments
- Cost-sensitive production systems (10–20x cheaper than LLM APIs)
- Regulated domains that need per-layer auditability

**MSM is not the right choice for:**

- Open-ended reasoning or creative writing (use GPT-4, Claude)
- Tasks that require broad world knowledge across many domains
- Rapid prototyping where you don't yet know the domain structure
- Single-turn Q&A with no domain specialization

MSM replaces LLMs for **structured domain pipelines**. It does not replace LLMs for **general intelligence**.

---

## Getting Started

### Install from npm

```bash
npm install msm-ai
```

> **Note:** `npm install msm-ai` gives you the library for use in your own projects. The demo scripts, benchmarks, and CLI below require cloning the repo.

### Option A: Try instantly (no models needed)

```bash
git clone https://github.com/emadjumaah/msm.git
cd msm
pnpm install
pnpm demo          # runs with dummy models — zero setup
```

### Option B: Run with real AI models (Ollama)

```bash
# 1. Install Ollama (https://ollama.com)
brew install ollama        # macOS
# or: curl -fsSL https://ollama.ai/install.sh | sh   # Linux

# 2. Pull the model (~2GB download, runs on CPU)
ollama pull qwen2.5:3b

# 3. Run the real demo
pnpm demo:ollama
```

### Option C: Run as HTTP server

```bash
pnpm server               # dummy models on http://localhost:3000
pnpm server:ollama         # real Ollama models on http://localhost:3000

# Or point at ANY manifest:
pnpm server examples/food-commerce-gulf-ollama.yaml

# Test it
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{"text": "ابي اطلب برغر وبيبسي"}'
```

### Option D: Docker (everything included)

```bash
docker compose up          # starts Ollama + MSM server
# Pipeline available at http://localhost:3000/api/run
```

---

## Manifests — One File Per Domain (like Docker Compose)

A manifest is a YAML file that declares the complete pipeline for a domain. Think of it as docker-compose for AI models:

| Docker Compose         | MSM Manifest                            |
| ---------------------- | --------------------------------------- |
| `image: nginx:1.25`    | `provider: ollama`, `model: qwen2.5:3b` |
| `docker compose up`    | `createPipeline("food-gulf.yaml")`      |
| Switch image → restart | Switch provider/model → swap layer      |
| One file per project   | One file per domain                     |

### Example: Gulf Food Commerce (Ollama)

```yaml
# examples/food-commerce-gulf-ollama.yaml
msm_version: "1.0"
manifest_id: "food-commerce-gulf-ollama-v1"
domain: "food-commerce"
region: "gulf-arabic"
created: "2026-04-12"

layers:
  translation:
    provider: ollama # ← which implementation to use
    model: "qwen2.5:3b" # ← which model
    version: "1.0.0"
    mode: "translated" # "translated" = translate non-English, "native" = English passthrough

  classification:
    provider: ollama
    model: "qwen2.5:3b"

  orchestration:
    provider: ollama
    model: "qwen2.5:3b"

  execution:
    provider: dummy # ← rule-based, no LLM needed

  generation:
    provider: ollama
    model: "qwen2.5:3b"

  validation:
    provider: dummy # ← rule-based, no LLM needed
```

### Run any manifest

```typescript
import { createPipeline } from "msm-ai";

// One line: reads manifest → looks up providers → creates all layers → returns pipeline
const pipeline = await createPipeline(
  "./examples/food-commerce-gulf-ollama.yaml",
);
const trace = await pipeline.run({
  raw: "ابي اطلب برغر وبيبسي",
  modality: "text",
});
```

```bash
# Or via HTTP server — pass any manifest as argument:
pnpm server examples/food-commerce-gulf-ollama.yaml
pnpm server examples/food-commerce-gulf-dummy.yaml
```

### Switch domains = switch manifest

```
examples/
├── food-commerce-gulf-dummy.yaml    ← Gulf food, offline (run locally now)
├── food-commerce-gulf-ollama.yaml   ← Gulf food, real Ollama (run locally now)
├── healthcare-triage.yaml           ← Medical triage (production blueprint)
├── sports-booking.yaml              ← Sports booking (production blueprint)
├── legal-compliance.yaml            ← Legal/contract review (production blueprint)
├── banking-support.yaml             ← Gulf banking support (production blueprint)
├── education-tutoring.yaml          ← AI tutoring (production blueprint)
└── ecommerce-retail.yaml            ← Gulf e-commerce (production blueprint)
```

The `dummy` and `ollama` manifests run locally out of the box. The other manifests are production blueprints — they show what a real deployment looks like with dedicated model servers and domain-specific hooks. To use them, register your own providers or swap to `dummy`/`ollama`.

Each manifest is self-contained. Switching from food to healthcare is one line change — not a code change.

---

## Adding Custom Providers (No Core Changes)

MSM ships with two built-in providers: `dummy` and `ollama`. Adding your own takes 2 steps:

### Step 1: Create your layer class

```typescript
import type { MSMLayer, MSMPayload, TranslationOutput } from "msm-ai";

class OpenAITranslationLayer implements MSMLayer<TranslationOutput> {
  name = "translation" as const;

  constructor(private model: string) {}

  async process(payload: MSMPayload): Promise<TranslationOutput> {
    const start = performance.now();
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: payload.input.raw }],
      }),
    }).then((r) => r.json());

    return {
      translated_text: res.choices[0].message.content,
      source_language: "ar",
      target_language: "en",
      layer_invoked: true,
      mode: "translated",
      model_id: this.model,
      model_ver: "1.0",
      latency_ms: Math.round(performance.now() - start),
      confidence: 0.95,
      status: "ok",
    };
  }
}
```

### Step 2: Register it

```typescript
import { getDefaultRegistry, createPipeline } from "msm-ai";

const registry = await getDefaultRegistry();
registry.register(
  "translation",
  "openai",
  (config) => new OpenAITranslationLayer(config.model),
);
// Now "openai" is available as a provider in manifests
```

### Step 3: Use it in a manifest

```yaml
layers:
  translation:
    provider: openai
    model: "gpt-4o-mini"
  classification:
    provider: ollama
    model: "qwen2.5:3b"
  # mix providers freely...
```

### Or extend HttpLayer for even less code

```typescript
import { HttpLayer } from "msm-ai";
import type { TranslationOutput, MSMPayload } from "msm-ai";

class NLLBTranslationLayer extends HttpLayer<TranslationOutput> {
  name = "translation" as const;
  constructor() {
    super("http://your-model-server:8000/translate");
  }

  protected buildRequestBody(payload: MSMPayload) {
    return { text: payload.input.raw };
  }

  protected parseResponse(json: unknown, latency: number): TranslationOutput {
    const res = json as { text: string; source: string; confidence: number };
    return {
      translated_text: res.text,
      source_language: res.source,
      target_language: "en",
      layer_invoked: true,
      mode: "translated",
      model_id: "nllb-200-600m",
      model_ver: "2.1",
      latency_ms: latency,
      confidence: res.confidence,
      status: "ok",
    };
  }
}
```

### Built-in providers

| Provider | Layers                                                 | Requirements     | Use Case         |
| -------- | ------------------------------------------------------ | ---------------- | ---------------- |
| `dummy`  | All 6                                                  | None             | Testing, offline |
| `ollama` | Translation, Classification, Orchestration, Generation | Ollama installed | Local AI, dev    |
| `http`   | (base class)                                           | Model server     | Production       |

---

## Hooks — Domain Extensions Without Core Changes

The 6 core layers are the standard. They don't change. But different domains need specialized processing — image recognition, drug checks, fraud detection. That's what **hooks** are for.

Hooks plug in **between** layers. They enrich the payload without touching the pipeline architecture:

```
           ┌─────────────────────────────┐
           │  HEALTHCARE PIPELINE        │
           │                             │
           │  [L1] Translation           │
           │       ↓                     │
           │  ⚡ image_analysis hook      │  ← reads X-ray, adds findings
           │       ↓                     │
           │  [L2] Classification        │  ← now sees "normal chest X-ray"
           │       ↓                     │
           │  [L3] Orchestration         │
           │       ↓                     │
           │  [L4] Execution             │
           │       ↓                     │
           │  [L5] Generation            │
           │       ↓                     │
           │  ⚡ drug_interaction hook    │  ← checks for dangerous combos
           │       ↓                     │
           │  [L6] Validation            │
           └─────────────────────────────┘
```

### Declare hooks in the manifest

```yaml
# examples/healthcare-triage.yaml
layers:
  translation: { provider: ollama, model: "qwen2.5:3b", ... }
  classification: { provider: http, model: "mdeberta-v3-medical", ... }
  # ... 6 standard layers ...

hooks:
  image_analysis:
    provider: http
    model: "medclip-v1"
    point: "before:classification" # ← when to run
    endpoint: "http://localhost:8010/analyze-image"

  drug_interaction_check:
    provider: http
    model: "drugcheck-v1"
    point: "after:generation" # ← runs after response is generated
    endpoint: "http://localhost:8011/drug-check"
```

### Use hooks in code

```typescript
import { Pipeline } from "msm-ai";
import type { MSMHook } from "msm-ai";

const pipeline = new Pipeline();
// ... register 6 core layers ...

// Add a custom hook — no core changes needed
pipeline.addHook({
  name: "image_analysis",
  point: "before:classification",
  async process(payload) {
    const result = await analyzeImage(payload.input.raw);
    return {
      model_id: "medclip-v1",
      model_ver: "1.0",
      latency_ms: 200,
      confidence: 0.92,
      status: "ok",
      data: { findings: result.findings, image_type: "xray" },
    };
  },
});
```

### Hook guarantees

- Hooks **never break the pipeline** — if a hook fails, it's recorded and the pipeline continues
- Hook output is stored in `payload.hooks["hook_name"]` — downstream layers can read it
- Hooks appear in the trace alongside core layers
- Multiple hooks can run at the same point
- Available points: `before:translation`, `after:translation`, `before:classification`, `after:classification`, etc.

### Domain examples

| Domain     | Hook               | Point                   | Purpose                                  |
| ---------- | ------------------ | ----------------------- | ---------------------------------------- |
| Healthcare | `image_analysis`   | `before:classification` | Convert X-ray/MRI to structured findings |
| Healthcare | `drug_interaction` | `after:generation`      | Check response for dangerous drug combos |
| E-commerce | `fraud_detection`  | `after:classification`  | Flag suspicious purchase patterns        |
| Legal      | `compliance_check` | `after:generation`      | Verify response meets regulations        |
| Finance    | `kyc_verification` | `before:execution`      | Verify identity before processing        |

---

## HTTP Server API

```bash
pnpm server                                          # dummy models
pnpm server:ollama                                   # Ollama models
pnpm server examples/food-commerce-gulf-ollama.yaml  # any manifest
MSM_PORT=8080 pnpm server                            # custom port
```

### `POST /api/run`

```json
{
  "text": "ابي اطلب برغر وبيبسي",
  "modality": "text",
  "session_id": "optional-session-id"
}
```

Response:

```json
{
  "output": {
    "text": "تم تأكيد طلبك! التوصيل خلال 30 دقيقة تقريباً.",
    "language": "ar-gulf",
    "total_latency_ms": 3
  },
  "trace_id": "9f53fe56-...",
  "total_latency_ms": 3,
  "layers": [
    {
      "layer": "translation",
      "model_id": "dummy-translation-v1",
      "latency_ms": 0,
      "status": "ok"
    },
    {
      "layer": "classification",
      "model_id": "dummy-classification-v1",
      "latency_ms": 0,
      "status": "ok"
    },
    {
      "layer": "orchestration",
      "model_id": "dummy-orchestration-v1",
      "latency_ms": 0,
      "status": "ok"
    },
    {
      "layer": "execution",
      "model_id": "dummy-execution-v1",
      "latency_ms": 0,
      "status": "ok"
    },
    {
      "layer": "generation",
      "model_id": "dummy-generation-v1",
      "latency_ms": 0,
      "status": "ok"
    },
    {
      "layer": "validation",
      "model_id": "dummy-validation-v1",
      "latency_ms": 0,
      "status": "ok"
    }
  ]
}
```

The full `payload` object (with all layer outputs, context annotations, and hook results) is also included for debugging.

### `GET /api/health`

Returns server status and registered layers.

---

## The Six Layers

| #   | Layer              | Job                                | Dummy Model            | Ollama Model | Production Model         |
| --- | ------------------ | ---------------------------------- | ---------------------- | ------------ | ------------------------ |
| 1   | **Translation**    | Convert any language ↔ English     | Word-list substitution | qwen2.5:3b   | NLLB-200 600M            |
| 2   | **Classification** | Identify intent, domain, urgency   | Keyword matching       | qwen2.5:3b   | mDeBERTa-v3 + CAMeL-BERT |
| 3   | **Orchestration**  | Plan workflow steps + select tools | Hardcoded workflows    | qwen2.5:3b   | Qwen 2.5 3B              |
| 4   | **Execution**      | Execute tool calls, handle errors  | Mock API responses     | Mock APIs    | Your real APIs           |
| 5   | **Generation**     | Compose natural response           | Template responses     | qwen2.5:3b   | Qwen 2.5 0.5B            |
| 6   | **Validation**     | Verify quality, policy, safety     | Blocked-word check     | Rule-based   | MiniCheck + DeBERTa-v3   |

---

## Cultural Context Annotations

When translating from non-English languages, literal translation loses cultural meaning:

- **"اريد شي خفيف"** → literally "I want something light"
- But in Gulf Arabic, **"خفيف"** means a snack or small portion, not low-calorie food

MSM's Translation Layer produces **context annotations** alongside the translated text:

```json
{
  "translated_text": "I want something light",
  "context_annotations": [
    {
      "original_term": "خفيف",
      "translated_term": "light",
      "cultural_meaning": "In Gulf Arabic, 'خفيف' means a snack or small portion",
      "intent_hints": ["snack", "small_portion", "quick_meal"]
    }
  ]
}
```

Downstream layers read `intent_hints` to make better decisions — the cultural nuance stays in the Translation Layer where it belongs.

---

## Project Structure

```
msm/
├── src/
│   ├── core/
│   │   ├── types.ts          ← Layer contracts (THE standard)
│   │   ├── pipeline.ts       ← Pipeline engine + trace + validation gate
│   │   ├── registry.ts       ← Provider registry + createPipeline()
│   │   ├── manifest.ts       ← Manifest loader + Zod validation
│   │   └── http-layer.ts     ← Base class for HTTP-backed layers
│   ├── dummy-models/         ← Provider: "dummy" (no deps, instant)
│   │   ├── translation.ts
│   │   ├── classification.ts
│   │   ├── orchestration.ts
│   │   ├── execution.ts
│   │   ├── generation.ts
│   │   └── validation.ts
│   ├── ollama-layers/        ← Provider: "ollama" (real LLM)
│   │   ├── ollama-client.ts
│   │   ├── translation.ts
│   │   ├── classification.ts
│   │   ├── orchestration.ts
│   │   └── generation.ts
│   ├── server.ts             ← HTTP server (any manifest)
│   ├── demo.ts               ← Demo: pnpm demo
│   ├── demo-ollama.ts        ← Demo: pnpm demo:ollama
│   ├── cli.ts                ← CLI: msm demo / validate / trace
│   └── index.ts              ← Public API (all exports)
├── tests/
│   ├── pipeline.test.ts      ← 27 pipeline tests
│   ├── manifest.test.ts      ← 6 manifest tests
│   ├── registry.test.ts      ← 9 registry tests
│   └── hooks.test.ts         ← 9 hook tests (51 total)
├── examples/                 ← Domain manifests (like docker-compose files)
│   ├── food-commerce-gulf-dummy.yaml
│   ├── food-commerce-gulf-ollama.yaml
│   ├── healthcare-triage.yaml
│   ├── sports-booking.yaml
│   ├── legal-compliance.yaml
│   ├── banking-support.yaml
│   ├── education-tutoring.yaml
│   └── ecommerce-retail.yaml
├── spec/
│   └── MSM-Specification-v1.0.md
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Benchmarks

Run the benchmark suite against the golden test set (49 Arabic + English cases across food, retail, and support domains):

```bash
pnpm benchmark               # dummy models only
pnpm benchmark:ollama        # dummy + Ollama side-by-side
```

### Dummy Provider Results (49 cases)

| Metric                   | Score |
| ------------------------ | ----- |
| Avg latency per request  | 0ms   |
| Intent accuracy          | 69%   |
| Domain accuracy          | 88%   |
| Translation skip correct | 100%  |
| Annotation rate          | 48%   |
| Validation pass rate     | 100%  |

| Layer          | Avg | Min | Max | Success |
| -------------- | --- | --- | --- | ------- |
| Translation    | 0ms | 0ms | 0ms | 100%    |
| Classification | 0ms | 0ms | 0ms | 100%    |
| Orchestration  | 0ms | 0ms | 0ms | 100%    |
| Execution      | 0ms | 0ms | 0ms | 100%    |
| Generation     | 0ms | 0ms | 0ms | 100%    |
| Validation     | 0ms | 0ms | 0ms | 100%    |

> Dummy models are instant (in-memory) — latency is 0ms. The value is in accuracy: the keyword-based classifier hits 69% intent accuracy and 88% domain accuracy across 49 diverse cases — proving the pipeline contracts work. The remaining accuracy gap is exactly what real models close. Run `pnpm benchmark:ollama` to see the difference.

### What to expect from Ollama

With `qwen2.5:3b` on CPU, expect **800–2000ms per request** depending on hardware. On a Mac with Apple Silicon, closer to 400–800ms. The benchmark runner prints a side-by-side comparison so you can see exactly where the time goes (translation and generation are the heaviest layers).

Results are saved to `benchmark-results.json` for programmatic use.

---

## Pipeline Guarantees

- **Outbound translation** — non-English users automatically receive responses in their language
- **Typed fallbacks** — if a layer fails, downstream layers get valid typed defaults (e.g. `intent: "unknown"`, `domain: "general"`), not bare error objects
- **Graceful degradation** — if a layer or hook fails, pipeline continues with a recorded failure
- **Validation gate** — `block` unsafe responses (fallback) or `retry` generation
- **Full trace** — every request has per-layer model IDs, latency, confidence, and status (including hooks and outbound translation)
- **Hot swap** — replace any layer at runtime without restarting
- **Parallel hooks** — multiple hooks at the same point run concurrently via `Promise.allSettled()`
- **Session history** — `input.history` carries multi-turn conversation context through the pipeline
- **Extensible** — add domain-specific hooks without changing the 6 core layers

---

## Roadmap

- [x] Specification v1.0
- [x] TypeScript runtime + pipeline engine
- [x] Dummy model layers (provider: dummy)
- [x] Ollama model layers (provider: ollama)
- [x] Provider registry + `createPipeline()` from manifests
- [x] HTTP server + REST API (any manifest)
- [x] Docker compose (Ollama + MSM)
- [x] Cultural context annotations
- [x] Manifest system + Zod validation
- [x] Graceful degradation + validation gate
- [x] Typed layer fallbacks (downstream layers get valid shapes on failure)
- [x] Outbound translation (auto English → user’s language)
- [x] Parallel hook execution
- [x] Session history (multi-turn conversation context)
- [x] Hooks system (domain extensions without core changes)
- [x] CLI (demo / validate / trace)
- [x] 58+ tests passing
- [x] Benchmark suite (latency, accuracy per layer)
- [x] 8 domain manifests (food, healthcare, sports, legal, banking, education, e-commerce)
- [ ] Production model examples (NLLB, Functionary)
- [x] npm publish (`msm-ai` on npm)
- [ ] Fine-tuning guide for domain-specific models
- [ ] Streaming output (Time-to-First-Token)
- [ ] Observability dashboard (per-layer trace visualization)
- [ ] Web UI pipeline builder

## Philosophy

```
LLM:  one model knows everything
MSM:  each model masters one thing

LLM:  scale solves all problems
MSM:  specialization solves real problems

LLM:  black box, hope it works
MSM:  modular, measurable, replaceable
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding providers, domain manifests, hooks, and layers.

## License

MIT — The standard belongs to the community.
