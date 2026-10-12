// 用 ts-fsrs（开发依赖，只在测试中使用）逐步比对 FSRS 实现：同样的复习序列，
// 稳定性、难度和到期日都应该一致。
import { describe, expect, it } from "vitest";
import { createEmptyCard, fsrs, type Card, type Grade as TsGrade } from "ts-fsrs";
import { addDays } from "../src/core/date";
import { DEFAULT_WEIGHTS, intervalFor, nextState, outcomes, retrievability } from "../src/core/fsrs";
import { applyRating, GRADE_OF, initSchedule, type SchedulerConfig } from "../src/core/scheduler";
import type { Rating, Schedule } from "../src/core/types";

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const dateOf = (d: Date) => d.toISOString().slice(0, 10);

/** 可复现的伪随机数 */
function prng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

const RATINGS: Rating[] = ["forgot", "fuzzy", "good", "easy"];

describe("FSRS 与 ts-fsrs 一致", () => {
  const configs: SchedulerConfig[] = [
    { desiredRetention: 0.9, maximumInterval: 36500 },
    { desiredRetention: 0.8, maximumInterval: 365 },
    { desiredRetention: 0.95, maximumInterval: 120 },
  ];

  for (const config of configs) {
    it(`随机复习序列（保持率 ${config.desiredRetention}，最长 ${config.maximumInterval} 天）`, () => {
      const scheduler = fsrs({
        enable_short_term: false,
        enable_fuzz: false,
        request_retention: config.desiredRetention,
        maximum_interval: config.maximumInterval,
      });
      const rand = prng(Math.round(config.desiredRetention * 1000));

      for (let seq = 0; seq < 200; seq++) {
        let date = "2026-10-03";
        let ours: Schedule = initSchedule(date);
        let theirs: Card = createEmptyCard(utc(date));
        date = ours.nextreviewtime!;

        for (let step = 0; step < 12; step++) {
          const rating = RATINGS[Math.floor(rand() * 4)];
          ours = applyRating(ours, rating, date, config);
          theirs = scheduler.next(theirs, utc(date), GRADE_OF[rating] as TsGrade).card;

          const where = `序列 ${seq} 第 ${step + 1} 步（${date} ${rating}）`;
          expect(ours.stability, where).toBeCloseTo(theirs.stability, 6);
          expect(ours.difficulty, where).toBeCloseTo(theirs.difficulty, 6);
          // "简单"在插件里不再推送，ts-fsrs 照常排期；其余情况到期日一致。
          // 唯一的差别：ts-fsrs 为保证各按钮间隔递增，可能超出最长间隔 1～2 天，插件严格封顶。
          if (rating !== "easy") {
            const interval = Math.min(theirs.scheduled_days, config.maximumInterval);
            expect(ours.nextreviewtime, where).toBe(addDays(date, interval));
            if (interval === theirs.scheduled_days) expect(ours.nextreviewtime, where).toBe(dateOf(theirs.due));
          }

          // 下次复习：提前、按时、推迟都覆盖到，也包括同一天再复习
          const scheduled = Math.max(1, theirs.scheduled_days);
          date = addDays(date, Math.floor(rand() * 2 * scheduled));
        }
      }
    });
  }
});

describe("FSRS 记忆模型", () => {
  it("使用 FSRS-6 的 21 个默认参数", () => {
    expect(DEFAULT_WEIGHTS).toHaveLength(21);
  });

  it("稳定性的含义：过了 S 天，记住的概率降到 90%", () => {
    expect(retrievability(0, 10)).toBe(1);
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 6);
    expect(retrievability(30, 10)).toBeLessThan(0.9);
  });

  it("目标保持率 90% 时，间隔等于稳定性；保持率越高，间隔越短", () => {
    const opts = (desiredRetention: number) => ({ desiredRetention, maximumInterval: 36500 });
    expect(intervalFor(20, opts(0.9))).toBe(20);
    expect(intervalFor(20, opts(0.95))).toBeLessThan(20);
    expect(intervalFor(20, opts(0.8))).toBeGreaterThan(20);
    expect(intervalFor(0.2, opts(0.9))).toBe(1);
    expect(intervalFor(1000, { desiredRetention: 0.9, maximumInterval: 365 })).toBe(365);
  });

  it("新卡片：忘了 < 模糊 < 记得 < 简单", () => {
    const o = outcomes(null, 0, { desiredRetention: 0.9, maximumInterval: 36500 });
    expect([o[1].interval, o[2].interval, o[3].interval, o[4].interval]).toEqual([1, 2, 3, 8]);
  });

  it("同一天再复习：记得不增加稳定性，忘了降低稳定性", () => {
    const state = { stability: 20, difficulty: 5 };
    expect(nextState(state, 0, 3).stability).toBe(20);
    expect(nextState(state, 0, 1).stability).toBeLessThan(20);
  });

  it("推迟越久，答对后稳定性涨得越多", () => {
    const state = { stability: 10, difficulty: 5 };
    const early = nextState(state, 3, 3).stability;
    const onTime = nextState(state, 10, 3).stability;
    const late = nextState(state, 30, 3).stability;
    expect(early).toBeLessThan(onTime);
    expect(onTime).toBeLessThan(late);
  });
});
