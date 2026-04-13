# MSM — Multi Small Models

## Standard Specification · Version 1.0

**Status:** Draft for Community Review
**Date:** April 2026
**License:** Open Standard

---

> **Core Philosophy:** The product is the standard and the pipeline. The models inside are interchangeable commodities.

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Motivation](#2-motivation)
3. [Architecture Overview](#3-architecture-overview)
4. [Layer Contracts](#4-layer-contracts)
5. [Internal Payload Format](#5-internal-payload-format)
6. [Manifest Schema](#6-manifest-schema)
7. [Hooks](#7-hooks)
8. [Layer Registry & createPipeline](#8-layer-registry--createpipeline)
9. [Recommended Model Candidates](#9-recommended-model-candidates)
10. [Dummy Model Strategy](#10-dummy-model-strategy)
11. [Swap Mechanism](#11-swap-mechanism)
12. [Evaluation Criteria](#12-evaluation-criteria)
13. [Business Contract](#13-business-contract)
14. [Domain Expansion Path](#14-domain-expansion-path)
15. [Open Source Strategy](#15-open-source-strategy)
16. [Milestones](#16-milestones)
17. [Glossary](#17-glossary)

---

## 1. Abstract

MSM (Multi Small Models) is an open standard for building commercial AI systems using a coordinated pipeline of small, specialized language models rather than a single large language model (LLM). Each model in the pipeline masters one specific task. Together they deliver results that match or exceed large LLMs at a fraction of the cost, latency, and infrastructure requirement.

This specification defines the layer contracts, internal communication format, manifest schema, evaluation criteria, and swap mechanism that together constitute the MSM standard. Any AI system implementing these interfaces is MSM-compliant, regardless of which underlying models are used.

---

## 2. Motivation

### 2.1 The Problem with LLMs for Commerce

Large Language Models contain the accumulated knowledge of human civilization. They can write poetry, solve calculus, and discuss ancient philosophy. For a food ordering system in Doha, this is enormous waste.

A commercial AI system for Arabic-language commerce needs to master exactly six things:

- Understand what the user wants — **intent**
- Plan the steps to fulfil that intent — **workflow**
- Maintain session context — **state**
- Understand Arabic and English including code-switching — **language**
- Generate a natural, on-brand reply — **generation**
- Verify the output before sending — **validation**

A 200B parameter LLM solves all six poorly and expensively. Five specialized small models solve each one excellently and cheaply.

> **Note:** Tool execution (calling APIs, running functions) is intentionally **not** a layer. MSM is a brain — it decides what to do, plans the steps, and generates the response. The external agent loop handles actual execution. This keeps the pipeline pure and deterministic.

### 2.2 The Language Problem

Most LLMs treat non-English languages as secondary. Arabic — the fifth most spoken language and the primary language of one of the fastest-growing digital commerce regions — is particularly underserved. Gulf dialect receives even less attention.

MSM addresses this by isolating language handling into a dedicated Translation Layer. This layer is **conditional and language-agnostic**: it detects the input language, translates to English if needed, and skips entirely for English input. Any language gets first-class support by fine-tuning one layer, independent of the reasoning and orchestration layers which always operate in English.

```
Input: Arabic   →  translate to EN  →  logic  →  translate to AR  →  output
Input: Chinese  →  translate to EN  →  logic  →  translate to ZH  →  output
Input: French   →  translate to EN  →  logic  →  translate to FR  →  output
Input: English  →  skip layer       →  logic  →  skip layer       →  output
```

### 2.3 The Translation Architecture Advantage

By routing all non-English input through a dedicated translation model before any reasoning occurs, the orchestration and logic layers only need to be trained and evaluated in English. This means:

- Cleaner, more abundant training data for reasoning layers
- Any language's quality improves independently by upgrading one layer
- Code-switching (mixing languages mid-sentence) is handled at the boundary, not spread across all models
- Logic layers become easier to maintain, debug, and benchmark

### 2.4 Comparison

|                       | LLM Approach       | MSM Approach                      |
| --------------------- | ------------------ | --------------------------------- |
| Cost per call         | High               | 10–20x lower                      |
| Latency               | 2–5 seconds        | Under 1 second                    |
| Arabic quality        | Mediocre           | Purpose-built                     |
| Non-English languages | Afterthought       | First-class via Translation Layer |
| Domain accuracy       | ~80%               | 95%+ specialized                  |
| On-premise deploy     | Impractical        | Single GPU                        |
| Layer upgrades        | Replace everything | Swap one model                    |
| Auditability          | Black box          | Per-layer trace                   |
| Training cost         | Millions           | Thousands                         |

---

## 3. Architecture Overview

An MSM system is a sequential pipeline of five standard layers. Each layer receives a structured payload, performs its specialized task, appends its output to the payload, and passes it to the next layer.

> **Design Principle:** One layer, one job. A layer that does two things should be two layers.

### 3.1 The Five Core Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1 · Translation Layer                                │
│  Model: NLLB-200 distilled · Size: 600M                     │
│  Job:   Detect language; if not English, translate to        │
│         English. At output, translate back to user's lang.  │
│         Skipped entirely for English input.                  │
│  In:    Raw user text (any language)                        │
│  Out:   English text + language code + confidence           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2 · Classification Layer                             │
│  Model: mDeBERTa-v3 + CAMeL-BERT · Size: 450M              │
│  Job:   Identify intent, domain, urgency, routing target    │
│  In:    English text from Translation Layer                 │
│  Out:   Intent label + domain + urgency + confidence        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 · Orchestration Layer                              │
│  Model: Qwen 2.5 3B · Size: 3B                             │
│  Job:   Decompose intent into ordered workflow steps        │
│         Select appropriate tools for each step             │
│  In:    Intent + domain from Classification Layer           │
│  Out:   Ordered workflow steps + tool selection             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 4 · Generation Layer                                 │
│  Model: Qwen 2.5 0.5B · Size: 500M                         │
│  Job:   Compose natural English response from workflow plan │
│  In:    Workflow steps + original intent + brand voice config│
│  Out:   English response text + tone metadata               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 5 · Validation Layer                                 │
│  Model: MiniCheck + DeBERTa-v3 · Size: 400M                │
│  Job:   Verify factual consistency, policy, quality, safety │
│  In:    Generated response + intent + policy config         │
│  Out:   Pass/fail + quality score + failure reason          │
└─────────────────────────────────────────────────────────────┘
                           ↓
              [Layer 1 again: translate response]
                           ↓
                    Final User Output
```

### 3.2 Pipeline Flow Narrative

```
User Input (Arabic/English/mixed)
      ↓
[L1] Translation        →  English text
      ↓
[L2] Classification     →  Intent + Domain
      ↓
[L3] Orchestration      →  Workflow Steps + Tool Selection
      ↓
[L4] Generation         →  English Response
      ↓
[L5] Validation         →  Quality Gate
      ↓
[L1] Translation        →  Response in User's Language
      ↓
Final Output
```

The Translation Layer is invoked twice — at input and at output. It is **conditional and language-agnostic**: if the user's input is already in English, the layer is skipped (both inbound and outbound). If the input is in any other language — Arabic, Chinese, French, Urdu — it is translated to English before processing, and the final response is translated back. All intermediate layers always operate in English only. This means any language gets first-class support by improving one layer, and the system is not tied to any specific language pair.

#### 3.2.1 Cultural Context Annotations

A literal translation can lose cultural meaning. For example, the Gulf Arabic phrase "اريد شي خفيف" translates literally to "I want something light" — but in context, "خفيف" means a snack or small portion, not low-calorie food.

MSM addresses this with **context annotations**: the Translation Layer optionally produces a `context_annotations` array alongside the translated text. Each annotation captures:

| Field              | Type       | Description                                   |
| ------------------ | ---------- | --------------------------------------------- |
| `original_term`    | `string`   | The source-language term                      |
| `translated_term`  | `string`   | The literal English translation               |
| `cultural_meaning` | `string`   | Human-readable explanation of cultural nuance |
| `intent_hints`     | `string[]` | Machine-readable hints for downstream layers  |

Downstream layers (especially Classification) can read `intent_hints` to make better decisions without needing to understand the source language.

#### 3.2.2 Translation Modes

The Translation Layer operates in one of two modes:

- **`translated`** — Input was in a non-English language; the layer performed translation and may have produced context annotations.
- **`native`** — Input was already in English; the layer is a passthrough with no translation or annotations.

The mode is declared in the manifest `layers.translation.mode` field and reported in the layer output.

### 3.3 Total System Footprint

```
Layer               Model                   Parameters
─────────────────────────────────────────────────────
Translation         NLLB-200 distilled      600M
Classification      mDeBERTa + CAMeL        450M
Orchestration       Qwen 2.5 3B             3,000M
Generation          Qwen 2.5 0.5B           500M
Validation          MiniCheck + DeBERTa     400M
─────────────────────────────────────────────────────
Total                                       ~4.95B
─────────────────────────────────────────────────────
Hardware:   Single A100 (80GB) or 2x A10G
Latency:    Under 1 second end-to-end
Cost/call:  Fraction of one cent
```

---

## 4. Layer Contracts

Every MSM layer must implement the following interface. A layer that does not satisfy its contract is not MSM-compliant.

### 4.1 Universal Layer Interface

Every layer:

- Receives the full accumulated MSM payload
- Performs its single specialized task
- Appends its result block to the payload
- Returns the updated payload to the pipeline runner

Every layer output block must include:

```json
{
  "model_id": "string — which model handled this layer",
  "model_ver": "string — model version",
  "latency_ms": "number — processing time in milliseconds",
  "confidence": "float — 0.0 to 1.0",
  "status": "ok | degraded | failed",
  "error": "string — populated only if status is not ok"
}
```

### 4.2 Layer-Specific Output Requirements

| Layer          | Required Output Fields                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Translation    | `translated_text`, `source_language`, `target_language`, `confidence`, `mode`, `context_annotations?` |
| Classification | `intent`, `domain`, `urgency`, `confidence`, `routing_target`                                         |
| Orchestration  | `workflow_steps[]`, `tool_selections[]`, `estimated_steps`, `mode`                                    |
| Generation     | `response_text`, `tone`, `word_count`                                                                 |
| Validation     | `passed`, `quality_score`, `policy_violations[]`, `action`                                            |

### 4.3 Graceful Degradation

If a layer fails, the pipeline must not crash. The layer must:

- Set `status` to `failed`
- Populate `error` with a human-readable reason
- Return a **typed fallback** with valid layer-specific fields so downstream layers can continue safely

Each layer has a typed fallback that preserves the downstream contract:

| Layer          | Fallback Fields                                                         |
| -------------- | ----------------------------------------------------------------------- |
| Translation    | `translated_text: null`, `source_language: "unknown"`, `mode: "native"` |
| Classification | `intent: "unknown"`, `domain: "general"`, `urgency: "normal"`           |
| Orchestration  | `workflow_steps: ["fallback_response"]`, `tool_selections: []`          |
| Generation     | `response_text: <fallback message>`, `tone: "neutral"`                  |
| Validation     | `passed: true`, `action: "release"` (don't block on validator failure)  |

### 4.4 Session History

`MSMInput` supports an optional `history` field for multi-turn conversational context:

```json
{
  "raw": "I'll have a burger",
  "modality": "text",
  "history": [
    { "role": "user", "content": "What's on your menu?" },
    { "role": "assistant", "content": "We have burgers, pizza, and more." }
  ]
}
```

Layers that support multi-turn context (e.g., Generation, Orchestration) may read `input.history` to produce contextually aware responses. The pipeline passes `history` through unchanged — it is the responsibility of each layer to use or ignore it.

---

## 5. Internal Payload Format

All layers communicate via a single JSON payload that accumulates results as it passes through the pipeline. This enables full traceability of every request from input to output.

```json
{
  "msm_version": "1.0",
  "session_id": "uuid-v4",
  "trace_id": "uuid-v4",
  "timestamp": "ISO-8601",

  "input": {
    "raw": "ابي اطلب برغر وبيبسي",
    "modality": "text",
    "language": "ar-gulf",
    "history": []
  },

  "translation": {
    "translated_text": "I want to order a burger and pepsi",
    "source_language": "ar-gulf",
    "target_language": "en",
    "mode": "translated",
    "confidence": 0.97,
    "model_id": "nllb-200-600m",
    "model_ver": "2.1",
    "latency_ms": 42,
    "status": "ok",
    "context_annotations": [
      {
        "original_term": "ابي",
        "translated_term": "I want",
        "cultural_meaning": "Gulf dialect form of 'أريد' — casual register, implies informal ordering context",
        "intent_hints": ["casual_request", "place_order"]
      }
    ]
  },

  "classification": {
    "intent": "place_order",
    "domain": "food",
    "urgency": "normal",
    "routing_target": "order_workflow",
    "confidence": 0.94,
    "model_id": "mdeberta-v3-commerce",
    "latency_ms": 28,
    "status": "ok"
  },

  "orchestration": {
    "workflow_steps": [
      "get_location",
      "find_restaurant",
      "check_menu",
      "place_order"
    ],
    "tool_selections": ["location_api", "restaurant_api", "order_api"],
    "estimated_steps": 4,
    "model_id": "qwen2.5-3b-msm",
    "latency_ms": 190,
    "status": "ok"
  },

  "generation": {
    "response_text": "Your order is confirmed! Delivery in approximately 30 minutes.",
    "tone": "warm",
    "word_count": 10,
    "model_id": "qwen2.5-0.5b-msm",
    "latency_ms": 55,
    "status": "ok"
  },

  "validation": {
    "passed": true,
    "quality_score": 0.96,
    "policy_violations": [],
    "action": "release",
    "model_id": "minicheck-msm",
    "latency_ms": 22,
    "status": "ok"
  },

  "hooks": {
    "image_analysis": {
      "model_id": "medclip-v1",
      "model_ver": "1.0",
      "latency_ms": 200,
      "confidence": 0.92,
      "status": "ok",
      "data": { "findings": ["...domain-specific results..."] }
    }
  },

  "outbound_translation": {
    "translated_text": "تم تأكيد طلبك! التوصيل خلال 30 دقيقة تقريباً.",
    "source_language": "en",
    "target_language": "ar-gulf",
    "layer_invoked": true,
    "mode": "translated",
    "confidence": 0.95,
    "model_id": "nllb-200-600m",
    "model_ver": "2.1",
    "latency_ms": 38,
    "status": "ok"
  },

  "final_output": {
    "text": "تم تأكيد طلبك! التوصيل خلال 30 دقيقة تقريباً.",
    "language": "ar-gulf",
    "total_latency_ms": 647
  }
}
```

---

## 6. Manifest Schema

Every MSM deployment declares a manifest file. The manifest specifies which model fulfils each layer, its version, whether it has been fine-tuned, and on what data. Manifests enable reproducibility, auditability, and community sharing of domain-specific configurations.

```yaml
# msm-manifest.yaml

msm_version: "1.0"
manifest_id: "food-commerce-gulf-v1"
domain: "food-commerce"
region: "gulf-arabic"
created: "2026-04-01"

layers:
  translation:
    provider: "ollama" # which backend serves this layer
    model: "nllb-200-600m"
    version: "2.1"
    fine_tuned: true
    dataset: "gulf-commerce-ar-en-v3"
    languages: ["ar-gulf", "ar-msa", "en"]

  classification:
    provider: "ollama"
    model: "mdeberta-v3"
    version: "1.4"
    fine_tuned: true
    dataset: "intent-food-gulf-v2"
    intents: ["place_order", "track_order", "cancel", "inquiry", "complaint"]

  orchestration:
    provider: "ollama"
    model: "qwen2.5-3b"
    version: "3.0"
    fine_tuned: true
    dataset: "food-workflows-v5"

  generation:
    provider: "ollama"
    model: "qwen2.5-0.5b"
    version: "2.0"
    fine_tuned: true
    dataset: "brand-voice-gulf-v1"
    tone: "warm"

  validation:
    provider: "dummy"
    model: "minicheck"
    version: "1.0"
    fine_tuned: false
    policy: "food-commerce-policy-v2"

hooks: # optional domain-specific extensions
  drug_interaction_check:
    provider: "http"
    model: "drug-interaction-v2"
    point: "after:generation" # runs after generation, before validation
```

> **Key Promise:** Any layer model can be swapped by updating the manifest and reloading. No other layers are affected. This is the core contract of MSM.

### 6.1 The `provider` Field

Every layer in a manifest must declare a `provider` — the backend that serves that layer. Built-in providers:

| Provider | Description                                                            |
| -------- | ---------------------------------------------------------------------- |
| `dummy`  | In-memory dummy models for testing and development                     |
| `ollama` | Local Ollama instance (default: `http://localhost:11434`)              |
| `http`   | Generic HTTP endpoint — the layer sends requests to the configured URL |

Custom providers can be registered at runtime via the Layer Registry (see Section 8). The `provider` field defaults to `"dummy"` if omitted.

---

## 7. Hooks

Hooks extend the pipeline for domain-specific needs without changing core layers. A hook runs at a specific **hook point** — before or after any of the five core layers — and appends its output to the `payload.hooks` map.

### 7.1 Hook Points

Ten hook points are available:

```
before:translation    after:translation
before:classification after:classification
before:orchestration  after:orchestration
before:generation     after:generation
before:validation     after:validation
```

### 7.2 Hook Interface

Every hook must implement:

```typescript
interface MSMHook {
  name: string; // unique identifier
  point: HookPoint; // e.g. "before:classification"
  process(payload: MSMPayload): Promise<HookOutput>;
}
```

Hook output includes the standard `LayerMeta` fields plus an arbitrary `data` record:

```json
{
  "model_id": "medclip-v1",
  "model_ver": "1.0",
  "latency_ms": 200,
  "confidence": 0.92,
  "status": "ok",
  "data": {
    "findings": ["chest_xray_normal"]
  }
}
```

### 7.3 Hooks in Manifests

Hooks are declared in the `hooks` section of a manifest:

```yaml
hooks:
  image_analysis:
    provider: "http"
    model: "medclip-v1"
    point: "before:classification"
  drug_interaction_check:
    provider: "http"
    model: "drug-interaction-v2"
    point: "after:generation"
```

### 7.4 Hook Execution Rules

- Hooks run in declaration order at their hook point
- A hook failure does not crash the pipeline — it is traced with `status: "failed"` and skipped
- Hook outputs are stored in `payload.hooks[hookName]` and are available to all subsequent layers and hooks
- Hooks extend but never replace core layers

### 7.5 Example: Healthcare Domain

A healthcare triage manifest might add:

```yaml
hooks:
  image_analysis:
    provider: http
    model: medclip-v1
    point: "before:classification" # analyze X-ray before classifying intent
  drug_interaction_check:
    provider: http
    model: drug-interaction-v2
    point: "after:generation" # verify drug safety before validation
```

This adds medical capabilities without modifying any of the five core layers.

---

## 8. Layer Registry & createPipeline

The **Layer Registry** maps `(layerName, provider)` pairs to factory functions. It is the bridge between declarative manifests and runnable pipelines.

### 8.1 Registering Providers

```typescript
import { LayerRegistry } from "msm";

const registry = new LayerRegistry();

// Register a layer factory
registry.register(
  "translation",
  "ollama",
  (config) => new OllamaTranslation(config.model),
);
registry.register(
  "translation",
  "openai",
  (config) => new OpenAITranslation(config.model),
);

// Register a hook factory
registry.registerHook("http", (name, config) => new HttpHook(name, config));
```

### 8.2 createPipeline

`createPipeline()` reads a manifest and builds a ready-to-run Pipeline using the registry:

```typescript
import { createPipeline, getDefaultRegistry } from "msm";

const registry = await getDefaultRegistry(); // pre-loaded with dummy + ollama
const pipeline = await createPipeline(
  "examples/food-commerce-gulf-ollama.yaml",
  registry,
);

const result = await pipeline.run({ raw: "ابي برغر", modality: "text" });
```

This is the "manifest as docker-compose" model: declare what you want, the registry wires it up.

### 8.3 Default Registry

`getDefaultRegistry()` pre-registers:

| Provider | Layers                                                 | Description            |
| -------- | ------------------------------------------------------ | ---------------------- |
| `dummy`  | All 5                                                  | In-memory dummy models |
| `ollama` | Translation, Classification, Orchestration, Generation | Real models via Ollama |

Validation uses `dummy` provider by default since it requires domain-specific policy integrations.

---

## 9. Recommended Model Candidates

These are the best available starting points for each layer as of 2026. Any model that implements the layer contract may be used instead.

### Layer 1 — Translation

| Model                         | Size | Notes                                                                                         |
| ----------------------------- | ---- | --------------------------------------------------------------------------------------------- |
| **NLLB-200 distilled 600M** ✓ | 600M | Best Arabic quality at this size. Meta. 200 languages. Fine-tune on Gulf commerce vocabulary. |
| Helsinki OPUS-MT              | 300M | Faster but weaker Arabic dialect coverage                                                     |
| Tower Instruct                | 7B   | Quality ceiling reference — too large for production                                          |

### Layer 2 — Classification

| Model                          | Size       | Notes                                                                    |
| ------------------------------ | ---------- | ------------------------------------------------------------------------ |
| **mDeBERTa-v3 + CAMeL-BERT** ✓ | 450M total | mDeBERTa for intent routing, CAMeL for Gulf Arabic dialect understanding |
| DeBERTa-v3 small               | 180M       | English-only, use if translation layer is strong                         |
| AraBERT                        | 135M       | Arabic BERT, strong baseline                                             |

### Layer 3 — Orchestration

The Orchestration layer plans workflow steps and selects tools. It supports three resolution modes:

| Mode     | Description                                                         | Best For                         |
| -------- | ------------------------------------------------------------------- | -------------------------------- |
| `rules`  | Deterministic workflow lookup by intent. Fastest, most predictable. | Known domains with fixed intents |
| `llm`    | LLM-planned workflows. Flexible but less deterministic.             | Open-ended or novel intents      |
| `hybrid` | Rules first, LLM fallback when no rule matches.                     | Production systems (recommended) |

Set `orchestration_mode` in the manifest to control this:

```yaml
orchestration:
  provider: ollama
  model: "qwen2.5:3b"
  orchestration_mode: hybrid # rules | llm | hybrid
```

| Model             | Size | Notes                                                                                |
| ----------------- | ---- | ------------------------------------------------------------------------------------ |
| **Qwen 2.5 3B** ✓ | 3B   | Best tool calling at 3B class. Native function calling. Large fine-tuning community. |
| Phi-3.5 mini      | 3.8B | Better raw reasoning, weaker native tool calling                                     |
| Gemma 2 2B        | 2B   | More efficient, slightly weaker reasoning                                            |
| Llama 3.2 3B      | 3B   | Large community, good instruction following                                          |

### Layer 4 — Generation

| Model               | Size | Notes                                                                              |
| ------------------- | ---- | ---------------------------------------------------------------------------------- |
| **Qwen 2.5 0.5B** ✓ | 500M | Surprisingly capable. Consistent with Qwen family. Fine-tunes well on brand voice. |
| SmolLM2 360M        | 360M | Extremely small, good fluency for simple responses                                 |
| Phi-1.5             | 1.3B | Higher quality output, slightly larger                                             |

### Layer 5 — Validation

| Model                        | Size       | Notes                                                               |
| ---------------------------- | ---------- | ------------------------------------------------------------------- |
| **MiniCheck + DeBERTa-v3** ✓ | 400M total | MiniCheck for factual consistency, DeBERTa for policy compliance    |
| TinyBERT                     | 66M        | Minimal size for binary pass/fail checks                            |
| Prometheus 2                 | 2B         | Quality ceiling reference — use to generate validator training data |

### The Qwen Family Advantage

Qwen 2.5 covers three layer slots with a consistent model family:

```
Qwen 2.5 0.5B  →  Generation Layer
Qwen 2.5 3B    →  Orchestration Layer
Qwen 2.5 7B    →  Teacher model for distillation
```

Shared tokenizer, shared fine-tuning tooling, shared ecosystem. This simplifies the entire training pipeline significantly.

---

## 10. Dummy Model Strategy

Before deploying real fine-tuned models, MSM provides a set of dummy models for each layer. These are small (under 100M parameters each) and designed not to produce high-quality results, but to prove that the pipeline, payload format, manifest system, trace system, and swap mechanism all work correctly end to end.

### Purpose of Dummy Models

```
Dummy SMs prove:
  ✓ Layer contracts are correctly implemented
  ✓ Payload accumulates correctly across all layers
  ✓ Manifest loads and resolves correctly
  ✓ Trace system captures all layer metadata
  ✓ Swap mechanism replaces models without breaking pipeline
  ✓ End-to-end latency is measurable
  ✓ Validation gate fires correctly

Dummy SMs do NOT prove:
  ✗ Output quality
  ✗ Arabic accuracy
  ✗ Domain correctness
```

### Dummy Model Specifications

| Layer          | Dummy Behavior                                                | Size  |
| -------------- | ------------------------------------------------------------- | ----- |
| Translation    | Simple word-list substitution, returns input with basic swaps | < 50M |
| Classification | Returns a random valid intent from a fixed list               | < 10M |
| Orchestration  | Returns a hardcoded 3-step workflow for any input             | < 10M |
| Generation     | Returns a template string with slot-filled values             | < 50M |
| Validation     | Always returns passed=true, quality_score=0.80                | < 10M |

### Showcase Example with Dummy Models

```
Input:  "ابي اطلب برغر وبيبسي"

[L1] Translation dummy:    "I want something and something"       [conf: 0.60]
[L2] Classification dummy: intent=place_order, domain=food        [conf: 0.70]
[L3] Orchestration dummy:  steps=[step_1, step_2, step_3]        [conf: 0.70]
[L4] Generation dummy:     "Your request has been processed."    [conf: 0.70]
[L5] Validation dummy:     passed=true, score=0.80
[L1] Translation dummy:    "تم معالجة طلبك."                    [conf: 0.60]

Full trace: ✓ captured
Total time: 280ms
Pipeline:   ✓ working
```

The output quality is not the point. The infrastructure working end to end is the point.

---

## 11. Swap Mechanism

The swap mechanism is what makes MSM a platform rather than just a pipeline. Any layer can be upgraded, replaced, or rolled back without affecting other layers or requiring downtime.

### Swap Process

Swaps can be performed at two levels:

**Manifest-level:** Change the `provider` and/or `model` for a layer in the manifest YAML and reload:

```yaml
# Before: dummy provider
translation:
  provider: dummy
  model: "word-list-v1"

# After: real Ollama model
translation:
  provider: ollama
  model: "qwen2.5:3b"
```

**Runtime-level:** Use the Pipeline's `swap()` method to replace a layer programmatically:

```typescript
pipeline.swap("translation", new OllamaTranslation("qwen2.5:3b"));
```

**CLI flow:**

```
1. Update manifest — change provider/model for the target layer
2. Validate manifest — msm validate manifest.yaml
3. Load new model — msm load --layer translation --model nllb-200-600m-v3
4. Run layer tests — msm test --layer translation
5. Hot swap — msm swap --layer translation (zero downtime)
6. Monitor — trace system shows before/after quality comparison
7. Rollback if needed — msm rollback --layer translation
```

### What a Swap Affects

```
Changing the Translation Layer model:
  ✓ Translation Layer  — updated
  ✗ Classification     — unchanged
  ✗ Orchestration      — unchanged
  ✗ Generation         — unchanged
  ✗ Validation         — unchanged
```

This is the core MSM promise. Layers are independent. Improvements compound over time.

---

## 12. Evaluation Criteria

Each layer is evaluated independently using its own benchmark. The overall system is evaluated end to end. This separates signal from noise — if overall quality drops, you can identify exactly which layer caused it.

### Per-Layer Metrics

| Layer          | Primary Metric                                 | Threshold |
| -------------- | ---------------------------------------------- | --------- |
| Translation    | BLEU score on Gulf Arabic commerce test set    | > 0.72    |
| Classification | F1 score on intent classification benchmark    | > 0.90    |
| Orchestration  | Workflow accuracy on golden trace set          | > 0.85    |
| Generation     | Human preference score vs baseline             | > 0.80    |
| Validation     | False positive rate (blocking valid responses) | < 0.02    |

### End-to-End Metrics

- **Task completion rate** — did the user's intent get fulfilled correctly
- **End-to-end latency** — total pipeline time under 1000ms
- **Cost per request** — measured and reported per manifest
- **User satisfaction** — thumbs up/down signal from production

---

## 13. Business Contract

MSM makes the following guarantees to businesses deploying it. These guarantees are about the pipeline behavior, not the model quality, which varies by manifest.

### Input Guarantees

- Accepts Arabic, English, and mixed code-switched input
- Accepts text input (voice and image via future Multimodal Layer)
- Supports stateless and stateful sessions via session_id

### Output Guarantees

- Responds in the same language as input
- Every response includes a full structured trace
- Confidence score provided at every layer
- Validation gate runs before every response is released
- Responses blocked by Validation Layer return a safe fallback, never an error crash

### Operational Guarantees

- Any layer is swappable without pipeline downtime
- Every deployment is reproducible via its manifest
- Each layer is independently monitored and alertable
- Graceful degradation if one layer enters degraded status
- Full audit log available per request via trace_id

---

## 14. Domain Expansion Path

MSM is designed to expand across domains without changing the core standard. Each new domain is a new manifest family, not a new system.

```
MSM v1.0  ·  Commerce
             Food ordering, retail, ecommerce
             Prove the standard. Build the ecosystem.

MSM v1.5  ·  Business Support
             Customer service, HR bots, operations
             Same runtime. New manifests. New tool sets.

MSM v2.0  ·  Regulated Domains
             Healthcare triage, banking support, legal Q&A
             Add: Safety Layer (between Generation and Validation)
             Add: Compliance Layer (domain-specific policy engine)

MSM v3.0  ·  Infrastructure Layer
             Other AI systems use MSM as their backbone
             MSM becomes the standard others build on
```

### Future Layers (Not in v1.0)

These layers may be added in future versions as separate optional extensions:

| Future Layer          | Purpose                                    | When Needed                               |
| --------------------- | ------------------------------------------ | ----------------------------------------- |
| Memory Layer          | Long-term user memory, session persistence | When sessions span multiple conversations |
| Personalization Layer | Per-user tone, preference, history         | When brand experience matters deeply      |
| Safety Layer          | Dedicated ethics and content guardrails    | Regulated domains                         |
| Reasoning Layer       | Deep multi-step chain-of-thought           | Complex problem solving                   |
| Multimodal Layer      | Image, voice, document input               | When users send photos or speak           |

All future layers will maintain backward compatibility with v1.0 manifests.

---

## 15. Open Source Strategy

```
Open Source (community standard)     Proprietary (business)
────────────────────────────────     ──────────────────────
/spec          — layer contracts     Hosted MSM runtime (SaaS)
/runtime       — pipeline engine     Gulf Arabic fine-tuned models
/dummy-models  — showcase layer      Domain manifests (enterprise)
/evaluation    — benchmark suite     Managed swap marketplace
/examples      — sample manifests    Compliance certification
/docs          — this document       Priority support SLA
```

Open standard builds trust and community. Managed service and fine-tuned models is the sustainable business. This is the Red Hat model applied to AI infrastructure.

### Repository Structure

```
msm/
├── spec/
│   └── MSM-Specification-v1.0.md
├── src/
│   ├── core/
│   │   ├── types.ts          — all layer contracts & hook types
│   │   ├── pipeline.ts       — pipeline engine with trace & hooks
│   │   ├── registry.ts       — LayerRegistry & createPipeline
│   │   ├── manifest.ts       — Zod schema & YAML loader
│   │   └── http-layer.ts     — abstract HTTP-backed layer base
│   ├── dummy-models/         — 5 dummy layer implementations
│   ├── ollama-layers/        — Ollama-backed layers (translation, classification, orchestration, generation)
│   ├── server.ts             — HTTP REST API server
│   ├── demo.ts               — CLI demo runner
│   └── index.ts              — public barrel exports
├── tests/
│   ├── pipeline.test.ts      — 27 pipeline tests
│   ├── manifest.test.ts      — 6 manifest validation tests
│   ├── registry.test.ts      — 9 registry tests
│   └── hooks.test.ts         — 9 hook tests
├── examples/
│   ├── food-commerce-gulf-dummy.yaml
│   ├── food-commerce-gulf-ollama.yaml
│   ├── healthcare-triage.yaml
│   └── sports-booking.yaml
├── Dockerfile
└── docker-compose.yml
```

---

## 16. Milestones

### Milestone 1 — The Standard ✅

- ✅ Spec document published and open sourced
- ✅ Layer contracts finalized (5 layers + hooks)
- ✅ Manifest schema finalized (with `provider` field and `hooks` section)
- ✅ GitHub repository live — https://github.com/emadjumaah/msm

### Milestone 2 — The Runtime ✅

- ✅ Pipeline engine running (with trace, graceful degradation, validation gate, hooks)
- ✅ All five dummy models implemented
- ✅ Full trace system working
- ✅ Layer Registry & `createPipeline()` — manifest-driven pipeline creation
- ✅ 51 tests across 4 suites (pipeline, manifest, registry, hooks)
- ✅ HTTP server & Docker deployment

### Milestone 3 — First Real Manifest ✅

- ✅ Food commerce Gulf manifests (dummy + Ollama variants)
- ✅ Real Ollama models (Qwen 2.5 3B) for Translation, Classification, Orchestration, Generation
- ✅ Healthcare triage and sports booking blueprint manifests

### Milestone 4 — Community (In Progress)

- ✅ Four domain manifests publicly available
- Swap marketplace prototype
- Fine-tuning guide published
- Arabic commerce benchmark dataset released

---

## 17. Glossary

| Term                | Definition                                                                         |
| ------------------- | ---------------------------------------------------------------------------------- |
| **MSM**             | Multi Small Models — this standard                                                 |
| **Layer**           | One specialized model slot in the pipeline                                         |
| **Manifest**        | YAML file declaring which models fill each layer in a deployment                   |
| **Payload**         | The JSON object that accumulates results as it passes through all layers           |
| **Trace**           | The complete payload for a single request, used for debugging and audit            |
| **Swap**            | Replacing one layer's model without affecting other layers                         |
| **Dummy model**     | A minimal model used to prove the pipeline works before real models are plugged in |
| **Hook**            | A domain-specific extension that runs before or after a core layer                 |
| **Hook point**      | A named insertion point: `before:<layer>` or `after:<layer>`                       |
| **Provider**        | The backend that serves a layer (e.g. `dummy`, `ollama`, `http`)                   |
| **Registry**        | Maps (layer, provider) pairs to factory functions for manifest-driven construction |
| **Domain manifest** | A manifest configured for a specific business domain (e.g. food commerce)          |
| **Gulf Arabic**     | The dialect family spoken in Qatar, UAE, Saudi Arabia, Kuwait, Bahrain, Oman       |
| **Code-switching**  | The practice of alternating between Arabic and English within a single sentence    |
| **LLM**             | Large Language Model — what MSM is designed to replace for commercial use cases    |
| **Distillation**    | Training a small model to replicate the behavior patterns of a large model         |

---

_MSM Specification v1.0 — Open Standard — April 2026_
_Contributions welcome. The standard belongs to the community._
