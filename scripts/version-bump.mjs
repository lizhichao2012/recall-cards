// npm version patch|minor|major 时自动运行：把 package.json 的新版本号同步到 manifest.json，
// 并在 versions.json 中记录这个版本要求的最低 Obsidian 版本。

import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.npm_package_version;
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = version;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[version] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
