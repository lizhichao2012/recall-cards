import { describe, expect, it } from "vitest";
import { AnthropicProvider, normalizeAnthropicBaseUrl } from "../src/llm/providers/anthropic";
import { baseUrlAfterSwitch } from "../src/llm/providers";
import type { HttpClient, HttpRequest, LLMConfig } from "../src/llm/types";

const config: LLMConfig = {
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  model: "claude-opus-5-5",
  apiKey: "sk-test",
  temperature: 0.3,
};

const messages = [
  { role: "system" as const, content: "你是出题老师" },
  { role: "user" as const, content: "笔记内容" },
];

function reply(body: object, status = 200): { http: HttpClient; seen: HttpRequest[] } {
  const seen: HttpRequest[] = [];
  const http: HttpClient = async (req) => {
    seen.push(req);
    return { status, text: JSON.stringify(body), headers: { "content-type": "application/json" } };
  };
  return { http, seen };
}

const okMessage = (content: object[], stop_reason = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

describe("AnthropicProvider", () => {
  it("官方 API：发送正确的请求，开启拒答兜底，不发送 temperature", async () => {
    const { http, seen } = reply(okMessage([{ type: "text", text: '{"questions": []}' }]));
    const text = await new AnthropicProvider(config, http).complete(messages);
    expect(text).toBe('{"questions": []}');

    const req = seen[0];
    expect(req.method).toBe("POST");
    expect(req.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    expect(req.headers["x-api-key"]).toBe("sk-test");
    expect(req.headers["anthropic-version"]).toBeTruthy();
    expect(req.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    const body = JSON.parse(req.body!);
    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: "你是出题老师",
      messages: [{ role: "user", content: "笔记内容" }],
      fallbacks: "default",
    });
    expect(body).not.toHaveProperty("temperature");
  });

  it("中转服务：不发送 fallbacks 和 beta 头，兼容结尾带 /v1 的地址", async () => {
    const { http, seen } = reply(okMessage([{ type: "text", text: "ok" }]));
    await new AnthropicProvider({ ...config, baseUrl: "https://relay.example.com/v1/", model: "claude-sonnet-4-6" }, http).complete(
      messages,
    );
    expect(seen[0].url).toBe("https://relay.example.com/v1/messages");
    expect(seen[0].headers["anthropic-beta"]).toBeUndefined();
    expect(JSON.parse(seen[0].body!)).not.toHaveProperty("fallbacks");
  });

  it("只取 text 块，忽略 thinking 块", async () => {
    const { http } = reply(
      okMessage([
        { type: "thinking", thinking: "", signature: "x" },
        { type: "text", text: "答案" },
      ]),
    );
    expect(await new AnthropicProvider(config, http).complete(messages)).toBe("答案");
  });

  it("模型为空时使用默认模型", async () => {
    const { http, seen } = reply(okMessage([{ type: "text", text: "ok" }]));
    await new AnthropicProvider({ ...config, model: "" }, http).complete(messages);
    expect(JSON.parse(seen[0].body!).model).toBe("claude-opus-5-5");
  });

  it.each([
    ["refusal", "拒绝"],
    ["max_tokens", "截断"],
  ])("stop_reason 为 %s 时报错", async (reason, msg) => {
    const { http } = reply(okMessage([{ type: "text", text: "x" }], reason));
    await expect(new AnthropicProvider(config, http).complete(messages)).rejects.toThrow(msg);
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [400, "http"],
  ])("HTTP %s → %s", async (status, kind) => {
    const { http } = reply({ type: "error", error: { type: "x", message: "bad" } }, status);
    await expect(new AnthropicProvider(config, http).complete(messages)).rejects.toMatchObject({ kind });
  });

  it("网络不通 → network", async () => {
    const http: HttpClient = async () => {
      throw new Error("offline");
    };
    await expect(new AnthropicProvider(config, http).complete(messages)).rejects.toMatchObject({ kind: "network" });
  });

  it("未填 API key 时提示，不发请求", async () => {
    const { http, seen } = reply({});
    await expect(new AnthropicProvider({ ...config, apiKey: "" }, http).complete(messages)).rejects.toMatchObject({
      kind: "config",
    });
    expect(seen).toHaveLength(0);
  });
});

describe("base URL", () => {
  it("规范化", () => {
    expect(normalizeAnthropicBaseUrl("")).toBe("https://api.anthropic.com");
    expect(normalizeAnthropicBaseUrl("https://x.com/v1/")).toBe("https://x.com");
    expect(normalizeAnthropicBaseUrl("https://x.com/api")).toBe("https://x.com/api");
  });

  it("切换服务商时只替换默认值", () => {
    expect(baseUrlAfterSwitch("https://api.openai.com/v1", "anthropic")).toBe("https://api.anthropic.com");
    expect(baseUrlAfterSwitch("", "anthropic")).toBe("https://api.anthropic.com");
    expect(baseUrlAfterSwitch("https://relay.example.com", "anthropic")).toBe("https://relay.example.com");
  });
});
