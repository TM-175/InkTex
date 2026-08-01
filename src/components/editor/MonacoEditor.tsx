import { useCallback, useEffect, useMemo, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import type { EditorTab } from '@/types/editor';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useResolvedTheme } from '@/hooks/useResolvedTheme';
import { DARK_THEME_ID, LIGHT_THEME_ID, languageForPath } from '@/services/latexLanguage';
import { setActiveEditor } from '@/services/editorBridge';
import { Spinner } from '@/components/ui/Feedback';

interface MonacoEditorProps {
  tab: EditorTab;
}

/**
 * The text editor.
 *
 * `path` is passed to `@monaco-editor/react`, which keeps one model per file.
 * That is what preserves undo history and cursor position when switching tabs
 * — recreating a model on every switch would discard both.
 */
export function MonacoEditor({ tab }: MonacoEditorProps) {
  const settings = useSettingsStore((state) => state.settings);
  const theme = useResolvedTheme();
  const updateTabContent = useProjectStore((state) => state.updateTabContent);
  const pendingLocation = useProjectStore((state) => state.pendingLocation);
  const consumePendingLocation = useProjectStore((state) => state.consumePendingLocation);

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  const options = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      tabSize: settings.tabWidth,
      insertSpaces: settings.insertSpaces,
      wordWrap: settings.wordWrap ? 'on' : 'off',
      minimap: { enabled: settings.minimap, renderCharacters: false },
      lineNumbers: settings.lineNumbers,
      renderWhitespace: settings.renderWhitespace,
      bracketPairColorization: { enabled: settings.bracketPairColorization },
      autoClosingBrackets: settings.autoClosingBrackets ? 'languageDefined' : 'never',
      autoClosingQuotes: settings.autoClosingBrackets ? 'languageDefined' : 'never',

      // Editing behaviour tuned for prose-heavy LaTeX rather than code.
      automaticLayout: true,
      autoIndent: 'full',
      formatOnPaste: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      multiCursorModifier: 'alt',
      folding: true,
      foldingStrategy: 'auto',
      showFoldingControls: 'mouseover',
      matchBrackets: 'always',
      occurrencesHighlight: 'singleFile',
      renderLineHighlight: 'line',
      scrollBeyondLastLine: true,
      lineHeight: Math.round(settings.fontSize * 1.6),
      padding: { top: 12, bottom: 24 },
      guides: { indentation: true, bracketPairs: false },
      suggestSelection: 'first',
      quickSuggestions: { other: true, comments: false, strings: false },
      wordBasedSuggestions: 'currentDocument',
      unicodeHighlight: { ambiguousCharacters: false },
      stickyScroll: { enabled: false },
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        useShadows: false,
      },
    }),
    [settings],
  );

  const onMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setActiveEditor(editor, monaco);

    // Monaco's own Cmd/Ctrl+S would otherwise do nothing; route it to the app.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void useProjectStore.getState().saveActiveTab();
    });

    editor.onDidChangeCursorPosition(() => {
      const position = editor.getPosition();
      const path = useProjectStore.getState().activePath;
      if (position === null || path === null) return;

      useProjectStore.getState().storeViewState(path, {
        line: position.lineNumber,
        column: position.column,
        scrollTop: editor.getScrollTop(),
      });
    });
  }, []);

  useEffect(() => () => setActiveEditor(null, null), []);

  // Jump to a location requested elsewhere (a problem row, quick open).
  useEffect(() => {
    if (pendingLocation === null || pendingLocation.path !== tab.path) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (editor === null || monaco === null) return;

    // Defer a frame so the model for a freshly opened tab is in place.
    const frame = requestAnimationFrame(() => {
      editor.revealLineInCenter(pendingLocation.line, monaco.editor.ScrollType.Smooth);
      editor.setPosition({
        lineNumber: pendingLocation.line,
        column: pendingLocation.column ?? 1,
      });
      editor.focus();
      consumePendingLocation();
    });

    return () => cancelAnimationFrame(frame);
  }, [pendingLocation, tab.path, consumePendingLocation]);

  return (
    <Editor
      path={tab.path}
      language={languageForPath(tab.path)}
      value={tab.content}
      theme={theme === 'dark' ? DARK_THEME_ID : LIGHT_THEME_ID}
      options={options}
      onMount={onMount}
      onChange={(value) => updateTabContent(tab.path, value ?? '')}
      loading={
        <div className="flex h-full items-center justify-center">
          <Spinner className="size-5 text-content-muted" />
        </div>
      }
    />
  );
}
