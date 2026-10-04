// NoteGateway 的 Obsidian 实现：读正文、读写 frontmatter 中的 review-id、按 noteId 找笔记。

import { TFile, type App } from "obsidian";
import { extractBody } from "../core/noteBody";
import type { NoteGateway } from "../review/ports";
import type { MemoryStore } from "../storage/MemoryStore";
import type { NoteIndex } from "./NoteIndex";

export const REVIEW_ID_KEY = "review-id";

export function readReviewId(frontmatter: Record<string, unknown> | undefined): string | null {
  const value = frontmatter?.[REVIEW_ID_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class ObsidianNoteGateway implements NoteGateway {
  constructor(
    private readonly app: App,
    private readonly index: NoteIndex,
    private readonly store: MemoryStore,
  ) {}

  file(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  exists(path: string): boolean {
    return this.file(path) !== null;
  }

  async readBody(path: string): Promise<string> {
    const file = this.file(path);
    if (!file) throw new Error(`找不到笔记：${path}`);
    return extractBody(await this.app.vault.read(file));
  }

  /** 以索引为准；索引由 metadataCache 事件维护 */
  getReviewId(path: string): string | null {
    return this.index.idOf(path);
  }

  async setReviewId(path: string, id: string): Promise<void> {
    const file = this.file(path);
    if (!file) throw new Error(`找不到笔记：${path}`);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[REVIEW_ID_KEY] = id;
    });
    this.index.set(path, id);
  }

  pathOf(noteId: string): string | null {
    return this.index.primaryPath(noteId, this.store.get(noteId)?.source);
  }
}
