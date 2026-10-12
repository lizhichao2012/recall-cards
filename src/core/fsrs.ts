// FSRS-6 记忆模型：纯数学，不涉及日期和记忆文件。对应设计方案第六节。
// 公式、默认参数和间隔规则与 open-spaced-repetition/ts-fsrs 5.4.2 的长期调度器一致
// （enable_short_term: false，不加随机扰动），tests/fsrs.test.ts 用 ts-fsrs 逐步比对结果。
// 时间单位是"天"：插件只按天调度，没有分钟级的学习步骤。
// 同一天内再次复习时 R = 100%：点"记得"稳定性不变，点"忘了"按遗忘公式降低。

/** 反馈对应的 FSRS 评分：1 Again / 2 Hard / 3 Good / 4 Easy */
export type Grade = 1 | 2 | 3 | 4;

export interface MemoryState {
  /** 稳定性：记住的概率降到 90% 所需的天数 */
  stability: number;
  /** 难度：1～10 */
  difficulty: number;
}

/** FSRS-6 默认参数 w0～w20 */
export const DEFAULT_WEIGHTS: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614,
  0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

const W = DEFAULT_WEIGHTS;
const S_MIN = 0.001;
const S_MAX = 36500;
const DECAY = -W[20];
/** 使 R(t = S) = 90% 的系数 */
const FACTOR = roundTo(Math.exp(Math.log(0.9) / DECAY) - 1, 8);

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** 距上次复习 elapsedDays 天时，记住的概率 */
export function retrievability(elapsedDays: number, stability: number): number {
  return roundTo(Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY), 8);
}

function initDifficulty(g: Grade): number {
  return roundTo(W[4] - Math.exp((g - 1) * W[5]) + 1, 8);
}

function nextDifficulty(d: number, g: Grade): number {
  const delta = -W[6] * (g - 3);
  const damped = d + roundTo((delta * (10 - d)) / 9, 8);
  // 向"简单"的初始难度回归，避免难度一直累积
  const reverted = roundTo(W[7] * initDifficulty(4) + (1 - W[7]) * damped, 8);
  return clamp(reverted, 1, 10);
}

function recallStability(d: number, s: number, r: number, g: Grade): number {
  const hardPenalty = g === 2 ? W[15] : 1;
  const easyBonus = g === 4 ? W[16] : 1;
  const inc =
    Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hardPenalty * easyBonus;
  return roundTo(clamp(s * (1 + inc), S_MIN, S_MAX), 8);
}

function forgetStability(d: number, s: number, r: number): number {
  const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
  // 忘记后的稳定性不超过原来的值
  return clamp(s, S_MIN, roundTo(clamp(sf, S_MIN, S_MAX), 8));
}

/**
 * 一次复习后的记忆状态。
 * state 为 null 表示从未复习过的新卡片；elapsedDays 是距上次复习的天数。
 */
export function nextState(state: MemoryState | null, elapsedDays: number, g: Grade): MemoryState {
  if (!state) {
    return { stability: Math.max(W[g - 1], 0.1), difficulty: clamp(initDifficulty(g), 1, 10) };
  }
  const { stability: s, difficulty: d } = state;
  const r = retrievability(Math.max(0, elapsedDays), s);
  const stability = g === 1 ? forgetStability(d, s, r) : recallStability(d, s, r, g);
  return { stability, difficulty: nextDifficulty(d, g) };
}

export interface IntervalOptions {
  /** 目标记忆保持率：到期时希望还能记住的概率，例如 0.9 */
  desiredRetention: number;
  /** 最长间隔（天） */
  maximumInterval: number;
}

/** 记住的概率降到目标保持率所需的天数，至少 1 天 */
export function intervalFor(stability: number, options: IntervalOptions): number {
  const modifier = roundTo((Math.pow(options.desiredRetention, 1 / DECAY) - 1) / FACTOR, 8);
  return Math.min(Math.max(1, Math.round(stability * modifier)), options.maximumInterval);
}

export interface GradeOutcome {
  state: MemoryState;
  /** 下次复习距今的天数 */
  interval: number;
}

/**
 * 四种评分各自的结果。间隔保证 Again ≤ Hard < Good < Easy，
 * 否则新卡片或稳定性很低时，几个按钮可能给出同样的间隔。
 */
export function outcomes(
  state: MemoryState | null,
  elapsedDays: number,
  options: IntervalOptions,
): Record<Grade, GradeOutcome> {
  const states = ([1, 2, 3, 4] as const).map((g) => nextState(state, elapsedDays, g));
  const [again, hard, good, easy] = states.map((s) => intervalFor(s.stability, options));
  const a = Math.min(again, hard);
  const h = Math.max(hard, a + 1);
  const g = Math.max(good, h + 1);
  const e = Math.max(easy, g + 1);
  const cap = (n: number) => Math.min(n, options.maximumInterval);
  return {
    1: { state: states[0], interval: cap(a) },
    2: { state: states[1], interval: cap(h) },
    3: { state: states[2], interval: cap(g) },
    4: { state: states[3], interval: cap(e) },
  };
}
