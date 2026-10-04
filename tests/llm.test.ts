import { describe, expect, it } from "vitest";
import { GenerationError } from "../src/llm/errors";
import { QuestionGenerator } from "../src/llm/generator";
import { parseQuestions } from "../src/llm/parse";
import { buildMessages } from "../src/llm/prompt";
import { OpenAICompatibleProvider } from "../src/llm/providers/openaiCompatible";
import type { HttpClient, LLMConfig } from "../src/llm/types";

const opts = { minQuestions: 3, maxQuestions: 7 };
const three = JSON.stringify({
  questions: [1, 2, 3].map((i) => ({ question: `Q${i}`, answer: `A${i}` })),
});

describe("parseQuestions", () => {
  it("合法输出", () => {
    expect(parseQuestions(three, opts)).toHaveLength(3);
  });

  it("容忍代码块包裹和前后说明", () => {
    expect(parseQuestions("好的：\n```json\n" + three + "\n```\n", opts)).toHaveLength(3);
  });

  it.each([
    ["不是 JSON", "抱歉"],
    ["缺少数组", '{"items": []}'],
    ["题数太少", '{"questions": [{"question": "q", "answer": "a"}]}'],
    ["答案为空", JSON.stringify({ questions: [1, 2, 3].map(() => ({ question: "q", answer: " " })) })],
  ])("%s 时抛出 invalid-output", (_, raw) => {
    expect(() => parseQuestions(raw, opts)).toThrow(GenerationError);
  });
});

describe("prompt", () => {
  it("列出二级标题", () => {
    const [system] = buildMessages("## 甲\n内容\n## 乙\n内容", opts);
    expect(system.content).toContain("「甲」、「乙」");
    expect(system.content).toContain("每个标题至少要有一道题");
  });

  it("标题数超过题目上限时说明优先级", () => {
    const body = Array.from({ length: 9 }, (_, i) => `## H${i}\n内容`).join("\n");
    expect(buildMessages(body, opts)[0].content).toContain("超过题目上限 7");
  });
});

describe("QuestionGenerator", () => {
  const provider = (raw: string) => () => ({ complete: async () => raw });

  it("超过长度上限时不调用 LLM", async () => {
    let called = false;
    const gen = new QuestionGenerator(
      () => ({
        complete: async () => {
          called = true;
          return three;
        },
      }),
      () => ({ ...opts, maxBodyChars: 5 }),
    );
    await expect(gen.generate("123456")).rejects.toMatchObject({ kind: "too-long" });
    expect(called).toBe(false);
  });

  it("正文为空时报错", async () => {
    const gen = new QuestionGenerator(provider(three), () => ({ ...opts, maxBodyChars: 100 }));
    await expect(gen.generate("  \n ")).rejects.toMatchObject({ kind: "empty" });
  });

  it("正常生成", async () => {
    const gen = new QuestionGenerator(provider(three), () => ({ ...opts, maxBodyChars: 100 }));
    expect(await gen.generate("内容")).toEqual([
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
      { question: "Q3", answer: "A3" },
    ]);
  });
});

describe("OpenAICompatibleProvider", () => {
  const config: LLMConfig = {
    provider: "openai-compatible",
    baseUrl: "https://api.example.com/v1/",
    model: "m",
    apiKey: "k",
    temperature: 0.3,
  };

  it("发送正确的请求并取出内容", async () => {
    let seen: Parameters<HttpClient>[0] | null = null;
    const http: HttpClient = async (req) => {
      seen = req;
      return { status: 200, text: JSON.stringify({ choices: [{ message: { content: "hi" } }] }) };
    };
    expect(await new OpenAICompatibleProvider(config, http).complete([{ role: "user", content: "x" }])).toBe("hi");
    expect(seen!.url).toBe("https://api.example.com/v1/chat/completions");
    expect(seen!.headers.Authorization).toBe("Bearer k");
  });

  it.each([
    ["auth", async () => ({ status: 401, text: "" })],
    ["http", async () => ({ status: 500, text: "boom" })],
    [
      "network",
      async () => {
        throw new Error("offline");
      },
    ],
  ] as [string, HttpClient][])("错误类型 %s", async (kind, http) => {
    await expect(new OpenAICompatibleProvider(config, http).complete([])).rejects.toMatchObject({ kind });
  });

  it("未配置 model 时提示", async () => {
    const p = new OpenAICompatibleProvider({ ...config, model: "" }, async () => ({ status: 200, text: "" }));
    await expect(p.complete([])).rejects.toMatchObject({ kind: "config" });
  });
});
