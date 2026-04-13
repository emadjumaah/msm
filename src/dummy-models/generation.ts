import type {
  MSMLayer,
  MSMPayload,
  GenerationOutput,
  Tone,
} from "../core/types.js";

/**
 * Dummy Generation Layer
 * Template-based response generation.
 * Real implementation would use Qwen 2.5 0.5B.
 */

const TEMPLATES: Record<string, (payload: MSMPayload) => string> = {
  place_order: (p) => {
    const toolResults = p.input.tool_results ?? p.execution?.tool_results ?? [];
    const order = toolResults.find((r) => r.tool === "order_api");
    const restaurant = toolResults.find((r) => r.tool === "restaurant_api");
    const orderId =
      (order?.result as Record<string, unknown>)?.order_id ?? "ORD-0000";
    const name =
      (restaurant?.result as Record<string, unknown>)?.name ?? "the restaurant";
    const eta =
      (restaurant?.result as Record<string, unknown>)?.eta_minutes ?? 30;
    return `Your order ${orderId} from ${name} is confirmed! Estimated delivery in ${eta} minutes.`;
  },

  track_order: (p) => {
    const toolResults = p.input.tool_results ?? p.execution?.tool_results ?? [];
    const delivery = toolResults.find((r) => r.tool === "delivery_api");
    const eta =
      (delivery?.result as Record<string, unknown>)?.eta_minutes ?? "unknown";
    const status =
      (delivery?.result as Record<string, unknown>)?.status ?? "processing";
    return `Your order is ${status}. Estimated arrival in ${eta} minutes.`;
  },

  cancel: () =>
    "Your order has been cancelled. A full refund will be processed.",

  inquiry: (p) => {
    const toolResults = p.input.tool_results ?? p.execution?.tool_results ?? [];
    const kb = toolResults.find((r) => r.tool === "knowledge_api");
    return (
      ((kb?.result as Record<string, unknown>)?.answer as string) ??
      "Here is the information you requested."
    );
  },

  complaint: (p) => {
    const toolResults = p.input.tool_results ?? p.execution?.tool_results ?? [];
    const ticket = toolResults.find((r) => r.tool === "support_api");
    const ticketId =
      (ticket?.result as Record<string, unknown>)?.ticket_id ?? "TKT-0000";
    return `We're sorry about the issue. A support ticket ${ticketId} has been created and assigned to our team.`;
  },

  greeting: () => "Hello! How can I help you today?",
};

const DEFAULT_TEMPLATE = () => "Your request has been processed.";

export class DummyGenerationLayer implements MSMLayer<GenerationOutput> {
  name = "generation" as const;

  async process(payload: MSMPayload): Promise<GenerationOutput> {
    const start = performance.now();
    const intent = payload.classification?.intent ?? "inquiry";
    const template = TEMPLATES[intent] ?? DEFAULT_TEMPLATE;
    const text = template(payload);

    return {
      response_text: text,
      tone: "warm" as Tone,
      word_count: text.split(/\s+/).length,
      model_id: "dummy-generation-v1",
      model_ver: "1.0.0",
      latency_ms: Math.round(performance.now() - start),
      confidence: 0.7,
      status: "ok",
    };
  }
}
