// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FolderContextMenu } from "./FolderContextMenu";

afterEach(cleanup);

describe("FolderContextMenu", () => {
  it("replaces the WebView menu with complete folder actions", () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    render(
      <FolderContextMenu
        folder={{ vaultId: "vault", path: "项目", name: "项目", protected: false }}
        x={20}
        y={30}
        onClose={onClose}
        onNewNote={vi.fn()}
        onNewFolder={vi.fn()}
        onImport={vi.fn()}
        onRename={onRename}
        onCopyPath={vi.fn()}
        onReveal={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.queryByText("Reload")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建笔记" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入文件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移到系统废纸篓" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("protects assets and documents from rename and deletion", () => {
    render(
      <FolderContextMenu
        folder={{ vaultId: "vault", path: "assets", name: "assets", protected: true }}
        x={20}
        y={30}
        onClose={vi.fn()}
        onNewNote={vi.fn()}
        onNewFolder={vi.fn()}
        onImport={vi.fn()}
        onRename={vi.fn()}
        onCopyPath={vi.fn()}
        onReveal={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "重命名" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "移到系统废纸篓" })).toBeDisabled();
  });
});
