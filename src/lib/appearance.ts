import type { ColorMode, ThemeStyle } from "../types";

export interface AppearanceSettings {
  theme: ThemeStyle;
  colorMode: ColorMode;
}

const themes = new Set<ThemeStyle>(["modern", "paper", "glass"]);
const colorModes = new Set<ColorMode>(["system", "light", "dark"]);

export function readAppearance(storage: Pick<Storage, "getItem"> = localStorage): AppearanceSettings {
  const storedTheme = storage.getItem("noteharbor:theme") as ThemeStyle | null;
  const storedColorMode = storage.getItem("noteharbor:colorMode") as ColorMode | null;
  return {
    theme: storedTheme && themes.has(storedTheme) ? storedTheme : "modern",
    colorMode: storedColorMode && colorModes.has(storedColorMode) ? storedColorMode : "system"
  };
}

export function resolveColorMode(colorMode: ColorMode, systemPrefersDark: boolean): "light" | "dark" {
  return colorMode === "system" ? (systemPrefersDark ? "dark" : "light") : colorMode;
}

export function applyAppearance(
  root: HTMLElement,
  theme: ThemeStyle,
  colorMode: ColorMode,
  systemPrefersDark: boolean
) {
  const effectiveColorMode = resolveColorMode(colorMode, systemPrefersDark);
  root.dataset.theme = theme;
  root.dataset.colorMode = colorMode;
  root.dataset.effectiveColorMode = effectiveColorMode;
  root.style.colorScheme = effectiveColorMode;
}

export function storeAppearance(
  storage: Pick<Storage, "setItem">,
  theme: ThemeStyle,
  colorMode: ColorMode
) {
  storage.setItem("noteharbor:theme", theme);
  storage.setItem("noteharbor:colorMode", colorMode);
}
