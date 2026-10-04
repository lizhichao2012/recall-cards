// 选出今天要推送的卡片，对应设计方案 2.2.3"每日推送上限"。
// 顺延不改写任何时间字段，每次都从全部卡片中动态选择。

import { compareDate } from "./date";
import type { DateStr, MemoryFile } from "./types";

export interface PickOptions {
  /** 源笔记是否存在；不存在的不推送 */
  isAvailable?: (file: MemoryFile) => boolean;
  /** 需要排除的 noteId，例如本次运行中被关闭的卡片 */
  exclude?: ReadonlySet<string>;
}

export function isDue(file: MemoryFile, today: DateStr): boolean {
  const s = file.schedule;
  return s.status === "active" && s.nextreviewtime !== null && s.nextreviewtime <= today;
}

/**
 * 排序：nextreviewtime 早的优先 → starttime 早的优先 → noteId。
 * 方案原文最后一级是"随机"，这里用 noteId 代替，保证结果可复现、可测试。
 */
export function compareDue(a: MemoryFile, b: MemoryFile): number {
  return (
    compareDate(a.schedule.nextreviewtime!, b.schedule.nextreviewtime!) ||
    compareDate(a.schedule.starttime, b.schedule.starttime) ||
    (a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0)
  );
}

/** 全部到期卡片，按优先级排序 */
export function dueQueue(
  all: readonly MemoryFile[],
  today: DateStr,
  options: PickOptions = {},
): MemoryFile[] {
  const { isAvailable = () => true, exclude } = options;
  return all
    .filter((f) => isDue(f, today) && !exclude?.has(f.noteId) && isAvailable(f))
    .sort(compareDue);
}

/** 取前 remaining 张 */
export function pickDue(
  all: readonly MemoryFile[],
  today: DateStr,
  remaining: number,
  options: PickOptions = {},
): MemoryFile[] {
  if (remaining <= 0) return [];
  return dueQueue(all, today, options).slice(0, remaining);
}
