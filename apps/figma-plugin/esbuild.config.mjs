import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const isWatch = process.argv.includes("--watch");

// 1. Sandbox (main.ts) 빌드
const mainBuild = esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  target: "es2020",
  format: "iife",
  sourcemap: false,
  minify: !isWatch,
  ...(isWatch ? { plugins: [watchPlugin("main")] } : {}),
});

// 2. UI 빌드 (html에 inline)
const uiBuild = esbuild.build({
  entryPoints: ["src/ui.tsx"],
  bundle: true,
  outfile: "dist/ui-bundle.js",
  target: "es2020",
  format: "iife",
  sourcemap: false,
  minify: !isWatch,
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
  },
  ...(isWatch ? { plugins: [watchPlugin("ui")] } : {}),
});

function watchPlugin(name) {
  return {
    name: `watch-${name}`,
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length === 0) {
          console.log(`[${name}] Build succeeded`);
          if (name === "ui") inlineUI();
        } else {
          console.error(`[${name}] Build failed`, result.errors);
        }
      });
    },
  };
}

function inlineUI() {
  try {
    const html = readFileSync("ui.html", "utf-8");
    const js = readFileSync("dist/ui-bundle.js", "utf-8");
    const result = html.replace("<!-- SCRIPT -->", `<script>${js}</script>`);
    writeFileSync("dist/ui.html", result);
  } catch {
    // 초기 빌드 시 ui-bundle.js가 아직 없을 수 있음
  }
}

await Promise.all([mainBuild, uiBuild]);
inlineUI();
console.log("✅ Build complete");
