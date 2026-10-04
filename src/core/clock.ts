// 时钟：所有"今天"都从这里取，调试命令"模拟今天日期"通过覆盖它生效。

import { formatLocalDate, isDateStr } from "./date";
import type { DateStr } from "./types";

export interface Clock {
  today(): DateStr;
}

export class SystemClock implements Clock {
  private override: DateStr | null = null;

  constructor(private readonly now: () => Date = () => new Date()) {}

  today(): DateStr {
    return this.override ?? formatLocalDate(this.now());
  }

  /** 设置模拟日期；传 null 恢复真实日期。只保存在内存中，重启后失效。 */
  setOverride(date: DateStr | null): void {
    if (date !== null && !isDateStr(date)) throw new Error(`无效日期：${date}`);
    this.override = date;
  }

  getOverride(): DateStr | null {
    return this.override;
  }
}
