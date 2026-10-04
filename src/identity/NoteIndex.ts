// noteId → 笔记路径的索引。纯数据结构，由 Obsidian 事件驱动更新。
// 笔记身份以 frontmatter 的 review-id 为准，记忆文件里的 source 只是缓存。

export class NoteIndex {
  private idByPath = new Map<string, string>();
  private pathsById = new Map<string, Set<string>>();

  clear(): void {
    this.idByPath.clear();
    this.pathsById.clear();
  }

  /** 设置某个路径的 review-id；id 为 null 表示这篇笔记没有 review-id */
  set(path: string, id: string | null): void {
    this.remove(path);
    if (!id) return;
    this.idByPath.set(path, id);
    let paths = this.pathsById.get(id);
    if (!paths) this.pathsById.set(id, (paths = new Set()));
    paths.add(path);
  }

  remove(path: string): void {
    const id = this.idByPath.get(path);
    if (!id) return;
    this.idByPath.delete(path);
    const paths = this.pathsById.get(id);
    paths?.delete(path);
    if (paths?.size === 0) this.pathsById.delete(id);
  }

  rename(oldPath: string, newPath: string): void {
    const id = this.idByPath.get(oldPath) ?? null;
    this.remove(oldPath);
    this.set(newPath, id);
  }

  idOf(path: string): string | null {
    return this.idByPath.get(path) ?? null;
  }

  pathsOf(id: string): string[] {
    return [...(this.pathsById.get(id) ?? [])].sort();
  }

  /**
   * 主路径：有多篇笔记使用同一个 id（复制笔记造成）时，优先取记忆文件 source 指向的那篇，
   * 其余视为副本。
   */
  primaryPath(id: string, preferred?: string | null): string | null {
    const paths = this.pathsOf(id);
    if (paths.length === 0) return null;
    if (preferred && paths.includes(preferred)) return preferred;
    return paths[0];
  }

  /** 是否是重复 id 的副本（不是主路径） */
  isDuplicateCopy(path: string, preferred?: string | null): boolean {
    const id = this.idOf(path);
    return !!id && this.pathsOf(id).length > 1 && this.primaryPath(id, preferred) !== path;
  }

  duplicates(): { id: string; paths: string[] }[] {
    return [...this.pathsById.entries()]
      .filter(([, paths]) => paths.size > 1)
      .map(([id]) => ({ id, paths: this.pathsOf(id) }));
  }
}
