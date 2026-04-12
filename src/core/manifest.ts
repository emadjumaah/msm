import { z } from "zod";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

// ─── Manifest Zod Schema ────────────────────────────────────

const LayerConfigSchema = z.object({
  provider: z.string().default("dummy"), // "dummy", "ollama", or your custom provider
  model: z.string(),
  version: z.string(),
  fine_tuned: z.boolean().default(false),
  dataset: z.string().optional(),
  endpoint: z.string().optional(), // HTTP endpoint for real model servers
  mode: z.enum(["translated", "native"]).optional(), // Translation layer mode
});

const HOOK_POINTS = [
  "before:translation",
  "after:translation",
  "before:classification",
  "after:classification",
  "before:orchestration",
  "after:orchestration",
  "before:execution",
  "after:execution",
  "before:generation",
  "after:generation",
  "before:validation",
  "after:validation",
] as const;

const HookConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  version: z.string(),
  point: z.enum(HOOK_POINTS),
  endpoint: z.string().optional(),
  fine_tuned: z.boolean().default(false),
  dataset: z.string().optional(),
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

  hooks: z.record(z.string(), HookConfigSchema).optional(),
});

export type MSMManifest = z.infer<typeof ManifestSchema>;
export type LayerConfig = z.infer<typeof LayerConfigSchema>;
export type HookConfig = z.infer<typeof HookConfigSchema>;

// ─── Loader ──────────────────────────────────────────────────

export async function loadManifest(path: string): Promise<MSMManifest> {
  const raw = await readFile(path, "utf-8");
  const parsed = parseYaml(raw);
  return ManifestSchema.parse(parsed);
}

export function validateManifest(data: unknown): MSMManifest {
  return ManifestSchema.parse(data);
}
