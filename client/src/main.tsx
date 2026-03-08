import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Register Service Worker for notifications and PWA update support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed — notifications will use fallback
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
