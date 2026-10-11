// 组合根：只负责创建各模块并把它们连起来，不写业务逻辑。
// 模块说明见 README.md。

import { Notice, Plugin } from "obsidian";
import { registerCommands } from "./commands";
import { SystemClock } from "./core/clock";
import type { DailyCount } from "./core/quota";
import { IdentityWatcher } from "./identity/IdentityWatcher";
import { NoteIndex } from "./identity/NoteIndex";
import { ObsidianNoteGateway } from "./identity/ObsidianNoteGateway";
import { QuestionGenerator } from "./llm/generator";
import { createProvider } from "./llm/providers";
import { obsidianHttp } from "./platform/obsidianHttp";
import { PushController } from "./push/PushController";
import { ReviewService } from "./review/ReviewService";
import { normalizeSettings, type Settings } from "./settings";
import { VaultMemoryStore } from "./storage/MemoryStore";
import { CardPanel } from "./ui/CardPanel";
import { CARD_VIEW_TYPE, CardView } from "./ui/CardView";
import { NoteActions } from "./ui/NoteActions";
import { ReviewActions } from "./ui/ReviewActions";
import { RecallCardsSettingTab, type SettingsHost } from "./ui/SettingTab";
import { StatusBar } from "./ui/StatusBar";

/** data.json 的结构 */
interface PluginData {
  settings: Settings;
  quota: DailyCount | null;
}

export default class RecallCardsPlugin extends Plugin implements SettingsHost {
  override settings!: Settings;
  private quota: DailyCount | null = null;

  private store!: VaultMemoryStore;
  private watcher!: IdentityWatcher;
  private push!: PushController;
  private noteActions!: NoteActions;
  private statusBar!: StatusBar;
  private clock = new SystemClock();

  override async onload(): Promise<void> {
    await this.loadPluginData();

    // 数据层
    const index = new NoteIndex();
    this.store = new VaultMemoryStore(this.app.vault.adapter, () => this.settings.memoryDir);
    const notes = new ObsidianNoteGateway(this.app, index, this.store);

    // 业务层
    const generator = new QuestionGenerator(
      () => createProvider(this.settings.llm, obsidianHttp),
      () => this.settings,
    );
    const review = new ReviewService({
      store: this.store,
      notes,
      generator,
      clock: this.clock,
      settings: () => this.settings,
      newId: () => crypto.randomUUID(),
    });

    // 推送
    const cards = new CardPanel(this.app);
    this.push = new PushController({
      store: this.store,
      clock: this.clock,
      settings: () => this.settings,
      quota: {
        get: () => this.quota,
        set: async (q) => {
          this.quota = q;
          await this.savePluginData();
        },
      },
      presenter: cards,
      isAvailable: (m) => notes.pathOf(m.noteId) !== null,
      notify: (msg) => new Notice(msg),
      onQueueChanged: () => this.refreshStatusBar(),
    });

    // 界面
    const actions = new ReviewActions({
      app: this.app,
      review,
      push: this.push,
      cards,
      notes,
      intervals: () => this.settings.intervals,
      clock: this.clock,
      onChanged: (path) => {
        if (path) this.noteActions.refreshPath(path);
        this.refreshStatusBar();
      },
    });
    this.registerView(CARD_VIEW_TYPE, (leaf) => new CardView(leaf, actions));
    this.noteActions = new NoteActions(this.app, review, actions);
    this.statusBar = new StatusBar(this.addStatusBarItem(), () => void this.push.openFromQueue());
    this.addSettingTab(new RecallCardsSettingTab(this.app, this, this));
    registerCommands(this, {
      actions,
      push: this.push,
      clock: this.clock,
      onDateChanged: () => {
        this.noteActions.refreshAll();
        void this.push.check();
      },
    });

    // 身份管理
    this.watcher = new IdentityWatcher(this.app, index, this.store, review, () => this.settings.changeDebounceMs, {
      onNoteChanged: (path) => this.noteActions.refreshPath(path),
      onIndexChanged: () => {
        this.refreshStatusBar();
        cards.rerender();
      },
    });

    this.app.workspace.onLayoutReady(() => void this.start());
  }

  override onunload(): void {
    this.watcher?.dispose();
    this.noteActions?.destroy();
  }

  /** 布局就绪后：加载记忆文件 → 建索引 → 监听事件 → 开始推送 */
  private async start(): Promise<void> {
    await this.reloadMemory();
    this.watcher.register(this);
    this.registerEvent(this.app.workspace.on("layout-change", () => this.noteActions.refreshAll()));
    this.noteActions.refreshAll();
    this.registerInterval(window.setInterval(() => void this.push.tick(), 60_000));
    await this.push.tick();
  }

  async reloadMemory(): Promise<void> {
    const report = await this.store.loadAll();
    if (report.errors.length > 0) {
      console.warn("[recall-cards] 无法读取的记忆文件", report.errors);
      new Notice(`有 ${report.errors.length} 个记忆文件无法读取，详情见开发者控制台`);
    }
    await this.watcher.rebuild();
    this.noteActions.refreshAll();
  }

  private refreshStatusBar(): void {
    this.statusBar?.update(this.push.dueCount(), this.clock.getOverride());
  }

  // ---- 持久化 ----

  private async loadPluginData(): Promise<void> {
    const data = ((await this.loadData()) ?? {}) as Partial<PluginData>;
    this.settings = normalizeSettings(data.settings);
    this.quota = data.quota ?? null;
  }

  private async savePluginData(): Promise<void> {
    const data: PluginData = { settings: this.settings, quota: this.quota };
    await this.saveData(data);
  }

  async saveSettings(): Promise<void> {
    await this.savePluginData();
    this.refreshStatusBar();
  }
}
