import { describe, expect, it } from "vitest";
import { createMemoryFile, parseMemoryFile, serializeMemoryFile } from "../src/core/memoryFile";
import { contentHash, extractBody, extractH2Headings } from "../src/core/noteBody";
import { applyRating, initSchedule } from "../src/core/scheduler";
import { NoteIndex } from "../src/identity/NoteIndex";
import { makeMemory, SCHEDULER } from "./helpers";

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
    });
    expect(file.createdAt).toBe("2026-10-03");
    expect(file.questions[0]).toEqual({ question: "q", answer: "a", row: 0, memory: null });
    expect(parseMemoryFile(serializeMemoryFile(file))).toEqual(file);
  });

  it("非法文件抛错", () => {
    expect(() => parseMemoryFile("{")).toThrow("不是合法的 JSON");
    expect(() => parseMemoryFile('{"version": 99}')).toThrow("不支持的记忆文件版本");
    expect(() => parseMemoryFile('{"version": 2, "noteId": "x"}')).toThrow("source");
  });

  it("stability 和 difficulty 必须同时为空或同时是正数", () => {
    const file = makeMemory("id1");
    const withSchedule = (patch: object) =>
      serializeMemoryFile({ ...file, schedule: { ...file.schedule, ...patch } });
    expect(() => parseMemoryFile(withSchedule({ stability: 3 }))).toThrow("同时为空");
    expect(() => parseMemoryFile(withSchedule({ stability: -1, difficulty: 5 }))).toThrow("非法");
    expect(() => parseMemoryFile(withSchedule({ stability: undefined, difficulty: undefined }))).toThrow("非法");
    expect(parseMemoryFile(withSchedule({ stability: 3, difficulty: 5 })).schedule.stability).toBe(3);
  });
});

describe("从版本 1（固定间隔表）升级", () => {
  const v1 = (schedule: object, history: object[]) =>
    JSON.stringify({
      version: 1,
      noteId: "id1",
      source: "a.md",
      contentHash: "sha256:1",
      createdAt: "2026-10-03",
      questions: [{ question: "q", answer: "a", row: 0, memory: null }],
      schedule: {
        status: "active",
        level: 2,
        starttime: "2026-10-03",
        lastreviewtime: "2026-10-09",
        nextreviewtime: "2026-10-13",
        memory: "good",
        ...schedule,
      },
      history,
    });
  const ratings = [
    { date: "2026-10-04", rating: "good", manual: false },
    { date: "2026-10-09", rating: "good", manual: false },
  ];

  it("去掉 level，按复习记录推算记忆状态，已排好的日期不变", () => {
    const file = parseMemoryFile(v1({}, ratings));
    let s = applyRating(initSchedule("2026-10-03"), "good", "2026-10-04", SCHEDULER);
    s = applyRating(s, "good", "2026-10-09", SCHEDULER);
    expect(file.version).toBe(2);
    expect(file.schedule).toEqual({
      status: "active",
      starttime: "2026-10-03",
      lastreviewtime: "2026-10-09",
      nextreviewtime: "2026-10-13",
      memory: "good",
      stability: s.stability,
      difficulty: s.difficulty,
    });
    expect(file.history).toEqual(ratings);
  });

  it("从头记忆之后的记录才计入；没有复习记录时是新卡片", () => {
    const reset = [...ratings, { date: "2026-10-10", event: "reset" }];
    expect(parseMemoryFile(v1({ lastreviewtime: null }, reset)).schedule).toMatchObject({
      stability: null,
      difficulty: null,
    });
    expect(parseMemoryFile(v1({ lastreviewtime: null }, [])).schedule.stability).toBeNull();
  });

  it("升级后的文件可以序列化再解析", () => {
    const file = parseMemoryFile(v1({}, ratings));
    expect(parseMemoryFile(serializeMemoryFile(file))).toEqual(file);
  });

  it("复习记录无法识别时报错，不猜测", () => {
    expect(() => parseMemoryFile(v1({}, [{ date: "2026-10-04", rating: "great" }]))).toThrow("history");
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
