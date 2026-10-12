// 调试用的对话框：模拟今天日期、查看时间轴。

import { App, Modal, Notice, Setting } from "obsidian";
import { isDateStr } from "../core/date";
import type { TimelinePoint } from "../core/scheduler";

export class SimulateDateModal extends Modal {
  constructor(
    app: App,
    private readonly current: string | null,
    private readonly onSubmit: (date: string | null) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText("调试：模拟今天日期");
    this.contentEl.createEl("p", {
      text: "所有调度计算都会使用这个日期。留空恢复真实日期。只在本次运行有效，重启后自动恢复。",
    });
    let value = this.current ?? "";
    new Setting(this.contentEl).setName("日期（YYYY-MM-DD）").addText((t) =>
      t
        .setPlaceholder("2026-10-03")
        .setValue(value)
        .onChange((v) => (value = v.trim())),
    );
    new Setting(this.contentEl).addButton((b) =>
      b
        .setButtonText("确定")
        .setCta()
        .onClick(() => {
          if (value && !isDateStr(value)) {
            new Notice("日期格式应为 YYYY-MM-DD");
            return;
          }
          this.close();
          this.onSubmit(value || null);
        }),
    );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

export class TimelineModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly points: TimelinePoint[],
  ) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText(`时间轴：${this.title}`);
    if (this.points.length === 0) {
      this.contentEl.createEl("p", { text: "这张卡片已进入长期记忆，不再推送。" });
      return;
    }
    this.contentEl.createEl("p", { text: "假设每次都在到期当天点“记得”，未来的复习日期：" });
    const table = this.contentEl.createEl("table", { cls: "recall-cards-timeline" });
    const head = table.createEl("tr");
    head.createEl("th", { text: "次序" });
    head.createEl("th", { text: "日期" });
    head.createEl("th", { text: "距上次复习" });
    this.points.forEach((p, i) => {
      const row = table.createEl("tr");
      row.createEl("td", { text: String(i + 1) });
      row.createEl("td", { text: p.date });
      row.createEl("td", { text: `${p.gap} 天` });
    });
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
