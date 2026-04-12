import type {
  MSMLayer,
  MSMPayload,
  ClassificationOutput,
} from "../core/types.js";

/**
 * Dummy Classification Layer
 * Keyword-based intent matching.
 * Real implementation would use mDeBERTa-v3 + CAMeL-BERT.
 */

const INTENT_KEYWORDS: Record<string, string[]> = {
  place_order: ["order", "want", "get", "buy", "need", "i want", "i need"],
  track_order: [
    "where",
    "track",
    "status",
    "delivery",
    "eta",
    "my order",
    "where is",
    "shipping",
    "arrive",
    "status of order",
  ],
  cancel: [
    "cancel",
    "stop",
    "remove",
    "delete",
    "nevermind",
    "cancel my",
    "changed my mind",
  ],
  inquiry: [
    "how",
    "what",
    "price",
    "cost",
    "menu",
    "available",
    "how much",
    "hours",
    "options",
    "do you have",
    "nearest",
    "help",
    "i need help",
  ],
  complaint: [
    "problem",
    "wrong",
    "bad",
    "late",
    "missing",
    "broken",
    "defective",
    "terrible",
    "cold",
    "issue",
    "return",
    "speak to",
    "i want to return",
  ],
  greeting: [
    "hello",
    "hi",
    "hey",
    "good morning",
    "good evening",
    "thanks",
    "thank",
  ],
};

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  food: [
    "burger",
    "pizza",
    "order",
    "restaurant",
    "delivery",
    "menu",
    "pepsi",
    "coffee",
    "food",
    "meal",
    "fries",
    "chicken",
    "shawarma",
    "falafel",
    "hummus",
    "croissant",
    "pasta",
    "gluten",
  ],
  retail: ["buy", "product", "item", "shipping", "return", "store", "shop"],
  support: [
    "help",
    "problem",
    "issue",
    "complaint",
    "service",
    "account",
    "subscription",
    "payment",
  ],
};

function matchKeywords(text: string, map: Record<string, string[]>): string {
  const lower = text.toLowerCase();
  let bestMatch = Object.keys(map)[0];
  let bestScore = 0;

  for (const [label, keywords] of Object.entries(map)) {
    // Longer keyword matches score 2, single-word matches score 1
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        score += kw.includes(" ") ? 2 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = label;
    }
  }
  return bestMatch;
}

export class DummyClassificationLayer implements MSMLayer<ClassificationOutput> {
  name = "classification" as const;

  async process(payload: MSMPayload): Promise<ClassificationOutput> {
    const start = performance.now();
    const text = payload.translation?.translated_text ?? payload.input.raw;

    let intent = matchKeywords(text, INTENT_KEYWORDS);
    const domain = matchKeywords(text, DOMAIN_KEYWORDS);

    // Boost classification using cultural context annotations from translation
    const annotations = payload.translation?.context_annotations;
    if (annotations?.length) {
      const allHints = annotations.flatMap((a) => a.intent_hints);
      // If annotations hint at ordering, reinforce place_order
      if (
        allHints.some((h) =>
          ["place_order", "casual_request", "urgent_request"].includes(h),
        )
      ) {
        intent = intent === "inquiry" ? "place_order" : intent;
      }
      // If annotations hint at browsing/recommendation
      if (
        allHints.includes("recommendation") ||
        allHints.includes("browse_menu")
      ) {
        intent = "inquiry";
      }
    }

    return {
      intent,
      domain,
      urgency: "normal",
      routing_target: `${intent}_workflow`,
      model_id: "dummy-classification-v1",
      model_ver: "1.0.0",
      latency_ms: Math.round(performance.now() - start),
      confidence: annotations?.length ? 0.8 : 0.7,
      status: "ok",
    };
  }
}
