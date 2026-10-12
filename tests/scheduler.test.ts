import { describe, expect, it } from "vitest";
import { addDays, diffDays, isDateStr } from "../src/core/date";
import {
  applyRating,
  currentRetrievability,
  initSchedule,
  previewTimeline,
  resetSchedule,
  stateFromHistory,
} from "../src/core/scheduler";
import type { HistoryEntry, Rating, Schedule } from "../src/core/types";
import { SCHEDULER } from "./helpers";

describe("date", () => {
  it("加减天数跨月跨年", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(diffDays("2026-10-03", "2026-12-02")).toBe(60);
  });

  it("校验日期格式", () => {
    expect(isDateStr("2026-10-03")).toBe(true);
    expect(isDateStr("2026-02-30")).toBe(false);
    expect(isDateStr("2026-1-3")).toBe(false);
    expect(isDateStr(null)).toBe(false);
  });
});

describe("状态变化规则（第六节）", () => {
  const today = "2026-10-10";
  // 上次 10-01 复习，稳定性 9 天，今天正好接近到期
  const base: Schedule = {
    status: "active",
    starttime: "2026-09-20",
    lastreviewtime: "2026-10-01",
    nextreviewtime: "2026-10-10",
    memory: "good",
    stability: 9,
    difficulty: 5,
  };
  const next = (r: Rating, s: Schedule = base) => applyRating(s, r, today, SCHEDULER);
  const gap = (s: Schedule) => diffDays(today, s.nextreviewtime!);

  it("首次生成：没有记忆状态，第二天第一次复习", () => {
    expect(initSchedule(today)).toEqual({
      status: "active",
      starttime: today,
      lastreviewtime: null,
      nextreviewtime: "2026-10-11",
      memory: null,
      stability: null,
      difficulty: null,
    });
  });

  it("每次反馈都更新 lastreviewtime、memory 和记忆状态，starttime 不变", () => {
    for (const r of ["forgot", "fuzzy", "good", "easy"] as Rating[]) {
      const s = next(r);
      expect(s).toMatchObject({ starttime: base.starttime, lastreviewtime: today, memory: r });
      expect(s.stability).toBeGreaterThan(0);
      expect(s.difficulty).toBeGreaterThanOrEqual(1);
    }
  });

  it("忘了：稳定性降低，难度升高，很快再复习", () => {
    const s = next("forgot");
    expect(s.status).toBe("active");
    expect(s.stability!).toBeLessThan(base.stability!);
    expect(s.difficulty!).toBeGreaterThan(base.difficulty!);
    expect(gap(s)).toBeLessThan(base.stability!);
  });

  it("间隔：忘了 < 模糊 < 记得", () => {
    const [f, z, g] = (["forgot", "fuzzy", "good"] as Rating[]).map((r) => gap(next(r)));
    expect(f).toBeLessThan(z);
    expect(z).toBeLessThan(g);
  });

  it("记得：稳定性增加，难度基本不变", () => {
    const s = next("good");
    expect(s.stability!).toBeGreaterThan(base.stability!);
    expect(s.difficulty!).toBeCloseTo(base.difficulty!, 1);
  });

  it("简单：进入长期记忆，不再推送", () => {
    expect(next("easy")).toMatchObject({ status: "mastered", nextreviewtime: null });
  });

  it("重新生成（从头记忆）：记忆状态清空", () => {
    expect(resetSchedule(today)).toEqual(initSchedule(today));
  });

  it("mastered 的卡片手动复习后恢复 active", () => {
    const mastered = next("easy");
    for (const r of ["forgot", "fuzzy", "good"] as Rating[]) {
      expect(applyRating(mastered, r, "2026-11-01", SCHEDULER).status).toBe("active");
    }
    expect(applyRating(mastered, "easy", "2026-11-01", SCHEDULER).status).toBe("mastered");
  });

  it("提前复习时稳定性涨得少，推迟复习时涨得多", () => {
    const early = applyRating(base, "good", "2026-10-03", SCHEDULER).stability!;
    const onTime = next("good").stability!;
    const late = applyRating(base, "good", "2026-10-30", SCHEDULER).stability!;
    expect(early).toBeLessThan(onTime);
    expect(onTime).toBeLessThan(late);
  });

  it("间隔不超过最长间隔", () => {
    const strong = { ...base, stability: 2000, lastreviewtime: "2021-01-01" };
    const s = applyRating(strong, "good", today, { desiredRetention: 0.9, maximumInterval: 180 });
    expect(s.nextreviewtime).toBe(addDays(today, 180));
  });

  it("模拟日期早于上次复习时，按同一天处理", () => {
    expect(applyRating(base, "good", "2026-09-25", SCHEDULER).stability).toBe(base.stability);
  });

  it("今天记住的概率", () => {
    expect(currentRetrievability(initSchedule(today), today)).toBeNull();
    expect(currentRetrievability(base, "2026-10-01")).toBe(1);
    expect(currentRetrievability(base, addDays("2026-10-01", 9))).toBeCloseTo(0.9, 6);
  });
});

describe("按复习记录重放记忆状态", () => {
  it("和逐次反馈的结果一致；reset 之后从新卡片开始，regenerate 不影响", () => {
    const ops: [string, Rating | "reset" | "regenerate"][] = [
      ["2026-10-04", "good"],
      ["2026-10-09", "fuzzy"],
      ["2026-10-09", "regenerate"],
      ["2026-10-20", "forgot"],
      ["2026-10-25", "reset"],
      ["2026-10-26", "good"],
      ["2026-10-29", "good"],
    ];
    let s = initSchedule("2026-10-03");
    const history: HistoryEntry[] = [];
    for (const [date, op] of ops) {
      if (op === "reset") s = resetSchedule(date);
      if (op === "reset" || op === "regenerate") history.push({ date, event: op });
      else {
        s = applyRating(s, op, date, SCHEDULER);
        history.push({ date, rating: op, manual: false });
      }
      expect(stateFromHistory(history), `${date} ${op}`).toEqual(
        s.stability === null ? null : { stability: s.stability, difficulty: s.difficulty },
      );
    }
  });

  it("没有复习记录时是新卡片", () => {
    expect(stateFromHistory([])).toBeNull();
  });
});

describe("附录：调度推演示例", () => {
  // [操作日期, 操作, stability, difficulty, lastreviewtime, nextreviewtime, status]
  type Op = Rating | "init" | "regenerate-keep";
  const steps: [string, Op, number | null, number | null, string | null, string | null, string][] = [
    ["2026-10-03", "init", null, null, null, "2026-10-04", "active"],
    ["2026-10-04", "good", 2.31, 2.12, "2026-10-04", "2026-10-07", "active"],
    ["2026-10-09", "good", 18.17, 2.11, "2026-10-09", "2026-10-27", "active"],
    ["2026-10-27", "fuzzy", 50.23, 4.75, "2026-10-27", "2026-12-16", "active"],
    ["2026-12-16", "forgot", 2.88, 8.26, "2026-12-16", "2026-12-19", "active"],
    ["2026-12-19", "good", 6.55, 8.25, "2026-12-19", "2026-12-26", "active"],
    ["2026-12-19", "regenerate-keep", 6.55, 8.25, "2026-12-19", "2026-12-26", "active"],
    ["2026-12-26", "easy", 20.51, 7.65, "2026-12-26", null, "mastered"],
    ["2027-03-01", "fuzzy", 47.93, 8.42, "2027-03-01", "2027-04-18", "active"],
    ["2027-04-18", "good", 82.91, 8.41, "2027-04-18", "2027-07-10", "active"],
    ["2027-04-18", "forgot", 2.87, 9.46, "2027-04-18", "2027-04-21", "active"],
  ];
  const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

  it("逐步对得上", () => {
    let s: Schedule | null = null;
    steps.forEach(([date, op, stability, difficulty, last, next, status], i) => {
      if (op === "init") s = initSchedule(date);
      else if (op === "regenerate-keep") s = { ...s! };
      else s = applyRating(s!, op, date, SCHEDULER);
      expect(
        {
          stability: round(s!.stability),
          difficulty: round(s!.difficulty),
          last: s!.lastreviewtime,
          next: s!.nextreviewtime,
          status: s!.status,
          start: s!.starttime,
        },
        `第 ${i + 1} 步`,
      ).toEqual({ stability, difficulty, last, next, status, start: "2026-10-03" });
    });
  });
});

describe("时间轴", () => {
  it("假设每次都在到期当天点记得，间隔逐渐拉长，到最长间隔封顶", () => {
    const points = previewTimeline(initSchedule("2026-10-03"), SCHEDULER, 7);
    expect(points.map((p) => p.gap)).toEqual([1, 3, 14, 57, 196, 365, 365]);
    expect(points[0].date).toBe("2026-10-04");
    points.slice(1).forEach((p, i) => expect(diffDays(points[i].date, p.date)).toBe(p.gap));
  });

  it("目标保持率越高，复习越频繁", () => {
    const at = (desiredRetention: number) =>
      previewTimeline(initSchedule("2026-10-03"), { desiredRetention, maximumInterval: 365 }, 4).map((p) => p.gap);
    expect(at(0.95)[3]).toBeLessThan(at(0.9)[3]);
    expect(at(0.8)[3]).toBeGreaterThan(at(0.9)[3]);
  });

  it("mastered 返回空", () => {
    const s = applyRating(initSchedule("2026-10-03"), "easy", "2026-10-04", SCHEDULER);
    expect(previewTimeline(s, SCHEDULER)).toEqual([]);
  });
});
