"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/platform/push";

/**
 * Registers the service worker on mount. Lives in the root layout.
 * Registration itself is delegated to the platform adapter so a native
 * wrapper can replace it without touching the layout.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
