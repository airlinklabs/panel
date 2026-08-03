/* inline script 1 */

/* inline script 2 */

require.config({
  paths: {
    'vs': '/monaco/vs'
  }
});
  let editor;
  let wordWrapEnabled = false;
  let minimapEnabled = false;
  let themeMode = 'auto'; // 'auto', 'light', or 'dark'
  let isDirty = false;
  let allowNavigation = false;
  const serverUuid = null;
  const editorFilePath = null;
  const saveUrl = `/server/${serverUuid}/files/${encodeURIComponent(editorFilePath)}`;

  require(['vs/editor/editor.main'], function (_) {
    // Define custom themes
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
        { token: 'string', foreground: 'CE9178' }
      ],
      colors: {
        'editor.background': '#1E1E1E',
        'editor.foreground': '#D4D4D4',
        'editor.lineHighlightBackground': '#2A2A2A',
        'editor.selectionBackground': '#264F78',
        'editor.selectionHighlightBackground': '#2D3B40',
        'editorCursor.foreground': '#AEAFAD',
        'editorWhitespace.foreground': '#3B3B3B'
      }
    });

    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '008000', fontStyle: 'italic' },
        { token: 'keyword', foreground: '0000FF', fontStyle: 'bold' },
        { token: 'string', foreground: 'A31515' }
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#000000',
        'editor.lineHighlightBackground': '#F5F5F5',
        'editor.selectionBackground': '#ADD6FF',
        'editor.selectionHighlightBackground': '#E5EBF1',
        'editorCursor.foreground': '#000000',
        'editorWhitespace.foreground': '#DDDDDD'
      }
    });

    // Create editor with enhanced options
    editor = monaco.editor.create(document.getElementById('editor-container'), {
      value: null,
      language: 'null',
      theme: document.documentElement.classList.contains('dark') ? 'custom-dark' : 'custom-light',
      automaticLayout: true,
      lineNumbers: 'on',
      roundedSelection: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'all',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      minimap: {
        enabled: minimapEnabled,
        scale: 1,
        showSlider: 'mouseover'
      },
      wordWrap: wordWrapEnabled ? 'on' : 'off',
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontLigatures: true,
      contextmenu: true,
      rulers: [],
      bracketPairColorization: {
        enabled: true
      },
      padding: {
        top: 10
      },
      folding: true,
      foldingStrategy: 'auto',
      matchBrackets: 'always',
      autoIndent: 'full',
      formatOnPaste: true,
      formatOnType: true,
      renderWhitespace: 'selection',
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
        showSnippets: true
      }
    });

    // Update status bar with cursor position
    editor.onDidChangeCursorPosition(function(e) {
      document.getElementById('editor-status').textContent = `Line: ${e.position.lineNumber}, Column: ${e.position.column}`;
    });

    // Track unsaved changes — dirty flag guards navigation and close
    editor.onDidChangeModelContent(function() {
      if (!isDirty) isDirty = true;
    });

    // Set file info in the status bar
    document.getElementById('file-info').textContent = 'null' || 'plaintext';

    // Toggle word wrap
    document.getElementById('toggle-wordwrap').addEventListener('click', function() {
      wordWrapEnabled = !wordWrapEnabled;
      editor.updateOptions({ wordWrap: wordWrapEnabled ? 'on' : 'off' });
      this.textContent = wordWrapEnabled ? 'On' : 'Off';
    });

    // Toggle minimap
    document.getElementById('toggle-minimap').addEventListener('click', function() {
      minimapEnabled = !minimapEnabled;
      editor.updateOptions({ minimap: { enabled: minimapEnabled } });
      this.textContent = minimapEnabled ? 'On' : 'Off';
    });

    // Function to update editor theme
    function updateEditorTheme() {
      let theme;
      if (themeMode === 'auto') {
        theme = document.documentElement.classList.contains('dark') ? 'custom-dark' : 'custom-light';
      } else if (themeMode === 'dark') {
        theme = 'custom-dark';
      } else {
        theme = 'custom-light';
      }
      monaco.editor.setTheme(theme);
    }

    // Toggle theme button
    document.getElementById('toggle-theme').addEventListener('click', function() {
      if (themeMode === 'auto') {
        themeMode = 'light';
      } else if (themeMode === 'light') {
        themeMode = 'dark';
      } else {
        themeMode = 'auto';
      }
      this.textContent = themeMode.charAt(0).toUpperCase() + themeMode.slice(1);
      updateEditorTheme();
    });

    // Adjust theme when system theme changes
    const darkModeObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.attributeName === 'class' && themeMode === 'auto') {
          updateEditorTheme();
        }
      });
    });

    darkModeObserver.observe(document.documentElement, { attributes: true });
  });


  async function saveFile() {
    if (!editor) return;
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = `
      <svg class="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Saving...
    `;

    const content = editor.getValue();
    try {
      const response = await fetch(saveUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) throw new Error('Failed to save file');

      isDirty = false;
      showToast('File saved.', 'success');
    } catch (error) {
      console.error('Error saving file:', error);
      // Content is never cleared on failure — offer Retry instead
      showToast('Failed to save file', 'error');
      if (window.modal) {
        window.modal.confirm({
          title: 'Save failed',
          body: 'Your changes are still in the editor. Try saving again?',
          danger: false,
          confirmLabel: 'Retry',
          onConfirm: function () { saveFile(); },
        });
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
        Save
      `;
    }
  }

  document.getElementById('saveBtn').addEventListener('click', saveFile);

  document.addEventListener('keydown', async (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      await saveFile();
    }
  });

  // ── Unsaved-changes guard ─────────────────────────────────────────────────
  // beforeunload covers tab close / hard navigation; in-app links get a
  // Cancel-first confirm ("Keep editing" stays focused — never traps).
  window.addEventListener('beforeunload', function (event) {
    if (!isDirty || allowNavigation) return;
    event.preventDefault();
    event.returnValue = '';
  });

  function guardNavigation(href) {
    if (!isDirty || allowNavigation) return;
    if (window.modal) {
      event.preventDefault();
      event.stopPropagation();
      window.modal.confirm({
        title: 'Unsaved changes',
        body: 'You have unsaved changes in this file. Leave anyway?',
        confirmLabel: 'Discard',
        onConfirm: function () {
          allowNavigation = true;
          window.location.href = href;
        },
      });
    }
  }

  document.addEventListener('click', function (event) {
    if (!isDirty || allowNavigation) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    guardNavigation(href);
  });
