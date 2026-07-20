// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenameDialog } from "./RenameDialog";

afterEach(cleanup);

describe("RenameDialog", () => {
  it("shows an in-app input and submits the new name", () => {
    const onSubmit = vi.fn();
    render(
      <RenameDialog
        open
        currentName="未命名笔记"
        kind="markdown"
        busy={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const input = screen.getByLabelText("新的文件名称");
    expect(input).toHaveValue("未命名笔记");
    fireEvent.change(input, { target: { value: "项目计划" } });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));

    expect(onSubmit).toHaveBeenCalledWith("项目计划");
  });

  it("treats an optional extension as part of the same Markdown name", () => {
    const onSubmit = vi.fn();
    render(
      <RenameDialog
        open
        currentName="项目计划"
        kind="markdown"
        busy={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText("新的文件名称"), {
      target: { value: "项目计划.MD" }
    });

    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
  });

  it("closes with Escape and keeps the dialog open while busy", () => {
    const onCancel = vi.fn();
    const view = render(
      <RenameDialog
        open
        currentName="未命名笔记"
        kind="markdown"
        busy={false}
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    view.rerender(
      <RenameDialog
        open
        currentName="未命名笔记"
        kind="markdown"
        busy
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows backend validation errors without closing", () => {
    render(
      <RenameDialog
        open
        currentName="未命名笔记"
        kind="markdown"
        busy={false}
        error="同名笔记已经存在"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("同名笔记已经存在");
  });
});
