import type {
  MSMLayer,
  MSMPayload,
  ExecutionOutput,
  ToolResult,
} from "../core/types.js";

/**
 * Dummy Execution Layer
 * Mocks tool calls with synthetic responses.
 * Real implementation would use Functionary Small v3 calling actual APIs.
 */

const MOCK_RESULTS: Record<string, Record<string, unknown>> = {
  location_api: { lat: 25.2854, lng: 51.531, city: "Doha", country: "QA" },
  restaurant_api: {
    name: "Burger House",
    rating: 4.5,
    eta_minutes: 30,
    open: true,
  },
  menu_api: {
    items: ["Classic Burger", "Cheese Burger", "Pepsi", "Fries"],
    currency: "QAR",
  },
  order_api: {
    order_id: "ORD-9921",
    status: "confirmed",
    total: 45.0,
    currency: "QAR",
  },
  delivery_api: { status: "in_transit", eta_minutes: 15, driver: "Ahmed" },
  policy_api: { cancellable: true, refund_percent: 100, window_minutes: 5 },
  knowledge_api: {
    answer: "Our menu includes burgers, pizzas, and beverages.",
  },
  support_api: { ticket_id: "TKT-4401", priority: "normal", assigned: true },
  payment_api: {
    status: "charged",
    amount: 45.0,
    currency: "QAR",
    method: "card",
  },
};

export class DummyExecutionLayer implements MSMLayer<ExecutionOutput> {
  name = "execution" as const;

  async process(payload: MSMPayload): Promise<ExecutionOutput> {
    const start = performance.now();
    const tools = payload.orchestration?.tool_selections ?? [];

    const results: ToolResult[] = tools.map((tool) => ({
      tool,
      status: "ok" as const,
      result: MOCK_RESULTS[tool] ?? { info: "no mock data available" },
    }));

    return {
      tool_results: results,
      execution_status: "ok",
      errors: [],
      model_id: "dummy-execution-v1",
      model_ver: "1.0.0",
      latency_ms: Math.round(performance.now() - start),
      confidence: 0.7,
      status: "ok",
    };
  }
}
