# Contributing to MSM

MSM is an open standard. Contributions are welcome.

## Ways to Contribute

### Add a Domain Manifest

Create a new manifest YAML in `examples/` for your domain (healthcare, legal, banking, logistics, education, etc.). Follow the existing manifest format and validate with:

```bash
pnpm msm validate examples/your-manifest.yaml
```

### Implement a Real Layer

Replace a dummy model with a real one by implementing the `MSMLayer` interface. For HTTP-backed models, extend `HttpLayer`:

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

### Improve the Standard

Open an issue or PR to propose changes to the layer contracts in `src/core/types.ts` or the spec in `spec/`.

## Development

```bash
pnpm install        # Install dependencies
pnpm demo           # Run the pipeline demo
pnpm test           # Run tests
pnpm lint           # Type check
pnpm build          # Compile TypeScript
```

## Guidelines

- Every layer must implement the `MSMLayer` interface
- Every layer output must include the `LayerMeta` fields (model_id, model_ver, latency_ms, confidence, status)
- Manifests must pass `msm validate` before merging
- Tests must pass before merging
- Keep the standard simple — resist adding complexity without clear need

## Layer Contract Rules

1. One layer, one job
2. A layer that does two things should be two layers
3. Layers communicate only through the shared payload
4. Layers must not depend on specific models — only on the interface
5. Layers must handle failure gracefully (set `status: "failed"`, don't throw)
