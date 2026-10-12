// 调度：纯函数，对应设计方案第六节"FSRS 调度"。把 FSRS 记忆模型（fsrs.ts）接到记忆文件的 schedule 上。
// 时间精度为"天"，下次复习时间一律按实际复习日期（today）计算。

import { addDays, diffDays } from "./date";
import { nextState, outcomes, retrievability, type Grade, type MemoryState } from "./fsrs";
import type { DateStr, HistoryEntry, Rating, Schedule } from "./types";

export interface SchedulerConfig {
  /** 目标记忆保持率：到期时希望还能记住的概率 */
  desiredRetention: number;
  /** 最长间隔（天） */
  maximumInterval: number;
}

export const DEFAULT_SCHEDULER: SchedulerConfig = { desiredRetention: 0.9, maximumInterval: 365 };

/** 四个按钮对应的 FSRS 评分。"简单"按 Easy 更新记忆状态，但卡片进入长期记忆、不再推送。 */
export const GRADE_OF: Record<Rating, Grade> = { forgot: 1, fuzzy: 2, good: 3, easy: 4 };

export function memoryState(schedule: Schedule): MemoryState | null {
  const { stability, difficulty } = schedule;
  return stability === null || difficulty === null ? null : { stability, difficulty };
}

/** 距上次复习的天数；从未复习过时为 0。模拟日期往回调时不会出现负数。 */
function elapsedDays(schedule: Schedule, today: DateStr): number {
  return schedule.lastreviewtime ? Math.max(0, diffDays(schedule.lastreviewtime, today)) : 0;
}

/** 首次生成：还没复习过，第二天第一次复习 */
export function initSchedule(today: DateStr): Schedule {
  return {
    status: "active",
    starttime: today,
    lastreviewtime: null,
    nextreviewtime: addDays(today, 1),
    memory: null,
    stability: null,
    difficulty: null,
  };
}

/** 重新生成（从头记忆）：记忆状态清空，和首次生成相同 */
export function resetSchedule(today: DateStr): Schedule {
  return initSchedule(today);
}

/** 根据反馈计算新状态。提前复习、推迟复习都按实际间隔计算。 */
export function applyRating(
  schedule: Schedule,
  rating: Rating,
  today: DateStr,
  config: SchedulerConfig,
): Schedule {
  const outcome = outcomes(memoryState(schedule), elapsedDays(schedule, today), config)[GRADE_OF[rating]];
  const base: Schedule = {
    ...schedule,
    lastreviewtime: today,
    memory: rating,
    stability: outcome.state.stability,
    difficulty: outcome.state.difficulty,
  };
  if (rating === "easy") return { ...base, status: "mastered", nextreviewtime: null };
  return { ...base, status: "active", nextreviewtime: addDays(today, outcome.interval) };
}

/** 今天记住的概率；还没复习过时返回 null */
export function currentRetrievability(schedule: Schedule, today: DateStr): number | null {
  const state = memoryState(schedule);
  return state ? retrievability(elapsedDays(schedule, today), state.stability) : null;
}

/**
 * 按复习记录重放出记忆状态，用于从固定间隔表（版本 1）升级。
 * reset 事件之后从新卡片开始；regenerate（记忆保持）不影响记忆状态。
 */
export function stateFromHistory(history: readonly HistoryEntry[]): MemoryState | null {
  let state: MemoryState | null = null;
  let last: DateStr | null = null;
  for (const entry of history) {
    if ("event" in entry) {
      if (entry.event === "reset") [state, last] = [null, null];
      continue;
    }
    const t = last ? Math.max(0, diffDays(last, entry.date)) : 0;
    state = nextState(state, t, GRADE_OF[entry.rating]);
    last = entry.date;
  }
  return state;
}

export interface TimelinePoint {
  date: DateStr;
  /** 距上一次复习的天数（第一次复习时距生成日期） */
  gap: number;
}

/**
 * 时间轴预测：假设每次都在到期当天点"记得"，未来各次复习的日期。
 * 用于调试命令"查看时间轴"。mastered 的卡片不再推送，返回空数组。
 */
export function previewTimeline(schedule: Schedule, config: SchedulerConfig, steps = 8): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  let current = schedule;
  for (let i = 0; i < steps && current.status === "active" && current.nextreviewtime; i++) {
    const date = current.nextreviewtime;
    points.push({ date, gap: diffDays(current.lastreviewtime ?? current.starttime, date) });
    current = applyRating(current, "good", date, config);
  }
  return points;
}
