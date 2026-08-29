#!/usr/bin/env node

/**
 * generate-al-icon.mjs - generates al-icon SVG sprite from SVG files.
 *
 * Usage:
 *   node public/scripts/generate-al-icon.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import boxen from "boxen";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, "../..");
const iconsDir = resolve(projectDir, "node_modules/@airlink/icons/svg");
const outputDir = resolve(projectDir, "public/assets");

const TTY = process.stdout.isTTY;

// ---
// Terminal helpers
// ---

const ok = (msg) => console.log(`  ${chalk.green("+")} ${msg}`);
const warn = (msg) =>
  console.log(`  ${chalk.yellow("!")} ${chalk.yellow(msg)}`);
const gap = () => console.log();

function section(title) {
  gap();
  console.log(`  ${chalk.bold.green(title)}`);
}

// ---
// Sprite generation
// ---

function generate() {
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
      `  ${chalk.bold.cyan("generate-al-icon")}`,
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
    console.log("  generate-al-icon");
  }

  if (!existsSync(iconsDir)) {
    warn("@airlink/icons not found — run pnpm install");
    return;
  }

  section("Generating SVG sprite");

  const svgFiles = readdirSync(iconsDir).filter((f) => f.endsWith(".svg"));
  if (svgFiles.length === 0) {
    warn("No SVG files found in @airlink/icons/svg");
    return;
  }

  const symbols = svgFiles.map((file) => {
    const name = file.replace(".svg", "");
    const svg = readFileSync(resolve(iconsDir, file), "utf-8");
    const viewBox = svg.match(/viewBox="([^"]*)"/)?.[1] || "0 0 24 24";
    const content = svg
      .replace(/<svg[^>]*>/, "")
      .replace(/<\/svg>/, "")
      .trim();
    return `  <symbol id="al-icon-${name}" viewBox="${viewBox}">\n    ${content}\n  </symbol>`;
  });

  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join("\n")}\n</svg>`;

  writeFileSync(resolve(outputDir, "al-icon.svg"), sprite);
  ok(`Generated al-icon.svg with ${svgFiles.length} icons`);
}

generate();
