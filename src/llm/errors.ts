// 出题失败的统一错误类型。UI 只需要显示 message；kind 便于以后按类型做不同处理。

export type GenerationErrorKind =
  | "config" // 设置不完整
  | "empty" // 笔记正文为空
  | "too-long" // 超过长度上限
  | "network" // 网络不通
  | "auth" // API key 错误
  | "http" // 其他 HTTP 错误
  | "invalid-output"; // LLM 输出不符合格式

export class GenerationError extends Error {
  constructor(
    readonly kind: GenerationErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}
