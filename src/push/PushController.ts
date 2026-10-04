// 推送：定时检查、管理每日额度、决定打开哪张卡片。对应设计方案 2.2.4"推送时机"。
// 不依赖 Obsidian：定时器由 main.ts 每分钟调用 tick()，卡片显示通过 CardPresenter 接口完成。
//
// 规则（评审后确认的默认做法）：
// - 推送卡片点了反馈才计入额度；手动复习不计入。
// - 状态栏点击和"下一张"都算推送；额度用完时，状态栏点击按手动复习打开。
// - 推送的卡片未反馈就被关闭：不计额度，本次运行期间不再自动弹出，第二天或重启后恢复。
// - 有待反馈的卡片正在显示时，不自动推送，避免打断。

import type { Clock } from "../core/clock";
import { dueQueue, pickDue } from "../core/picker";
import { consume, remainingToday, type DailyCount } from "../core/quota";
import type { MemoryFile } from "../core/types";
import type { MemoryStore } from "../storage/MemoryStore";

export type CardMode = "push" | "manual";

export interface CardPresenter {
  /** 当前是否显示着待反馈的卡片 */
  hasPendingCard(): boolean;
  show(memory: MemoryFile, mode: CardMode): Promise<void>;
}

export interface QuotaRepository {
  get(): DailyCount | null;
  set(value: DailyCount): Promise<void>;
}

export interface PushDeps {
  store: MemoryStore;
  clock: Clock;
  settings: () => { dailyLimit: number; checkIntervalMinutes: number };
  quota: QuotaRepository;
  presenter: CardPresenter;
  /** 源笔记是否存在 */
  isAvailable: (memory: MemoryFile) => boolean;
  notify: (message: string) => void;
  /** 待复习数量可能变化时调用，用于刷新状态栏 */
  onQueueChanged: () => void;
  now?: () => number;
}

export class PushController {
  private readonly skipped = new Set<string>();
  private autoPushSuppressed = false;
  private lastCheckAt = Number.NEGATIVE_INFINITY;
  private lastDate: string | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: PushDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** 每分钟调用一次：日期变化时立即检查，否则按设置的间隔检查 */
  async tick(): Promise<void> {
    const today = this.deps.clock.today();
    if (today !== this.lastDate) {
      this.onDateChanged(today);
      await this.check();
      return;
    }
    const interval = this.deps.settings().checkIntervalMinutes * 60_000;
    if (this.now() - this.lastCheckAt >= interval) await this.check();
  }

  /** 检查并自动推送一张卡片 */
  async check(): Promise<void> {
    this.lastCheckAt = this.now();
    const today = this.deps.clock.today();
    if (today !== this.lastDate) this.onDateChanged(today);
    this.deps.onQueueChanged();

    if (this.autoPushSuppressed || this.deps.presenter.hasPendingCard()) return;
    const [first] = pickDue(this.deps.store.all(), today, this.remaining(), {
      exclude: this.skipped,
      isAvailable: this.deps.isAvailable,
    });
    if (!first) return;
    await this.deps.presenter.show(first, "push");
    this.deps.notify(`今天有 ${this.dueCount()} 张卡片待复习`);
  }

  /** 今天剩余的推送额度 */
  remaining(): number {
    return remainingToday(this.deps.quota.get(), this.deps.clock.today(), this.deps.settings().dailyLimit);
  }

  /** 全部到期卡片数（状态栏显示的 N） */
  dueCount(): number {
    return this.queue().length;
  }

  /** 点击状态栏：打开队列中的第一张 */
  async openFromQueue(): Promise<void> {
    const [first] = this.queue();
    if (!first) {
      this.deps.notify("今天没有待复习的卡片");
      return;
    }
    this.skipped.delete(first.noteId);
    await this.deps.presenter.show(first, this.remaining() > 0 ? "push" : "manual");
  }

  /** 反馈后是否显示"下一张" */
  hasNext(currentId: string): boolean {
    return this.remaining() > 0 && this.queue(currentId, true).length > 0;
  }

  async openNext(currentId: string): Promise<void> {
    if (this.remaining() <= 0) return;
    const [next] = this.queue(currentId, true);
    if (next) await this.deps.presenter.show(next, "push");
  }

  /** 卡片收到反馈后调用 */
  async onRated(noteId: string, mode: CardMode): Promise<void> {
    this.skipped.delete(noteId);
    if (mode === "push") await this.deps.quota.set(consume(this.deps.quota.get(), this.deps.clock.today()));
    this.deps.onQueueChanged();
  }

  /** 卡片未反馈就被关闭或被替换时调用 */
  onDismissed(noteId: string, mode: CardMode): void {
    if (mode !== "push") return;
    this.skipped.add(noteId);
    this.autoPushSuppressed = true;
  }

  private onDateChanged(today: string): void {
    this.lastDate = today;
    this.skipped.clear();
    this.autoPushSuppressed = false;
  }

  private queue(excludeId?: string, excludeSkipped = false): MemoryFile[] {
    const exclude = new Set(excludeSkipped ? this.skipped : []);
    if (excludeId) exclude.add(excludeId);
    return dueQueue(this.deps.store.all(), this.deps.clock.today(), {
      exclude,
      isAvailable: this.deps.isAvailable,
    });
  }
}
