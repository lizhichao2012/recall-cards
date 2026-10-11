# Recall Cards

Obsidian 插件：让 LLM 根据笔记出题，再按记忆曲线把题目推送给你复习。

[English](./README.md)

## 怎么用

1. 打开一篇笔记，点击右上角的大脑图标，选择「生成回忆」。LLM 会读这篇笔记，出 3–7 道题并附上答案。题目偏重"为什么、怎么做、区别是什么"，答案必须能在原文中找到依据。
2. 题目以卡片的形式显示在右侧边栏。先试着回答，再展开答案，然后按记住的程度反馈：

   | 按钮 | 含义 | 记忆曲线的变化 |
   |---|---|---|
   | 忘了 | 大部分想不起来 | 归零，回到第 1 档（1 天后复习） |
   | 模糊 | 看了答案或原文才想起来 | 保持当前档位 |
   | 记得 | 可以正确回答问题 | 升一档 |
   | 简单 | 轻松答出 | 进入长期记忆，不再推送 |

   鼠标放在按钮上，会显示点击后具体升到哪一档、哪天再复习。
3. 卡片到期后会自动推送。默认间隔是 1、2、4、7、15、30、60 天，每 30 分钟检查一次，每天最多推送 3 张。状态栏会显示待复习的数量。
4. 生成题目后如果修改了笔记，图标会变色。这时可以选择三种处理方式：重新生成并保留复习进度、重新生成并让记忆曲线归零，或者忽略这次修改。

## 安装

插件还没有上架社区插件市场。手动安装的步骤：

1. 从 [最新 Release](../../releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`。
2. 放到 `<笔记库>/.obsidian/plugins/recall-cards/` 目录下。
3. 重启 Obsidian，在「设置 → 第三方插件」中开启 **Recall Cards**。

也可以用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 填入本仓库地址安装。

仅支持桌面端。

## 配置

在「设置 → Recall Cards」中选择 LLM 服务商，填写 Base URL、模型名和 API key。各服务商的说明见下方[LLM 服务商](#llm-服务商)。

其他可以调整的设置：间隔表、每日推送上限、每篇笔记的题数范围、正文长度上限、记忆文件保存的目录。

## 隐私和数据

- **笔记内容会发送给你配置的 LLM 服务商**，只在生成或重新生成题目时发送。除此之外插件不发出任何网络请求，也不收集任何统计数据。
- **API key 以明文保存**在 `.obsidian/plugins/recall-cards/data.json`。如果笔记库通过 git 或云盘同步，key 会一起被同步出去。
- **插件会写入你的笔记库：**
  - 生成过题目的笔记，frontmatter 里会多一个 `review-id` 字段。笔记重命名或移动后，靠它找到对应的题目。
  - 题目和复习记录以 JSON 文件保存在 `recall-cards/` 目录下，目录可以在设置中修改。

## 开发

```bash
npm install
npm test          # 单元测试（调度、出题校验、推送、业务流程）
npm run build     # 类型检查 + 打包，生成 main.js
npm run dev       # 监听修改，自动重新打包
npm run deploy    # 打包并复制到笔记库的插件目录
```

`npm run deploy` 按顺序从这两处读取笔记库路径：
- 环境变量 `RECALL_CARDS_VAULT`
- 项目根目录的 `.vault-path` 文件（已在 `.gitignore` 中，例如 `echo /path/to/vault > .vault-path`）

它只写入 `<笔记库>/.obsidian/plugins/recall-cards/` 下的三个文件（`main.js`、`manifest.json`、`styles.css`），不碰其他内容。复制后在 Obsidian 中关闭再开启插件即可生效。

发布新版本：
1. 运行 `npm version patch`（或 `minor` / `major`），版本号会自动同步到 `manifest.json` 和 `versions.json`。
2. 运行 `git push --follow-tags` 推送标签，GitHub Actions 会自动打包并创建草稿 Release。
3. 到 GitHub 上检查草稿，没问题后点发布。

需求和规则见 [设计方案](./笔记复习插件设计方案.md)。

### LLM 服务商

在设置页的"服务商"中选择：

| 服务商 | 适用 | Base URL | 默认模型 |
|---|---|---|---|
| OpenAI 兼容接口 | OpenAI、DeepSeek、通义、Ollama 等 | 如 `https://api.openai.com/v1` | 需要填写 |
| Claude 格式接口 | Anthropic 官方 API，或兼容 Claude 格式的中转服务 | 官方填 `https://api.anthropic.com`；中转填它提供的地址，结尾的 `/v1` 可写可不写 | 留空时用 `claude-opus-5-5` |

Claude 格式接口的说明：

- 使用官方 SDK `@anthropic-ai/sdk`，请求通过 Obsidian 的 `requestUrl` 发出，所以中转服务没有 CORS 头也能用。
- 不发送 temperature（Claude 新模型不接受这个参数），设置页选 Claude 时会隐藏这一项。
- 连接官方 API 且模型是 `claude-opus-5-5`、`claude-opus-5`、`claude-sonnet-5-5` 或 `claude-fable-5-1` 时，会开启服务端拒答兜底（`fallbacks: "default"`）：模型拒答时自动换一个模型重试。中转服务不开启，因为它们可能不认识这个参数。

### 模块划分

依赖方向是从上往下：界面层依赖业务层，业务层只依赖接口。`core/`、`llm/`、`review/`、`push/`、`storage/` 都不引用 `obsidian`，可以直接做单元测试。

```
src/
├── main.ts                 组合根：创建各模块并连起来，不写业务逻辑
├── settings.ts             设置的类型、默认值、校验
├── commands.ts             命令面板中的命令
│
├── core/                   纯逻辑，不依赖 Obsidian
│   ├── types.ts            记忆文件的数据结构（设计方案 4.3）
│   ├── scheduler.ts        记忆曲线：反馈 → 新状态（2.2.3 规则表）
│   ├── picker.ts           选出今天要推送的卡片
│   ├── quota.ts            每日推送额度
│   ├── noteBody.ts         去 frontmatter、规范化、SHA-256、提取二级标题
│   ├── memoryFile.ts       记忆文件的创建、校验、版本迁移
│   ├── date.ts             日期加减（按天，本地时区）
│   └── clock.ts            "今天"，支持调试时模拟日期
│
├── llm/                    出题
│   ├── generator.ts        长度检查 → 拼 prompt → 调用 LLM → 校验
│   ├── prompt.ts           出题 prompt
│   ├── parse.ts            校验 LLM 输出
│   ├── errors.ts           出题错误类型
│   ├── types.ts            ChatProvider / HttpClient 接口
│   ├── fetchAdapter.ts     把 HttpClient 包装成 fetch，供 SDK 使用
│   └── providers/          各 LLM 服务商的实现和注册表
│       ├── openaiCompatible.ts  OpenAI 兼容接口（/chat/completions）
│       └── anthropic.ts         Claude 格式接口（/v1/messages，官方 SDK）
│
├── storage/MemoryStore.ts  读写 <记忆目录>/<noteId>.json
├── identity/               笔记身份管理
│   ├── NoteIndex.ts        noteId → 路径索引、重复检测（纯数据结构）
│   ├── ObsidianNoteGateway.ts  读正文、读写 review-id
│   └── IdentityWatcher.ts  监听修改、重命名、删除事件
├── review/ReviewService.ts 生成、重新生成、忽略变化、反馈的业务流程
├── push/PushController.ts  定时检查、额度、推送哪张卡片
├── platform/obsidianHttp.ts  用 requestUrl 实现 HttpClient
│
└── ui/                     界面，只负责显示和收集操作
    ├── CardView.ts         侧边栏卡片
    ├── CardPanel.ts        打开或复用侧边栏卡片（CardPresenter 的实现）
    ├── NoteActions.ts      笔记右上角图标和菜单
    ├── ReviewActions.ts    用户操作入口：调用业务层并显示提示
    ├── StatusBar.ts        状态栏"待复习 N"
    ├── SettingTab.ts       设置页
    └── modals.ts           调试用对话框
```

### 常见修改去哪里改

| 想改的东西 | 改哪里 |
|---|---|
| 换记忆曲线算法（SM-2、FSRS） | `core/scheduler.ts`；需要新字段时在 `core/types.ts` 加字段，并在 `core/memoryFile.ts` 的 `migrate` 中升级版本 |
| 推送排序规则 | `core/picker.ts` 的 `compareDue` |
| 什么时候推送、额度怎么算 | `push/PushController.ts` |
| 出题风格、题数要求 | `llm/prompt.ts` |
| 接入新的 LLM 服务商 | 在 `llm/providers/` 实现 `ChatProvider`，并在 `providers/index.ts` 注册 |
| 卡片改回弹窗 | 新写一个实现 `CardPresenter` 的类，替换 `main.ts` 中的 `CardPanel` |
| 卡片样式和布局 | `ui/CardView.ts`、`styles.css` |
| 图标菜单的选项 | `ui/NoteActions.ts` |
| 新的设置项 | `settings.ts` 加字段和默认值，`ui/SettingTab.ts` 加输入框 |
