// 出题 prompt，对应设计方案 2.2.2"出题要求"。调整出题风格只改这个文件。

import { extractH2Headings } from "../core/noteBody";
import type { ChatMessage } from "./types";

export interface PromptOptions {
  minQuestions: number;
  maxQuestions: number;
}

export function buildMessages(body: string, opts: PromptOptions): ChatMessage[] {
  const { minQuestions: min, maxQuestions: max } = opts;
  const headings = extractH2Headings(body);

  const rules = [
    "问题覆盖笔记的主要知识点。",
    "优先问“为什么、怎么做、区别是什么”，少问纯记忆型的细节。",
    `题数根据笔记长度决定，最少 ${min} 道，最多 ${max} 道。`,
    "答案必须能在原文中找到依据，不要编造原文没有的内容。",
    "问题和答案使用笔记原文的语言。",
  ];

  if (headings.length > 0 && headings.length <= max) {
    rules.push(`笔记有以下二级标题，每个标题至少要有一道题：${headings.map((h) => `「${h}」`).join("、")}。`);
  } else if (headings.length > max) {
    rules.push(
      `笔记有 ${headings.length} 个二级标题，超过题目上限 ${max}。` +
        `请优先覆盖篇幅长、内容核心的标题，可以把相关标题合并成一道题：${headings.map((h) => `「${h}」`).join("、")}。`,
    );
  }

  const system =
    "你是一位帮助用户复习笔记的出题老师。根据用户提供的笔记出题，用于主动回忆练习。\n" +
    "出题要求：\n" +
    rules.map((r, i) => `${i + 1}. ${r}`).join("\n") +
    "\n\n只输出如下格式的 JSON，不要输出任何额外文字，也不要用代码块包裹：\n" +
    '{"questions": [{"question": "问题", "answer": "答案"}]}';

  return [
    { role: "system", content: system },
    { role: "user", content: `笔记内容如下：\n\n${body}` },
  ];
}
