// 笔记正文处理：去掉 frontmatter、规范化、计算 contentHash、提取二级标题。

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

/** 去掉 frontmatter，返回正文 */
export function extractBody(text: string): string {
  return text.replace(FRONTMATTER_RE, "");
}

/**
 * hash 前的规范化：统一换行符、去掉行尾空白、去掉首尾空行。
 * 去掉首尾空行是因为写入 frontmatter 时，正文开头的空行可能被增减。
 */
export function normalizeBody(body: string): string {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

/** SHA-256（Web Crypto API），结果形如 "sha256:<hex>" */
export async function contentHash(body: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeBody(body));
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

/** 提取二级标题（忽略代码块内的内容），用于出题 prompt */
export function extractH2Headings(body: string): string[] {
  const headings: string[] = [];
  let inFence = false;
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) headings.push(m[1]);
  }
  return headings;
}
