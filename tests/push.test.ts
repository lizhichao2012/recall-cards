// 对应 2.1"卡片推送与完成"的验证项。

import { beforeEach, describe, expect, it } from "vitest";
import { SystemClock } from "../src/core/clock";
import type { DailyCount } from "../src/core/quota";
import type { MemoryFile } from "../src/core/types";
import { PushController, type CardMode, type CardPresenter } from "../src/push/PushController";
import { VaultMemoryStore } from "../src/storage/MemoryStore";
import { MemoryAdapter, makeMemory } from "./helpers";

class FakePresenter implements CardPresenter {
  shown: { id: string; mode: CardMode }[] = [];
  pending = false;
  hasPendingCard() {
    return this.pending;
  }
  async show(m: MemoryFile, mode: CardMode) {
    this.shown.push({ id: m.noteId, mode });
    this.pending = true;
  }
}

describe("PushController", () => {
  let store: VaultMemoryStore;
  let clock: SystemClock;
  let presenter: FakePresenter;
  let quota: DailyCount | null;
  let now: number;
  let push: PushController;
  let limit: number;

  const build = () =>
    new PushController({
      store,
      clock,
      settings: () => ({ dailyLimit: limit, checkIntervalMinutes: 30 }),
      quota: { get: () => quota, set: async (q) => void (quota = q) },
      presenter,
      isAvailable: () => true,
      notify: () => {},
      onQueueChanged: () => {},
      now: () => now,
    });

  /** 模拟一次推送后点反馈 */
  const answer = async (mode: CardMode = "push") => {
    const { id } = presenter.shown.at(-1)!;
    const m = store.get(id)!;
    await store.save({ ...m, schedule: { ...m.schedule, nextreviewtime: "2026-10-20" } });
    presenter.pending = false;
    await push.onRated(id, mode);
  };

  beforeEach(async () => {
    store = new VaultMemoryStore(new MemoryAdapter(), () => "automem");
    for (const [id, next] of [
      ["a", "2026-10-06"],
      ["b", "2026-10-07"],
      ["c", "2026-10-08"],
      ["d", "2026-10-09"],
      ["e", "2026-10-10"],
    ]) {
      await store.save(makeMemory(id, { nextreviewtime: next }));
    }
    clock = new SystemClock();
    clock.setOverride("2026-10-10");
    presenter = new FakePresenter();
    quota = null;
    now = 0;
    limit = 3;
    push = build();
  });

  it("5 张到期，当天只推 3 张，顺序符合排序规则", async () => {
    expect(push.dueCount()).toBe(5);
    for (let i = 0; i < 5; i++) {
      await push.check();
      if (presenter.pending) await answer();
    }
    expect(presenter.shown.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(quota).toEqual({ date: "2026-10-10", count: 3 });
    expect(push.remaining()).toBe(0);
  });

  it("有待反馈的卡片时不再推送", async () => {
    await push.check();
    await push.check();
    expect(presenter.shown).toHaveLength(1);
  });

  it("重启后不重复计数", async () => {
    await push.check();
    await answer();
    push = build(); // 模拟重启：额度来自持久化数据
    expect(push.remaining()).toBe(2);
    await push.check();
    expect(presenter.shown.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("关闭不反馈：不消耗额度，本次运行不再自动推送，第二天恢复", async () => {
    await push.check();
    presenter.pending = false;
    push.onDismissed("a", "push");
    expect(push.remaining()).toBe(3);
    now += 31 * 60_000;
    await push.tick();
    expect(presenter.shown).toHaveLength(1);

    clock.setOverride("2026-10-11");
    await push.tick();
    expect(presenter.shown.map((s) => s.id)).toEqual(["a", "a"]);
  });

  it("手动复习不受额度限制，也不计入", async () => {
    limit = 0;
    await push.onRated("a", "manual");
    expect(quota).toBeNull();
    await push.check();
    expect(presenter.shown).toHaveLength(0);
  });

  it("状态栏点击：有额度按推送打开，额度用完按手动打开", async () => {
    await push.openFromQueue();
    expect(presenter.shown.at(-1)).toEqual({ id: "a", mode: "push" });
    quota = { date: "2026-10-10", count: 3 };
    await push.openFromQueue();
    expect(presenter.shown.at(-1)).toEqual({ id: "a", mode: "manual" });
  });

  it("反馈后有额度和到期卡片时显示下一张", async () => {
    await push.check();
    await answer();
    expect(push.hasNext("a")).toBe(true);
    await push.openNext("a");
    expect(presenter.shown.at(-1)).toEqual({ id: "b", mode: "push" });
    quota = { date: "2026-10-10", count: 3 };
    expect(push.hasNext("b")).toBe(false);
  });

  it("每 30 分钟检查一次", async () => {
    await push.tick();
    expect(presenter.shown).toHaveLength(1);
    await answer();
    now += 10 * 60_000;
    await push.tick();
    expect(presenter.shown).toHaveLength(1);
    now += 25 * 60_000;
    await push.tick();
    expect(presenter.shown).toHaveLength(2);
  });
});
