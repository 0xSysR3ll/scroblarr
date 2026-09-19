import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./index.css";
import "./i18n/config";
import { ThemeProvider } from "./contexts/ThemeContext";

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const key = "scroblarr:chunk-reload";
  if (sessionStorage.getItem(key) === "1") {
    return;
  }
  sessionStorage.setItem(key, "1");
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
