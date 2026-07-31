import {
  createCliRenderer,
  Box,
  Text,
  ScrollBoxRenderable,
  TextRenderable,
  type KeyEvent,
} from "@opentui/core";
import { watch, openSync, readSync, closeSync, statSync, existsSync } from "node:fs";

const LOG_DIR = process.env.AIRLINK_LOG_DIR ?? "../logs";
const LOG_FILES = ["combined.log", "error.log"];
const CODENAME = "Katharos";
const VERSION = "2.5.128";
const WIDE_MIN_WIDTH = 110;
const BRAND_WIDTH = 56;
const INITIAL_TAIL_LINES = 1000;

const ART = [
  " █████╗ ██╗██████╗ ██╗     ██╗███╗   ██╗██╗  ██╗",
  "██╔══██╗██║██╔══██╗██║     ██║████╗  ██║██║ ██╔╝",
  "███████║██║██████╔╝██║     ██║██╔██╗ ██║█████╔╝ ",
  "██╔══██║██║██╔══██╗██║     ██║██║╚██╗██║██╔═██╗ ",
  "██║  ██║██║██║  ██║███████╗██║██║ ╚████║██║  ██╗",
  "╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚══════╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝",
];

const LICENSE_FULL = [
  "MIT License",
  "Copyright (c) 2026 Airlink",
  "",
  "Permission is hereby granted, free of charge, to any person",
  "obtaining a copy of this software and associated documentation",
  'files (the "Software"), to deal in the Software without',
  "restriction, including without limitation the rights to use, copy,",
  "modify, merge, publish, distribute, sublicense, and/or sell copies",
  "of the Software, and to permit persons to whom the Software is",
  "furnished to do so, subject to the following conditions:",
  "",
  "The above copyright notice and this permission notice shall be",
  "included in all copies or substantial portions of the Software.",
  "",
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,',
  "EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES",
  "OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND",
  "NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT",
  "HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,",
  "WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
  "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER",
  "DEALINGS IN THE SOFTWARE.",
];

const LICENSE_SHORT = [
  "MIT License — Copyright (c) 2026 Airlink.",
  "Free to use, copy, modify and redistribute.",
  "See LICENSE for the full text.",
];

function logPath(name: string) {
  return `${LOG_DIR}/${name}`;
}

function readTail(name: string, from: number): { lines: string[]; nextOffset: number } {
  const path = logPath(name);
  const size = statSync(path).size;
  if (from > size) from = 0;
  if (from === size) return { lines: [], nextOffset: size };
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(size - from);
    readSync(fd, buf, 0, buf.length, from);
    const text = buf.toString("utf8");
    const parts = text.split("\n");
    const trailing = parts.pop() ?? "";
    return { lines: parts, nextOffset: size - trailing.length };
  } finally {
    closeSync(fd);
  }
}

function colorForLine(line: string): string {
  if (line.includes("ERROR")) return "#FF6B6B";
  if (line.includes("WARN")) return "#FFD166";
  if (line.includes("INFO")) return "#7CB7FF";
  return "#9CA3AF";
}

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
    backgroundColor: "#0D1117",
  });

  let currentFile = LOG_FILES[0];
  let offsets: Record<string, number> = {};

  const logs = new ScrollBoxRenderable(renderer, {
    id: "logs",
    width: "100%",
    height: "100%",
    stickyScroll: true,
    stickyStart: "bottom",
    viewportCulling: true,
    scrollbarOptions: {
      trackOptions: { foregroundColor: "#4B5563", backgroundColor: "#1F2937" },
    },
  });

  function clearLogs() {
    for (const child of [...logs.getChildren()]) logs.remove(child);
  }

  function fillFromFile(name: string) {
    clearLogs();
    if (!existsSync(logPath(name))) {
      logs.add(
        new TextRenderable(renderer, {
          content: `(no ${name} yet — waiting for panel logs)`,
          fg: "#6B7280",
          width: "100%",
        })
      );
      return;
    }
    offsets[name] = 0;
    const { lines, nextOffset } = readTail(name, 0);
    offsets[name] = nextOffset;
    for (const line of lines.slice(-INITIAL_TAIL_LINES)) {
      logs.add(new TextRenderable(renderer, { content: line, fg: colorForLine(line), width: "100%" }));
    }
  }

  function appendNewLines() {
    if (!existsSync(logPath(currentFile))) return;
    const { lines, nextOffset } = readTail(currentFile, offsets[currentFile] ?? 0);
    offsets[currentFile] = nextOffset;
    for (const line of lines) {
      logs.add(new TextRenderable(renderer, { content: line, fg: colorForLine(line), width: "100%" }));
    }
  }

  // ── Brand panel (persistent; properties mutated on resize) ──────────────
  const brand = Box(
    {
      id: "brand",
      width: BRAND_WIDTH,
      height: "100%",
      flexDirection: "column",
      paddingX: 1,
      paddingY: 1,
      gap: 1,
      borderStyle: "rounded",
      borderColor: "#374151",
      title: "Airlink Panel",
      titleColor: "#4ADE80",
    },
    Text({ content: ART.join("\n"), fg: "#4ADE80" }),
    Text({ content: `Codename: ${CODENAME}  ·  v${VERSION}`, fg: "#60A5FA" }),
    Text({ id: "license-full", content: LICENSE_FULL.join("\n"), fg: "#9CA3AF" }),
    Text({ id: "license-short", content: LICENSE_SHORT.join("\n"), fg: "#9CA3AF", visible: false }),
    Text({ content: "[Tab] switch log   [Ctrl+C] quit", fg: "#4B5563" })
  );

  const logsWrap = Box({ id: "logs-wrap", flexGrow: 1, flexDirection: "column" }, logs);
  const outer = Box(
    { id: "outer", width: "100%", height: "100%", flexDirection: "row", gap: 1 },
    brand,
    logsWrap
  );
  renderer.root.add(outer);

  const realOuter = renderer.root.getRenderable("outer")!;
  const realBrand = realOuter.getRenderable("brand")!;

  function applyLayout() {
    const wide = renderer.width >= WIDE_MIN_WIDTH;
    realOuter.flexDirection = wide ? "row" : "column";
    realBrand.width = wide ? BRAND_WIDTH : "100%";
    realBrand.height = wide ? "100%" : "auto";
    const licenseFull = realBrand.getRenderable("license-full");
    const licenseShort = realBrand.getRenderable("license-short");
    if (licenseFull) licenseFull.visible = wide;
    if (licenseShort) licenseShort.visible = !wide;
  }

  function switchFile() {
    const idx = LOG_FILES.indexOf(currentFile);
    currentFile = LOG_FILES[(idx + 1) % LOG_FILES.length];
    fillFromFile(currentFile);
  }

  applyLayout();
  fillFromFile(currentFile);

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "tab") switchFile();
  });

  let watcher: ReturnType<typeof watch> | undefined;
  try {
    watcher = watch(LOG_DIR, { persistent: false }, (_evt, filename) => {
      if (filename && String(filename) === currentFile) appendNewLines();
    });
  } catch {
    /* log dir may not exist yet */
  }

  renderer.on("resize", () => applyLayout());
  renderer.on("destroy", () => watcher?.close());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
