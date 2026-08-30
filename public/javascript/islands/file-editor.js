/**
 * file-editor — Monaco editor island
 *
 * Mount: FileEditor.mount(root, config)
 * Destroy: disposes Monaco, removes all listeners.
 *
 * config = {
 *   serverUUID, filePath, language, content,
 *   tooLarge, invalidUtf8, skipped,
 *   saveUrl,
 * }
 */
let monacoReady;
async function loadMonaco() {
  if (monacoReady) return monacoReady;
  monacoReady = new Promise((resolve) => {
    require.config({ paths: { vs: "/monaco/vs" } });
    require(["vs/editor/editor.main"], resolve);
  });
  return monacoReady;
}

const darkTheme = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6A9955", fontStyle: "italic" },
    { token: "keyword", foreground: "C586C0", fontStyle: "bold" },
    { token: "string", foreground: "CE9178" },
  ],
  colors: {
    "editor.background": "#1E1E1E",
    "editor.foreground": "#D4D4D4",
    "editor.lineHighlightBackground": "#2A2A2A",
    "editor.selectionBackground": "#264F78",
    "editor.selectionHighlightBackground": "#2D3B40",
    "editorCursor.foreground": "#AEAFAD",
    "editorWhitespace.foreground": "#3B3B3B",
  },
};
const lightTheme = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "008000", fontStyle: "italic" },
    { token: "keyword", foreground: "0000FF", fontStyle: "bold" },
    { token: "string", foreground: "A31515" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#000000",
    "editor.lineHighlightBackground": "#F5F5F5",
    "editor.selectionBackground": "#ADD6FF",
    "editor.selectionHighlightBackground": "#E5EBF1",
    "editorCursor.foreground": "#000000",
    "editorWhitespace.foreground": "#DDDDDD",
  },
};

export async function mount(root, config) {
  await loadMonaco();
  monaco.editor.defineTheme("custom-dark", darkTheme);
  monaco.editor.defineTheme("custom-light", lightTheme);

  let editor = null;
  let isDirty = false;
  let isSaving = false;
  let allowNavigation = config.skipped || false;
  let wordWrapEnabled = false;
  let minimapEnabled = false;
  let themeMode = "auto";

  const listeners = [];
  function listen(el, evt, fn, opts) {
    el.addEventListener(evt, fn, opts);
    listeners.push([el, evt, fn, opts]);
  }

  function updateTheme() {
    if (!editor) return;
    let theme;
    if (themeMode === "auto")
      theme = document.documentElement.classList.contains("dark")
        ? "custom-dark"
        : "custom-light";
    else if (themeMode === "dark") theme = "custom-dark";
    else theme = "custom-light";
    monaco.editor.setTheme(theme);
  }

  if (config.skipped) {
    const container = root.querySelector("#editor-container");
    if (container)
      container.innerHTML = `<div class="p-6 text-sm" style="color:var(--theme-text);">${config.tooLarge ? "This file is too large (&gt; 1 MiB) for the in-browser editor. Download or edit it locally instead." : "This file contains non-UTF-8 binary content and cannot be edited safely in the browser."}</div>`;
    const info = root.querySelector("#file-info");
    if (info)
      info.textContent = config.tooLarge
        ? "file too large"
        : "binary / non-UTF-8";
  } else {
    editor = monaco.editor.create(root.querySelector("#editor-container"), {
      value: config.content || "",
      language: config.language,
      theme: document.documentElement.classList.contains("dark")
        ? "custom-dark"
        : "custom-light",
      automaticLayout: true,
      lineNumbers: "on",
      roundedSelection: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: "all",
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      minimap: { enabled: minimapEnabled, scale: 1, showSlider: "mouseover" },
      wordWrap: wordWrapEnabled ? "on" : "off",
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontLigatures: true,
      contextmenu: true,
      folding: true,
      foldingStrategy: "auto",
      matchBrackets: "always",
      autoIndent: "full",
      formatOnPaste: true,
      formatOnType: true,
      renderWhitespace: "selection",
      renderControlCharacters: true,
      renderIndentGuides: true,
      renderFinalNewline: true,
      colorDecorators: true,
      suggest: {
        showMethods: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showKeywords: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showTypeParameters: true,
        showSnippets: true,
      },
      bracketPairColorization: { enabled: true },
      padding: { top: 10 },
    });
    editor.onDidChangeCursorPosition((e) => {
      root.querySelector("#editor-status").textContent =
        `Line: ${e.position.lineNumber}, Column: ${e.position.column}`;
    });
    editor.onDidChangeModelContent(() => {
      isDirty = true;
    });
    root.querySelector("#file-info").textContent =
      config.language || "plaintext";
  }

  async function saveFile() {
    if (!editor || isSaving) return;
    isSaving = true;
    const saveBtn = root.querySelector("#saveBtn");
    const originalHTML = saveBtn.innerHTML;
    saveBtn.disabled = true;
    try {
      const csrfToken =
        document
          .querySelector('meta[name="csrf-token"]')
          ?.getAttribute("content") || "";
      const res = await fetch(config.saveUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "csrf-token": csrfToken,
        },
        body: JSON.stringify({ content: editor.getValue() }),
      });
      if (!res.ok) {
        let msg = "Failed to save file";
        try {
          const d = await res.json();
          if (d?.error) msg = d.error;
        } catch {}
        throw new Error(msg);
      }
      isDirty = false;
      window.showToast?.("File saved.", "success");
    } catch (err) {
      window.showToast?.(err?.message || "Failed to save file", "error");
      window.modal?.confirm({
        title: "Save failed",
        body: "Your changes are still in the editor. Try saving again?",
        confirmLabel: "Retry",
        onConfirm: saveFile,
      });
    } finally {
      isSaving = false;
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHTML;
    }
  }

  const saveBtn = root.querySelector("#saveBtn");
  if (saveBtn) listen(saveBtn, "click", saveFile);
  listen(document, "keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveFile();
    }
  });

  // Word wrap
  const wwBtn = root.querySelector("#toggle-wordwrap");
  if (wwBtn)
    listen(wwBtn, "click", () => {
      wordWrapEnabled = !wordWrapEnabled;
      editor?.updateOptions({ wordWrap: wordWrapEnabled ? "on" : "off" });
      wwBtn.textContent = wordWrapEnabled ? "On" : "Off";
    });

  // Minimap
  const mmBtn = root.querySelector("#toggle-minimap");
  if (mmBtn)
    listen(mmBtn, "click", () => {
      minimapEnabled = !minimapEnabled;
      editor?.updateOptions({ minimap: { enabled: minimapEnabled } });
      mmBtn.textContent = minimapEnabled ? "On" : "Off";
    });

  // Theme toggle
  const thBtn = root.querySelector("#toggle-theme");
  if (thBtn)
    listen(thBtn, "click", () => {
      themeMode =
        themeMode === "auto"
          ? "light"
          : themeMode === "light"
            ? "dark"
            : "auto";
      thBtn.textContent =
        themeMode.charAt(0).toUpperCase() + themeMode.slice(1);
      updateTheme();
    });

  // Dark mode observer
  const obs = new MutationObserver((muts) => {
    if (themeMode === "auto")
      muts.forEach((m) => {
        if (m.attributeName === "class") updateTheme();
      });
  });
  obs.observe(document.documentElement, { attributes: true });

  // Retry connection
  const retryBtn = root.querySelector("#retryConnectionBtn");
  if (retryBtn)
    listen(retryBtn, "click", async () => {
      const originalHTML = retryBtn.innerHTML;
      retryBtn.disabled = true;
      try {
        const res = await fetch(window.location.href);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const dataEl = doc.getElementById("editor-file-data");
        if (!res.ok || doc.getElementById("daemon-offline-banner") || !dataEl) {
          window.showToast?.("Daemon still unreachable.", "error");
          return;
        }
        isDirty = false;
        allowNavigation = false;
        const data = JSON.parse(dataEl.textContent);
        if (data.tooLarge || data.invalidUtf8) {
          allowNavigation = true;
          root.querySelector("#editor-container").innerHTML =
            `<div class="p-6 text-sm" style="color:var(--theme-text);">${data.tooLarge ? "File too large." : "Binary content."}</div>`;
        } else {
          editor?.setValue(data.content || "");
        }
        window.showToast?.("Connection restored.", "success");
      } catch {
        window.showToast?.("Network error.", "error");
      } finally {
        retryBtn.disabled = false;
        retryBtn.innerHTML = originalHTML;
      }
    });

  // Unsaved changes guard
  listen(window, "beforeunload", (e) => {
    if (isDirty && !allowNavigation) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  listen(document, "click", (e) => {
    if (!isDirty || allowNavigation) return;
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    e.preventDefault();
    e.stopPropagation();
    window.modal?.confirm({
      title: "Unsaved changes",
      body: "You have unsaved changes. Leave anyway?",
      danger: true,
      confirmLabel: "Discard",
      onConfirm: () => {
        allowNavigation = true;
        window.location.href = href;
      },
    });
  });

  function teardown() {
    editor?.dispose();
    listeners.forEach(([el, evt, fn, opts]) =>
      el.removeEventListener(evt, fn, opts),
    );
    listeners.length = 0;
    obs.disconnect();
  }
  return { teardown };
}
