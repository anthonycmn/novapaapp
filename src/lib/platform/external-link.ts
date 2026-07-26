/**
 * Platform adapter: opening external links (web implementation).
 * PWA opens a new tab; a native wrapper swaps this for an in-app browser.
 */
export function openExternal(url: string): void {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}
