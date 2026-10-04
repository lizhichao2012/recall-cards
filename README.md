# AutoMem 笔记复习

Obsidian 插件：让 LLM 根据笔记出题，按记忆曲线推送复习卡片。需求和规则见 [设计方案](./%23%20笔记复习插件设计方案.md)。

## 开发

```bash
npm install
npm test          # 单元测试（调度、出题校验、推送、业务流程）
npm run build     # 类型检查 + 打包，生成 main.js
npm run dev       # 监听修改，自动重新打包
```

安装到 vault：把 `main.js`、`manifest.json`、`styles.css` 复制到 `<vault>/.obsidian/plugins/automem/`，然后在 Obsidian 设置 → 第三方插件中启用。也可以把整个项目目录软链接到那里，配合 `npm run dev` 使用。

## 模块划分

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
│   └── providers/          各 LLM 服务商的实现和注册表
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

## 常见修改去哪里改

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
