// 设置页。设置项的类型和校验在 src/settings.ts。

import { App, PluginSettingTab, Setting, type Plugin } from "obsidian";
import { baseUrlAfterSwitch, providerInfo, providerOptions } from "../llm/providers";
import type { ProviderId } from "../llm/types";
import { normalizeDir, parseIntervals, type Settings } from "../settings";

export interface SettingsHost {
  settings: Settings;
  saveSettings(): Promise<void>;
  /** 记忆目录变化后重新加载记忆文件 */
  reloadMemory(): Promise<void>;
}

export class AutomemSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: SettingsHost,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    const s = this.host.settings;
    const save = () => this.host.saveSettings();
    containerEl.empty();

    new Setting(containerEl).setName("LLM").setHeading();

    const provider = providerInfo(s.llm.provider);

    new Setting(containerEl).setName("服务商").addDropdown((d) => {
      for (const { id, label } of providerOptions()) d.addOption(id, label);
      d.setValue(s.llm.provider).onChange(async (v) => {
        const id = v as ProviderId;
        s.llm.baseUrl = baseUrlAfterSwitch(s.llm.baseUrl, id);
        s.llm.provider = id;
        await save();
        this.display(); // 刷新 base URL、模型提示等随服务商变化的内容
      });
    });

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc(provider.baseUrlHint)
      .addText((t) =>
        t
          .setPlaceholder(provider.defaultBaseUrl)
          .setValue(s.llm.baseUrl)
          .onChange(async (v) => {
            s.llm.baseUrl = v.trim();
            await save();
          }),
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc(s.llm.provider === "anthropic" ? `留空时使用 ${provider.modelPlaceholder}` : "")
      .addText((t) =>
        t
          .setPlaceholder(provider.modelPlaceholder)
          .setValue(s.llm.model)
          .onChange(async (v) => {
            s.llm.model = v.trim();
            await save();
          }),
      );

    new Setting(containerEl)
      .setName("API key")
      .setDesc("API key 以明文保存在 .obsidian/plugins/automem/data.json。如果 vault 通过 git 或云盘同步，key 会一起被同步出去。")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(s.llm.apiKey).onChange(async (v) => {
          s.llm.apiKey = v.trim();
          await save();
        });
      });

    if (provider.usesTemperature) {
      new Setting(containerEl).setName("Temperature").addSlider((sl) =>
        sl
          .setLimits(0, 1, 0.1)
          .setValue(s.llm.temperature)
          .setDynamicTooltip()
          .onChange(async (v) => {
            s.llm.temperature = v;
            await save();
          }),
      );
    }

    new Setting(containerEl).setName("出题").setHeading();

    new Setting(containerEl)
      .setName("正文长度上限")
      .setDesc("笔记正文超过这个字数时不生成，避免请求过大。")
      .addText((t) =>
        t.setValue(String(s.maxBodyChars)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isInteger(n) && n > 0) {
            s.maxBodyChars = n;
            await save();
          }
        }),
      );

    new Setting(containerEl).setName("题数范围").setDesc("最少和最多几道题。").addText((t) =>
      t.setValue(`${s.minQuestions}-${s.maxQuestions}`).onChange(async (v) => {
        const m = /^\s*(\d+)\s*[-~～]\s*(\d+)\s*$/.exec(v);
        if (!m) return;
        const [min, max] = [Number(m[1]), Number(m[2])];
        if (min >= 1 && max >= min) {
          s.minQuestions = min;
          s.maxQuestions = max;
          await save();
        }
      }),
    );

    new Setting(containerEl).setName("复习").setHeading();

    new Setting(containerEl)
      .setName("记忆目录")
      .setDesc("记忆文件保存在 vault 中的这个目录。修改后会从新目录重新加载，旧目录的文件不会自动搬过去。")
      .addText((t) => {
        t.setValue(s.memoryDir);
        t.inputEl.addEventListener("blur", async () => {
          const dir = normalizeDir(t.getValue());
          if (!dir || dir === s.memoryDir) return;
          s.memoryDir = dir;
          await save();
          await this.host.reloadMemory();
        });
      });

    new Setting(containerEl).setName("每日推送上限").setDesc("手动复习不受限制，也不计入。").addText((t) =>
      t.setValue(String(s.dailyLimit)).onChange(async (v) => {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0) {
          s.dailyLimit = n;
          await save();
        }
      }),
    );

    new Setting(containerEl)
      .setName("间隔表（天）")
      .setDesc("严格递增的正整数，用逗号分隔。缩短后，超出范围的档位会按最后一档计算。")
      .addText((t) =>
        t.setValue(s.intervals.join(", ")).onChange(async (v) => {
          const list = parseIntervals(v);
          if (list) {
            s.intervals = list;
            await save();
          }
        }),
      );

    new Setting(containerEl).setName("检查间隔（分钟）").setDesc("多久检查一次是否有到期卡片。").addText((t) =>
      t.setValue(String(s.checkIntervalMinutes)).onChange(async (v) => {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 1) {
          s.checkIntervalMinutes = n;
          await save();
        }
      }),
    );
  }
}
