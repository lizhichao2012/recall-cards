// 设置的类型、默认值和校验。不依赖 Obsidian，设置页 UI 在 ui/SettingTab.ts。

import { DEFAULT_SCHEDULER } from "./core/scheduler";
import type { LLMConfig } from "./llm/types";

export interface Settings {
  llm: LLMConfig;
  /** 记忆文件目录（vault 内的相对路径） */
  memoryDir: string;
  /** 每天最多推送几张卡片 */
  dailyLimit: number;
  /** 目标记忆保持率：到期时希望还能记住的概率，越高复习越频繁 */
  desiredRetention: number;
  /** 最长间隔（天） */
  maximumInterval: number;
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
  memoryDir: "recall-cards",
  dailyLimit: 3,
  desiredRetention: DEFAULT_SCHEDULER.desiredRetention,
  maximumInterval: DEFAULT_SCHEDULER.maximumInterval,
  maxBodyChars: 20000,
  minQuestions: 3,
  maxQuestions: 7,
  checkIntervalMinutes: 30,
  changeDebounceMs: 2000,
};

/** 合并已保存的设置和默认值，并修正非法值 */
export function normalizeSettings(saved: Partial<Settings> | undefined): Settings {
  // 第一版的 intervals（间隔表）已被 FSRS 取代，丢弃
  const { intervals: _intervals, ...rest } = (saved ?? {}) as Partial<Settings> & { intervals?: unknown };
  const s: Settings = {
    ...DEFAULT_SETTINGS,
    ...rest,
    llm: { ...DEFAULT_SETTINGS.llm, ...rest.llm },
  };
  if (!isValidRetention(s.desiredRetention)) s.desiredRetention = DEFAULT_SETTINGS.desiredRetention;
  s.maximumInterval = positiveInt(s.maximumInterval, DEFAULT_SETTINGS.maximumInterval, 1);
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

export const RETENTION_RANGE = { min: 0.7, max: 0.97 } as const;

/** 保持率过低时间隔会变得很长，过高时复习量会急剧增加 */
export function isValidRetention(value: unknown): value is number {
  return typeof value === "number" && value >= RETENTION_RANGE.min && value <= RETENTION_RANGE.max;
}
