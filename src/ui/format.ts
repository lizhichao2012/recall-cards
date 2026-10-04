// 界面上的小工具函数

/** "目录/笔记名.md" → "笔记名" */
export function noteName(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}
