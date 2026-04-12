import type {
  MSMLayer,
  MSMPayload,
  TranslationOutput,
  ContextAnnotation,
} from "../core/types.js";

/**
 * Dummy Translation Layer
 * Does basic word-list substitution for Arabic → English.
 * Produces cultural context annotations for ambiguous terms.
 * Real implementation would call NLLB-200, Helsinki OPUS-MT, etc.
 */

const AR_TO_EN: Record<string, string> = {
  ابي: "I want",
  اطلب: "to order",
  برغر: "a burger",
  بيتزا: "a pizza",
  وبيبسي: "and pepsi",
  بيبسي: "pepsi",
  شي: "something",
  خفيف: "light",
  أبغى: "I want",
  وين: "where",
  طلبي: "my order",
  كم: "how much",
  السعر: "the price",
  شكرا: "thank you",
  مرحبا: "hello",
  الغ: "cancel",
  الطلب: "the order",
  الغي: "cancel",
  وصل: "arrived",
  متى: "when",
  وجبة: "meal",
  اريد: "I want",
};

/**
 * Cultural context map — terms whose literal translation loses meaning.
 * Each entry describes the cultural nuance that downstream layers need.
 */
const CULTURAL_CONTEXT: Record<string, ContextAnnotation> = {
  خفيف: {
    original_term: "خفيف",
    translated_term: "light",
    cultural_meaning:
      "In Gulf Arabic, 'خفيف' when referring to food means a snack or small portion, not low-calorie",
    intent_hints: ["snack", "small_portion", "quick_meal"],
  },
  وجبة: {
    original_term: "وجبة",
    translated_term: "meal",
    cultural_meaning:
      "In Gulf Arabic, 'وجبة' implies a sit-down or substantial meal, not a snack",
    intent_hints: ["full_meal", "restaurant_order"],
  },
  ابي: {
    original_term: "ابي",
    translated_term: "I want",
    cultural_meaning:
      "Gulf dialect form of 'أريد' — casual register, implies informal ordering context",
    intent_hints: ["casual_request", "place_order"],
  },
  أبغى: {
    original_term: "أبغى",
    translated_term: "I want",
    cultural_meaning:
      "Gulf dialect for 'I want' — strong intent, more assertive than 'ابي'",
    intent_hints: ["urgent_request", "place_order"],
  },
  شي: {
    original_term: "شي",
    translated_term: "something",
    cultural_meaning:
      "Vague request — in food context typically means 'recommend me something'",
    intent_hints: ["recommendation", "browse_menu"],
  },
};

function detectLanguage(text: string): string {
  const arabicPattern = /[\u0600-\u06FF]/;
  if (arabicPattern.test(text)) return "ar-gulf";
  return "en";
}

function dummyTranslate(
  text: string,
  direction: "to_en" | "to_ar",
): { text: string; annotations: ContextAnnotation[] } {
  if (direction === "to_en") {
    let result = text;
    const annotations: ContextAnnotation[] = [];

    for (const [ar, en] of Object.entries(AR_TO_EN)) {
      if (result.includes(ar)) {
        // Collect cultural context annotations for ambiguous terms
        if (CULTURAL_CONTEXT[ar]) {
          annotations.push(CULTURAL_CONTEXT[ar]);
        }
        result = result.replace(new RegExp(ar, "g"), en);
      }
    }
    // Clean leftover Arabic chars
    result = result.replace(/[\u0600-\u06FF]+/g, "[untranslated]").trim();
    return { text: result || "I want something", annotations };
  }
  // to_ar: very basic reverse (for final output translation)
  return { text: "تم معالجة طلبك", annotations: [] };
}

export class DummyTranslationLayer implements MSMLayer<TranslationOutput> {
  name = "translation" as const;

  async process(payload: MSMPayload): Promise<TranslationOutput> {
    const start = performance.now();

    // Outbound translation: EN → user's language
    if (
      payload.input.direction === "outbound" &&
      payload.input.target_language
    ) {
      const { text: translated } = dummyTranslate(payload.input.raw, "to_ar");
      return {
        translated_text: translated,
        source_language: "en",
        target_language: payload.input.target_language,
        layer_invoked: true,
        mode: "translated",
        model_id: "dummy-translation-v1",
        model_ver: "1.0.0",
        latency_ms: Math.round(performance.now() - start),
        confidence: 0.6,
        status: "ok",
      };
    }

    const sourceLang = detectLanguage(payload.input.raw);
    const isEnglish = sourceLang === "en";

    const { text: translated, annotations } = isEnglish
      ? { text: payload.input.raw, annotations: [] }
      : dummyTranslate(payload.input.raw, "to_en");

    return {
      translated_text: isEnglish ? null : translated,
      source_language: sourceLang,
      target_language: "en",
      layer_invoked: !isEnglish,
      mode: isEnglish ? "native" : "translated",
      context_annotations: annotations.length > 0 ? annotations : undefined,
      model_id: "dummy-translation-v1",
      model_ver: "1.0.0",
      latency_ms: Math.round(performance.now() - start),
      confidence: isEnglish ? 1.0 : 0.6,
      status: "ok",
    };
  }
}
