import { useCallback, useEffect, useMemo, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor/editor/editor.api';
import { useSettingsStore } from '@/store/settingsStore';
import { useResolvedTheme } from '@/hooks/useResolvedTheme';
import { DARK_THEME_ID, LIGHT_THEME_ID } from '@/services/latexLanguage';
import { languageById } from '@/services/listings/languages';
import { parseLineRanges, toggleLine } from '@/services/listings/lineRanges';
import { Spinner } from '@/components/ui/Feedback';

interface EmbeddedCodeEditorProps {
  code: string;
  language: string;
  onChange: (code: string) => void;
  /** Highlighted-line ranges, in `1,3-5` form. */
  highlightLines: string;
  onHighlightChange: (ranges: string) => void;
  /** Line number the listing starts at, so the gutter matches the PDF. */
  firstNumber: number;
  showMinimap: boolean;
  readOnly?: boolean;
  /** Called when the user pastes, so the caller can run language detection. */
  onPaste?: (text: string) => void;
}

/**
 * The code editor embedded in the wizard and inspector.
 *
 * This is a full Monaco instance rather than a textarea, so a listing gets the
 * same editing affordances as the document itself: bracket matching, multiple
 * cursors, find and replace, folding.
 *
 * Clicking a line number toggles highlighting for that line. That is the whole
 * point of the line-highlight feature — the user picks lines by clicking them
 * rather than working out that they meant `3,7-9`.
 */
export function EmbeddedCodeEditor({
  code,
  language,
  onChange,
  highlightLines,
  onHighlightChange,
  firstNumber,
  showMinimap,
  readOnly = false,
  onPaste,
}: EmbeddedCodeEditorProps) {
  const settings = useSettingsStore((state) => state.settings);
  const theme = useResolvedTheme();

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  // Held in a ref so the click handler, registered once, always sees current
  // values without being re-registered on every keystroke.
  const highlightRef = useRef(highlightLines);
  highlightRef.current = highlightLines;
  const onHighlightRef = useRef(onHighlightChange);
  onHighlightRef.current = onHighlightChange;
  const firstNumberRef = useRef(firstNumber);
  firstNumberRef.current = firstNumber;

  const monacoLanguage = languageById(language)?.monaco ?? 'plaintext';

  const options = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      fontSize: Math.max(11, settings.fontSize - 1),
      fontFamily: settings.fontFamily,
      tabSize: settings.tabWidth,
      insertSpaces: settings.insertSpaces,
      minimap: { enabled: showMinimap, renderCharacters: false },
      lineNumbers: (lineNumber: number) => String(lineNumber + firstNumber - 1),
      // The gutter is a control surface here, so it must accept clicks.
      lineNumbersMinChars: 4,
      glyphMargin: false,
      folding: true,
      wordWrap: settings.wordWrap ? 'on' : 'off',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
      bracketPairColorization: { enabled: settings.bracketPairColorization },
      readOnly,
      multiCursorModifier: 'alt',
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
      padding: { top: 8, bottom: 8 },
      overviewRulerLanes: 0,
    }),
    [settings, showMinimap, firstNumber, readOnly],
  );

  /** Paint the highlighted lines. */
  const applyDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (editor === null || monaco === null) return;

    const model = editor.getModel();
    if (model === null) return;

    const offset = firstNumberRef.current - 1;
    const lines = parseLineRanges(highlightRef.current);

    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
    for (const displayed of lines) {
      // The gutter shows `firstNumber`-based numbers; the model is 1-based.
      const actual = displayed - offset;
      if (actual < 1 || actual > model.getLineCount()) continue;

      decorations.push({
        range: new monaco.Range(actual, 1, actual, 1),
        options: {
          isWholeLine: true,
          className: 'inktex-listing-highlight',
          linesDecorationsClassName: 'inktex-listing-highlight-gutter',
        },
      });
    }

    if (decorationsRef.current === null) {
      decorationsRef.current = editor.createDecorationsCollection(decorations);
    } else {
      decorationsRef.current.set(decorations);
    }
  }, []);

  useEffect(applyDecorations, [applyDecorations, highlightLines, firstNumber, code]);

  const onMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Clicking the line-number gutter toggles that line's highlighting.
      editor.onMouseDown((event) => {
        const isGutter =
          event.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
          event.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS;

        if (!isGutter) return;
        const lineNumber = event.target.position?.lineNumber;
        if (lineNumber === undefined) return;

        event.event.preventDefault();
        const displayed = lineNumber + firstNumberRef.current - 1;
        onHighlightRef.current(toggleLine(highlightRef.current, displayed));
      });

      if (onPaste !== undefined) {
        editor.onDidPaste(() => {
          const model = editor.getModel();
          if (model !== null) onPaste(model.getValue());
        });
      }

      applyDecorations();
    },
    [applyDecorations, onPaste],
  );

  return (
    <Editor
      language={monacoLanguage}
      value={code}
      theme={theme === 'dark' ? DARK_THEME_ID : LIGHT_THEME_ID}
      options={options}
      onMount={onMount}
      onChange={(value) => onChange(value ?? '')}
      loading={
        <div className="flex h-full items-center justify-center">
          <Spinner className="size-4 text-content-muted" />
        </div>
      }
    />
  );
}
