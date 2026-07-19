import { useEffect, useRef } from "react";

export function useModalDialog({ isBusy, onClose }) {
  const modalRef = useRef(null);
  const initialFocusRef = useRef(null);

  useEffect(() => {
    initialFocusRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !isBusy) onClose();
      if (event.key !== "Tab") return;

      const focusable = modalRef.current?.querySelectorAll(
        "button:not([disabled]), input:not([disabled])",
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.classList.add("modal-open");
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBusy, onClose]);

  return { modalRef, initialFocusRef };
}
