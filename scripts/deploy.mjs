// 把打包结果复制到笔记库的插件目录。用法：npm run deploy
// 笔记库路径按顺序取：环境变量 RECALL_CARDS_VAULT → 项目根目录的 .vault-path 文件（已在 .gitignore 中）
//   RECALL_CARDS_VAULT=/path/to/vault npm run deploy
//   echo /path/to/vault > .vault-path
// 只会写入 <笔记库>/.obsidian/plugins/recall-cards/ 下的三个文件，不碰其他任何内容。

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FILES = ["main.js", "manifest.json", "styles.css"];
const VAULT_FILE = ".vault-path";

const vault = process.env.RECALL_CARDS_VAULT || (existsSync(VAULT_FILE) ? readFileSync(VAULT_FILE, "utf8").trim() : "");
if (!vault) {
  console.error(`✗ 没有指定笔记库。设置环境变量 RECALL_CARDS_VAULT，或把笔记库路径写入 ${VAULT_FILE}`);
  process.exit(1);
}
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
console.log("  在 Obsidian 中重新加载插件后生效（设置 → 第三方插件 → 关闭再开启 Recall Cards）");
