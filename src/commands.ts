// 命令面板中的命令。

import { MarkdownView, Notice, type Plugin } from "obsidian";
import type { SystemClock } from "./core/clock";
import type { PushController } from "./push/PushController";
import type { ReviewActions } from "./ui/ReviewActions";
import { SimulateDateModal } from "./ui/modals";

export interface CommandDeps {
  actions: ReviewActions;
  push: PushController;
  clock: SystemClock;
  /** 模拟日期变化后刷新界面 */
  onDateChanged: () => void;
}

export function registerCommands(plugin: Plugin, deps: CommandDeps): void {
  const { actions, push, clock } = deps;

  /** 只在当前打开的是 Markdown 笔记时可用 */
  const withNote = (fn: (path: string) => void) => (checking: boolean) => {
    const path = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
    if (!path) return false;
    if (!checking) fn(path);
    return true;
  };

  plugin.addCommand({
    id: "review-current-note",
    name: "复习当前笔记",
    checkCallback: withNote((path) => void actions.openCard(path)),
  });

  plugin.addCommand({
    id: "generate-current-note",
    name: "为当前笔记生成回忆",
    checkCallback: withNote((path) => void actions.generate(path)),
  });

  plugin.addCommand({
    id: "regenerate-keep",
    name: "重新生成（记忆保持）",
    checkCallback: withNote((path) => void actions.regenerate(path, "keep")),
  });

  plugin.addCommand({
    id: "regenerate-reset",
    name: "重新生成（从头记忆）",
    checkCallback: withNote((path) => void actions.regenerate(path, "reset")),
  });

  plugin.addCommand({
    id: "open-review-queue",
    name: "打开待复习的卡片",
    callback: () => void push.openFromQueue(),
  });

  plugin.addCommand({
    id: "debug-timeline",
    name: "查看时间轴",
    checkCallback: withNote((path) => actions.showTimeline(path)),
  });

  plugin.addCommand({
    id: "debug-simulate-today",
    name: "调试：模拟今天日期",
    callback: () =>
      new SimulateDateModal(plugin.app, clock.getOverride(), (date) => {
        clock.setOverride(date);
        new Notice(date ? `已模拟今天为 ${date}` : "已恢复真实日期");
        deps.onDateChanged();
      }).open(),
  });

  plugin.addCommand({
    id: "debug-check-now",
    name: "调试：立即检查推送",
    callback: () => void push.check(),
  });
}
