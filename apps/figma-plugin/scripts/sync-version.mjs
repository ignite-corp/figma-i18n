import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));

// manifest.json에서 version 필드 제거 (Figma가 허용하지 않음)
const manifestPath = resolve(root, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
delete manifest.version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`✅ version synced: ${pkg.version}`);
