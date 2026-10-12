import { describe, expect, it } from "vitest";
import { applyRating, initSchedule } from "../src/core/scheduler";
import type { Schedule } from "../src/core/types";
import { describeRatingEffect, formatDays } from "../src/ui/format";
import { SCHEDULER } from "./helpers";

const today = "2026-10-10";
const reviewed: Schedule = {
  ...initSchedule("2026-09-01"),
  lastreviewtime: "2026-10-01",
  nextreviewtime: today,
  stability: 9,
  difficulty: 5,
};

describe("反馈按钮的曲线变化提示", () => {
  it("新卡片：显示下次复习日期和初始稳定性", () => {
    const fresh = initSchedule("2026-10-09");
    expect(describeRatingEffect(fresh, "good", today, SCHEDULER)).toBe("3 天后（2026-10-13）复习；记忆稳定性 2.3 天");
    expect(describeRatingEffect(fresh, "forgot", today, SCHEDULER)).toBe("1 天后（2026-10-11）复习；记忆稳定性 0.2 天");
  });

  it("已复习过：显示稳定性的变化，和实际调度一致", () => {
    for (const r of ["forgot", "fuzzy", "good"] as const) {
      const next = applyRating(reviewed, r, today, SCHEDULER);
      expect(describeRatingEffect(reviewed, r, today, SCHEDULER)).toContain(`（${next.nextreviewtime}）复习`);
      expect(describeRatingEffect(reviewed, r, today, SCHEDULER)).toContain(
        `记忆稳定性 9.0 → ${formatDays(next.stability!)} 天`,
      );
    }
  });

  it("简单：不再推送", () => {
    expect(describeRatingEffect(reviewed, "easy", today, SCHEDULER)).toBe("进入长期记忆，不再推送");
  });

  it("已进入长期记忆的卡片手动复习后恢复推送", () => {
    const mastered: Schedule = { ...reviewed, status: "mastered", nextreviewtime: null };
    expect(describeRatingEffect(mastered, "fuzzy", today, SCHEDULER)).toMatch(/^恢复推送，\d+ 天后/);
  });

  it("天数格式：10 天以内保留一位小数", () => {
    expect(formatDays(2.3065)).toBe("2.3");
    expect(formatDays(18.17)).toBe("18");
  });
});
