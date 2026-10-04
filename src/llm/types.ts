// LLM 层的抽象。出题逻辑只依赖 ChatProvider，新增服务商时实现这个接口即可。

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatProvider {
  complete(messages: ChatMessage[]): Promise<string>;
}

/** 服务商标识。新增服务商：在这里加一项，并在 providers/index.ts 注册。 */
export type ProviderId = "openai-compatible";

export interface LLMConfig {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
}

/** HTTP 抽象：插件里用 Obsidian 的 requestUrl 实现（绕过 CORS），测试里用假实现。 */
export interface HttpRequest {
  url: string;
  method: "POST" | "GET";
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  text: string;
}

export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;
