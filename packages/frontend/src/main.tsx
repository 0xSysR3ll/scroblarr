import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./index.css";
import "./i18n/config";
import { ThemeProvider } from "./contexts/ThemeContext";

const CHUNK_RELOAD_KEY = "scroblarr:chunk-reload";

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") {
    return;
  }
  sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  window.location.reload();
});

// Clear after a successful boot so a later deploy can recover again.
// Delay past this load so cascading preload failures still see the guard.
window.addEventListener(
  "load",
  () => {
    window.setTimeout(() => {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    }, 1000);
  },
  { once: true }
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
