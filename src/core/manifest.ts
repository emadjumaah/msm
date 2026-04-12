import { z } from "zod";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

// ─── Manifest Zod Schema ────────────────────────────────────

const LayerConfigSchema = z.object({
  model: z.string(),
  version: z.string(),
  fine_tuned: z.boolean().default(false),
  dataset: z.string().optional(),
  endpoint: z.string().optional(), // HTTP endpoint for real model servers
  mode: z.enum(["translated", "native"]).optional(), // Translation layer mode
});

const ManifestSchema = z.object({
  msm_version: z.string(),
  manifest_id: z.string(),
  domain: z.string(),
  region: z.string().optional(),
  created: z.string(),

  layers: z.object({
    translation: LayerConfigSchema,
    classification: LayerConfigSchema,
    orchestration: LayerConfigSchema,
    execution: LayerConfigSchema,
    generation: LayerConfigSchema,
    validation: LayerConfigSchema,
  }),
});

export type MSMManifest = z.infer<typeof ManifestSchema>;
export type LayerConfig = z.infer<typeof LayerConfigSchema>;

// ─── Loader ──────────────────────────────────────────────────

export async function loadManifest(path: string): Promise<MSMManifest> {
  const raw = await readFile(path, "utf-8");
  const parsed = parseYaml(raw);
  return ManifestSchema.parse(parsed);
}

export function validateManifest(data: unknown): MSMManifest {
  return ManifestSchema.parse(data);
}
