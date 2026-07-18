import { useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { EditorMode } from "../types";
import { livePreviewExtension } from "../editor/livePreview";

interface EditorPaneProps {
  value: string;
  mode: EditorMode;
  onChange: (value: string) => void;
  onScrollRatio?: (ratio: number) => void;
  onImportAttachment?: (file: File) => Promise<string>;
}

export function EditorPane({
  value,
  mode,
  onChange,
  onScrollRatio,
  onImportAttachment
}: EditorPaneProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const extensions = useMemo(() => {
    const result = [
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(HighlightStyle.define([
        { tag: tags.heading, color: "var(--text-strong)", fontWeight: "650" },
        { tag: tags.strong, color: "var(--text-strong)", fontWeight: "650" },
        { tag: tags.emphasis, color: "var(--text)", fontStyle: "italic" },
        { tag: tags.link, color: "var(--accent-strong)", textDecoration: "none" },
        { tag: tags.url, color: "var(--accent)" },
        { tag: tags.monospace, color: "var(--accent-strong)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
        { tag: tags.meta, color: "var(--text-faint)" },
        { tag: tags.comment, color: "var(--text-faint)", fontStyle: "italic" },
        { tag: tags.keyword, color: "var(--accent-strong)" },
        { tag: tags.string, color: "color-mix(in srgb, var(--accent) 76%, var(--text))" },
        { tag: tags.bool, color: "var(--accent)" },
        { tag: tags.number, color: "var(--accent)" },
        { tag: tags.punctuation, color: "var(--text-muted)" }
      ])),
      keymap.of([indentWithTab]),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          height: "100%",
          background: "transparent"
        },
        ".cm-scroller": {
          fontFamily: "var(--font-editor)",
          fontSize: "var(--editor-size)",
          lineHeight: "1.78",
          padding: "42px max(32px, calc((100% - var(--editor-width)) / 2)) 40vh"
        },
        ".cm-content": {
          padding: "0",
          maxWidth: "var(--editor-width)"
        },
        ".cm-focused": { outline: "none" },
        ".cm-gutters": {
          background: "transparent",
          border: "none",
          color: "var(--text-faint)"
        },
        ".cm-activeLine, .cm-activeLineGutter": {
          background: "color-mix(in srgb, var(--accent) 4%, transparent)"
        },
        ".cm-selectionBackground": {
          background: "color-mix(in srgb, var(--accent) 20%, transparent) !important"
        }
      }),
      EditorView.domEventHandlers({
        scroll: (_event, view) => {
          const element = view.scrollDOM;
          const max = element.scrollHeight - element.clientHeight;
          onScrollRatio?.(max > 0 ? element.scrollTop / max : 0);
        },
        paste: (event, view) => {
          const file = [...(event.clipboardData?.files ?? [])].find((item) =>
            item.type.startsWith("image/")
          );
          if (!file || !onImportAttachment) return false;
          event.preventDefault();
          void onImportAttachment(file).then((path) => {
            const selection = view.state.selection.main;
            view.dispatch({
              changes: {
                from: selection.from,
                to: selection.to,
                insert: `![${file.name || "图片"}](${path})`
              }
            });
          });
          return true;
        },
        drop: (event, view) => {
          const file = [...(event.dataTransfer?.files ?? [])].find((item) =>
            item.type.startsWith("image/")
          );
          if (!file || !onImportAttachment) return false;
          event.preventDefault();
          void onImportAttachment(file).then((path) => {
            const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
            view.dispatch({
              changes: {
                from: position ?? view.state.selection.main.head,
                insert: `![${file.name || "图片"}](${path})`
              }
            });
          });
          return true;
        }
      })
    ];
    if (mode === "live") result.push(...livePreviewExtension);
    return result;
  }, [mode, onImportAttachment, onScrollRatio]);

  return (
    <div className={`editor-pane editor-${mode}`}>
      <CodeMirror
        ref={editorRef}
        value={value}
        height="100%"
        theme="none"
        extensions={extensions}
        onChange={onChange}
        basicSetup={{
          lineNumbers: mode === "source",
          foldGutter: mode === "source",
          highlightActiveLine: mode === "source",
          bracketMatching: true,
          autocompletion: true,
          closeBrackets: true
        }}
      />
    </div>
  );
}
