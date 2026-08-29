#!/usr/bin/env node

/**
 * build-vendor.mjs - copies vendor assets from node_modules into public/vendor.
 *
 * Usage:
 *   node public/scripts/build-vendor.mjs
 */

import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import boxen from "boxen";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, "../..");
const vendorDir = resolve(__dirname, "../vendor");

const TTY = process.stdout.isTTY;

// ---
// Terminal helpers
// ---

const ok = (msg) => console.log(`  ${chalk.green("+")} ${msg}`);
const fail = (msg) => console.log(`  ${chalk.red("x")} ${chalk.red(msg)}`);
const gap = () => console.log();

function section(title) {
  gap();
  console.log(`  ${chalk.bold.green(title)}`);
}

// ---
// Vendor assets
// ---

const ASSETS = [
  { name: "htmx", src: "htmx.org/dist/htmx.min.js", dst: "htmx.min.js" },
  { name: "alpinejs", src: "alpinejs/dist/cdn.min.js", dst: "alpine.min.js" },
  {
    name: "inter",
    src: "@fontsource-variable/inter",
    dst: "@fontsource-variable/inter",
  },
  { name: "chart.js", src: "chart.js/dist/chart.umd.js", dst: "chart.umd.js" },
];

function main() {
  if (TTY) {
    const ASCII = `  /$$$$$$ /$$         /$$/$$         /$$
 /$$__  $|__/        | $|__/        | $$
| $$   $$/$$ /$$$$$$| $$/$$/$$$$$$$| $$   /$$
| $$$$$$$| $$/$$__  $| $| $| $$__  $| $$  /$$/
| $$__  $| $| $$  __| $| $| $$   $| $$$$$$/
| $$  | $| $| $$     | $| $| $$  | $| $$_  $$
| $$  | $| $| $$     | $| $| $$  | $| $$ \\  $$
|__/  |__|__|__/     |__|__|__/  |__|__/  __/`;
    const lines = [
      chalk.cyan(ASCII),
      "",
      `  ${chalk.bold.cyan("build-vendor")}`,
    ];
    console.log(
      boxen(lines.join("\n"), {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "cyan",
      }),
    );
  } else {
    console.log("  build-vendor");
  }

  section("Copying vendor assets");

  if (existsSync(vendorDir)) {
    rmSync(vendorDir, { recursive: true });
  }
  mkdirSync(vendorDir, { recursive: true });

  let copied = 0;
  for (const asset of ASSETS) {
    const src = resolve(projectDir, "node_modules", asset.src);
    const dst = resolve(vendorDir, asset.dst);

    if (!existsSync(src)) {
      fail(`${asset.name}: ${asset.src} not found — run pnpm install`);
      continue;
    }

    cpSync(src, dst, { recursive: true });
    ok(`${asset.name}`);
    copied++;
  }

  gap();
  ok(`Copied ${copied}/${ASSETS.length} vendor assets`);
}

main();
