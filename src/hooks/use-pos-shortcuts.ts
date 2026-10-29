"use client";

import { useEffect, useRef } from "react";

export interface PosShortcutHandlers {
  focusSearch: () => void; // '/' or F1
  cycleUnit: () => void; // F2
  editQty: () => void; // F3
  toggleCustomer: () => void; // F4
  toggleInvoiceKind: () => void; // F6
  settle: () => void; // F8 or Ctrl+Enter
  moveSelection: (delta: number) => void; // ↑ / ↓ (outside text fields)
  removeLine: () => void; // Delete (outside text fields)
  bumpQty: (delta: number) => void; // + / − (outside text fields)
}

const isTypingTarget = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
};

/**
 * Global POS hotkeys. Function keys work from anywhere (including the search box) and have
 * their browser defaults suppressed (F1 help, F3 find...). Single-character keys only fire
 * when the cashier isn't typing into a field. Disabled while a dialog is open.
 */
export function usePosShortcuts(handlers: PosShortcutHandlers, enabled = true) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      const typing = isTypingTarget(e.target);

      const fn: Record<string, (() => void) | undefined> = {
        F1: h.focusSearch,
        F2: h.cycleUnit,
        F3: h.editQty,
        F4: h.toggleCustomer,
        F6: h.toggleInvoiceKind,
        F8: h.settle,
      };
      const action = fn[e.key];
      if (action && !e.altKey && !e.metaKey) {
        e.preventDefault();
        action();
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        h.settle();
        return;
      }
      if (typing || e.ctrlKey || e.altKey || e.metaKey) return;

      switch (e.key) {
        case "/":
          e.preventDefault();
          h.focusSearch();
          break;
        case "ArrowUp":
          e.preventDefault();
          h.moveSelection(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          h.moveSelection(1);
          break;
        case "Delete":
          e.preventDefault();
          h.removeLine();
          break;
        case "+":
        case "=":
          e.preventDefault();
          h.bumpQty(1);
          break;
        case "-":
          e.preventDefault();
          h.bumpQty(-1);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
