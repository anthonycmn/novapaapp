"use client";

import { useEffect } from "react";

/**
 * Warns before leaving the page while a form has unsaved changes.
 * Mount inside a form and flip `dirty` from the form's change handler.
 */
export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome requires returnValue to be set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return null;
}
