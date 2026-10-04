// 日期工具。调度只关心"天"，内部用 UTC 做加减，避免夏令时造成的偏差。

import type { DateStr } from "./types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isDateStr(value: unknown): value is DateStr {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return toDateStrUTC(d) === value;
}

function parseUTC(date: DateStr): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`无效日期：${date}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStrUTC(d: Date): DateStr {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 把本地时间转成本地日期字符串 */
export function formatLocalDate(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(date: DateStr, days: number): DateStr {
  return toDateStrUTC(new Date(parseUTC(date).getTime() + days * DAY_MS));
}

/** b - a 的天数 */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((parseUTC(b).getTime() - parseUTC(a).getTime()) / DAY_MS);
}

/** 日期字符串可以直接按字典序比较 */
export function compareDate(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
