// 设置的类型、默认值和校验。不依赖 Obsidian，设置页 UI 在 ui/SettingTab.ts。

import { DEFAULT_INTERVALS } from "./core/scheduler";
import type { LLMConfig } from "./llm/types";

export interface Settings {
  llm: LLMConfig;
  /** 记忆文件目录（vault 内的相对路径） */
  memoryDir: string;
  /** 每天最多推送几张卡片 */
  dailyLimit: number;
  /** 间隔表（天） */
  intervals: number[];
  /** 正文长度上限（字符数） */
  maxBodyChars: number;
  minQuestions: number;
  maxQuestions: number;
  /** 定时检查推送的间隔（分钟） */
  checkIntervalMinutes: number;
  /** 停止编辑多久后检测内容变化（毫秒） */
  changeDebounceMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  llm: {
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "",
    apiKey: "",
    temperature: 0.3,
  },
  memoryDir: "automem",
  dailyLimit: 3,
  intervals: [...DEFAULT_INTERVALS],
  maxBodyChars: 20000,
  minQuestions: 3,
  maxQuestions: 7,
  checkIntervalMinutes: 30,
  changeDebounceMs: 2000,
};

/** 合并已保存的设置和默认值，并修正非法值 */
export function normalizeSettings(saved: Partial<Settings> | undefined): Settings {
  const s: Settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    llm: { ...DEFAULT_SETTINGS.llm, ...saved?.llm },
  };
  if (!isValidIntervals(s.intervals)) s.intervals = [...DEFAULT_INTERVALS];
  s.dailyLimit = positiveInt(s.dailyLimit, DEFAULT_SETTINGS.dailyLimit, 0);
  s.maxBodyChars = positiveInt(s.maxBodyChars, DEFAULT_SETTINGS.maxBodyChars, 1);
  s.minQuestions = positiveInt(s.minQuestions, DEFAULT_SETTINGS.minQuestions, 1);
  s.maxQuestions = Math.max(s.minQuestions, positiveInt(s.maxQuestions, DEFAULT_SETTINGS.maxQuestions, 1));
  s.checkIntervalMinutes = positiveInt(s.checkIntervalMinutes, DEFAULT_SETTINGS.checkIntervalMinutes, 1);
  s.memoryDir = normalizeDir(s.memoryDir) || DEFAULT_SETTINGS.memoryDir;
  return s;
}

function positiveInt(value: unknown, fallback: number, min: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min ? value : fallback;
}

export function normalizeDir(dir: string): string {
  return dir.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/** 间隔表必须是严格递增的正整数 */
export function isValidIntervals(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((n, i) => Number.isInteger(n) && n > 0 && (i === 0 || n > value[i - 1]))
  );
}

/** 解析设置页输入的间隔表，例如 "1, 2, 4, 7"；非法时返回 null */
export function parseIntervals(text: string): number[] | null {
  const list = text
    .split(/[,，\s]+/)
    .filter(Boolean)
    .map(Number);
  return isValidIntervals(list) ? list : null;
}
