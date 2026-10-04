// 调度：纯函数，对应设计方案 2.2.3 的状态变化规则表。
// 第二版要换成 SM-2 / FSRS 时，只需替换这个文件里的函数实现。

import { addDays } from "./date";
import type { DateStr, Rating, Schedule } from "./types";

export const DEFAULT_INTERVALS: readonly number[] = [1, 2, 4, 7, 15, 30, 60];

/** 最高档位。间隔表可配置，所以不写死为 6。 */
export function maxLevel(intervals: readonly number[]): number {
  return intervals.length - 1;
}

/** 间隔表变短后，旧文件里的档位可能越界，统一夹到合法范围。 */
export function clampLevel(level: number, intervals: readonly number[]): number {
  return Math.max(0, Math.min(level, maxLevel(intervals)));
}

export function intervalOf(level: number, intervals: readonly number[]): number {
  return intervals[clampLevel(level, intervals)];
}

/** 首次生成 */
export function initSchedule(today: DateStr, intervals: readonly number[]): Schedule {
  return {
    status: "active",
    level: 0,
    starttime: today,
    lastreviewtime: null,
    nextreviewtime: addDays(today, intervalOf(0, intervals)),
    memory: null,
  };
}

/** 重新生成（从头记忆）：曲线归零，和首次生成相同 */
export function resetSchedule(today: DateStr, intervals: readonly number[]): Schedule {
  return initSchedule(today, intervals);
}

/** 根据反馈计算新状态。下次复习时间一律按实际复习日期（today）计算。 */
export function applyRating(
  schedule: Schedule,
  rating: Rating,
  today: DateStr,
  intervals: readonly number[],
): Schedule {
  const level = clampLevel(schedule.level, intervals);
  const base = { ...schedule, level, lastreviewtime: today, memory: rating };

  switch (rating) {
    case "forgot":
      return {
        ...base,
        status: "active",
        level: 0,
        starttime: today,
        nextreviewtime: addDays(today, intervalOf(0, intervals)),
      };
    case "fuzzy":
      return {
        ...base,
        status: "active",
        nextreviewtime: addDays(today, intervalOf(level, intervals)),
      };
    case "good": {
      const next = Math.min(level + 1, maxLevel(intervals));
      return {
        ...base,
        status: "active",
        level: next,
        nextreviewtime: addDays(today, intervalOf(next, intervals)),
      };
    }
    case "easy":
      return { ...base, status: "mastered", nextreviewtime: null };
  }
}

export interface TimelinePoint {
  date: DateStr;
  level: number;
}

/**
 * 时间轴预测：假设每次都在到期当天点"记得"，未来各次复习的日期。
 * 用于调试命令"查看时间轴"。mastered 的卡片不再推送，返回空数组。
 */
export function previewTimeline(
  schedule: Schedule,
  intervals: readonly number[],
  steps = intervals.length + 1,
): TimelinePoint[] {
  if (schedule.status === "mastered" || schedule.nextreviewtime === null) return [];
  const points: TimelinePoint[] = [];
  let current = schedule;
  for (let i = 0; i < steps && current.nextreviewtime; i++) {
    points.push({ date: current.nextreviewtime, level: current.level });
    current = applyRating(current, "good", current.nextreviewtime, intervals);
  }
  return points;
}
