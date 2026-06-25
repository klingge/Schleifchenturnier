import "@radix-ui/themes/styles.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Theme } from "@radix-ui/themes";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme
      accentColor="blue"
      grayColor="slate"
      radius="medium"
      scaling="100%"
      appearance="light"
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Theme>
  </StrictMode>,
);
