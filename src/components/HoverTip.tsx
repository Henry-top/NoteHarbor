import { cloneElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface HoverTipChildProps {
  "aria-label"?: string;
}

interface HoverTipProps {
  label: string;
  detail?: string;
  shortcut?: string;
  side?: "top" | "bottom";
  children: React.ReactElement<HoverTipChildProps>;
}

export function HoverTip({
  label,
  detail,
  shortcut,
  side = "bottom",
  children
}: HoverTipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const close = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPosition(null);
  };

  const open = (delay = 0) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        x: Math.max(150, Math.min(window.innerWidth - 150, rect.left + rect.width / 2)),
        y: side === "top" ? rect.top - 9 : rect.bottom + 9
      });
      timerRef.current = null;
    }, delay);
  };

  useEffect(() => {
    if (!position) return;
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [position]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const child = cloneElement(children, {
    "aria-label": children.props["aria-label"] || label
  });

  return (
    <span
      className="hover-tip-anchor"
      ref={anchorRef}
      onMouseEnter={() => open(420)}
      onMouseLeave={close}
      onFocusCapture={() => open()}
      onBlurCapture={close}
    >
      {child}
      {position && createPortal(
        <span
          className={`hover-tip hover-tip-${side}`}
          role="tooltip"
          style={{ left: position.x, top: position.y }}
        >
          <span>
            <strong>{label}</strong>
            {detail && <small>{detail}</small>}
          </span>
          {shortcut && <kbd>{shortcut}</kbd>}
        </span>,
        document.body
      )}
    </span>
  );
}
