// 界面上的小工具函数

import { diffDays } from "../core/date";
import { applyRating, clampLevel } from "../core/scheduler";
import type { DateStr, Rating, Schedule } from "../core/types";

/** "目录/笔记名.md" → "笔记名" */
export function noteName(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

/**
 * 反馈按钮的提示：点击后记忆曲线会怎样变化。
 * 直接用 applyRating 推算结果，保证提示和实际调度一致。
 */
export function describeRatingEffect(
  schedule: Schedule,
  rating: Rating,
  today: DateStr,
  intervals: readonly number[],
): string {
  const next = applyRating(schedule, rating, today, intervals);
  if (next.status === "mastered" || next.nextreviewtime === null) return "进入长期记忆，不再推送";

  const current = clampLevel(schedule.level, intervals);
  const levelText = `第 ${next.level + 1} 档`;
  let change: string;
  if (rating === "forgot") change = `记忆曲线归零，回到${levelText}`;
  else if (next.level > current) change = `升到${levelText}`;
  else if (rating === "good") change = `已是最高档，保持${levelText}`;
  else change = `保持${levelText}`;

  const resume = schedule.status === "mastered" ? "恢复推送，" : "";
  const days = diffDays(today, next.nextreviewtime);
  return `${resume}${change}，${days} 天后（${next.nextreviewtime}）复习`;
}
