// 记忆文件的数据结构，对应设计方案 4.3。各模块之间只通过这些类型交换数据。

/** 日期字符串，格式 YYYY-MM-DD，本地时区。 */
export type DateStr = string;

/** 反馈：忘了 / 模糊 / 记得 / 简单 */
export type Rating = "forgot" | "fuzzy" | "good" | "easy";

export const RATINGS: readonly Rating[] = ["forgot", "fuzzy", "good", "easy"];

export type ScheduleStatus = "active" | "mastered";

export interface Schedule {
  status: ScheduleStatus;
  /** 当前档位，间隔表的下标 */
  level: number;
  /** 当前这条曲线的起点；"忘了"和"从头记忆"会重置 */
  starttime: DateStr;
  lastreviewtime: DateStr | null;
  /** mastered 时为 null */
  nextreviewtime: DateStr | null;
  /** 最近一次反馈 */
  memory: Rating | null;
}

export interface Question {
  question: string;
  answer: string;
  /** 保留字段，MVP 固定为 0 */
  row: number;
  /** 保留字段，MVP 为 null */
  memory: null;
}

/** 一次反馈 */
export interface RatingEntry {
  date: DateStr;
  rating: Rating;
  /** true 表示手动复习，false 表示推送复习 */
  manual: boolean;
}

/** 重新生成事件：第二版算法需要知道曲线在哪里被重置过 */
export interface EventEntry {
  date: DateStr;
  event: "regenerate" | "reset";
}

export type HistoryEntry = RatingEntry | EventEntry;

export const MEMORY_FILE_VERSION = 1;

export interface MemoryFile {
  version: number;
  noteId: string;
  /** 源笔记路径（缓存，真实身份以笔记 frontmatter 中的 review-id 为准） */
  source: string;
  contentHash: string;
  /** 首次生成日期，永不改变 */
  createdAt: DateStr;
  questions: Question[];
  schedule: Schedule;
  history: HistoryEntry[];
}

/** 出题模块的产出，只有问题和答案 */
export interface GeneratedQuestion {
  question: string;
  answer: string;
}
