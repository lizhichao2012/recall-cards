import { describe, expect, it } from "vitest";
import { initSchedule } from "../src/core/scheduler";
import type { Schedule } from "../src/core/types";
import { describeRatingEffect } from "../src/ui/format";

import { INTERVALS } from "./helpers";
const today = "2026-10-10";
const at = (level: number, status: Schedule["status"] = "active"): Schedule => ({
  ...initSchedule("2026-09-01", INTERVALS),
  level,
  status,
  nextreviewtime: status === "mastered" ? null : today,
});

describe("反馈按钮的曲线变化提示", () => {
  it("忘了：曲线归零", () => {
    expect(describeRatingEffect(at(3), "forgot", today, INTERVALS)).toBe(
      "记忆曲线归零，回到第 1 档，1 天后（2026-10-11）复习",
    );
  });

  it("模糊：保持当前档", () => {
    expect(describeRatingEffect(at(3), "fuzzy", today, INTERVALS)).toBe("保持第 4 档，7 天后（2026-10-17）复习");
  });

  it("记得：升一档；最高档时保持", () => {
    expect(describeRatingEffect(at(3), "good", today, INTERVALS)).toBe("升到第 5 档，15 天后（2026-10-25）复习");
    expect(describeRatingEffect(at(6), "good", today, INTERVALS)).toBe(
      "已是最高档，保持第 7 档，60 天后（2026-12-09）复习",
    );
  });

  it("简单：不再推送", () => {
    expect(describeRatingEffect(at(3), "easy", today, INTERVALS)).toBe("进入长期记忆，不再推送");
  });

  it("已进入长期记忆的卡片手动复习后恢复推送", () => {
    expect(describeRatingEffect(at(2, "mastered"), "fuzzy", today, INTERVALS)).toBe(
      "恢复推送，保持第 3 档，4 天后（2026-10-14）复习",
    );
  });
});
