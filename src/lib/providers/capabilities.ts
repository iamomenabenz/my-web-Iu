// M8 provider capability layer — static metadata for picking how to invoke a model.
// Client-safe. The runner uses pickRunner() to choose between "tool-calls" and
// "json-mode" planning when a model lacks native tool-calling.

export interface ProviderCapability {
  provider: string;
  model: string;
  toolCalling: boolean;
  jsonMode: boolean;
  streaming: boolean;
  vision: boolean;
  contextWindow: number;
}

const CAPS: ProviderCapability[] = [
  {
    provider: "google",
    model: "google/gemini-3-flash-preview",
    toolCalling: true,
    jsonMode: true,
    streaming: true,
    vision: true,
    contextWindow: 1_000_000,
  },
  {
    provider: "google",
    model: "google/gemini-2.5-flash",
    toolCalling: true,
    jsonMode: true,
    streaming: true,
    vision: true,
    contextWindow: 1_000_000,
  },
  {
    provider: "google",
    model: "google/gemini-2.5-pro",
    toolCalling: true,
    jsonMode: true,
    streaming: true,
    vision: true,
    contextWindow: 1_000_000,
  },
  {
    provider: "openai",
    model: "openai/gpt-5",
    toolCalling: true,
    jsonMode: true,
    streaming: true,
    vision: true,
    contextWindow: 400_000,
  },
  {
    provider: "openai",
    model: "openai/gpt-5-mini",
    toolCalling: true,
    jsonMode: true,
    streaming: true,
    vision: true,
    contextWindow: 400_000,
  },
];

export type RunnerKind = "tool-calls" | "json-mode";

export function getCapability(model: string): ProviderCapability | null {
  return CAPS.find((c) => c.model === model) ?? null;
}

export function pickRunner(model: string): RunnerKind {
  const cap = getCapability(model);
  if (cap?.toolCalling) return "tool-calls";
  return "json-mode";
}

export function listKnownModels(): ProviderCapability[] {
  return [...CAPS];
}
