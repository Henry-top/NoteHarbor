import { StateField, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet
} from "@codemirror/view";
import hljs from "highlight.js/lib/common";
import katex from "katex";

class MathWidget extends WidgetType {
  constructor(
    readonly formula: string,
    readonly displayMode: boolean
  ) {
    super();
  }

  eq(other: MathWidget) {
    return other.formula === this.formula && other.displayMode === this.displayMode;
  }

  toDOM() {
    const element = document.createElement(this.displayMode ? "div" : "span");
    element.className = this.displayMode ? "cm-math-block" : "cm-math-inline";
    katex.render(this.formula, element, {
      throwOnError: false,
      displayMode: this.displayMode,
      strict: "ignore"
    });
    return element;
  }
}

class MermaidWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  eq(other: MermaidWidget) {
    return other.source === this.source;
  }

  toDOM() {
    const element = document.createElement("div");
    element.className = "cm-mermaid-block";
    element.textContent = "正在渲染图表…";
    const id = `noteharbor-live-${crypto.randomUUID()}`;
    void import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base"
        });
        return mermaid.render(id, this.source);
      })
      .then(({ svg }) => {
        if (element.isConnected) element.innerHTML = svg;
      })
      .catch(() => {
        element.textContent = "图表语法有误";
        element.classList.add("cm-widget-error");
      });
    return element;
  }
}

class CodeBlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly language: string,
    readonly sourcePosition: number
  ) {
    super();
  }

  eq(other: CodeBlockWidget) {
    return (
      other.source === this.source
      && other.language === this.language
      && other.sourcePosition === this.sourcePosition
    );
  }

  toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.className = "cm-live-code-block";
    container.title = "点击编辑代码";

    if (this.language) {
      const label = document.createElement("span");
      label.className = "cm-live-code-language";
      label.textContent = this.language;
      container.append(label);
    }

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = "hljs";
    try {
      const highlighted = this.language && hljs.getLanguage(this.language)
        ? hljs.highlight(this.source, { language: this.language })
        : hljs.highlightAuto(this.source);
      code.innerHTML = highlighted.value;
    } catch {
      code.textContent = this.source;
    }
    pre.append(code);
    container.append(pre);

    container.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({
        selection: { anchor: Math.min(this.sourcePosition, view.state.doc.length) },
        scrollIntoView: true
      });
      view.focus();
    });
    return container;
  }
}

interface FenceOpening {
  marker: "`" | "~";
  length: number;
  language: string;
}

function parseFenceOpening(text: string): FenceOpening | null {
  const match = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  if (!match) return null;
  const marker = match[1][0] as "`" | "~";
  const info = match[2].trim();
  if (marker === "`" && info.includes("`")) return null;
  const language = (info.split(/\s+/)[0] || "")
    .replace(/^\{?\.?/, "")
    .replace(/\}?$/, "")
    .toLowerCase();
  return { marker, length: match[1].length, language };
}

function isFenceClosing(text: string, opening: FenceOpening): boolean {
  const indentation = text.length - text.trimStart().length;
  if (indentation > 3) return false;
  const candidate = text.trim();
  return (
    candidate.length >= opening.length
    && [...candidate].every((character) => character === opening.marker)
  );
}

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: { from: number; to?: number; value: Decoration }[] = [];
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  let firstVisibleLine = 1;

  if (state.doc.line(1).text.trim() === "---") {
    for (let number = 2; number <= state.doc.lines; number += 1) {
      if (state.doc.line(number).text.trim() === "---") {
        const closing = state.doc.line(number);
        const to = closing.to < state.doc.length ? closing.to + 1 : closing.to;
        decorations.push({
          from: 0,
          to,
          value: Decoration.replace({})
        });
        firstVisibleLine = number + 1;
        break;
      }
    }
  }

  const blockedLines = new Set<number>();
  for (let number = firstVisibleLine; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    const trimmed = line.text.trim();
    const fence = parseFenceOpening(line.text);
    const isMath = trimmed === "$$";
    if (!fence && !isMath) continue;
    for (let closingNumber = number + 1; closingNumber <= state.doc.lines; closingNumber += 1) {
      const closing = state.doc.line(closingNumber);
      const isClosing = fence
        ? isFenceClosing(closing.text, fence)
        : closing.text.trim() === "$$";
      if (!isClosing) continue;
      for (let hidden = number; hidden <= closingNumber; hidden += 1) blockedLines.add(hidden);
      if (cursorLine < number || cursorLine > closingNumber) {
        const source = state.doc.sliceString(line.to + 1, closing.from).trim();
        const widget = isMath
          ? new MathWidget(source, true)
          : fence?.language === "mermaid"
            ? new MermaidWidget(source)
            : new CodeBlockWidget(source, fence?.language || "", line.from);
        decorations.push({
          from: line.from,
          to: closing.to,
          value: Decoration.replace({
            widget,
            block: true
          })
        });
      }
      number = closingNumber;
      break;
    }
  }

  for (let number = firstVisibleLine; number <= state.doc.lines; number += 1) {
    if (blockedLines.has(number)) continue;
    const line = state.doc.line(number);
    const text = line.text;
    const heading = /^(#{1,6})(\s+)/.exec(text);
    if (heading) {
      decorations.push({
        from: line.from,
        value: Decoration.line({ class: `cm-live-heading cm-live-h${heading[1].length}` })
      });
      if (number !== cursorLine) {
        decorations.push({
          from: line.from,
          to: line.from + heading[0].length,
          value: Decoration.replace({})
        });
      }
    }

    if (number === cursorLine) continue;

    for (const match of text.matchAll(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g)) {
      if (match.index === undefined) continue;
      decorations.push({
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
        value: Decoration.replace({ widget: new MathWidget(match[1], false) })
      });
    }

    for (const match of text.matchAll(/\*\*|__|~~|`(?=[^`])/g)) {
      if (match.index === undefined) continue;
      const marker = match[0];
      decorations.push({
        from: line.from + match.index,
        to: line.from + match.index + marker.length,
        value: Decoration.replace({})
      });
    }

    for (const match of text.matchAll(/\[\[|\]\]/g)) {
      if (match.index === undefined) continue;
      decorations.push({
        from: line.from + match.index,
        to: line.from + match.index + 2,
        value: Decoration.replace({})
      });
    }
  }

  decorations.sort((a, b) => a.from - b.from || (a.to ?? a.from) - (b.to ?? b.from));
  return Decoration.set(
    decorations.map(({ from, to, value }) => value.range(from, to)),
    true
  );
}

const field = StateField.define<DecorationSet>({
  create: buildDecorations,
  update(value, transaction) {
    if (transaction.docChanged || transaction.selection) {
      return buildDecorations(transaction.state);
    }
    return value;
  },
  provide: (stateField) => EditorView.decorations.from(stateField)
});

export const livePreviewExtension = [
  field,
  EditorView.baseTheme({
    ".cm-live-heading": {
      fontFamily: "var(--font-display)",
      fontWeight: "650",
      color: "var(--text-strong)"
    },
    ".cm-live-h1": { fontSize: "2em", lineHeight: "1.35" },
    ".cm-live-h2": { fontSize: "1.55em", lineHeight: "1.45" },
    ".cm-live-h3": { fontSize: "1.28em", lineHeight: "1.5" },
    ".cm-live-h4": { fontSize: "1.1em" },
    ".cm-content": { caretColor: "var(--accent)" },
    ".cm-line": { paddingTop: "2px", paddingBottom: "2px" },
    ".cm-math-block, .cm-mermaid-block": {
      display: "block",
      margin: "16px 0",
      padding: "16px",
      border: "1px solid var(--border)",
      borderRadius: "10px",
      overflow: "auto",
      background: "var(--surface-muted)",
      color: "var(--text)"
    },
    ".cm-live-code-block": {
      position: "relative",
      display: "block",
      margin: "14px 0",
      border: "1px solid var(--border)",
      borderRadius: "10px",
      overflow: "hidden",
      background: "#20272d",
      color: "#e5eaed",
      cursor: "text"
    },
    ".cm-live-code-block pre": {
      margin: "0",
      padding: "16px 18px",
      overflowX: "auto",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "0.88em",
      lineHeight: "1.62",
      whiteSpace: "pre"
    },
    ".cm-live-code-block code": {
      display: "block",
      minHeight: "1.62em",
      padding: "0",
      background: "transparent"
    },
    ".cm-live-code-language": {
      position: "absolute",
      zIndex: "1",
      top: "7px",
      right: "9px",
      padding: "2px 6px",
      borderRadius: "5px",
      color: "#9eabb4",
      background: "rgba(32, 39, 45, 0.82)",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "9px",
      lineHeight: "1.4",
      textTransform: "lowercase",
      pointerEvents: "none"
    },
    ".cm-math-inline": {
      display: "inline-block",
      color: "var(--text-strong)"
    },
    ".cm-mermaid-block svg": {
      display: "block",
      maxWidth: "100%",
      height: "auto",
      margin: "auto"
    },
    ".cm-widget-error": { color: "#c15b4f" }
  })
];
