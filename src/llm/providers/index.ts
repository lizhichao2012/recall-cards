// 服务商注册表。新增服务商：实现 ChatProvider，在 ProviderId 和这里各加一项。

import type { ChatProvider, HttpClient, LLMConfig, ProviderId } from "../types";
import { ANTHROPIC_DEFAULT_BASE_URL, ANTHROPIC_DEFAULT_MODEL, AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openaiCompatible";

type ProviderFactory = (config: LLMConfig, http: HttpClient) => ChatProvider;

export interface ProviderInfo {
  label: string;
  defaultBaseUrl: string;
  modelPlaceholder: string;
  baseUrlHint: string;
  /** 是否使用 temperature 设置 */
  usesTemperature: boolean;
  create: ProviderFactory;
}

const registry: Record<ProviderId, ProviderInfo> = {
  "openai-compatible": {
    label: "OpenAI 兼容接口",
    defaultBaseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o-mini",
    baseUrlHint: "例如 https://api.openai.com/v1、https://api.deepseek.com/v1、http://localhost:11434/v1",
    usesTemperature: true,
    create: (config, http) => new OpenAICompatibleProvider(config, http),
  },
  anthropic: {
    label: "Claude 格式接口",
    defaultBaseUrl: ANTHROPIC_DEFAULT_BASE_URL,
    modelPlaceholder: ANTHROPIC_DEFAULT_MODEL,
    baseUrlHint: "官方填 https://api.anthropic.com；中转服务填它提供的地址（结尾的 /v1 可写可不写）",
    usesTemperature: false,
    create: (config, http) => new AnthropicProvider(config, http),
  },
};

export function providerInfo(id: ProviderId): ProviderInfo {
  return registry[id] ?? registry["openai-compatible"];
}

export function createProvider(config: LLMConfig, http: HttpClient): ChatProvider {
  return providerInfo(config.provider).create(config, http);
}

export function providerOptions(): { id: ProviderId; label: string }[] {
  return (Object.keys(registry) as ProviderId[]).map((id) => ({ id, label: registry[id].label }));
}

/** 切换服务商时，如果 base URL 还是空的或是其他服务商的默认值，换成新服务商的默认值 */
export function baseUrlAfterSwitch(current: string, to: ProviderId): string {
  const defaults = Object.values(registry).map((p) => p.defaultBaseUrl);
  return !current.trim() || defaults.includes(current.trim()) ? providerInfo(to).defaultBaseUrl : current;
}
