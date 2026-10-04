// 监听 Obsidian 的文件事件，维护 noteId 索引，并在笔记变化时通知界面刷新。
// - metadataCache 'changed'：frontmatter 或正文变化（防抖后通知，界面重新计算 hash）
// - vault 'rename'：同步记忆文件的 source
// - vault 'delete'：从索引移除（记忆文件保留，不再推送）

import { Notice, TFile, type App, type Plugin } from "obsidian";
import type { ReviewService } from "../review/ReviewService";
import type { MemoryStore } from "../storage/MemoryStore";
import type { NoteIndex } from "./NoteIndex";
import { readReviewId } from "./ObsidianNoteGateway";

export interface WatcherCallbacks {
  /** 某篇笔记的状态可能变化（内容、review-id、路径） */
  onNoteChanged: (path: string) => void;
  /** 索引变化（重命名、删除），待复习队列可能变化 */
  onIndexChanged: () => void;
}

export class IdentityWatcher {
  private timers = new Map<string, number>();
  private warnedDuplicates = new Set<string>();

  constructor(
    private readonly app: App,
    private readonly index: NoteIndex,
    private readonly store: MemoryStore,
    private readonly review: ReviewService,
    private readonly debounceMs: () => number,
    private readonly callbacks: WatcherCallbacks,
  ) {}

  /** 全量重建索引，并用索引修正记忆文件中过期的 source */
  async rebuild(): Promise<void> {
    this.index.clear();
    for (const file of this.app.vault.getMarkdownFiles()) {
      this.index.set(file.path, this.idFromCache(file));
    }
    for (const memory of this.store.all()) {
      const path = this.index.primaryPath(memory.noteId, memory.source);
      if (path) await this.review.syncSource(memory.noteId, path);
    }
    this.warnDuplicates();
    this.callbacks.onIndexChanged();
  }

  register(plugin: Plugin): void {
    const { vault, metadataCache, workspace } = this.app;

    plugin.registerEvent(
      metadataCache.on("changed", (file, _data, cache) => {
        if (file.extension !== "md") return;
        const before = this.index.idOf(file.path);
        const after = readReviewId(cache.frontmatter);
        this.index.set(file.path, after);
        if (before !== after) {
          this.warnDuplicates();
          this.callbacks.onIndexChanged();
        }
        this.debounce(file.path);
      }),
    );

    plugin.registerEvent(
      vault.on("rename", async (file, oldPath) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        this.index.rename(oldPath, file.path);
        const id = this.index.idOf(file.path);
        // 只有记忆文件指向的那篇笔记被重命名时才同步，重复副本被重命名不影响
        if (id && this.store.get(id)?.source === oldPath) {
          await this.review.syncSource(id, file.path);
        }
        this.callbacks.onIndexChanged();
        this.callbacks.onNoteChanged(file.path);
      }),
    );

    plugin.registerEvent(
      vault.on("delete", (file) => {
        if (!(file instanceof TFile)) return;
        this.index.remove(file.path);
        this.callbacks.onIndexChanged();
      }),
    );

    // 打开笔记时也重新计算，捕获 Obsidian 关闭期间的外部修改
    plugin.registerEvent(
      workspace.on("file-open", (file) => {
        if (file) this.callbacks.onNoteChanged(file.path);
      }),
    );
  }

  dispose(): void {
    for (const t of this.timers.values()) window.clearTimeout(t);
    this.timers.clear();
  }

  private idFromCache(file: TFile): string | null {
    return readReviewId(this.app.metadataCache.getFileCache(file)?.frontmatter);
  }

  private debounce(path: string): void {
    window.clearTimeout(this.timers.get(path));
    this.timers.set(
      path,
      window.setTimeout(() => {
        this.timers.delete(path);
        this.callbacks.onNoteChanged(path);
      }, this.debounceMs()),
    );
  }

  /** 复制笔记会造成 review-id 重复。MVP 只提示，不自动处理。 */
  private warnDuplicates(): void {
    for (const { id, paths } of this.index.duplicates()) {
      if (this.warnedDuplicates.has(id)) continue;
      this.warnedDuplicates.add(id);
      new Notice(
        `以下笔记的 review-id 重复（可能是复制笔记造成的），请删除副本中的 review-id：\n${paths.join("\n")}`,
        15000,
      );
    }
  }
}
