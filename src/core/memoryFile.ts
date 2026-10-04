// 记忆文件的创建、校验和版本迁移。读文件时统一走 parseMemoryFile，
// 第二版改格式时在 migrate 里加分支即可。

import { isDateStr } from "./date";
import { initSchedule } from "./scheduler";
import {
  MEMORY_FILE_VERSION,
  RATINGS,
  type DateStr,
  type GeneratedQuestion,
  type MemoryFile,
  type Question,
} from "./types";

export function toQuestions(generated: readonly GeneratedQuestion[]): Question[] {
  return generated.map((q) => ({ question: q.question, answer: q.answer, row: 0, memory: null }));
}

export interface NewMemoryFileInput {
  noteId: string;
  source: string;
  contentHash: string;
  questions: readonly GeneratedQuestion[];
  today: DateStr;
  intervals: readonly number[];
}

export function createMemoryFile(input: NewMemoryFileInput): MemoryFile {
  return {
    version: MEMORY_FILE_VERSION,
    noteId: input.noteId,
    source: input.source,
    contentHash: input.contentHash,
    createdAt: input.today,
    questions: toQuestions(input.questions),
    schedule: initSchedule(input.today, input.intervals),
    history: [],
  };
}

export class MemoryFileError extends Error {}

function fail(msg: string): never {
  throw new MemoryFileError(msg);
}

function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const version = raw.version;
  if (version === MEMORY_FILE_VERSION) return raw;
  return fail(`不支持的记忆文件版本：${String(version)}`);
}

/** 解析并校验记忆文件，非法时抛出 MemoryFileError */
export function parseMemoryFile(text: string): MemoryFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("不是合法的 JSON");
  }
  if (!raw || typeof raw !== "object") fail("根节点不是对象");
  const obj = migrate(raw as Record<string, unknown>);

  if (typeof obj.noteId !== "string" || !obj.noteId) fail("缺少 noteId");
  if (typeof obj.source !== "string") fail("缺少 source");
  if (typeof obj.contentHash !== "string") fail("缺少 contentHash");
  if (!isDateStr(obj.createdAt)) fail("createdAt 不是合法日期");
  if (!Array.isArray(obj.questions)) fail("questions 不是数组");

  const s = obj.schedule as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") fail("缺少 schedule");
  if (s.status !== "active" && s.status !== "mastered") fail("schedule.status 非法");
  if (typeof s.level !== "number" || s.level < 0) fail("schedule.level 非法");
  if (!isDateStr(s.starttime)) fail("schedule.starttime 非法");
  if (s.lastreviewtime !== null && !isDateStr(s.lastreviewtime)) fail("schedule.lastreviewtime 非法");
  if (s.nextreviewtime !== null && !isDateStr(s.nextreviewtime)) fail("schedule.nextreviewtime 非法");
  if (s.memory !== null && s.memory !== undefined && !RATINGS.includes(s.memory as never)) {
    fail("schedule.memory 非法");
  }

  return {
    ...(obj as unknown as MemoryFile),
    schedule: { ...(s as unknown as MemoryFile["schedule"]), memory: (s.memory as never) ?? null },
    history: Array.isArray(obj.history) ? (obj.history as MemoryFile["history"]) : [],
  };
}

export function serializeMemoryFile(file: MemoryFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}
