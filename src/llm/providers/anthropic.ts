// Claude 格式接口（Anthropic Messages API，POST /v1/messages）。
// 官方 API 和兼容 Claude 格式的中转服务都走这里。
// 使用官方 SDK；请求通过 HttpClient 发出（插件里是 requestUrl，绕过 CORS）。

import Anthropic from "@anthropic-ai/sdk";
import { GenerationError } from "../errors";
import { httpToFetch } from "../fetchAdapter";
import type { ChatMessage, ChatProvider, HttpClient, LLMConfig } from "../types";

export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

const MAX_TOKENS = 16000;

/**
 * 支持服务端拒答兜底（fallbacks: "default"）的模型。只在官方 API 上启用：
 * 中转服务和其他模型可能不认识这个参数，会直接返回 400。
 */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

/** SDK 会自己拼上 /v1/messages，所以去掉用户填写的结尾 / 和 /v1 */
export function normalizeAnthropicBaseUrl(url: string): string {
  return (url.trim() || ANTHROPIC_DEFAULT_BASE_URL).replace(/\/+$/, "").replace(/\/v1$/, "");
}

function isOfficialApi(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === "api.anthropic.com";
  } catch {
    return false;
  }
}

export class AnthropicProvider implements ChatProvider {
  private readonly client: Anthropic;
  private readonly baseUrl: string;

  constructor(
    private readonly config: LLMConfig,
    http: HttpClient,
  ) {
    this.baseUrl = normalizeAnthropicBaseUrl(config.baseUrl);
    this.client = new Anthropic({
      apiKey: config.apiKey.trim(),
      baseURL: this.baseUrl,
      fetch: httpToFetch(http),
      // 运行在 Obsidian（Electron 渲染进程）中，SDK 会把它识别为浏览器环境
      dangerouslyAllowBrowser: true,
      maxRetries: 1,
      timeout: 120_000,
    });
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const model = this.config.model.trim() || ANTHROPIC_DEFAULT_MODEL;
    if (!this.config.apiKey.trim()) {
      throw new GenerationError("config", "请先在插件设置中填写 API key");
    }

    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const params = {
      model,
      max_tokens: MAX_TOKENS,
      ...(system ? { system } : {}),
      messages: conversation,
    };

    let response: Anthropic.Message | Anthropic.Beta.BetaMessage;
    try {
      response =
        isOfficialApi(this.baseUrl) && FALLBACK_MODELS.has(model)
          ? await this.client.beta.messages.create({
              ...params,
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
            })
          : await this.client.messages.create(params);
    } catch (e) {
      throw toGenerationError(e);
    }

    if (response.stop_reason === "refusal") {
      throw new GenerationError("invalid-output", "模型拒绝回答这次请求，请换一篇笔记或换一个模型再试");
    }
    if (response.stop_reason === "max_tokens") {
      throw new GenerationError("invalid-output", "LLM 输出被截断，请缩短笔记后重试");
    }

    // 开启思考的模型会先返回 thinking 块，只取正文 text 块
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    if (!text) throw new GenerationError("invalid-output", "LLM 服务没有返回内容");
    return text;
  }
}

function toGenerationError(e: unknown): GenerationError {
  if (e instanceof GenerationError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new GenerationError("auth", `LLM 服务拒绝访问（HTTP ${e.status}），请检查 API key`);
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new GenerationError("http", "请求过于频繁或额度不足（HTTP 429），请稍后再试");
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new GenerationError("network", `无法连接 LLM 服务：${e.message}`);
  }
  if (e instanceof Anthropic.APIError) {
    return new GenerationError("http", `LLM 服务返回错误（HTTP ${e.status ?? "?"}）：${e.message.slice(0, 200)}`);
  }
  return new GenerationError("http", `调用 LLM 失败：${e instanceof Error ? e.message : String(e)}`);
}
