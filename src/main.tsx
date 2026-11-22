import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { pageOptions } from "./host";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App options={pageOptions()} />
  </StrictMode>,
);
