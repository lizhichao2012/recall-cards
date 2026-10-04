import { describe, expect, it } from "vitest";
import { dueQueue, pickDue } from "../src/core/picker";
import { consume, remainingToday, usedToday } from "../src/core/quota";
import { makeMemory } from "./helpers";

const today = "2026-10-10";

describe("pickDue", () => {
  const all = [
    makeMemory("e", { nextreviewtime: "2026-10-10", starttime: "2026-10-01" }),
    makeMemory("d", { nextreviewtime: "2026-10-10", starttime: "2026-10-01" }),
    makeMemory("c", { nextreviewtime: "2026-10-10", starttime: "2026-09-01" }),
    makeMemory("b", { nextreviewtime: "2026-10-08" }),
    makeMemory("a", { nextreviewtime: "2026-10-05" }),
    makeMemory("future", { nextreviewtime: "2026-10-11" }),
    makeMemory("mastered", { status: "mastered", nextreviewtime: null }),
  ];

  it("逾期越久越靠前 → starttime 早的优先 → noteId", () => {
    expect(dueQueue(all, today).map((m) => m.noteId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("只取剩余额度张数", () => {
    expect(pickDue(all, today, 3).map((m) => m.noteId)).toEqual(["a", "b", "c"]);
    expect(pickDue(all, today, 0)).toEqual([]);
  });

  it("排除源笔记不存在的和本次跳过的", () => {
    const picked = pickDue(all, today, 3, {
      exclude: new Set(["a"]),
      isAvailable: (m) => m.noteId !== "b",
    });
    expect(picked.map((m) => m.noteId)).toEqual(["c", "d", "e"]);
  });

  it("没被选中的卡片第二天继续参与，且排在新到期的前面", () => {
    const next = [...all, makeMemory("new", { nextreviewtime: "2026-10-11" })];
    expect(pickDue(next, "2026-10-11", 3).map((m) => m.noteId)).toEqual(["a", "b", "c"]);
  });
});

describe("每日额度", () => {
  it("按日期计数，换日后清零", () => {
    let q = consume(null, today);
    q = consume(q, today);
    expect(usedToday(q, today)).toBe(2);
    expect(remainingToday(q, today, 3)).toBe(1);
    expect(remainingToday(q, "2026-10-11", 3)).toBe(3);
    expect(consume(q, "2026-10-11")).toEqual({ date: "2026-10-11", count: 1 });
    expect(remainingToday({ date: today, count: 5 }, today, 3)).toBe(0);
  });
});
