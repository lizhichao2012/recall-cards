// 复习业务流程：生成、重新生成、忽略变化、反馈。把出题、调度、存储、身份管理串起来。
// 不依赖 Obsidian，所有外部能力通过构造参数注入。
// 字段归属（设计方案 4.4）：出题只写 questions，调度只写 schedule 和 history。

import type { Clock } from "../core/clock";
import { createMemoryFile, toQuestions } from "../core/memoryFile";
import { contentHash } from "../core/noteBody";
import { applyRating, resetSchedule } from "../core/scheduler";
import type { MemoryFile, Rating } from "../core/types";
import type { QuestionSource } from "../llm/generator";
import type { MemoryStore } from "../storage/MemoryStore";
import type { NoteGateway, ReviewSettings } from "./ports";

/**
 * none      未生成回忆（没有 review-id，或有 id 但记忆文件丢失）
 * ready     已生成，内容未变化
 * changed   已生成，正文变化了
 * duplicate 这篇笔记的 review-id 与另一篇重复（复制笔记造成），不是主笔记
 */
export type NoteStatus = "none" | "ready" | "changed" | "duplicate";

export type RegenerateMode = "keep" | "reset";

export class ReviewError extends Error {}

export interface ReviewServiceDeps {
  store: MemoryStore;
  notes: NoteGateway;
  generator: QuestionSource;
  clock: Clock;
  settings: () => ReviewSettings;
  newId: () => string;
  hash?: (body: string) => Promise<string>;
}

export class ReviewService {
  private readonly hash: (body: string) => Promise<string>;
  /** 正在出题的笔记路径，防止重复点击 */
  private readonly busy = new Set<string>();

  constructor(private readonly deps: ReviewServiceDeps) {
    this.hash = deps.hash ?? contentHash;
  }

  isBusy(path: string): boolean {
    return this.busy.has(path);
  }

  /** 笔记对应的记忆文件；未生成或是重复副本时返回 null */
  memoryOf(path: string): MemoryFile | null {
    const id = this.deps.notes.getReviewId(path);
    if (!id || this.deps.notes.pathOf(id) !== path) return null;
    return this.deps.store.get(id);
  }

  async statusOf(path: string): Promise<NoteStatus> {
    const { notes, store } = this.deps;
    const id = notes.getReviewId(path);
    if (!id) return "none";
    const memory = store.get(id);
    if (!memory) return "none";
    if (notes.pathOf(id) !== path) return "duplicate";
    const hash = await this.hash(await notes.readBody(path));
    return hash === memory.contentHash ? "ready" : "changed";
  }

  /** 首次生成回忆。点击的这一天就是记忆曲线的起点。 */
  async generate(path: string): Promise<MemoryFile> {
    const { notes, store, clock, newId } = this.deps;
    const existingId = notes.getReviewId(path);
    if (existingId && store.get(existingId)) {
      if (notes.pathOf(existingId) !== path) {
        throw new ReviewError("这篇笔记的 review-id 与另一篇笔记重复，请先删除其中一篇的 review-id");
      }
      throw new ReviewError("这篇笔记已经生成过回忆");
    }

    return this.withBusy(path, async () => {
      const body = await notes.readBody(path);
      const questions = await this.deps.generator.generate(body);
      // 有 id 但记忆文件丢失时沿用原 id
      const noteId = existingId ?? newId();
      const memory = createMemoryFile({
        noteId,
        source: path,
        contentHash: await this.hash(body),
        questions,
        today: clock.today(),
      });
      // 先写记忆文件，成功后再写 frontmatter，避免出现有 id 却没有记忆文件的笔记
      await store.save(memory);
      if (!existingId) await notes.setReviewId(path, noteId);
      return memory;
    });
  }

  /** 重新生成：keep 只换题目；reset 换题目并让记忆曲线归零 */
  async regenerate(noteId: string, mode: RegenerateMode): Promise<MemoryFile> {
    const { memory, path } = this.requireNote(noteId);
    const { clock } = this.deps;

    return this.withBusy(path, async () => {
      const body = await this.deps.notes.readBody(path);
      const questions = await this.deps.generator.generate(body);
      const today = clock.today();
      const updated: MemoryFile = {
        ...memory,
        source: path,
        contentHash: await this.hash(body),
        questions: toQuestions(questions),
        schedule: mode === "reset" ? resetSchedule(today) : memory.schedule,
        history: [...memory.history, { date: today, event: mode === "reset" ? "reset" : "regenerate" }],
      };
      await this.deps.store.save(updated);
      return updated;
    });
  }

  /** 忽略本次变化：只把 contentHash 更新为当前值 */
  async ignoreChange(noteId: string): Promise<MemoryFile> {
    const { memory, path } = this.requireNote(noteId);
    const body = await this.deps.notes.readBody(path);
    const updated = { ...memory, contentHash: await this.hash(body) };
    await this.deps.store.save(updated);
    return updated;
  }

  /** 反馈。推送复习和手动复习使用同一套规则。 */
  async rate(noteId: string, rating: Rating, manual: boolean): Promise<MemoryFile> {
    const { memory } = this.requireNote(noteId);
    const { clock, settings } = this.deps;
    const today = clock.today();
    const updated: MemoryFile = {
      ...memory,
      schedule: applyRating(memory.schedule, rating, today, settings()),
      history: [...memory.history, { date: today, rating, manual }],
    };
    await this.deps.store.save(updated);
    return updated;
  }

  /** 笔记重命名或移动后同步 source */
  async syncSource(noteId: string, path: string): Promise<void> {
    const memory = this.deps.store.get(noteId);
    if (memory && memory.source !== path) await this.deps.store.save({ ...memory, source: path });
  }

  private requireNote(noteId: string): { memory: MemoryFile; path: string } {
    const memory = this.deps.store.get(noteId);
    if (!memory) throw new ReviewError("找不到这篇笔记的记忆文件");
    const path = this.deps.notes.pathOf(noteId);
    if (!path) throw new ReviewError("源笔记已被删除");
    return { memory, path };
  }

  private async withBusy<T>(path: string, fn: () => Promise<T>): Promise<T> {
    if (this.busy.has(path)) throw new ReviewError("正在生成中，请稍候");
    this.busy.add(path);
    try {
      return await fn();
    } finally {
      this.busy.delete(path);
    }
  }
}
