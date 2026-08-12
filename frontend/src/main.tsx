import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import SharedRoom from "./SharedRoom";
import "./index.css";

// /s/<token> is the public read-only view and never touches the authenticated app.
const shared = location.pathname.match(/^\/s\/([A-Za-z0-9_-]{16,64})$/)?.[1];

createRoot(document.getElementById("root")!).render(
  <StrictMode>{shared ? <SharedRoom token={shared} /> : <App />}</StrictMode>
);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
