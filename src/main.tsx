import React from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./style.css";
import "./pages.css";
import PagesApp from "./PagesApp";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PagesApp />
  </React.StrictMode>,
);
