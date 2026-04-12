#!/usr/bin/env tsx
/**
 * MSM HTTP Server — expose the pipeline as a REST API.
 *
 * Endpoints:
 *   POST /api/run     — run the full pipeline
 *   GET  /api/health  — health check
 *
 * Usage:
 *   pnpm server              # dummy models
 *   pnpm server:ollama       # real Ollama models
 *   MSM_PORT=8080 pnpm server
 *
 * Request:
 *   curl -X POST http://localhost:3000/api/run \
 *     -H "Content-Type: application/json" \
 *     -d '{"text": "ابي اطلب برغر وبيبسي"}'
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { z } from "zod";
import { Pipeline } from "./core/pipeline.js";
import type { PipelineTrace } from "./core/pipeline.js";
import type { MSMLayer } from "./core/types.js";
import { createPipeline } from "./core/registry.js";
import { loadManifest } from "./core/manifest.js";

// ─── Request schema ──────────────────────────────────────────

const MAX_BODY_BYTES = 64 * 1024; // 64 KB

const RunRequestSchema = z.object({
  text: z.string().min(1, "text must be non-empty").max(4096),
  modality: z.enum(["text", "voice", "image"]).default("text"),
  session_id: z.string().max(256).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4096),
      }),
    )
    .max(50)
    .optional(),
});

// ─── Layer Loading ───────────────────────────────────────────

const manifestArg = process.argv.find(
  (a) => a.endsWith(".yaml") || a.endsWith(".yml"),
);
const mode = manifestArg
  ? "manifest"
  : process.argv.includes("--ollama")
    ? "ollama"
    : "dummy";

async function buildPipeline(): Promise<{ pipeline: Pipeline; label: string }> {
  // If a manifest file is provided, build entirely from manifest
  if (manifestArg) {
    const pipeline = await createPipeline(manifestArg);
    const manifest = await loadManifest(manifestArg);
    return {
      pipeline,
      label: `manifest: ${manifest.manifest_id} (${manifest.domain})`,
    };
  }

  // Otherwise fall back to hardcoded modes
  if (mode === "ollama") {
    const pipeline = await createPipeline(
      "./examples/food-commerce-gulf-ollama.yaml",
    );
    return { pipeline, label: "Ollama (Qwen 2.5 3B)" };
  }

  const pipeline = await createPipeline(
    "./examples/food-commerce-gulf-dummy.yaml",
  );
  return { pipeline, label: "dummy models" };
}

// ─── Helpers ─────────────────────────────────────────────────

const READ_TIMEOUT_MS = 10_000; // 10s inactivity timeout

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        req.destroy();
        reject(new Error("Request body read timed out"));
      }
    }, READ_TIMEOUT_MS);

    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        clearTimeout(timer);
        req.destroy();
        reject(new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString());
      }
    });
    req.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

// ─── Rate Limiter (simple in-memory, per-IP) ────────────────

const RATE_WINDOW_MS = 60_000; // 1 minute window
const RATE_MAX_REQUESTS = 60; // 60 req/min per IP

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateEntry>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let entry = rateBuckets.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, entry);
  }
  entry.count++;
  return entry.count > RATE_MAX_REQUESTS;
}

// ─── Server ──────────────────────────────────────────────────

async function main() {
  const { pipeline, label } = await buildPipeline();

  const PORT = parseInt(process.env.MSM_PORT ?? "3000", 10);

  const server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    // Rate limiting
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";
    if (isRateLimited(clientIp)) {
      json(res, 429, { error: "Too many requests. Try again later." });
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    // Health check
    if (url.pathname === "/api/health" && req.method === "GET") {
      json(res, 200, { status: "ok", mode: label });
      return;
    }

    // Run pipeline
    if (url.pathname === "/api/run" && req.method === "POST") {
      try {
        let rawBody: unknown;
        try {
          rawBody = JSON.parse(await readBody(req));
        } catch {
          json(res, 400, { error: "Invalid JSON body" });
          return;
        }

        const parsed = RunRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          json(res, 400, {
            error: "Validation failed",
            details: parsed.error.issues.map((i) => i.message),
          });
          return;
        }
        const body = parsed.data;

        const trace: PipelineTrace = await pipeline.run(
          {
            raw: body.text,
            modality: body.modality,
            history: body.history,
          },
          body.session_id,
        );

        json(res, 200, {
          output: trace.payload.final_output,
          trace_id: trace.trace_id,
          total_latency_ms: trace.total_latency_ms,
          layers: trace.entries.map((e) => ({
            layer: e.layer,
            model_id: e.model_id,
            latency_ms: e.latency_ms,
            status: e.status,
          })),
          // Full payload only when explicitly requested (contains all intermediate outputs)
          ...(url.searchParams.get("debug") === "true" && {
            payload: trace.payload,
          }),
        });
      } catch (err) {
        json(res, 500, {
          error: err instanceof Error ? err.message : "Internal server error",
        });
      }
      return;
    }

    // 404
    json(res, 404, {
      error: "Not found. Use POST /api/run or GET /api/health",
    });
  });

  server.listen(PORT, () => {
    console.log(`\n  MSM Server running on http://localhost:${PORT}`);
    console.log(`  Mode: ${label}`);
    console.log(`\n  Endpoints:`);
    console.log(`    POST /api/run     — run the pipeline`);
    console.log(`    GET  /api/health  — health check\n`);
    console.log(`  Example:`);
    console.log(`    curl -X POST http://localhost:${PORT}/api/run \\`);
    console.log(`      -H "Content-Type: application/json" \\`);
    console.log(`      -d '{"text": "ابي اطلب برغر وبيبسي"}'\n`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
