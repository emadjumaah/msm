import type {
  MSMLayer,
  MSMPayload,
  ClassificationOutput,
} from "../core/types.js";
import { ollamaGenerate } from "./ollama-client.js";

const SYSTEM_PROMPT = `You are an intent classifier for a commercial AI system.
Given a user message (already translated to English), classify the user's INTENT, DOMAIN, and URGENCY.

Valid intents (pick the MOST specific one):
- place_order → user wants to buy, order, or get something (including "I want a burger", "I want something light")
- track_order → user asks about delivery status, ETA, or "where is my order/delivery"
- cancel → user wants to cancel, stop, or remove an order
- inquiry → user asks a question about prices, menu, availability, or information
- complaint → user reports a problem, wrong item, or bad experience
- greeting → user says hello, hi, or a simple greeting

Valid domains: food, retail, healthcare, sports, support, general
Valid urgency: low, normal, high, critical

Examples:
"I want to order a burger and pepsi" → {"intent":"place_order","domain":"food","urgency":"normal"}
"I would like a burger and Pepsi" → {"intent":"place_order","domain":"food","urgency":"normal"}
"I want something light" → {"intent":"place_order","domain":"food","urgency":"low"}
"Where is my delivery?" → {"intent":"track_order","domain":"food","urgency":"normal"}
"Cancel my order" → {"intent":"cancel","domain":"food","urgency":"high"}
"How much is the pizza?" → {"intent":"inquiry","domain":"food","urgency":"low"}
"Hello" → {"intent":"greeting","domain":"general","urgency":"low"}

Respond ONLY with JSON:
{"intent": "...", "domain": "...", "urgency": "..."}`;

export class OllamaClassificationLayer implements MSMLayer<ClassificationOutput> {
  name = "classification" as const;

  constructor(
    private model = "qwen2.5:3b",
    private baseUrl = "http://localhost:11434",
  ) {}

  async process(payload: MSMPayload): Promise<ClassificationOutput> {
    const start = performance.now();
    const text = payload.translation?.translated_text ?? payload.input.raw;

    // Include annotation hints if available
    let prompt = `User message: "${text}"`;
    const annotations = payload.translation?.context_annotations;
    if (annotations?.length) {
      const hints = annotations
        .map((a) => `"${a.original_term}" means: ${a.cultural_meaning}`)
        .join("\n");
      prompt += `\n\nCultural context from translation:\n${hints}`;
    }

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

    let parsed: { intent: string; domain: string; urgency: string };
    try {
      parsed = JSON.parse(res.response);
    } catch {
      parsed = { intent: "inquiry", domain: "general", urgency: "normal" };
    }

    const urgency = (["low", "normal", "high", "critical"] as const).includes(
      parsed.urgency as "low" | "normal" | "high" | "critical",
    )
      ? (parsed.urgency as "low" | "normal" | "high" | "critical")
      : "normal";

    return {
      intent: parsed.intent || "inquiry",
      domain: parsed.domain || "general",
      urgency,
      routing_target: `${parsed.intent || "inquiry"}_workflow`,
      model_id: this.model,
      model_ver: "1.0.0",
      latency_ms: latency,
      confidence: 0.85,
      status: "ok",
    };
  }
}
