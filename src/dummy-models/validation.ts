import type { MSMLayer, MSMPayload, ValidationOutput } from "../core/types.js";

/**
 * Dummy Validation Layer
 * Basic length and content checks.
 * Real implementation would use MiniCheck + DeBERTa-v3.
 */

const BLOCKED_WORDS = ["password", "credit card", "ssn", "secret"];

export class DummyValidationLayer implements MSMLayer<ValidationOutput> {
  name = "validation" as const;

  async process(payload: MSMPayload): Promise<ValidationOutput> {
    const start = performance.now();
    const text = payload.generation?.response_text ?? "";
    const violations: string[] = [];

    // Check for blocked content
    const lower = text.toLowerCase();
    for (const word of BLOCKED_WORDS) {
      if (lower.includes(word)) {
        violations.push(`blocked_content: "${word}"`);
      }
    }

    // Check response isn't empty
    if (text.trim().length === 0) {
      violations.push("empty_response");
    }

    // Check response isn't absurdly long
    if (text.length > 2000) {
      violations.push("response_too_long");
    }

    const passed = violations.length === 0;

    return {
      passed,
      quality_score: passed ? 0.8 : 0.3,
      policy_violations: violations,
      action: passed ? "release" : "block",
      model_id: "dummy-validation-v1",
      model_ver: "1.0.0",
      latency_ms: Math.round(performance.now() - start),
      confidence: 0.8,
      status: "ok",
    };
  }
}
