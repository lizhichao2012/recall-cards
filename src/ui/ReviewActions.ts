// 用户操作的入口：图标菜单、命令、卡片按钮都调用这里。
// 负责把 ReviewService / PushController 的结果转成提示，并通知界面刷新。

import { Notice, TFile, type App } from "obsidian";
import type { Clock } from "../core/clock";
import type { SchedulerConfig } from "../core/scheduler";
import type { DateStr, Rating, MemoryFile } from "../core/types";
import { previewTimeline } from "../core/scheduler";
import type { CardMode, PushController } from "../push/PushController";
import type { NoteGateway } from "../review/ports";
import type { RegenerateMode, ReviewService } from "../review/ReviewService";
import type { CardPanel } from "./CardPanel";
import type { CardController } from "./CardView";
import type { NoteActionHandlers } from "./NoteActions";
import { noteName } from "./format";
import { TimelineModal } from "./modals";

export interface ReviewActionsDeps {
  app: App;
  review: ReviewService;
  push: PushController;
  cards: CardPanel;
  notes: NoteGateway;
  scheduler: () => SchedulerConfig;
  clock: Clock;
  /** 记忆文件或笔记状态变化后刷新界面 */
  onChanged: (path?: string) => void;
}

export class ReviewActions implements NoteActionHandlers, CardController {
  constructor(private readonly deps: ReviewActionsDeps) {}

  // ---- 笔记图标菜单 / 命令 ----

  async generate(path: string): Promise<void> {
    const notice = new Notice("正在生成回忆…", 0);
    try {
      const pending = this.deps.review.generate(path);
      this.deps.onChanged(path); // 进入"生成中"状态后刷新图标
      const memory = await pending;
      new Notice(`已生成 ${memory.questions.length} 道题，首次复习：${memory.schedule.nextreviewtime}`);
    } catch (e) {
      this.fail("生成失败", e);
    } finally {
      notice.hide();
      this.deps.onChanged(path);
    }
  }

  async openCard(path: string): Promise<void> {
    const memory = this.deps.review.memoryOf(path);
    if (!memory) {
      new Notice("这篇笔记还没有生成回忆");
      return;
    }
    await this.deps.cards.show(memory, "manual");
  }

  async regenerate(path: string, mode: RegenerateMode): Promise<void> {
    const memory = this.deps.review.memoryOf(path);
    if (!memory) {
      new Notice("这篇笔记还没有生成回忆");
      return;
    }
    const notice = new Notice("正在重新生成…", 0);
    try {
      const pending = this.deps.review.regenerate(memory.noteId, mode);
      this.deps.onChanged(path);
      const updated = await pending;
      this.deps.cards.refresh(updated);
      new Notice(mode === "reset" ? "已重新生成，记忆曲线已归零" : "已重新生成，复习进度不变");
    } catch (e) {
      this.fail("重新生成失败", e);
    } finally {
      notice.hide();
      this.deps.onChanged(path);
    }
  }

  async ignoreChange(path: string): Promise<void> {
    const memory = this.deps.review.memoryOf(path);
    if (!memory) return;
    try {
      await this.deps.review.ignoreChange(memory.noteId);
    } catch (e) {
      this.fail("操作失败", e);
    }
    this.deps.onChanged(path);
  }

  showTimeline(path: string): void {
    const memory = this.deps.review.memoryOf(path);
    if (!memory) {
      new Notice("这篇笔记还没有生成回忆");
      return;
    }
    const points = previewTimeline(memory.schedule, this.deps.scheduler());
    new TimelineModal(this.deps.app, noteName(path), points).open();
  }

  // ---- 卡片 ----

  async rate(noteId: string, rating: Rating, mode: CardMode): Promise<MemoryFile | null> {
    try {
      const updated = await this.deps.review.rate(noteId, rating, mode === "manual");
      await this.deps.push.onRated(noteId, mode);
      return updated;
    } catch (e) {
      this.fail("保存反馈失败", e);
      return null;
    }
  }

  async openSource(noteId: string): Promise<void> {
    const path = this.deps.notes.pathOf(noteId);
    const file = path ? this.deps.app.vault.getAbstractFileByPath(path) : null;
    if (!(file instanceof TFile)) {
      new Notice("源笔记已被删除");
      return;
    }
    const { workspace } = this.deps.app;
    // 在主编辑区打开，卡片留在侧边栏；MVP 跳到笔记开头
    const leaf = workspace.getMostRecentLeaf(workspace.rootSplit) ?? workspace.getLeaf("tab");
    await leaf.openFile(file, { eState: { line: 0 } });
  }

  sourcePath(noteId: string): string | null {
    return this.deps.notes.pathOf(noteId);
  }

  hasNext(noteId: string): boolean {
    return this.deps.push.hasNext(noteId);
  }

  openNext(noteId: string): Promise<void> {
    return this.deps.push.openNext(noteId);
  }

  dismissed(noteId: string, mode: CardMode): void {
    this.deps.push.onDismissed(noteId, mode);
  }

  scheduler(): SchedulerConfig {
    return this.deps.scheduler();
  }

  today(): DateStr {
    return this.deps.clock.today();
  }

  private fail(title: string, e: unknown): void {
    console.error("[recall-cards]", title, e);
    new Notice(`${title}：${e instanceof Error ? e.message : String(e)}`, 8000);
  }
}
