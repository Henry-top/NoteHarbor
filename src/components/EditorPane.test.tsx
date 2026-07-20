// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorPane } from "./EditorPane";

afterEach(cleanup);

const fencedMarkdown = [
  "# 本地开发",
  "",
  "```bash",
  "pnpm install",
  "pnpm desktop:dev",
  "```",
  "",
  "后续内容"
].join("\n");

describe("EditorPane", () => {
  it("renders fenced code blocks in live mode when the cursor is outside", () => {
    const { container } = render(
      <EditorPane
        value={fencedMarkdown}
        mode="live"
        onChange={vi.fn()}
      />
    );

    const block = container.querySelector(".cm-live-code-block");
    expect(block).not.toBeNull();
    expect(block).toHaveTextContent("bash");
    expect(block).toHaveTextContent("pnpm install");
    expect(container.querySelector(".editor-codemirror .cm-scroller")).not.toBeNull();
  });

  it("reveals fenced source after clicking the rendered block", () => {
    const { container } = render(
      <EditorPane
        value={fencedMarkdown}
        mode="live"
        onChange={vi.fn()}
      />
    );

    const block = container.querySelector(".cm-live-code-block");
    expect(block).not.toBeNull();
    fireEvent.mouseDown(block!);

    expect(container.querySelector(".cm-live-code-block")).toBeNull();
    expect(container.querySelector(".cm-content")).toHaveTextContent("```bash");
  });

  it("keeps fenced Markdown visible in source mode", () => {
    const { container } = render(
      <EditorPane
        value={fencedMarkdown}
        mode="source"
        onChange={vi.fn()}
      />
    );

    expect(container.querySelector(".cm-live-code-block")).toBeNull();
    expect(container.querySelector(".cm-content")).toHaveTextContent("```bash");
  });
});
