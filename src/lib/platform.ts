export type PlatformFileLabels = {
  reveal: string;
  trash: string;
};

export function platformFileLabels(platform: string): PlatformFileLabels {
  const normalized = platform.toLocaleLowerCase();
  if (normalized.includes("mac")) {
    return { reveal: "在访达中显示", trash: "移到废纸篓" };
  }
  if (normalized.includes("win")) {
    return { reveal: "在文件资源管理器中显示", trash: "移到回收站" };
  }
  return { reveal: "在文件管理器中显示", trash: "移到回收站" };
}
