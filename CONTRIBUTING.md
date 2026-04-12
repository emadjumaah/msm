# Contributing to MSM

MSM is an open standard. Contributions are welcome.

## Ways to Contribute

### Add a Domain Manifest

Create a new manifest YAML in `examples/` for your domain (healthcare, legal, banking, logistics, education, etc.). Each manifest declares the `provider` and `model` for each layer, plus optional hooks:

```yaml
msm_version: "1.0"
manifest_id: "your-domain-v1"
domain: "your-domain"
created: "2026-01-01"

layers:
  translation:
    provider: ollama # dummy, ollama, or your custom provider
    model: "qwen2.5:3b"
    version: "1.0.0"
  # ... all 6 layers

hooks: # optional domain-specific extensions
  your_hook:
    provider: your-provider
    model: "your-model"
    point: "before:classification"
```

Validate with:

```bash
pnpm msm validate examples/your-manifest.yaml
```

### Register a Custom Provider

Add support for a new model backend (OpenAI, vLLM, ONNX, etc.) without changing core code:

```typescript
import { getDefaultRegistry } from "msm";

const registry = await getDefaultRegistry();
registry.register(
  "translation",
  "openai",
  (config) => new MyOpenAILayer(config.model),
);
```

Now `provider: openai` works in any manifest.

### Implement a Real Layer

Implement the `MSMLayer` interface. For HTTP-backed models, extend `HttpLayer`:

```typescript
import { HttpLayer } from "msm";
import type { TranslationOutput, MSMPayload } from "msm";

class NLLBTranslationLayer extends HttpLayer<TranslationOutput> {
  name = "translation" as const;
  constructor() {
    super("http://localhost:8000/translate");
  }

  protected buildRequestBody(payload: MSMPayload) {
    return { text: payload.input.raw };
  }

  protected parseResponse(json: unknown, latency: number): TranslationOutput {
    // Map your model server's response to the layer contract
  }
}
```

### Add a Domain Hook

Hooks extend the pipeline for domain-specific needs (image recognition, drug checks, fraud detection) without changing core layers:

```typescript
import type { MSMHook } from "msm";

const myHook: MSMHook = {
  name: "image_analysis",
  point: "before:classification", // runs between translation and classification
  async process(payload) {
    const result = await analyzeImage(payload.input.raw);
    return {
      model_id: "medclip-v1",
      model_ver: "1.0",
      latency_ms: 200,
      confidence: 0.92,
      status: "ok",
      data: { findings: result.findings },
    };
  },
};
pipeline.addHook(myHook);
```

Register hook providers so manifests can declare them:

```typescript
registry.registerHook("my-provider", (name, config) => ({ name, point: config.point, process: ... }));
```

### Improve the Standard

Open an issue or PR to propose changes to the layer contracts in `src/core/types.ts` or the spec in `spec/`.

## Development

```bash
pnpm install        # Install dependencies
pnpm demo           # Run the pipeline demo (dummy models)
pnpm demo:ollama    # Run with real Ollama models
pnpm server         # HTTP server (dummy)
pnpm server:ollama  # HTTP server (Ollama)
pnpm test           # Run 51 tests
pnpm lint           # Type check
pnpm build          # Compile TypeScript
```

## Guidelines

- Every layer must implement the `MSMLayer` interface
- Every layer output must include the `LayerMeta` fields (model_id, model_ver, latency_ms, confidence, status)
- Hooks must implement the `MSMHook` interface and return `HookOutput` with a `data` field
- Manifests must pass `msm validate` before merging
- Tests must pass before merging
- Keep the standard simple — resist adding complexity without clear need

## Layer Contract Rules

1. One layer, one job
2. A layer that does two things should be two layers
3. Layers communicate only through the shared payload
4. Layers must not depend on specific models — only on the interface
5. Layers must handle failure gracefully (set `status: "failed"`, don't throw)
6. Hooks extend but never replace core layers — they add data to `payload.hooks`
