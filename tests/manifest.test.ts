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
});
