import type {
  MSMLayer,
  MSMPayload,
  TranslationOutput,
  ContextAnnotation,
} from "../core/types.js";
import { ollamaGenerate } from "./ollama-client.js";

const SYSTEM_PROMPT = `You are a specialized Arabic-to-English translation engine for a Gulf Arabic commerce system.

Your job:
1. Translate the Arabic text to natural English
2. Identify culturally specific terms that lose meaning in literal translation
3. For each such term, explain what it ACTUALLY means in Gulf Arabic culture and what the user's likely intent is

Focus on Gulf Arabic dialect (ابي، أبغى، وش، وين, etc.) and regional food/commerce context.

Respond ONLY with JSON:
{
  "translated_text": "natural english translation",
  "source_language": "ar-gulf",
  "annotations": [
    {
      "original_term": "the arabic word",
      "translated_term": "the english word used",
      "cultural_meaning": "what this actually means in Gulf culture — be specific",
      "intent_hints": ["place_order", "snack", etc.]
    }
  ]
}

Examples of good annotations:
- "ابي" → casual Gulf dialect for "I want", implies the user wants to order/buy something. intent_hints: ["place_order"]
- "خفيف" → literally "light" but in Gulf food context means a snack or small portion. intent_hints: ["snack", "small_portion"]
- "أبغى" → strong Gulf dialect for "I want", more assertive. intent_hints: ["place_order", "urgent_request"]

If no culturally ambiguous terms exist, return empty annotations array.`;

/** Detect English text locally — skip the LLM call entirely */
function isEnglishText(text: string): boolean {
  const nonAscii = text.replace(/[\x00-\x7F\s]/g, "");
  return nonAscii.length === 0;
}

export class OllamaTranslationLayer implements MSMLayer<TranslationOutput> {
  name = "translation" as const;

  constructor(
    private model = "qwen2.5:3b",
    private baseUrl = "http://localhost:11434",
  ) {}

  async process(payload: MSMPayload): Promise<TranslationOutput> {
    const start = performance.now();

    // Outbound translation: EN → user's language (use LLM to translate back)
    if (
      payload.input.direction === "outbound" &&
      payload.input.target_language
    ) {
      const res = await ollamaGenerate(
        {
          model: this.model,
          system: `You are an English-to-Arabic translation engine. Translate the English text into Gulf Arabic. Respond ONLY with JSON: {"translated_text": "the arabic translation"}`,
          prompt: payload.input.raw,
          format: "json",
          options: { temperature: 0.1 },
        },
        this.baseUrl,
      );

      const latency = Math.round(performance.now() - start);
      let translatedText: string;
      try {
        const parsed = JSON.parse(res.response);
        translatedText = parsed.translated_text || res.response;
      } catch {
        translatedText = res.response;
      }

      return {
        translated_text: translatedText,
        source_language: "en",
        target_language: payload.input.target_language,
        layer_invoked: true,
        mode: "translated",
        model_id: this.model,
        model_ver: "1.0.0",
        latency_ms: latency,
        confidence: 0.8,
        status: "ok",
      };
    }

    // Fast path: English input — no LLM call needed
    if (isEnglishText(payload.input.raw)) {
      return {
        translated_text: null,
        source_language: "en",
        target_language: "en",
        layer_invoked: false,
        mode: "native",
        model_id: this.model,
        model_ver: "1.0.0",
        latency_ms: Math.round(performance.now() - start),
        confidence: 1.0,
        status: "ok",
      };
    }

    const res = await ollamaGenerate(
      {
        model: this.model,
        system: SYSTEM_PROMPT,
        prompt: payload.input.raw,
        format: "json",
        options: { temperature: 0.1 },
      },
      this.baseUrl,
    );

    const latency = Math.round(performance.now() - start);

    let parsed: {
      translated_text: string;
      source_language: string;
      annotations?: ContextAnnotation[];
    };
    try {
      parsed = JSON.parse(res.response);
    } catch {
      parsed = {
        translated_text: res.response,
        source_language: "unknown",
      };
    }

    const annotations = parsed.annotations?.filter(
      (a) => a.original_term && a.cultural_meaning,
    );

    return {
      translated_text: parsed.translated_text,
      source_language: parsed.source_language || "ar-gulf",
      target_language: "en",
      layer_invoked: true,
      mode: "translated",
      context_annotations:
        annotations && annotations.length > 0 ? annotations : undefined,
      model_id: this.model,
      model_ver: "1.0.0",
      latency_ms: latency,
      confidence: 0.85,
      status: "ok",
    };
  }
}
