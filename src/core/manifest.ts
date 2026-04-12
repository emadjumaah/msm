import { z } from "zod";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

// ─── Manifest Zod Schema ────────────────────────────────────

const BaseLayerConfigSchema = z.object({
  provider: z.string().default("dummy"),
  model: z.string().optional(),
  version: z.string().optional(),
  fine_tuned: z.boolean().default(false),
  dataset: z.string().optional(),
  endpoint: z.string().optional(),
});

const TranslationLayerConfigSchema = BaseLayerConfigSchema.extend({
  mode: z.enum(["translated", "native"]).optional(),
}).strict();

const OrchestrationLayerConfigSchema = BaseLayerConfigSchema.extend({
  orchestration_mode: z.enum(["rules", "llm", "hybrid"]).optional(),
}).strict();

const StandardLayerConfigSchema = BaseLayerConfigSchema.strict();

/** Validates ISO 8601 date strings */
const isoDateString = z.string().refine((s) => !isNaN(Date.parse(s)), {
  message: "Invalid date format — expected ISO 8601 (e.g. 2025-01-15)",
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
  model: z.string().optional(),
  version: z.string().optional(),
  point: z.enum(HOOK_POINTS),
  endpoint: z.string().optional(),
  fine_tuned: z.boolean().default(false),
  dataset: z.string().optional(),
});

const ManifestSchema = z
  .object({
    msm_version: z.enum(["1.0"], {
      errorMap: () => ({ message: 'Unsupported msm_version — expected "1.0"' }),
    }),
    manifest_id: z.string(),
    domain: z.string(),
    region: z.string().optional(),
    created: isoDateString,

    layers: z
      .object({
        translation: TranslationLayerConfigSchema,
        classification: StandardLayerConfigSchema,
        orchestration: OrchestrationLayerConfigSchema,
        execution: StandardLayerConfigSchema,
        generation: StandardLayerConfigSchema,
        validation: StandardLayerConfigSchema,
      })
      .strict(),

    hooks: z.record(z.string(), HookConfigSchema).optional(),
  })
  .strict();

export type MSMManifest = z.infer<typeof ManifestSchema>;
export type LayerConfig =
  | z.infer<typeof TranslationLayerConfigSchema>
  | z.infer<typeof OrchestrationLayerConfigSchema>
  | z.infer<typeof StandardLayerConfigSchema>;
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
