import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark-dimmed.css";
import "./styles.css";
import App from "./App";
import { applyAppearance, readAppearance } from "./lib/appearance";

const initialAppearance = readAppearance();
applyAppearance(
  document.documentElement,
  initialAppearance.theme,
  initialAppearance.colorMode,
  window.matchMedia("(prefers-color-scheme: dark)").matches
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
