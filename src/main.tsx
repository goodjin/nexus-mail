import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { AccountProvider } from "./context/AccountContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AccountProvider>
      <App />
    </AccountProvider>
  </React.StrictMode>,
);
