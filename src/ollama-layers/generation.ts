import { z } from "zod";
import type {
  MSMLayer,
  MSMPayload,
  GenerationOutput,
  Tone,
} from "../core/types.js";
import { ollamaGenerate } from "./ollama-client.js";

const VALID_TONES: readonly Tone[] = [
  "warm",
  "neutral",
  "formal",
  "apologetic",
];

const GenerationSchema = z.object({
  response_text: z.string().default("How can I help you?"),
  tone: z.string().default("neutral"),
});

const SYSTEM_PROMPT = `You are a friendly customer service assistant for a commercial platform.
Generate a natural, helpful response to the user based on the context provided.

Rules:
- Be concise (1-3 sentences)
- Be warm and professional
- Include relevant details from tool results if provided
- Respond in English (translation to user's language happens separately)

Respond ONLY with JSON:
{
  "response_text": "your response to the user",
  "tone": "warm|neutral|formal|apologetic"
}`;

export class OllamaGenerationLayer implements MSMLayer<GenerationOutput> {
  name = "generation" as const;

  constructor(
    private model = "qwen2.5:3b",
    private baseUrl = "http://localhost:11434",
  ) {}

  async process(payload: MSMPayload): Promise<GenerationOutput> {
    const start = performance.now();

    const intent = payload.classification?.intent ?? "unknown";
    const domain = payload.classification?.domain ?? "general";
    const text = payload.translation?.translated_text ?? payload.input.raw;
    const steps = payload.orchestration?.workflow_steps?.join(", ") ?? "none";
    const toolResults =
      payload.execution?.tool_results
        ?.map((t) => `${t.tool}: ${JSON.stringify(t.result)}`)
        .join("\n") ?? "none";

    const prompt = `User message: "${text}"
Intent: ${intent}
Domain: ${domain}
Workflow steps completed: ${steps}
Tool results:
${toolResults}

Generate a response for the user.`;

    const res = await ollamaGenerate(
      {
        model: this.model,
        system: SYSTEM_PROMPT,
        prompt,
        format: "json",
        options: { temperature: 0.3, num_predict: 200 },
      },
      this.baseUrl,
    );

    const latency = Math.round(performance.now() - start);

    let parsed: z.infer<typeof GenerationSchema>;
    try {
      const raw = JSON.parse(res.response);
      parsed = GenerationSchema.parse(raw);
    } catch {
      parsed = { response_text: res.response, tone: "neutral" };
    }

    const responseText = parsed.response_text || "How can I help you?";
    const tone: Tone = VALID_TONES.includes(parsed.tone as Tone)
      ? (parsed.tone as Tone)
      : "neutral";

    return {
      response_text: responseText,
      tone,
      word_count: responseText.split(/\s+/).length,
      model_id: this.model,
      model_ver: "1.0.0",
      latency_ms: latency,
      confidence: 0.8,
      status: "ok",
    };
  }
}
