import { beforeEach, describe, expect, it } from "vitest";
import { SystemClock } from "../src/core/clock";
import { NoteIndex } from "../src/identity/NoteIndex";
import { GenerationError } from "../src/llm/errors";
import type { NoteGateway } from "../src/review/ports";
import { ReviewService } from "../src/review/ReviewService";
import { VaultMemoryStore } from "../src/storage/MemoryStore";
import { INTERVALS, MemoryAdapter, makeMemory } from "./helpers";

/** 内存版笔记库 */
class FakeNotes implements NoteGateway {
  bodies = new Map<string, string>();
  constructor(
    private index: NoteIndex,
    private store: VaultMemoryStore,
  ) {}
  exists(path: string) {
    return this.bodies.has(path);
  }
  async readBody(path: string) {
    return this.bodies.get(path)!;
  }
  getReviewId(path: string) {
    return this.index.idOf(path);
  }
  async setReviewId(path: string, id: string) {
    this.index.set(path, id);
  }
  pathOf(id: string) {
    return this.index.primaryPath(id, this.store.get(id)?.source);
  }
}

const QUESTIONS = [1, 2, 3].map((i) => ({ question: `Q${i}`, answer: `A${i}` }));

describe("ReviewService", () => {
  let adapter: MemoryAdapter;
  let store: VaultMemoryStore;
  let index: NoteIndex;
  let notes: FakeNotes;
  let clock: SystemClock;
  let failNext: boolean;
  let review: ReviewService;
  let ids: number;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    store = new VaultMemoryStore(adapter, () => "automem");
    index = new NoteIndex();
    notes = new FakeNotes(index, store);
    clock = new SystemClock();
    clock.setOverride("2026-10-03");
    failNext = false;
    ids = 0;
    review = new ReviewService({
      store,
      notes,
      clock,
      settings: () => ({ intervals: INTERVALS }),
      newId: () => `id${++ids}`,
      generator: {
        generate: async () => {
          if (failNext) throw new GenerationError("network", "offline");
          return QUESTIONS;
        },
      },
    });
    notes.bodies.set("a.md", "## 标题\n正文");
  });

  it("首次生成：写记忆文件和 review-id", async () => {
    expect(await review.statusOf("a.md")).toBe("none");
    const m = await review.generate("a.md");
    expect(m.noteId).toBe("id1");
    expect(m.schedule.nextreviewtime).toBe("2026-10-04");
    expect(index.idOf("a.md")).toBe("id1");
    expect(adapter.files.has("automem/id1.json")).toBe(true);
    expect(await review.statusOf("a.md")).toBe("ready");
  });

  it("LLM 失败时不写任何文件", async () => {
    failNext = true;
    await expect(review.generate("a.md")).rejects.toThrow("offline");
    expect(adapter.files.size).toBe(0);
    expect(index.idOf("a.md")).toBeNull();
    expect(review.isBusy("a.md")).toBe(false);
  });

  it("有 review-id 但记忆文件丢失时沿用原 id", async () => {
    index.set("a.md", "old-id");
    expect(await review.statusOf("a.md")).toBe("none");
    const m = await review.generate("a.md");
    expect(m.noteId).toBe("old-id");
  });

  it("正文变化后状态为 changed；忽略后恢复 ready", async () => {
    const m = await review.generate("a.md");
    notes.bodies.set("a.md", "## 标题\n正文改了");
    expect(await review.statusOf("a.md")).toBe("changed");
    await review.ignoreChange(m.noteId);
    expect(await review.statusOf("a.md")).toBe("ready");
    expect(store.get(m.noteId)!.schedule).toEqual(m.schedule);
  });

  it("重新生成（记忆保持）只换题目和 hash", async () => {
    const m = await review.generate("a.md");
    await review.rate(m.noteId, "good", false);
    const before = store.get(m.noteId)!;
    clock.setOverride("2026-10-05");
    notes.bodies.set("a.md", "新内容");
    const after = await review.regenerate(m.noteId, "keep");
    expect(after.schedule).toEqual(before.schedule);
    expect(after.contentHash).not.toBe(before.contentHash);
    expect(after.createdAt).toBe("2026-10-03");
    expect(after.history.at(-1)).toEqual({ date: "2026-10-05", event: "regenerate" });
  });

  it("重新生成（从头记忆）曲线归零，createdAt 不变", async () => {
    const m = await review.generate("a.md");
    await review.rate(m.noteId, "good", false);
    clock.setOverride("2026-10-08");
    const after = await review.regenerate(m.noteId, "reset");
    expect(after.schedule).toMatchObject({ level: 0, starttime: "2026-10-08", lastreviewtime: null, nextreviewtime: "2026-10-09" });
    expect(after.createdAt).toBe("2026-10-03");
    expect(after.history.at(-1)).toEqual({ date: "2026-10-08", event: "reset" });
  });

  it("反馈写入 schedule 和 history", async () => {
    const m = await review.generate("a.md");
    clock.setOverride("2026-10-04");
    const after = await review.rate(m.noteId, "good", true);
    expect(after.schedule).toMatchObject({ level: 1, nextreviewtime: "2026-10-06", memory: "good" });
    expect(after.history).toEqual([{ date: "2026-10-04", rating: "good", manual: true }]);
    // 重启后数据一致
    const reloaded = new VaultMemoryStore(adapter, () => "automem");
    await reloaded.loadAll();
    expect(reloaded.get(m.noteId)).toEqual(after);
  });

  it("源笔记删除后不能反馈", async () => {
    const m = await review.generate("a.md");
    index.remove("a.md");
    await expect(review.rate(m.noteId, "good", false)).rejects.toThrow("源笔记已被删除");
  });

  it("重复 review-id：副本显示 duplicate，且不能生成", async () => {
    const m = await review.generate("a.md");
    notes.bodies.set("copy.md", "## 标题\n正文");
    index.set("copy.md", m.noteId);
    expect(await review.statusOf("copy.md")).toBe("duplicate");
    expect(review.memoryOf("copy.md")).toBeNull();
    await expect(review.generate("copy.md")).rejects.toThrow("重复");
    expect(await review.statusOf("a.md")).toBe("ready");
  });

  it("重命名后同步 source", async () => {
    const m = await review.generate("a.md");
    index.rename("a.md", "dir/b.md");
    await review.syncSource(m.noteId, "dir/b.md");
    expect(store.get(m.noteId)!.source).toBe("dir/b.md");
  });

  it("加载时跳过损坏的记忆文件", async () => {
    await store.save(makeMemory("good"));
    adapter.files.set("automem/bad.json", "{oops");
    const report = await store.loadAll();
    expect(report.loaded).toBe(1);
    expect(report.errors).toHaveLength(1);
  });
});
