// 用 Obsidian 的 requestUrl 实现 HttpClient，绕过浏览器的 CORS 限制。

import { requestUrl } from "obsidian";
import type { HttpClient } from "../llm/types";

export const obsidianHttp: HttpClient = async (req) => {
  const res = await requestUrl({
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    throw: false,
  });
  return { status: res.status, text: res.text, headers: res.headers };
};
