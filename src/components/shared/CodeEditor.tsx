import { useRef, useEffect } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  tabSize?: number;
  editorViewRef?: React.MutableRefObject<EditorView | null>;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function CodeEditor({ value, onChange, placeholder, className, tabSize = 2, editorViewRef, onScroll, onContextMenu }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const tabCompartmentRef = useRef<Compartment | null>(null);
  const tabSizeRef = useRef(tabSize);
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScroll);
  const isExternalUpdate = useRef(false);

  tabSizeRef.current = tabSize;

  onChangeRef.current = onChange;
  onScrollRef.current = onScroll;

  // Create editor
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const theme = EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "var(--editor-font-size, 14px)",
        fontWeight: "var(--editor-font-weight, 400)",
        fontFamily: "var(--app-font, 'JetBrains Mono', 'Fira Code', monospace)",
      },
      ".cm-content": {
        padding: "16px 24px",
        lineHeight: "var(--editor-line-height, 1.9)",
        color: "var(--color-ink-soft, #3d3d38)",
        fontFamily: "inherit",
      },
      ".cm-line": {
        padding: "0",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-selectionBackground": {
        background: "var(--color-accent-mist, #e8f0eb) !important",
      },
      "&.cm-focused .cm-selectionBackground": {
        background: "var(--color-accent-mist, #e8f0eb) !important",
      },
      ".cm-activeLine": {
        background: "transparent",
      },
      ".cm-gutters": {
        background: "transparent",
        border: "none",
        color: "var(--color-ink-ghost, #b8b8ae)",
        fontSize: "11px",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 8px 0 16px",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--color-accent, #2d5a3d)",
        borderLeftWidth: "2px",
      },
      ".cm-matchingBracket": {
        background: "var(--color-accent-mist, #e8f0eb)",
        outline: "1px solid var(--color-accent, #2d5a3d)",
      },
      ".cm-searchMatch": {
        background: "var(--color-accent-mist, #e8f0eb)",
        outline: "1px solid var(--color-accent, #2d5a3d)",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        background: "var(--color-accent, #2d5a3d)",
        color: "white",
      },
    });

    const spaces = " ".repeat(tabSize);
    const tabCompartment = new Compartment();
    tabCompartmentRef.current = tabCompartment;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightSpecialChars(),
        history(),
        bracketMatching(),
        indentOnInput(),
        tabCompartment.of(indentUnit.of(spaces)),
        highlightSelectionMatches(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          { key: "Tab", run: (view) => {
            const size = tabSizeRef.current;
            const { from, to } = view.state.selection.main;
            view.dispatch({ changes: { from, to, insert: " ".repeat(size) }, selection: { anchor: from + size } });
            return true;
          }},
        ]),
        updateListener,
        theme,
        placeholder ? cmPlaceholder(placeholder) : [],
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    if (editorViewRef) editorViewRef.current = view;

    // Direct scroll listener for reliable scroll sync
    const scrollDom = view.scrollDOM;
    const scrollHandler = () => {
      onScrollRef.current?.(scrollDom.scrollTop, scrollDom.scrollHeight, scrollDom.clientHeight);
    };
    scrollDom.addEventListener("scroll", scrollHandler);

    return () => {
      scrollDom.removeEventListener("scroll", scrollHandler);
      view.destroy();
      viewRef.current = null;
      if (editorViewRef) editorViewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update tab size when it changes
  useEffect(() => {
    const view = viewRef.current;
    const compartment = tabCompartmentRef.current;
    if (!view || !compartment) return;
    const spaces = " ".repeat(tabSize);
    view.dispatch({
      effects: compartment.reconfigure(indentUnit.of(spaces)),
    });
  }, [tabSize]);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      isExternalUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
      isExternalUpdate.current = false;
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={className}
      onContextMenu={onContextMenu}
    />
  );
}

// Helper to insert text at cursor in CodeMirror
export function insertAtCursor(view: EditorView, before: string, after: string = "") {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = before + selected + after;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  });
  view.focus();
}
