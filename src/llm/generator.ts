// 出题模块：拼 prompt → 调用 LLM → 校验输出。只负责问题和答案，不碰调度字段。

import type { GeneratedQuestion } from "../core/types";
import { GenerationError } from "./errors";
import { parseQuestions } from "./parse";
import { buildMessages } from "./prompt";
import type { ChatProvider } from "./types";

export interface GeneratorOptions {
  /** 正文长度上限（字符数），超过时提示用户，不生成 */
  maxBodyChars: number;
  minQuestions: number;
  maxQuestions: number;
}

/** ReviewService 依赖的出题接口 */
export interface QuestionSource {
  generate(noteBody: string): Promise<GeneratedQuestion[]>;
}

export class QuestionGenerator implements QuestionSource {
  constructor(
    private readonly provider: () => ChatProvider,
    private readonly options: () => GeneratorOptions,
  ) {}

  async generate(noteBody: string): Promise<GeneratedQuestion[]> {
    const opts = this.options();
    const body = noteBody.trim();
    if (!body) throw new GenerationError("empty", "笔记正文为空，无法出题");
    if (body.length > opts.maxBodyChars) {
      throw new GenerationError(
        "too-long",
        `笔记正文 ${body.length} 字，超过上限 ${opts.maxBodyChars} 字。可以在设置中调高上限，或拆分笔记。`,
      );
    }
    const raw = await this.provider().complete(buildMessages(body, opts));
    return parseQuestions(raw, opts);
  }
}
