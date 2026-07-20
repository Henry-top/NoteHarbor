// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpCenter } from "./HelpCenter";

afterEach(cleanup);

describe("HelpCenter", () => {
  it("searches offline help topics and can restart onboarding", () => {
    const onStartTour = vi.fn();
    render(
      <HelpCenter
        open
        platform="MacIntel"
        onClose={vi.fn()}
        onStartTour={onStartTour}
      />
    );

    expect(screen.getByRole("dialog", { name: "使用帮助" })).toBeInTheDocument();
    expect(screen.getByText("从添加资料库到写下第一篇笔记。")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索功能或问题…"), {
      target: { value: "Word" }
    });
    expect(screen.getByRole("button", { name: "Word 文档" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "快速开始" })).not.toBeInTheDocument();
    expect(screen.getByText("导入、预览并与外部原文件保持同步。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新开始引导" }));
    expect(onStartTour).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape", () => {
    const onClose = vi.fn();
    render(
      <HelpCenter open platform="Win32" onClose={onClose} onStartTour={vi.fn()} />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
