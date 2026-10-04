// 把打包结果复制到笔记库的插件目录。用法：npm run deploy
// 笔记库路径默认是下面的 DEFAULT_VAULT，可以用环境变量 AUTOMEM_VAULT 覆盖：
//   AUTOMEM_VAULT=/path/to/vault npm run deploy
// 只会写入 <笔记库>/.obsidian/plugins/automem/ 下的三个文件，不碰其他任何内容。

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_VAULT = "/Users/zhichaoli/obsvan";
const FILES = ["main.js", "manifest.json", "styles.css"];

const vault = process.env.AUTOMEM_VAULT || DEFAULT_VAULT;
const obsidianDir = join(vault, ".obsidian");

if (!existsSync(obsidianDir) || !statSync(obsidianDir).isDirectory()) {
  console.error(`✗ ${vault} 不是 Obsidian 笔记库（找不到 .obsidian 目录）`);
  process.exit(1);
}

const { id, version } = JSON.parse(readFileSync("manifest.json", "utf8"));
const target = join(obsidianDir, "plugins", id);
mkdirSync(target, { recursive: true });

for (const file of FILES) {
  if (!existsSync(file)) {
    console.error(`✗ 找不到 ${file}，请先运行 npm run build`);
    process.exit(1);
  }
  copyFileSync(file, join(target, file));
}

console.log(`✓ 已复制 ${id} v${version} 到 ${target}`);
console.log("  在 Obsidian 中重新加载插件后生效（设置 → 第三方插件 → 关闭再开启 AutoMem）");
