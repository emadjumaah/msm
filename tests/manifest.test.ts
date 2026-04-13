import { describe, it, expect } from "vitest";
import { loadManifest, validateManifest } from "../src/core/manifest.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(__dirname, "../examples");

describe("Manifest Loader", () => {
  it("loads a valid manifest from YAML", async () => {
    const manifest = await loadManifest(
      resolve(examplesDir, "food-commerce-gulf-dummy.yaml"),
    );

    expect(manifest.msm_version).toBe("1.0");
    expect(manifest.manifest_id).toBe("food-commerce-gulf-dummy-v1");
    expect(manifest.domain).toBe("food-commerce");
    expect(manifest.layers.translation.model).toBe("dummy-translation-v1");
    expect(manifest.layers.validation.model).toBe("dummy-validation-v1");
  });

  it("loads healthcare manifest", async () => {
    const manifest = await loadManifest(
      resolve(examplesDir, "healthcare-triage.yaml"),
    );

    expect(manifest.domain).toBe("healthcare-triage");
    expect(manifest.layers.classification.fine_tuned).toBe(true);
    expect(manifest.layers.translation.endpoint).toBe(
      "http://localhost:8001/translate",
    );
  });

  it("loads sports manifest", async () => {
    const manifest = await loadManifest(
      resolve(examplesDir, "sports-booking.yaml"),
    );

    expect(manifest.domain).toBe("sports-booking");
    expect(manifest.layers.orchestration.fine_tuned).toBe(true);
  });

  it("rejects manifest with missing required fields", () => {
    expect(() =>
      validateManifest({
        msm_version: "1.0",
        // missing manifest_id, domain, created, layers
      }),
    ).toThrow();
  });

  it("rejects manifest with missing layer", () => {
    expect(() =>
      validateManifest({
        msm_version: "1.0",
        manifest_id: "test",
        domain: "test",
        created: "2026-01-01",
        layers: {
          translation: { model: "test", version: "1.0" },
          // missing other layers
        },
      }),
    ).toThrow();
  });

  it("rejects non-existent file", async () => {
    await expect(loadManifest("/nonexistent/path.yaml")).rejects.toThrow();
  });

  it("rejects manifest with unknown top-level field", () => {
    expect(() =>
      validateManifest({
        msm_version: "1.0",
        manifest_id: "test",
        domain: "test",
        created: "2026-01-01",
        unknown_field: "should fail",
        layers: {
          translation: { model: "t", version: "1.0", mode: "native" },
          classification: { model: "c", version: "1.0" },
          orchestration: { model: "o", version: "1.0" },
          generation: { model: "g", version: "1.0" },
          validation: { model: "v", version: "1.0" },
        },
      }),
    ).toThrow();
  });

  it("rejects mode field on non-translation layer", () => {
    expect(() =>
      validateManifest({
        msm_version: "1.0",
        manifest_id: "test",
        domain: "test",
        created: "2026-01-01",
        layers: {
          translation: { model: "t", version: "1.0" },
          classification: { model: "c", version: "1.0", mode: "native" },
          orchestration: { model: "o", version: "1.0" },
          generation: { model: "g", version: "1.0" },
          validation: { model: "v", version: "1.0" },
        },
      }),
    ).toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() =>
      validateManifest({
        msm_version: "1.0",
        manifest_id: "test",
        domain: "test",
        created: "not-a-date",
        layers: {
          translation: { model: "t", version: "1.0" },
          classification: { model: "c", version: "1.0" },
          orchestration: { model: "o", version: "1.0" },
          generation: { model: "g", version: "1.0" },
          validation: { model: "v", version: "1.0" },
        },
      }),
    ).toThrow();
  });

  it("accepts manifest without model/version (optional for dummy providers)", () => {
    const manifest = validateManifest({
      msm_version: "1.0",
      manifest_id: "minimal",
      domain: "test",
      created: "2026-01-01",
      layers: {
        translation: { provider: "dummy" },
        classification: { provider: "dummy" },
        orchestration: { provider: "dummy" },
        generation: { provider: "dummy" },
        validation: { provider: "dummy" },
      },
    });

    expect(manifest.layers.translation.model).toBeUndefined();
    expect(manifest.layers.translation.version).toBeUndefined();
  });

  it("rejects unsupported msm_version", () => {
    expect(() =>
      validateManifest({
        msm_version: "2.0",
        manifest_id: "test",
        domain: "test",
        created: "2026-01-01",
        layers: {
          translation: { provider: "dummy" },
          classification: { provider: "dummy" },
          orchestration: { provider: "dummy" },
          generation: { provider: "dummy" },
          validation: { provider: "dummy" },
        },
      }),
    ).toThrow(/msm_version/i);
  });

  it("accepts pipeline config with mode and max_iterations", () => {
    const manifest = validateManifest({
      msm_version: "1.0",
      manifest_id: "brain",
      domain: "support",
      created: "2026-04-13",
      pipeline: { mode: "iterative", max_iterations: 4 },
      layers: {
        translation: { provider: "dummy" },
        classification: { provider: "dummy" },
        orchestration: { provider: "dummy" },
        generation: { provider: "dummy" },
        validation: { provider: "dummy" },
      },
    });
    expect(manifest.pipeline?.mode).toBe("iterative");
    expect(manifest.pipeline?.max_iterations).toBe(4);
  });

  it("defaults pipeline mode to linear", () => {
    const manifest = validateManifest({
      msm_version: "1.0",
      manifest_id: "fast",
      domain: "food",
      created: "2026-04-13",
      pipeline: {},
      layers: {
        translation: { provider: "dummy" },
        classification: { provider: "dummy" },
        orchestration: { provider: "dummy" },
        generation: { provider: "dummy" },
        validation: { provider: "dummy" },
      },
    });
    expect(manifest.pipeline?.mode).toBe("linear");
    expect(manifest.pipeline?.max_iterations).toBe(6);
  });
});
