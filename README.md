# MSM — Multi Small Models

> **The product is the standard and the pipeline. The models inside are interchangeable commodities.**

MSM is an open standard for building commercial AI systems using a coordinated pipeline of small, specialized models instead of a single large language model.

Each model masters one task. Together they deliver results that match large LLMs on structured, domain-specific tasks — at a fraction of the cost, latency, and infrastructure.

```
Single-Pass Brain — Agent Controls the Loop

User Message                          Agent Loop
     ↓                                     │
[L1] Translation                           │  1. Agent sends message
     ↓                                     │  2. Brain returns action
[L2] Classification                        │
     ↓                                     │  action = "use_tool"?
[L3] Orchestration ──→ action?             │  → Agent executes tool
     │                                     │  → Agent calls brain again
     ├─ "use_tool"  → return early         │     with tool_results[]
     │   (action_required: true)           │
     │   + tool_name, tool_params, plan    │  action = "respond"?
     │                                     │  → Agent delivers response
     └─ "respond" / "escalate" / custom    │
          ↓                                │  action = "escalate"?
     [L4] Execution                        │  → Agent routes to human
          ↓                                │
     [L5] Generation                       │  action = custom?
          ↓                                │  → Agent handles internally
     [L6] Validation                       │
          ↓                                │
     [L7] Outbound Translation             │
          ↓                                │
     Final Output                          │
```

## Single-Pass Brain — Agent Loop Pattern

MSM is a **single-pass brain**. The brain never executes tools — it only decides what to do next. The agent framework controls the loop:

| Step | What happens                                                             | Who does it |
| ---- | ------------------------------------------------------------------------ | ----------- |
| 1    | User sends message                                                       | Agent       |
| 2    | Brain returns `action="use_tool"` + `tool_name` + `tool_params` + `plan` | Brain (MSM) |
| 3    | Agent executes the tool                                                  | Agent       |
| 4    | Agent calls brain again with `tool_results[]` in input                   | Agent       |
| 5    | Brain sees tool_results → returns `action="respond"` with generated text | Brain (MSM) |
| 6    | Agent delivers response to user                                          | Agent       |

### In code

```typescript
import {
  Pipeline,
  STANDARD_ACTIONS,
  type MSMInput,
  type ToolResult,
} from "msm-ai";

const brain = new Pipeline();
// ... register 6 layers ...
brain.freeze();

// Agent loop
let input: MSMInput = { raw: userMessage, modality: "text" };

while (true) {
  const trace = await brain.run(input);
  const action = trace.payload.orchestration?.action;

  if (action === STANDARD_ACTIONS.USE_TOOL) {
    // Brain wants a tool — agent executes it
    const result = await myToolRunner(trace.payload.orchestration!);
    input = { raw: userMessage, modality: "text", tool_results: [result] };
    continue;
  }

  // respond, escalate, clarify, or custom → done
  return trace.payload.final_output?.text;
}
```

See [examples/agent-integration.ts](examples/agent-integration.ts) for the full runnable demo.

---

## Extensible Orchestration Actions

The orchestration layer returns an `action` field that tells the pipeline what to do next. MSM ships with 5 standard actions:

```typescript
import { STANDARD_ACTIONS } from "msm-ai";

STANDARD_ACTIONS.USE_TOOL; // "use_tool"  — triggers iteration (System 2)
STANDARD_ACTIONS.RESPOND; // "respond"   — generate response directly
STANDARD_ACTIONS.CLARIFY; // "clarify"   — ask user for more info
STANDARD_ACTIONS.ESCALATE; // "escalate"  — hand off to human agent
STANDARD_ACTIONS.DELEGATE; // "delegate"  — pass to another agent
```

`OrchestrationAction` is typed as `string` — agents can define any custom action they need:

```typescript
// Agent-specific actions — MSM doesn't need to know about them
action: "require_approval"; // e.g. cancellation needs manager approval
action: "wait_for_payment"; // e.g. hold until payment confirms
action: "schedule_callback"; // e.g. call customer back later
```

Only `"use_tool"` has special pipeline behavior (triggers early return with `action_required: true`). Every other action — standard or custom — is treated as terminal: the pipeline moves straight to generation.

---

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
├── food-commerce-gulf-dummy.yaml         ← Gulf food, offline (run locally now)
├── food-commerce-gulf-ollama.yaml        ← Gulf food, real Ollama (run locally now)
├── healthcare-triage.yaml                ← Medical triage (production blueprint)
├── sports-booking.yaml                   ← Sports booking (production blueprint)
├── legal-compliance.yaml                 ← Legal/contract review (production blueprint)
├── banking-support.yaml                  ← Gulf banking support (production blueprint)
├── education-tutoring.yaml               ← AI tutoring (production blueprint)
├── ecommerce-retail.yaml                 ← Gulf e-commerce (production blueprint)
└── agent-integration.ts                  ← Agent loop integration demo
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
- Multiple hooks at the same point run **sequentially in declaration order** (spec §5.1)
- Hooks receive a `structuredClone` of the payload — they cannot mutate the live pipeline state
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

## Agent Integration — Brain + Hands Pattern

MSM is the **brain**. Your agent is the **hands**. The brain decides; the agent executes.

```typescript
import { Pipeline, STANDARD_ACTIONS, type MSMInput } from "msm-ai";

const brain = new Pipeline();
// ... register 6 layers ...
brain.freeze();

async function handleMessage(userMessage: string) {
  let input: MSMInput = { raw: userMessage, modality: "text" };

  while (true) {
    const trace = await brain.run(input);
    const action = trace.payload.orchestration?.action;

    if (action === STANDARD_ACTIONS.USE_TOOL) {
      // Brain wants a tool — agent executes it
      const toolName = trace.payload.orchestration?.tool_name!;
      const toolParams = trace.payload.orchestration?.tool_params!;
      const result = await executeMyTool(toolName, toolParams);

      // Feed results back to the brain
      input = { raw: userMessage, modality: "text", tool_results: [result] };
      continue;
    }

    if (action === STANDARD_ACTIONS.ESCALATE) {
      return routeToHumanAgent(trace);
    }

    // respond, clarify, or custom action → deliver response
    return trace.payload.final_output?.text;
  }
}
```

The brain returns:

- `action="use_tool"` + `tool_name` + `tool_params` + `plan[]` → agent executes, calls brain again
- `action="respond"` → generated response ready to deliver
- `action="escalate"` → route to human
- `action="clarify"` → ask user for more info
- Any custom action → agent handles it

See [examples/agent-integration.ts](examples/agent-integration.ts) for the full runnable demo.

---

## Shared Brain — Multi-Tenant Architecture

MSM is stateless and manifest-driven. This makes it **multi-tenant by default** — no extra infrastructure required.

Each request carries a `manifest_id`. The brain loads the right models, runs the pipeline, returns a decision. It has no concept of tenants, sessions, or routing.

```
Agent (salon)      → { message, manifest_id: "booking-gulf" }      ──┐
Agent (hotel)      → { message, manifest_id: "booking-gulf" }      ──┤
Agent (restaurant) → { message, manifest_id: "food-gulf" }         ──┤──→ Brain Service
Agent (clinic)     → { message, manifest_id: "healthcare-gulf" }   ──┘    (one instance)
```

**The agent owns the manifest choice.** It knows its domain at deploy time and sends the manifest ID with every request. No gateway, no tenant lookup table, no routing layer.

### Model deduplication

Models referenced by multiple manifests are loaded **once** in GPU memory:

```
5 manifests × 5 models each = 25 model loads (naive)

With deduplication:
  arabic-translate    ← loaded once, used by all 5 manifests
  intent-classify     ← loaded once, used by all 5 manifests
  format-validate     ← loaded once, used by all 5 manifests
  gulf-generate       ← loaded once, used by 4 manifests
  booking-orchestrate ← loaded once, used by 2 manifests
  food-orchestrate    ← loaded once
  health-orchestrate  ← loaded once

  Total: 7 models in GPU memory (not 25)
```

### Layer shareability across businesses

| Layer          | Shared across verticals? | Notes                                                   |
| -------------- | ------------------------ | ------------------------------------------------------- |
| Translation    | Fully shared             | Language processing is domain-agnostic                  |
| Classification | Mostly shared            | Core intents (book, cancel, inquire) are universal      |
| Orchestration  | Partially shared         | Same pattern (intent → tool), different tool registries |
| Execution      | Fully shared             | Passthrough — agent handles real execution              |
| Generation     | Partially shared         | Vertical-specific tone (hospitality vs medical)         |
| Validation     | Fully shared             | Format, language, and safety checks are domain-agnostic |

Two businesses in the same vertical (e.g., two restaurants) share 100% of the brain — same manifest, same models. The only difference is the agent's tool configuration.

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
  "manifest_id": "food-commerce-gulf",
  "session_id": "optional-session-id",
  "history": [
    { "role": "user", "content": "What's on your menu?" },
    { "role": "assistant", "content": "We have burgers, pizza, and more." }
  ]
}
```

All fields except `text` are optional. When `manifest_id` is provided, the brain loads and caches the corresponding manifest — enabling multi-tenant deployments from a single brain service. Request body is validated with Zod (max 4096 chars per field, max 50 history entries, 64KB body limit).

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
    },
    {
      "layer": "outbound_translation",
      "model_id": "dummy-translation-v1",
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

| #   | Layer              | Job                                           | Dummy Model            | Ollama Model | Production Model                                   |
| --- | ------------------ | --------------------------------------------- | ---------------------- | ------------ | -------------------------------------------------- |
| 1   | **Translation**    | Convert any language ↔ English                | Word-list substitution | qwen2.5:3b   | NLLB-200-distilled-600M (600M)                     |
| 2   | **Classification** | Identify intent, domain, urgency              | Keyword matching       | qwen2.5:3b   | MiniLM-L6-v2 + head (22.7M) or CAMeLBERT-DA (110M) |
| 3   | **Orchestration**  | Extract params, plan steps, select tools      | Hardcoded workflows    | qwen2.5:3b   | Qwen2.5-1.5B-Instruct (1.54B)                      |
| 4   | **Execution**      | Passthrough — agent handles real execution    | Mock API responses     | Mock APIs    | (none — passthrough)                               |
| 5   | **Generation**     | Compose grounded response from KB + tool data | Template responses     | qwen2.5:3b   | ← same Qwen2.5-1.5B (shared)                       |
| 6   | **Validation**     | Verify quality, grounding, safety             | Blocked-word check     | Rule-based   | Rule-based + fastText langdetect                   |

> Orchestration and Generation share the same Qwen2.5-1.5B model — loaded once, used with different system prompts. Execution is a passthrough; the agent handles real tool calls. This means a production pipeline typically loads **3 models total**.

---

## Model Sizing

A production MSM brain runs on 3 models. Orchestration and Generation share one model (different system prompts, same weights). Execution and Validation are rule-based.

### What each layer actually does

| Layer          | Task type                  | Why it needs ML (or doesn't)                                                                  |
| -------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| Translation    | Sequence-to-sequence       | Dialect handling, cultural context annotations, time conventions                              |
| Classification | Multi-label classification | Sentence-level intent + domain from ~12-20 labels                                             |
| Orchestration  | Structured JSON generation | Parameter extraction, missing field detection, KB-sufficiency check, multi-step planning      |
| Execution      | Passthrough                | Agent handles it — no model                                                                   |
| Generation     | Grounded text generation   | Synthesize KB snippets + tool results + company profile into fluent response with brand voice |
| Validation     | Rule-based checks          | Language, safety, completeness, factual grounding against KB                                  |

### Reference configurations

**Gulf Arabic (booking, food, support):**

| Layer          | Model                    | Params | Disk (quantized) |
| -------------- | ------------------------ | ------ | ---------------- |
| Translation    | NLLB-200-distilled-600M  | 600M   | ~1.2GB           |
| Classification | MiniLM-L6-v2 + head      | 22.7M  | ~90MB            |
| Orchestration  | Qwen2.5-1.5B-Instruct Q4 | 1.54B  | ~1GB             |
| Execution      | —                        | —      | —                |
| Generation     | ← same model (shared)    | —      | —                |
| Validation     | Rule-based               | —      | —                |
| **Total**      | **3 models**             |        | **~2.3GB**       |

**English-only (no translation):**

| Layer          | Model                    | Params | Disk (quantized) |
| -------------- | ------------------------ | ------ | ---------------- |
| Classification | MiniLM-L6-v2 + head      | 22.7M  | ~90MB            |
| Orchestration  | Qwen2.5-1.5B-Instruct Q4 | 1.54B  | ~1GB             |
| Generation     | ← same model (shared)    | —      | —                |
| **Total**      | **2 models**             |        | **~1.1GB**       |

> All model sizes verified against HuggingFace model cards (April 2026). Qwen2.5-1.5B: 1.54B params confirmed, supports 29+ languages including Arabic, structured JSON output. MiniLM-L6-v2: 22.7M params, 384-dim embeddings. NLLB-200: 600M params, 200 language variants.

### Context and grounding

The brain receives pre-fetched context from the agent — KB snippets, company profile, conversation history. It never queries databases directly. Generation (L5) synthesizes responses from this provided context. Validation (L6) checks that the generated response only contains facts present in the KB and tool results.

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
│   │   ├── pipeline.ts       ← Pipeline engine (single-pass brain)
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
│   ├── pipeline.test.ts      ← 62 pipeline tests (single-pass + agent loop)
│   ├── manifest.test.ts      ← 13 manifest tests
│   ├── registry.test.ts      ← 13 registry tests
│   └── hooks.test.ts         ← 9 hook tests (97 total)
├── examples/                 ← Domain manifests + integration demos
│   ├── food-commerce-gulf-dummy.yaml
│   ├── food-commerce-gulf-ollama.yaml
│   ├── healthcare-triage.yaml
│   ├── sports-booking.yaml
│   ├── legal-compliance.yaml
│   ├── banking-support.yaml
│   ├── education-tutoring.yaml
│   ├── ecommerce-retail.yaml
│   └── agent-integration.ts               ← Agent loop demo
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

- **Outbound translation** — non-English users automatically receive responses in their language (direction-aware: translation layers receive `direction: "outbound"` + `target_language`)
- **Single-pass brain** — brain decides, agent executes; `action="use_tool"` returns early with `tool_name`, `tool_params`, and `plan[]`; agent feeds `tool_results[]` back on next call
- **Extensible actions** — `OrchestrationAction` is `string` — use standard actions (`STANDARD_ACTIONS`) or define your own; only `"use_tool"` triggers early return
- **Typed fallbacks** — if a layer fails, downstream layers get valid typed defaults (e.g. `intent: "unknown"`, `domain: "general"`), not bare error objects
- **Graceful degradation** — if a layer or hook fails, pipeline continues with a recorded failure
- **Validation gate** — `block` unsafe responses (fallback) or `retry` generation (with `_validation_feedback` injected so generation knows WHY the previous attempt was rejected)
- **Full trace** — every request has per-layer model IDs, latency, confidence, and status (including hooks, outbound translation, and iteration history)
- **Immutable pipelines** — `pipeline.freeze()` locks layer/hook registration for safe concurrent use
- **Atomic runs** — `run()` snapshots layers and hooks at start, so mid-flight `swap()` calls don't affect in-progress requests
- **Hot swap** — replace any layer at runtime without restarting
- **AbortSignal** — pass `signal` to `pipeline.run()` for request cancellation
- **Sequential hooks** — multiple hooks at the same point run in declaration order per spec, with `structuredClone` isolation (hooks cannot mutate the live payload)
- **Session history** — `input.history` carries multi-turn conversation context through the pipeline
- **Strict manifests** — per-layer Zod schemas with `.strict()`, ISO 8601 date validation, unknown fields rejected
- **Hardened server** — Zod request validation, 64KB body limit, 10s read timeout (slowloris protection)
- **Registry guards** — duplicate registration throws, factory output verified against requested layer name
- **Bilingual output** — `response_text_ar` / `text_ar` for Arabic responses alongside English
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
- [x] Sequential hook execution (declaration order per spec, structuredClone isolation)
- [x] Session history (multi-turn conversation context)
- [x] Hooks system (domain extensions without core changes)
- [x] CLI (demo / validate / trace)
- [x] 97 tests passing
- [x] Benchmark suite (latency, accuracy per layer)
- [x] 8 domain manifests (food, healthcare, sports, legal, banking, education, e-commerce)
- [x] Single-pass brain (agent loop pattern — brain decides, agent executes)
- [x] Extensible orchestration actions (STANDARD_ACTIONS + custom strings)
- [x] Agent integration example (agent loop demo)
- [x] Pipeline freeze (immutable for concurrent use)
- [x] AbortSignal support (request cancellation)
- [x] Ollama Zod validation + retry + rate limiting
- [x] Bilingual output (response_text_ar, text_ar)
- [x] Strict manifest validation (per-layer Zod schemas, ISO 8601 dates)
- [x] Hardened server (Zod validation, body limits, read timeout)
- [x] Registry guards (duplicate detection, factory verification)
- [x] Atomic pipeline runs (layer/hook snapshots)
- [x] Retry feedback (validation violations fed back to generation)
- [x] Ollama client timeout (30s AbortController)
- [ ] Production model examples (NLLB, Functionary)
- [x] npm publish (`msm-ai` on npm)
- [ ] Fine-tuning guide for domain-specific models
- [ ] Streaming output (Time-to-First-Token)
- [ ] Observability dashboard (per-layer trace visualization)
- [ ] Web UI pipeline builder

## Philosophy

### The brain is simple — on purpose

Classifying "I want a burger" as `intent: place_order` is not intelligence. It's pattern matching. Translating Gulf Arabic is not reasoning. It's linguistics. Picking which API to call is not thinking. It's a lookup table with context.

LLMs use 70 billion parameters to do what a 3B model does just as well — when the domain is bounded. MSM exists because **most commercial AI tasks are bounded**. You know the intents. You know the tools. You know the languages. You don't need general intelligence. You need specialized accuracy.

### The brain decides. The agent executes.

MSM is a **stateless brain**: `f(message, manifest_id) → decision`. It never calls APIs, never manages state, never remembers previous turns. That's the agent's job.

This separation means:

- **The brain scales horizontally** — 100 agents can share one brain service on a single GPU
- **The brain runs anywhere** — cloud, on-premise, edge device, browser (via WASM)
- **The brain is testable** — input in, decision out, no side effects
- **The brain is multi-tenant by default** — each request carries a manifest ID, no routing infrastructure
- **The agent is portable** — swap the brain (new manifest), keep the same agent loop

### Models are commodities. The pipeline is the product.

When a better Arabic translation model comes out, you change one line in a YAML file. When you switch from Ollama to a cloud provider, you register a new provider. When you move from food commerce to healthcare, you swap the manifest.

The models are replaceable. The 6-layer pipeline contract — translate, classify, orchestrate, execute, generate, validate — is the standard. That's what MSM is.

```
LLM approach:   one model knows everything → expensive, slow, black box
MSM approach:   each model masters one task → cheap, fast, auditable

LLM approach:   brain and hands are the same thing
MSM approach:   brain decides, hands execute — separately, swappably

LLM approach:   scale the model to solve more problems
MSM approach:   specialize the model to solve real problems

LLM approach:   needs internet, needs API key, needs budget
MSM approach:   runs on a phone, runs offline, runs on your GPU
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding providers, domain manifests, hooks, and layers.

## License

MIT — The standard belongs to the community.
