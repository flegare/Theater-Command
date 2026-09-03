export type OllamaStatus = {
  online: boolean;
  activeModel: string;
  availableModels: string[];
  latencyMs: number;
  error?: string;
};

export const DEFAULT_OLLAMA_HOST =
  process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "llama3.1:latest";

export async function checkOllamaStatus(
  baseUrl = DEFAULT_OLLAMA_HOST,
  preferredModel = DEFAULT_OLLAMA_MODEL,
): Promise<OllamaStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        online: false,
        activeModel: preferredModel,
        availableModels: [],
        latencyMs: Date.now() - start,
        error: `Ollama HTTP status ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      models?: Array<{ name: string }>;
    };
    const availableModels = (data.models || []).map((m) => m.name);
    const activeModel = availableModels.includes(preferredModel)
      ? preferredModel
      : availableModels[0] || preferredModel;

    return {
      online: true,
      activeModel,
      availableModels,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      online: false,
      activeModel: preferredModel,
      availableModels: [],
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

export async function queryOllamaChat<T>(input: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  data?: T;
  rawText: string;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  const baseUrl = input.baseUrl || DEFAULT_OLLAMA_HOST;
  const model = input.model || DEFAULT_OLLAMA_MODEL;
  const timeoutMs = input.timeoutMs || 4000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        options: {
          temperature: 0.3,
          num_predict: 400,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        rawText: "",
        latencyMs: Date.now() - start,
        error: `Ollama returned ${res.status}: ${res.statusText}`,
      };
    }

    const json = (await res.json()) as {
      message?: { content: string };
    };
    const content = json.message?.content || "";

    try {
      const parsed = JSON.parse(content) as T;
      return {
        ok: true,
        data: parsed,
        rawText: content,
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        ok: false,
        rawText: content,
        latencyMs: Date.now() - start,
        error: "Failed to parse Ollama JSON response",
      };
    }
  } catch (err) {
    return {
      ok: false,
      rawText: "",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Ollama query failed",
    };
  }
}
