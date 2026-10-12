import { DEFAULT_SCHEDULER } from "../src/core/scheduler";
import type { MemoryFile, Schedule } from "../src/core/types";
import type { FileAdapter } from "../src/storage/MemoryStore";

export const SCHEDULER = DEFAULT_SCHEDULER;

export function makeMemory(noteId: string, schedule: Partial<Schedule> = {}, source = `${noteId}.md`): MemoryFile {
  return {
    version: 2,
    noteId,
    source,
    contentHash: "sha256:x",
    createdAt: "2026-10-01",
    questions: [{ question: "Q", answer: "A", row: 0, memory: null }],
    schedule: {
      status: "active",
      starttime: "2026-10-01",
      lastreviewtime: null,
      nextreviewtime: "2026-10-02",
      memory: null,
      stability: null,
      difficulty: null,
      ...schedule,
    },
    history: [],
  };
}

/** 内存版文件系统 */
export class MemoryAdapter implements FileAdapter {
  files = new Map<string, string>();
  dirs = new Set<string>();

  async exists(path: string) {
    return this.files.has(path) || this.dirs.has(path);
  }
  async mkdir(path: string) {
    this.dirs.add(path);
  }
  async read(path: string) {
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`not found: ${path}`);
    return v;
  }
  async write(path: string, data: string) {
    this.files.set(path, data);
  }
  async list(path: string) {
    return { files: [...this.files.keys()].filter((p) => p.startsWith(`${path}/`)), folders: [] };
  }
}
