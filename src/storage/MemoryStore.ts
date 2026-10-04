// 记忆存储：读写 <记忆目录>/<noteId>.json，启动时全部加载到内存。
// 只依赖 FileAdapter 接口，插件中传入 vault.adapter，测试中传入内存实现。

import { MemoryFileError, parseMemoryFile, serializeMemoryFile } from "../core/memoryFile";
import type { MemoryFile } from "../core/types";

/** vault.adapter 的最小子集 */
export interface FileAdapter {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
}

export interface MemoryStore {
  get(noteId: string): MemoryFile | null;
  all(): MemoryFile[];
  save(file: MemoryFile): Promise<void>;
  loadAll(): Promise<LoadReport>;
}

export interface LoadReport {
  loaded: number;
  /** 无法解析的文件及原因 */
  errors: { path: string; reason: string }[];
}

export class VaultMemoryStore implements MemoryStore {
  private cache = new Map<string, MemoryFile>();

  constructor(
    private readonly adapter: FileAdapter,
    private readonly dir: () => string,
  ) {}

  private pathOf(noteId: string): string {
    return `${this.dir()}/${noteId}.json`;
  }

  get(noteId: string): MemoryFile | null {
    return this.cache.get(noteId) ?? null;
  }

  all(): MemoryFile[] {
    return [...this.cache.values()];
  }

  async save(file: MemoryFile): Promise<void> {
    const dir = this.dir();
    if (!(await this.adapter.exists(dir))) await this.adapter.mkdir(dir);
    await this.adapter.write(this.pathOf(file.noteId), serializeMemoryFile(file));
    this.cache.set(file.noteId, file);
  }

  async loadAll(): Promise<LoadReport> {
    this.cache.clear();
    const report: LoadReport = { loaded: 0, errors: [] };
    const dir = this.dir();
    if (!(await this.adapter.exists(dir))) return report;

    const { files } = await this.adapter.list(dir);
    for (const path of files.filter((p) => p.endsWith(".json"))) {
      try {
        const file = parseMemoryFile(await this.adapter.read(path));
        this.cache.set(file.noteId, file);
        report.loaded++;
      } catch (e) {
        const reason = e instanceof MemoryFileError ? e.message : String(e);
        report.errors.push({ path, reason });
      }
    }
    return report;
  }
}
