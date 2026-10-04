// OpenAI 兼容接口（/chat/completions）。OpenAI、DeepSeek、通义、Ollama 等都兼容这个格式。

import { GenerationError } from "../errors";
import type { ChatMessage, ChatProvider, HttpClient, LLMConfig } from "../types";

export class OpenAICompatibleProvider implements ChatProvider {
  constructor(
    private readonly config: LLMConfig,
    private readonly http: HttpClient,
  ) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const { baseUrl, model, apiKey, temperature } = this.config;
    if (!baseUrl.trim() || !model.trim()) {
      throw new GenerationError("config", "请先在插件设置中填写 LLM 的 base URL 和 model");
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

    let res;
    try {
      res = await this.http({
        url: `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`,
        method: "POST",
        headers,
        body: JSON.stringify({ model: model.trim(), messages, temperature }),
      });
    } catch (e) {
      throw new GenerationError("network", `无法连接 LLM 服务：${(e as Error).message ?? e}`);
    }

    if (res.status === 401 || res.status === 403) {
      throw new GenerationError("auth", `LLM 服务拒绝访问（HTTP ${res.status}），请检查 API key`);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new GenerationError("http", `LLM 服务返回错误（HTTP ${res.status}）：${res.text.slice(0, 200)}`);
    }

    let content: unknown;
    try {
      content = JSON.parse(res.text)?.choices?.[0]?.message?.content;
    } catch {
      throw new GenerationError("invalid-output", "LLM 服务的响应不是合法的 JSON");
    }
    if (typeof content !== "string" || !content.trim()) {
      throw new GenerationError("invalid-output", "LLM 服务没有返回内容");
    }
    return content;
  }
}
