import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminApp } from "./components/AdminApp.jsx";
import "./admin.css";

const rootElement = document.getElementById("admin-root");
if (!rootElement) throw new Error("Admin page root element was not found.");

createRoot(rootElement).render(<StrictMode><AdminApp /></StrictMode>);
