// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingTour } from "./OnboardingTour";

afterEach(cleanup);

describe("OnboardingTour", () => {
  it("walks through five steps and finishes", () => {
    const onFinish = vi.fn();
    render(<OnboardingTour open onFinish={onFinish} />);

    expect(screen.getByText("你的文字，停泊在自己手中")).toBeInTheDocument();
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    }
    expect(screen.getByText("文档、帮助和数据安全")).toBeInTheDocument();
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
