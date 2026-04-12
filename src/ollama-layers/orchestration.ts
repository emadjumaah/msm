import { z } from "zod";
import type {
  MSMLayer,
  MSMPayload,
  OrchestrationOutput,
} from "../core/types.js";
import { ollamaGenerate } from "./ollama-client.js";

const OrchestrationSchema = z.object({
  workflow_steps: z.array(z.string()).default(["process_request"]),
  tool_selections: z.array(z.string()).default(["knowledge_api"]),
});

const SYSTEM_PROMPT = `You are a workflow planner for a commercial AI system.
Given a classified user intent and domain, plan the execution steps.

Respond ONLY with JSON:
{
  "workflow_steps": ["step1", "step2", "step3"],
  "tool_selections": ["tool_name_1", "tool_name_2"]
}

Keep steps practical and concise. Use tool names like: location_api, menu_api, order_api, delivery_api, payment_api, inventory_api, knowledge_api, booking_api.`;

export class OllamaOrchestrationLayer implements MSMLayer<OrchestrationOutput> {
  name = "orchestration" as const;

  constructor(
    private model = "qwen2.5:3b",
    private baseUrl = "http://localhost:11434",
  ) {}

  async process(payload: MSMPayload): Promise<OrchestrationOutput> {
    const start = performance.now();

    const intent = payload.classification?.intent ?? "unknown";
    const domain = payload.classification?.domain ?? "unknown";
    const text = payload.translation?.translated_text ?? payload.input.raw;

    const prompt = `Intent: ${intent}\nDomain: ${domain}\nUser message: "${text}"\n\nPlan the workflow steps and tools needed.`;

    const res = await ollamaGenerate(
      {
        model: this.model,
        system: SYSTEM_PROMPT,
        prompt,
        format: "json",
        options: { temperature: 0.1 },
      },
      this.baseUrl,
    );

    const latency = Math.round(performance.now() - start);

    let parsed: z.infer<typeof OrchestrationSchema>;
    try {
      const raw = JSON.parse(res.response);
      parsed = OrchestrationSchema.parse(raw);
    } catch {
      parsed = {
        workflow_steps: ["process_request"],
        tool_selections: ["knowledge_api"],
      };
    }

    const steps = parsed.workflow_steps;
    const tools = parsed.tool_selections;

    return {
      workflow_steps: steps,
      tool_selections: tools,
      estimated_steps: steps.length,
      mode: "llm",
      model_id: this.model,
      model_ver: "1.0.0",
      latency_ms: latency,
      confidence: 0.8,
      status: "ok",
    };
  }
}
