// 记忆文件的创建、校验和版本迁移。读文件时统一走 parseMemoryFile，
// 改格式时在 migrate 里加分支即可。旧版本的文件只在内存中升级，下次保存时才写回新格式。

import { isDateStr } from "./date";
import { initSchedule, stateFromHistory } from "./scheduler";
import {
  MEMORY_FILE_VERSION,
  RATINGS,
  type DateStr,
  type GeneratedQuestion,
  type HistoryEntry,
  type MemoryFile,
  type Question,
  type Rating,
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
}

export function createMemoryFile(input: NewMemoryFileInput): MemoryFile {
  return {
    version: MEMORY_FILE_VERSION,
    noteId: input.noteId,
    source: input.source,
    contentHash: input.contentHash,
    createdAt: input.today,
    questions: toQuestions(input.questions),
    schedule: initSchedule(input.today),
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
  if (version === 1) return migrateV1(raw);
  return fail(`不支持的记忆文件版本：${String(version)}`);
}

/**
 * 版本 1 → 2：固定间隔表换成 FSRS。去掉 level，按复习记录重放出稳定性和难度。
 * 已排好的 nextreviewtime 保持不变，升级后不会让所有卡片同时改期。
 */
function migrateV1(raw: Record<string, unknown>): Record<string, unknown> {
  const history = Array.isArray(raw.history) ? (raw.history as HistoryEntry[]) : [];
  const valid = history.every(
    (e) => e && isDateStr(e.date) && ("event" in e || RATINGS.includes((e as { rating: Rating }).rating)),
  );
  if (!valid) fail("history 中有无法识别的记录");
  const { level: _level, ...schedule } = (raw.schedule ?? {}) as Record<string, unknown>;
  const state = stateFromHistory(history);
  return {
    ...raw,
    version: MEMORY_FILE_VERSION,
    schedule: { ...schedule, stability: state?.stability ?? null, difficulty: state?.difficulty ?? null },
  };
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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
  if (!isDateStr(s.starttime)) fail("schedule.starttime 非法");
  if (s.lastreviewtime !== null && !isDateStr(s.lastreviewtime)) fail("schedule.lastreviewtime 非法");
  if (s.nextreviewtime !== null && !isDateStr(s.nextreviewtime)) fail("schedule.nextreviewtime 非法");
  if (s.memory !== null && s.memory !== undefined && !RATINGS.includes(s.memory as never)) {
    fail("schedule.memory 非法");
  }
  if (s.stability === null || s.difficulty === null) {
    if (s.stability !== s.difficulty) fail("schedule.stability 和 difficulty 必须同时为空");
  } else if (!isPositive(s.stability) || !isPositive(s.difficulty)) {
    fail("schedule.stability / difficulty 非法");
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
