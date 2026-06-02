import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
const version = pkg.version;

// manifest.json에 version 주입
const manifestPath = resolve(root, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

// src/version.ts 생성 (UI에서 import해서 표시)
const versionTsPath = resolve(root, "src/version.ts");
writeFileSync(versionTsPath, `export const VERSION = "${version}";\n`);

console.log(`✅ version synced: ${version}`);
