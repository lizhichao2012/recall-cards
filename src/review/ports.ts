// ReviewService 依赖的外部能力。插件里由 Obsidian 适配器实现，测试里用假实现。

export interface NoteGateway {
  exists(path: string): boolean;
  /** 读取正文（不含 frontmatter） */
  readBody(path: string): Promise<string>;
  getReviewId(path: string): string | null;
  setReviewId(path: string, id: string): Promise<void>;
  /** noteId 对应的源笔记路径；笔记已删除时返回 null */
  pathOf(noteId: string): string | null;
}

export interface ReviewSettings {
  intervals: readonly number[];
}
