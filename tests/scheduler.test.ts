import { describe, expect, it } from "vitest";
import { addDays, diffDays, isDateStr } from "../src/core/date";
import {
  applyRating,
  clampLevel,
  initSchedule,
  previewTimeline,
  resetSchedule,
} from "../src/core/scheduler";
import type { Rating, Schedule } from "../src/core/types";
import { INTERVALS } from "./helpers";

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

describe("状态变化规则表（2.2.3）", () => {
  const today = "2026-10-10";
  const base: Schedule = {
    status: "active",
    level: 2,
    starttime: "2026-10-01",
    lastreviewtime: "2026-10-06",
    nextreviewtime: "2026-10-10",
    memory: "good",
  };

  it("首次生成", () => {
    expect(initSchedule(today, INTERVALS)).toEqual({
      status: "active",
      level: 0,
      starttime: today,
      lastreviewtime: null,
      nextreviewtime: "2026-10-11",
      memory: null,
    });
  });

  it("忘了：回到第一档，从今天重新开始", () => {
    expect(applyRating(base, "forgot", today, INTERVALS)).toMatchObject({
      level: 0,
      starttime: today,
      lastreviewtime: today,
      nextreviewtime: "2026-10-11",
      status: "active",
      memory: "forgot",
    });
  });

  it("模糊：档位不变，按当前间隔再推一次", () => {
    expect(applyRating(base, "fuzzy", today, INTERVALS)).toMatchObject({
      level: 2,
      starttime: "2026-10-01",
      lastreviewtime: today,
      nextreviewtime: "2026-10-14",
      status: "active",
    });
  });

  it("记得：进入下一档", () => {
    expect(applyRating(base, "good", today, INTERVALS)).toMatchObject({
      level: 3,
      starttime: "2026-10-01",
      lastreviewtime: today,
      nextreviewtime: "2026-10-17",
      status: "active",
    });
  });

  it("简单：进入长期记忆，不再推送", () => {
    expect(applyRating(base, "easy", today, INTERVALS)).toMatchObject({
      level: 2,
      starttime: "2026-10-01",
      lastreviewtime: today,
      nextreviewtime: null,
      status: "mastered",
    });
  });

  it("重新生成（从头记忆）", () => {
    expect(resetSchedule(today, INTERVALS)).toEqual(initSchedule(today, INTERVALS));
  });

  it("mastered 的卡片手动复习后恢复 active", () => {
    const mastered = applyRating(base, "easy", today, INTERVALS);
    for (const r of ["forgot", "fuzzy", "good"] as Rating[]) {
      expect(applyRating(mastered, r, "2026-11-01", INTERVALS).status).toBe("active");
    }
    expect(applyRating(mastered, "easy", "2026-11-01", INTERVALS).status).toBe("mastered");
  });

  it("档位到 60 天后封顶", () => {
    let s: Schedule = { ...base, level: 6 };
    s = applyRating(s, "good", today, INTERVALS);
    expect(s.level).toBe(6);
    expect(s.nextreviewtime).toBe(addDays(today, 60));
  });

  it("间隔表缩短后，越界档位按最后一档计算", () => {
    const short = [1, 3];
    expect(clampLevel(5, short)).toBe(1);
    const s = applyRating({ ...base, level: 5 }, "fuzzy", today, short);
    expect(s.level).toBe(1);
    expect(s.nextreviewtime).toBe("2026-10-13");
  });
});

describe("附录：调度推演示例", () => {
  // [操作日期, 操作, level, starttime, lastreviewtime, nextreviewtime, status]
  type Op = Rating | "init" | "regenerate-keep";
  const steps: [string, Op, number, string, string | null, string | null, string][] = [
    ["2026-10-03", "init", 0, "2026-10-03", null, "2026-10-04", "active"],
    ["2026-10-04", "good", 1, "2026-10-03", "2026-10-04", "2026-10-06", "active"],
    ["2026-10-09", "good", 2, "2026-10-03", "2026-10-09", "2026-10-13", "active"],
    ["2026-10-13", "fuzzy", 2, "2026-10-03", "2026-10-13", "2026-10-17", "active"],
    ["2026-10-17", "forgot", 0, "2026-10-17", "2026-10-17", "2026-10-18", "active"],
    ["2026-10-18", "good", 1, "2026-10-17", "2026-10-18", "2026-10-20", "active"],
    ["2026-10-20", "regenerate-keep", 1, "2026-10-17", "2026-10-18", "2026-10-20", "active"],
    ["2026-10-20", "easy", 1, "2026-10-17", "2026-10-20", null, "mastered"],
    ["2026-11-15", "fuzzy", 1, "2026-10-17", "2026-11-15", "2026-11-17", "active"],
  ];

  it("逐步对得上", () => {
    let s: Schedule | null = null;
    steps.forEach(([date, op, level, start, last, next, status], i) => {
      if (op === "init") s = initSchedule(date, INTERVALS);
      else if (op === "regenerate-keep") s = { ...s! };
      else s = applyRating(s!, op, date, INTERVALS);
      expect(
        { level: s!.level, start: s!.starttime, last: s!.lastreviewtime, next: s!.nextreviewtime, status: s!.status },
        `第 ${i + 1} 步`,
      ).toEqual({ level, start, last, next, status });
    });
  });
});

describe("时间轴", () => {
  it("假设每次都点记得", () => {
    const s = initSchedule("2026-10-03", INTERVALS);
    const points = previewTimeline(s, INTERVALS, 9);
    expect(points.map((p) => p.date)).toEqual([
      "2026-10-04", // level 0
      "2026-10-06", // +2
      "2026-10-10", // +4
      "2026-10-17", // +7
      "2026-11-01", // +15
      "2026-12-01", // +30
      "2027-01-30", // +60
      "2027-03-31", // 封顶后 +60
      "2027-05-30",
    ]);
  });

  it("mastered 返回空", () => {
    const s = applyRating(initSchedule("2026-10-03", INTERVALS), "easy", "2026-10-04", INTERVALS);
    expect(previewTimeline(s, INTERVALS)).toEqual([]);
  });
});
