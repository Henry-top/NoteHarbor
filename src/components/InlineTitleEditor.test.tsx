// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineTitleEditor } from "./InlineTitleEditor";

afterEach(cleanup);

function renderTitle(onRename = vi.fn(async () => true)) {
  render(
    <InlineTitleEditor
      title="未命名笔记"
      kind="markdown"
      busy={false}
      onRename={onRename}
    />
  );
  return onRename;
}

describe("InlineTitleEditor", () => {
  it("edits the title in place and saves with Enter", async () => {
    const onRename = renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "重命名“未命名笔记”" }));

    const input = screen.getByRole("textbox", { name: "笔记名称" });
    fireEvent.change(input, { target: { value: "项目计划" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onRename).toHaveBeenCalledWith("项目计划"));
  });

  it("saves when focus leaves the title", async () => {
    const onRename = renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "重命名“未命名笔记”" }));
    const input = screen.getByRole("textbox", { name: "笔记名称" });
    fireEvent.change(input, { target: { value: "会议记录" } });
    fireEvent.blur(input);

    await waitFor(() => expect(onRename).toHaveBeenCalledWith("会议记录"));
  });

  it("cancels with Escape and treats .md as optional", async () => {
    const onRename = renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "重命名“未命名笔记”" }));
    const input = screen.getByRole("textbox", { name: "笔记名称" });
    fireEvent.change(input, { target: { value: "临时名称" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "重命名“未命名笔记”" }));
    const nextInput = screen.getByRole("textbox", { name: "笔记名称" });
    fireEvent.change(nextInput, { target: { value: "未命名笔记.md" } });
    fireEvent.keyDown(nextInput, { key: "Enter" });

    await waitFor(() => expect(screen.getByRole("button", { name: "重命名“未命名笔记”" })).toBeInTheDocument());
    expect(onRename).not.toHaveBeenCalled();
  });
});
