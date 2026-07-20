import { useEffect, useRef, type RefObject } from "react";
import { Check, Monitor, Moon, Palette, Sun, X } from "lucide-react";
import { t } from "../i18n";
import type { ColorMode, ThemeStyle } from "../types";

export function AppearancePopover({
  open,
  theme,
  colorMode,
  onThemeChange,
  onColorModeChange,
  onClose,
  anchorRef
}: {
  open: boolean;
  theme: ThemeStyle;
  colorMode: ColorMode;
  onThemeChange: (theme: ThemeStyle) => void;
  onColorModeChange: (mode: ColorMode) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target) || anchorRef?.current?.contains(target)) return;
      onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const closeOnBlur = () => onClose();

    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [anchorRef, onClose, open]);

  if (!open) return null;
  const themes: { id: ThemeStyle; label: string; colors: string[] }[] = [
    { id: "modern", label: t("modern"), colors: ["#f7f8fa", "#376f8c", "#1f2933"] },
    { id: "paper", label: t("paper"), colors: ["#f7f0e3", "#9a6842", "#443a31"] },
    { id: "glass", label: t("glass"), colors: ["#eaf3f7", "#4a88a8", "#685d9d"] }
  ];

  return (
    <div ref={popoverRef} className="appearance-popover" role="dialog" aria-label={t("appearance")}>
      <header>
        <span><Palette size={16} /> {t("appearance")}</span>
        <button type="button" className="icon-button" onClick={onClose}><X size={15} /></button>
      </header>
      <div className="theme-cards">
        {themes.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={theme === item.id}
            className={theme === item.id ? "active" : ""}
            onClick={() => onThemeChange(item.id)}
          >
            <span className="theme-swatch">
              {item.colors.map((color) => <i key={color} style={{ background: color }} />)}
            </span>
            <span>{item.label}</span>
            {theme === item.id && <Check size={14} />}
          </button>
        ))}
      </div>
      <div className="color-mode segmented">
        <button type="button" aria-pressed={colorMode === "system"} className={colorMode === "system" ? "active" : ""} onClick={() => onColorModeChange("system")}>
          <Monitor size={14} /> {t("system")}
        </button>
        <button type="button" aria-pressed={colorMode === "light"} className={colorMode === "light" ? "active" : ""} onClick={() => onColorModeChange("light")}>
          <Sun size={14} /> {t("light")}
        </button>
        <button type="button" aria-pressed={colorMode === "dark"} className={colorMode === "dark" ? "active" : ""} onClick={() => onColorModeChange("dark")}>
          <Moon size={14} /> {t("dark")}
        </button>
      </div>
    </div>
  );
}
