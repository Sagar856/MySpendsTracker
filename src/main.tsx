import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initIdentity } from "./auth/identity";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

initIdentity();
const qc = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);