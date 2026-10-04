// 把 HttpClient 包装成标准 fetch，交给需要 fetch 的 SDK 使用。
// 插件里 HttpClient 由 Obsidian 的 requestUrl 实现，这样 SDK 的请求也能绕过 CORS
// （很多中转服务不返回 CORS 头，浏览器环境下的 fetch 会被拦截）。

import type { HttpClient } from "./types";

type FetchInput = string | URL | Request;

export function httpToFetch(http: HttpClient): (input: FetchInput, init?: RequestInit) => Promise<Response> {
  return async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    if (init.body != null && typeof init.body !== "string") {
      throw new Error("fetchAdapter 只支持字符串请求体");
    }

    const method = (init.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") throw new Error(`fetchAdapter 不支持 ${method} 请求`);

    const res = await http({ url, method, headers, body: init.body ?? undefined });
    return new Response(res.text, {
      status: res.status,
      headers: res.headers ?? { "content-type": "application/json" },
    });
  };
}
