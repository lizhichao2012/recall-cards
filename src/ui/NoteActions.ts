// 笔记右上角的插件图标。对应设计方案 2.2.1"变化提示"和 2.2.4"手动复习入口"。
// 点击行为（评审后确认的默认做法）：
// - 未生成：直接生成回忆
// - 已生成：弹出菜单「打开卡片 / 重新生成（记忆保持）/ 重新生成（从头记忆）/ 忽略本次变化」
//   "忽略本次变化"只在内容变化时出现
// - review-id 重复：提示用户处理

import { MarkdownView, Menu, Notice, setIcon, type App } from "obsidian";
import type { NoteStatus, RegenerateMode, ReviewService } from "../review/ReviewService";

export interface NoteActionHandlers {
  generate(path: string): Promise<void>;
  openCard(path: string): Promise<void>;
  regenerate(path: string, mode: RegenerateMode): Promise<void>;
  ignoreChange(path: string): Promise<void>;
}

const LOOK: Record<NoteStatus | "busy", { icon: string; tooltip: string; cls?: string }> = {
  none: { icon: "brain", tooltip: "生成回忆" },
  ready: { icon: "brain", tooltip: "复习卡片", cls: "is-ready" },
  changed: { icon: "brain", tooltip: "笔记内容已变化，问题可能需要更新", cls: "is-changed" },
  duplicate: { icon: "brain", tooltip: "review-id 与另一篇笔记重复", cls: "is-changed" },
  busy: { icon: "loader", tooltip: "正在生成回忆…", cls: "is-busy" },
};

export class NoteActions {
  private buttons = new Map<MarkdownView, HTMLElement>();
  /** 每个视图的刷新序号，丢弃过期的异步结果 */
  private seq = new WeakMap<MarkdownView, number>();

  constructor(
    private readonly app: App,
    private readonly review: ReviewService,
    private readonly handlers: NoteActionHandlers,
  ) {}

  /** 给所有打开的笔记加上图标并刷新状态 */
  refreshAll(): void {
    const alive = new Set<MarkdownView>();
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView)) continue;
      alive.add(leaf.view);
      this.ensure(leaf.view);
      void this.update(leaf.view);
    }
    for (const [view, el] of this.buttons) {
      if (!alive.has(view)) {
        el.remove();
        this.buttons.delete(view);
      }
    }
  }

  refreshPath(path: string): void {
    for (const view of this.buttons.keys()) {
      if (view.file?.path === path) void this.update(view);
    }
  }

  destroy(): void {
    for (const el of this.buttons.values()) el.remove();
    this.buttons.clear();
  }

  private ensure(view: MarkdownView): void {
    if (this.buttons.has(view)) return;
    const el = view.addAction("brain", LOOK.none.tooltip, (evt) => void this.onClick(view, evt));
    el.addClass("recall-cards-note-action");
    this.buttons.set(view, el);
  }

  private async update(view: MarkdownView): Promise<void> {
    const el = this.buttons.get(view);
    const path = view.file?.path;
    if (!el || !path) return;
    const n = (this.seq.get(view) ?? 0) + 1;
    this.seq.set(view, n);

    const status = this.review.isBusy(path) ? "busy" : await this.review.statusOf(path).catch(() => "none" as const);
    if (this.seq.get(view) !== n) return;

    const look = LOOK[status];
    setIcon(el, look.icon);
    el.setAttribute("aria-label", look.tooltip);
    el.removeClass("is-ready", "is-changed", "is-busy");
    if (look.cls) el.addClass(look.cls);
  }

  private async onClick(view: MarkdownView, evt: MouseEvent): Promise<void> {
    const path = view.file?.path;
    if (!path) return;
    if (this.review.isBusy(path)) {
      new Notice("正在生成回忆，请稍候");
      return;
    }

    const status = await this.review.statusOf(path);
    if (status === "none") {
      await this.handlers.generate(path);
      return;
    }
    if (status === "duplicate") {
      new Notice("这篇笔记的 review-id 与另一篇笔记重复。如果这是复制出来的笔记，请删除它 frontmatter 中的 review-id。");
      return;
    }

    const menu = new Menu();
    menu.addItem((i) => i.setTitle("打开卡片").setIcon("layers").onClick(() => this.handlers.openCard(path)));
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("重新生成（记忆保持）").setIcon("refresh-cw").onClick(() => this.handlers.regenerate(path, "keep")),
    );
    menu.addItem((i) =>
      i.setTitle("重新生成（从头记忆）").setIcon("rotate-ccw").onClick(() => this.handlers.regenerate(path, "reset")),
    );
    if (status === "changed") {
      menu.addItem((i) => i.setTitle("忽略本次变化").setIcon("check").onClick(() => this.handlers.ignoreChange(path)));
    }
    menu.showAtMouseEvent(evt);
  }
}
