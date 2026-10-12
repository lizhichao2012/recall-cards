// 界面上的小工具函数

import { diffDays } from "../core/date";
import { applyRating, type SchedulerConfig } from "../core/scheduler";
import type { DateStr, Rating, Schedule } from "../core/types";

/** "目录/笔记名.md" → "笔记名" */
export function noteName(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

/** 稳定性等天数：10 天以内保留一位小数 */
export function formatDays(days: number): string {
  return days < 10 ? days.toFixed(1) : String(Math.round(days));
}

/**
 * 反馈按钮的提示：点击后记忆曲线会怎样变化。
 * 直接用 applyRating 推算结果，保证提示和实际调度一致。
 */
export function describeRatingEffect(
  schedule: Schedule,
  rating: Rating,
  today: DateStr,
  config: SchedulerConfig,
): string {
  const next = applyRating(schedule, rating, today, config);
  if (next.status === "mastered" || next.nextreviewtime === null) return "进入长期记忆，不再推送";

  const resume = schedule.status === "mastered" ? "恢复推送，" : "";
  const days = diffDays(today, next.nextreviewtime);
  const to = `${formatDays(next.stability!)} 天`;
  const stability =
    schedule.stability === null ? `记忆稳定性 ${to}` : `记忆稳定性 ${formatDays(schedule.stability)} → ${to}`;
  return `${resume}${days} 天后（${next.nextreviewtime}）复习；${stability}`;
}
