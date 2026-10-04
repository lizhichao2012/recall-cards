// CardPresenter 的实现：负责在右侧边栏找到或创建卡片视图。
// 如果以后要改回弹窗，替换这个类和 CardView 即可，PushController 不需要改。

import type { App } from "obsidian";
import type { MemoryFile } from "../core/types";
import type { CardMode, CardPresenter } from "../push/PushController";
import { CARD_VIEW_TYPE, CardView } from "./CardView";

export class CardPanel implements CardPresenter {
  constructor(private readonly app: App) {}

  private view(): CardView | null {
    for (const leaf of this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)) {
      if (leaf.view instanceof CardView) return leaf.view;
    }
    return null;
  }

  hasPendingCard(): boolean {
    return this.view()?.isPending() ?? false;
  }

  async show(memory: MemoryFile, mode: CardMode): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(CARD_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      const created = workspace.getRightLeaf(false);
      if (!created) return;
      await created.setViewState({ type: CARD_VIEW_TYPE, active: true });
      leaf = created;
    }
    await leaf.loadIfDeferred();
    await workspace.revealLeaf(leaf);
    if (leaf.view instanceof CardView) leaf.view.showCard(memory, mode);
  }

  /** 记忆文件更新后，如果卡片正在显示它，同步刷新 */
  refresh(memory: MemoryFile): void {
    this.view()?.updateMemory(memory);
  }
}
