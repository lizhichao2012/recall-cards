// 每日推送额度。保存在插件数据中，重启 Obsidian 后不会重新计算。
// 只有推送卡片在点了反馈后才计数；手动复习和关闭不反馈都不计数。

import type { DateStr } from "./types";

export interface DailyCount {
  date: DateStr;
  count: number;
}

export function usedToday(state: DailyCount | null, today: DateStr): number {
  return state && state.date === today ? state.count : 0;
}

export function remainingToday(state: DailyCount | null, today: DateStr, limit: number): number {
  return Math.max(0, limit - usedToday(state, today));
}

export function consume(state: DailyCount | null, today: DateStr): DailyCount {
  return { date: today, count: usedToday(state, today) + 1 };
}
