// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingTour } from "./OnboardingTour";

afterEach(cleanup);

describe("OnboardingTour", () => {
  it("walks through seven steps and finishes", () => {
    const onFinish = vi.fn();
    render(<OnboardingTour open onFinish={onFinish} />);

    expect(screen.getByText("你的文字，停泊在自己手中")).toBeInTheDocument();
    expect(screen.getByLabelText("第 1 步，共 7 步")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("添加一个资料库")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("用 Markdown 或 TXT 记录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("拖到哪里，就整理到哪里")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("在软件内阅读常用文档")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("链接并快速找到笔记")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("整理文件，也保留掌控")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始使用" }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("allows the user to skip the guide", () => {
    const onFinish = vi.fn();
    render(<OnboardingTour open onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: "跳过引导" }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
