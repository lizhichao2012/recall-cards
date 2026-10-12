// 复习卡片（右侧边栏视图），对应设计方案 2.2.4"卡片内容"和"卡片验收清单"。
// 只负责显示和收集操作，业务逻辑通过 CardController 交给外部处理。

import { Component, ItemView, MarkdownRenderer, type WorkspaceLeaf } from "obsidian";
import { currentRetrievability, type SchedulerConfig } from "../core/scheduler";
import type { DateStr, MemoryFile, Rating } from "../core/types";
import type { CardMode } from "../push/PushController";
import { describeRatingEffect, formatDays, noteName } from "./format";

export const CARD_VIEW_TYPE = "recall-cards-view";

export interface CardController {
  /** 提交反馈，成功返回更新后的记忆文件，失败返回 null（错误提示由实现方负责） */
  rate(noteId: string, rating: Rating, mode: CardMode): Promise<MemoryFile | null>;
  openSource(noteId: string): Promise<void>;
  sourcePath(noteId: string): string | null;
  hasNext(noteId: string): boolean;
  openNext(noteId: string): Promise<void>;
  /** 卡片未反馈就被关闭或被替换 */
  dismissed(noteId: string, mode: CardMode): void;
  scheduler(): SchedulerConfig;
  /** 今天的日期（调试时可能是模拟日期），用于推算反馈后的下次复习时间 */
  today(): DateStr;
}

const RATING_BUTTONS: { rating: Rating; label: string; hint: string }[] = [
  { rating: "forgot", label: "忘了", hint: "想不起来，或看了答案才想起来" },
  { rating: "fuzzy", label: "模糊", hint: "想起来了，但很吃力" },
  { rating: "good", label: "记得", hint: "可以正确回答问题" },
  { rating: "easy", label: "简单", hint: "轻松答出，不再推送" },
];

interface CardState {
  memory: MemoryFile;
  mode: CardMode;
  phase: "pending" | "answered";
  revealed: Set<number>;
  submitting: boolean;
}

export class CardView extends ItemView {
  private state: CardState | null = null;
  private renderScope: Component | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly controller: CardController,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "复习卡片";
  }

  override getIcon(): string {
    return "brain";
  }

  /** 是否显示着待反馈的卡片 */
  isPending(): boolean {
    return this.state?.phase === "pending";
  }

  currentNoteId(): string | null {
    return this.state?.memory.noteId ?? null;
  }

  showCard(memory: MemoryFile, mode: CardMode): void {
    const prev = this.state;
    if (prev && prev.phase === "pending") {
      if (prev.memory.noteId === memory.noteId) {
        // 同一张卡片重新打开：保留已展开的答案
        this.state = { ...prev, memory, mode };
        this.render();
        return;
      }
      this.controller.dismissed(prev.memory.noteId, prev.mode);
    }
    this.state = { memory, mode, phase: "pending", revealed: new Set(), submitting: false };
    this.render();
  }

  /** 源笔记被删除、重命名后重新渲染，更新标题和按钮可用状态 */
  rerender(): void {
    if (this.state && !this.state.submitting) this.render();
  }

  /** 记忆文件被更新（例如重新生成）时刷新内容 */
  updateMemory(memory: MemoryFile): void {
    if (this.state?.memory.noteId !== memory.noteId) return;
    const questionsChanged = this.state.memory.questions !== memory.questions;
    this.state = { ...this.state, memory, revealed: questionsChanged ? new Set() : this.state.revealed };
    this.render();
  }

  protected override async onOpen(): Promise<void> {
    this.render();
  }

  protected override async onClose(): Promise<void> {
    if (this.state?.phase === "pending") this.controller.dismissed(this.state.memory.noteId, this.state.mode);
    this.state = null;
    this.renderScope?.unload();
  }

  private render(): void {
    this.renderScope?.unload();
    this.renderScope = this.addChild(new Component());

    const root = this.contentEl;
    root.empty();
    root.addClass("recall-cards-view");

    const state = this.state;
    if (!state) {
      root.createDiv({
        cls: "recall-cards-empty",
        text: "当前没有打开的卡片。点击笔记右上角的复习图标，或点击状态栏的“待复习”打开卡片。",
      });
      return;
    }

    const { memory } = state;
    const path = this.controller.sourcePath(memory.noteId);
    this.renderHeader(root, memory, state.mode, path);

    if (!path) {
      root.createDiv({ cls: "recall-cards-warning", text: "源笔记已被删除，无法反馈。" });
    }

    const openBtn = root.createEl("button", { cls: "recall-cards-open-source", text: "打开原笔记" });
    openBtn.disabled = !path;
    openBtn.onclick = () => this.controller.openSource(memory.noteId);

    this.renderQuestions(root, state, path ?? memory.source);
    this.renderFooter(root, state, !!path);
  }

  private renderHeader(root: HTMLElement, memory: MemoryFile, mode: CardMode, path: string | null): void {
    const header = root.createDiv({ cls: "recall-cards-header" });
    header.createEl("h4", { text: noteName(path ?? memory.source) });
    const s = memory.schedule;
    const meta = header.createDiv({ cls: "recall-cards-meta" });
    meta.createSpan({ cls: "recall-cards-badge", text: mode === "push" ? "推送" : "手动" });
    const r = currentRetrievability(s, this.controller.today());
    if (s.stability === null || r === null) meta.createSpan({ text: "首次复习" });
    else {
      meta.createSpan({
        text: `记住的概率约 ${Math.round(r * 100)}%`,
        attr: { "aria-label": `记忆稳定性 ${formatDays(s.stability)} 天：过这么多天后，记住的概率降到 90%` },
      });
    }
    meta.createSpan({
      text: s.status === "mastered" ? "已进入长期记忆" : `下次复习：${s.nextreviewtime ?? "—"}`,
    });
  }

  private renderQuestions(root: HTMLElement, state: CardState, sourcePath: string): void {
    const list = root.createEl("ol", { cls: "recall-cards-questions" });
    state.memory.questions.forEach((q, i) => {
      const item = list.createEl("li", { cls: "recall-cards-question" });
      const questionEl = item.createDiv({ cls: "recall-cards-question-text" });
      void MarkdownRenderer.render(this.app, q.question, questionEl, sourcePath, this.renderScope!);

      const answerEl = item.createDiv({ cls: "recall-cards-answer" });
      void MarkdownRenderer.render(this.app, q.answer, answerEl, sourcePath, this.renderScope!);

      const toggle = item.createEl("button", { cls: "recall-cards-toggle" });
      const sync = () => {
        const shown = state.revealed.has(i);
        answerEl.toggleClass("is-hidden", !shown);
        toggle.setText(shown ? "隐藏答案" : "显示答案");
      };
      toggle.onclick = () => {
        if (state.revealed.has(i)) state.revealed.delete(i);
        else state.revealed.add(i);
        sync();
      };
      sync();
    });
  }

  private renderFooter(root: HTMLElement, state: CardState, sourceExists: boolean): void {
    const footer = root.createDiv({ cls: "recall-cards-footer" });
    const buttons = footer.createDiv({ cls: "recall-cards-ratings" });
    const enabled = state.phase === "pending" && sourceExists && !state.submitting;

    for (const { rating, label, hint } of RATING_BUTTONS) {
      // 待反馈时提示点击后的曲线变化；已反馈后档位已更新，只保留说明
      const tooltip = enabled
        ? `${hint}\n点击后：${describeRatingEffect(state.memory.schedule, rating, this.controller.today(), this.controller.scheduler())}`
        : hint;
      const btn = buttons.createEl("button", { text: label, attr: { "aria-label": tooltip } });
      btn.addClass(`recall-cards-rating-${rating}`);
      if (state.memory.schedule.memory === rating && state.phase === "answered") btn.addClass("is-selected");
      btn.disabled = !enabled;
      btn.onclick = () => this.submit(state, rating);
    }

    if (state.phase === "answered") {
      const s = state.memory.schedule;
      footer.createDiv({
        cls: "recall-cards-result",
        text: s.status === "mastered" ? "已进入长期记忆" : `下次复习：${s.nextreviewtime}`,
      });
      const noteId = state.memory.noteId;
      if (this.controller.hasNext(noteId)) {
        const next = footer.createEl("button", { cls: "mod-cta recall-cards-next", text: "下一张" });
        next.onclick = () => this.controller.openNext(noteId);
      }
    }
  }

  private async submit(state: CardState, rating: Rating): Promise<void> {
    if (state.phase !== "pending" || state.submitting) return;
    state.submitting = true;
    this.render();
    const updated = await this.controller.rate(state.memory.noteId, rating, state.mode);
    state.submitting = false;
    if (this.state !== state) return; // 提交期间卡片已被替换
    if (updated) {
      state.memory = updated;
      state.phase = "answered";
    }
    this.render();
  }
}
