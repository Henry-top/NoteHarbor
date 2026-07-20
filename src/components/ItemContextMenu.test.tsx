// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { platformFileLabels } from "../lib/platform";
import type { LibraryItemSummary } from "../types";
import { ItemContextMenu } from "./ItemContextMenu";

afterEach(cleanup);

const markdownItem: LibraryItemSummary = {
  vaultId: "vault",
  path: "notes/草稿笔记.md",
  title: "草稿笔记",
  kind: "markdown",
  tags: [],
  modifiedAt: "2026-07-20T00:00:00Z",
  isFavorite: false,
  isPinned: false
};

describe("ItemContextMenu", () => {
  it("uses native platform terminology", () => {
    expect(platformFileLabels("MacIntel")).toEqual({
      reveal: "在访达中显示",
      trash: "移到废纸篓"
    });
    expect(platformFileLabels("Win32")).toEqual({
      reveal: "在文件资源管理器中显示",
      trash: "移到回收站"
    });
  });

  it("shows Markdown actions and runs the selected command", () => {
    const onClose = vi.fn();
    const onRename = vi.fn();
    render(
      <ItemContextMenu
        item={markdownItem}
        x={20}
        y={30}
        labels={platformFileLabels("MacIntel")}
        onClose={onClose}
        actions={{
          onRename,
          onDuplicate: vi.fn(),
          onCopyWikiLink: vi.fn(),
          onCopyPath: vi.fn(),
          onTogglePinned: vi.fn(),
          onToggleFavorite: vi.fn(),
          onReveal: vi.fn(),
          onDelete: vi.fn()
        }}
      />
    );

    expect(screen.getByRole("menuitem", { name: "复制笔记" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "复制笔记链接" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "在访达中显示" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("shows Word-specific actions without Markdown-only commands", () => {
    render(
      <ItemContextMenu
        item={{ ...markdownItem, kind: "docx", path: "documents/资料.docx", sourcePath: "/tmp/资料.docx" }}
        x={20}
        y={30}
        labels={platformFileLabels("Win32")}
        onClose={vi.fn()}
        actions={{
          onRename: vi.fn(),
          onCopyPath: vi.fn(),
          onTogglePinned: vi.fn(),
          onToggleFavorite: vi.fn(),
          onReveal: vi.fn(),
          onOpenExternal: vi.fn(),
          onSync: vi.fn(),
          onRelink: vi.fn(),
          onDelete: vi.fn()
        }}
      />
    );

    expect(screen.getByRole("menuitem", { name: "使用本地默认软件打开" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "从源文件重新同步" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "在文件资源管理器中显示" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "移到回收站" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "复制笔记" })).not.toBeInTheDocument();
  });
});
