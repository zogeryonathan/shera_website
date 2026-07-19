import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BookingPage } from "./components/BookingPage.jsx";
import "./booking.css";

const rootElement = document.getElementById("booking-root");

if (!rootElement) {
  throw new Error("Booking page root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <BookingPage />
  </StrictMode>,
);
