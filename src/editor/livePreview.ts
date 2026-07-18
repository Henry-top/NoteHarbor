import { StateField, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet
} from "@codemirror/view";
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
    const isMermaid = trimmed.toLowerCase() === "```mermaid";
    const isMath = trimmed === "$$";
    if (!isMermaid && !isMath) continue;
    for (let closingNumber = number + 1; closingNumber <= state.doc.lines; closingNumber += 1) {
      const closing = state.doc.line(closingNumber);
      const isClosing = isMermaid ? closing.text.trim() === "```" : closing.text.trim() === "$$";
      if (!isClosing) continue;
      for (let hidden = number; hidden <= closingNumber; hidden += 1) blockedLines.add(hidden);
      if (cursorLine < number || cursorLine > closingNumber) {
        const source = state.doc.sliceString(line.to + 1, closing.from).trim();
        decorations.push({
          from: line.from,
          to: closing.to,
          value: Decoration.replace({
            widget: isMermaid ? new MermaidWidget(source) : new MathWidget(source, true),
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
