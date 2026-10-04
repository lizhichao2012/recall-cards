import { describe, expect, it } from "vitest";
import { createMemoryFile, parseMemoryFile, serializeMemoryFile } from "../src/core/memoryFile";
import { contentHash, extractBody, extractH2Headings } from "../src/core/noteBody";
import { NoteIndex } from "../src/identity/NoteIndex";
import { INTERVALS } from "./helpers";

describe("正文与 hash", () => {
  const body = "# 标题\n\n正文内容\n";

  it("去掉 frontmatter", () => {
    expect(extractBody(`---\nreview-id: abc\ntags: [a]\n---\n${body}`)).toBe(body);
    expect(extractBody(body)).toBe(body);
  });

  it("只改 frontmatter 不改变 hash", async () => {
    const a = await contentHash(extractBody(body));
    const b = await contentHash(extractBody(`---\nreview-id: abc\n---\n${body}`));
    const c = await contentHash(extractBody(`---\nreview-id: abc\n---\n\n${body}`));
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("换行符和行尾空白不影响 hash，正文修改会影响", async () => {
    const a = await contentHash("第一行\n第二行");
    expect(await contentHash("第一行  \r\n第二行\t")).toBe(a);
    expect(await contentHash("第一行\n第二行改了")).not.toBe(a);
  });

  it("提取二级标题，忽略代码块", () => {
    const md = "## 一\n文字\n```\n## 不是标题\n```\n### 三级\n## 二 ##\n";
    expect(extractH2Headings(md)).toEqual(["一", "二"]);
  });
});

describe("记忆文件", () => {
  it("创建后可以序列化再解析", () => {
    const file = createMemoryFile({
      noteId: "id1",
      source: "a/b.md",
      contentHash: "sha256:1",
      questions: [{ question: "q", answer: "a" }],
      today: "2026-10-03",
      intervals: INTERVALS,
    });
    expect(file.createdAt).toBe("2026-10-03");
    expect(file.questions[0]).toEqual({ question: "q", answer: "a", row: 0, memory: null });
    expect(parseMemoryFile(serializeMemoryFile(file))).toEqual(file);
  });

  it("非法文件抛错", () => {
    expect(() => parseMemoryFile("{")).toThrow("不是合法的 JSON");
    expect(() => parseMemoryFile('{"version": 99}')).toThrow("不支持的记忆文件版本");
    expect(() => parseMemoryFile('{"version": 1, "noteId": "x"}')).toThrow("source");
  });
});

describe("NoteIndex", () => {
  it("重命名后身份不变", () => {
    const idx = new NoteIndex();
    idx.set("a.md", "id1");
    idx.rename("a.md", "dir/b.md");
    expect(idx.idOf("dir/b.md")).toBe("id1");
    expect(idx.pathsOf("id1")).toEqual(["dir/b.md"]);
  });

  it("删除 review-id 后从索引移除", () => {
    const idx = new NoteIndex();
    idx.set("a.md", "id1");
    idx.set("a.md", null);
    expect(idx.pathsOf("id1")).toEqual([]);
  });

  it("复制笔记产生重复 id：source 指向的是主笔记", () => {
    const idx = new NoteIndex();
    idx.set("orig.md", "id1");
    idx.set("copy.md", "id1");
    expect(idx.duplicates()).toEqual([{ id: "id1", paths: ["copy.md", "orig.md"] }]);
    expect(idx.primaryPath("id1", "orig.md")).toBe("orig.md");
    expect(idx.isDuplicateCopy("copy.md", "orig.md")).toBe(true);
    expect(idx.isDuplicateCopy("orig.md", "orig.md")).toBe(false);
  });
});
