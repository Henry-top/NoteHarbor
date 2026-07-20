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

const htmlMarkdown = [
  "<p align=\"center\">",
  "  <img src=\"https://example.com/badge.png\" width=\"104\" alt=\"状态徽章\">",
  "  <a href=\"https://example.com\"><strong>下载应用</strong></a>",
  "</p>",
  "",
  "<h1 align=\"center\">墨岛笔记 NoteHarbor</h1>"
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

  it("renders common HTML blocks safely in live mode", () => {
    const { container } = render(
      <EditorPane
        value={htmlMarkdown}
        mode="live"
        onChange={vi.fn()}
      />
    );

    const blocks = container.querySelectorAll(".cm-live-html-block");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent("下载应用");
    expect(blocks[0].querySelector("img")).toHaveAttribute("src", "https://example.com/badge.png");
    expect(blocks[1].querySelector("h1")).toHaveTextContent("墨岛笔记 NoteHarbor");
    expect(container.querySelector(".cm-content")).not.toHaveTextContent("<h1");
  });

  it("removes executable HTML and unsafe attributes from live rendering", () => {
    const unsafe = [
      "<div onclick=\"alert('x')\">",
      "  <script>window.pwned = true</script>",
      "  <img src=\"javascript:alert('x')\" onerror=\"alert('x')\" alt=\"图片\">",
      "  <a href=\"javascript:alert('x')\">链接</a>",
      "</div>"
    ].join("\n");
    const { container } = render(
      <EditorPane
        value={unsafe}
        mode="live"
        onChange={vi.fn()}
      />
    );

    const block = container.querySelector(".cm-live-html-block");
    expect(block?.querySelector("script")).toBeNull();
    expect(block?.querySelector("div")).not.toHaveAttribute("onclick");
    expect(block?.querySelector("img")).not.toHaveAttribute("src");
    expect(block?.querySelector("img")).not.toHaveAttribute("onerror");
    expect(block?.querySelector("a")).not.toHaveAttribute("href");
  });

  it("reveals HTML source only after clicking its rendered block", () => {
    const { container } = render(
      <EditorPane
        value={htmlMarkdown}
        mode="live"
        onChange={vi.fn()}
      />
    );

    const block = container.querySelector(".cm-live-html-block");
    expect(block).not.toBeNull();
    fireEvent.mouseDown(block!);

    expect(container.querySelectorAll(".cm-live-html-block")).toHaveLength(1);
    expect(container.querySelector(".cm-content")).toHaveTextContent("<p align=\"center\">");
  });
});
