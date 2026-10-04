// 服务商注册表。新增服务商：实现 ChatProvider，在 ProviderId 和这里各加一项。

import type { ChatProvider, HttpClient, LLMConfig, ProviderId } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

type ProviderFactory = (config: LLMConfig, http: HttpClient) => ChatProvider;

const registry: Record<ProviderId, { label: string; create: ProviderFactory }> = {
  "openai-compatible": {
    label: "OpenAI 兼容接口",
    create: (config, http) => new OpenAICompatibleProvider(config, http),
  },
};

export function createProvider(config: LLMConfig, http: HttpClient): ChatProvider {
  const entry = registry[config.provider] ?? registry["openai-compatible"];
  return entry.create(config, http);
}

export function providerOptions(): { id: ProviderId; label: string }[] {
  return (Object.keys(registry) as ProviderId[]).map((id) => ({ id, label: registry[id].label }));
}
