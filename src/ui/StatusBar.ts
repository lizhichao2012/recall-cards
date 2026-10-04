// 状态栏常驻"待复习 N"，点击打开队列中的第一张卡片。

export class StatusBar {
  constructor(
    private readonly el: HTMLElement,
    onClick: () => void,
  ) {
    el.addClass("mod-clickable", "automem-status");
    el.setAttribute("aria-label", "打开待复习的卡片");
    el.onclick = onClick;
  }

  update(dueCount: number, simulatedToday: string | null): void {
    const text = `待复习 ${dueCount}`;
    this.el.setText(simulatedToday ? `${text} · 模拟 ${simulatedToday}` : text);
  }
}
