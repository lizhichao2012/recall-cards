// 校验 LLM 输出，对应设计方案 2.2.2 调用流程第 4 步。校验失败抛错，不写入记忆文件。

import type { GeneratedQuestion } from "../core/types";
import { GenerationError } from "./errors";

export interface ParseOptions {
  minQuestions: number;
  maxQuestions: number;
}

/** 模型偶尔会用代码块包裹或在前后加说明，这里截取第一个 { 到最后一个 } */
function extractJson(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw invalid("输出中没有 JSON 对象");
  return text.slice(start, end + 1);
}

function invalid(detail: string): GenerationError {
  return new GenerationError("invalid-output", `LLM 输出格式不正确：${detail}`);
}

export function parseQuestions(raw: string, opts: ParseOptions): GeneratedQuestion[] {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch (e) {
    if (e instanceof GenerationError) throw e;
    throw invalid("不是合法的 JSON");
  }

  const list = (data as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) throw invalid("缺少 questions 数组");
  if (list.length < opts.minQuestions || list.length > opts.maxQuestions) {
    throw invalid(`题数为 ${list.length}，应在 ${opts.minQuestions}～${opts.maxQuestions} 之间`);
  }

  return list.map((item, i) => {
    const q = (item as { question?: unknown })?.question;
    const a = (item as { answer?: unknown })?.answer;
    if (typeof q !== "string" || !q.trim()) throw invalid(`第 ${i + 1} 题的问题为空`);
    if (typeof a !== "string" || !a.trim()) throw invalid(`第 ${i + 1} 题的答案为空`);
    return { question: q.trim(), answer: a.trim() };
  });
}
