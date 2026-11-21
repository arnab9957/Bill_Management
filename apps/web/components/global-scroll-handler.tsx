"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Global smooth auto-scroll handler.
 * Automatically scrolls to:
 * 1. Deep-linked targets via #hash (e.g., #classes-sections, #academic-sessions)
 * 2. URL search params e.g. ?open=section-id or ?section=section-id
 * 3. Handles opening parent <details> or triggering accordion buttons if collapsed.
 * 4. Ensures elements are not obscured by the sticky top header (~5rem).
 */
export function GlobalScrollHandler() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    const performScroll = () => {
      const hash = window.location.hash.replace(/^#/, "");
      const openParam = searchParams.get("open") || searchParams.get("section");
      const targetId = hash || openParam;

      if (!targetId) return;

      let attempts = 0;
      const maxAttempts = 15; // try for ~750ms during client hydration

      const tryScroll = () => {
        if (cancelled) return;

        const targetEl =
          document.getElementById(targetId) ||
          document.querySelector<HTMLElement>(`[data-section="${targetId}"]`) ||
          document.querySelector<HTMLElement>(`[name="${targetId}"]`);

        if (targetEl) {
          // If the target is inside a closed <details>, open it
          const parentDetails = targetEl.closest("details");
          if (parentDetails && !parentDetails.open) {
            parentDetails.open = true;
          }

          // If the target is inside or has a toggle button for a section, ensure it's open
          const toggleBtn =
            targetEl.querySelector<HTMLButtonElement>('button[aria-expanded="false"]') ||
            document.querySelector<HTMLButtonElement>(`button[aria-controls="settings-section-${targetId}"][aria-expanded="false"]`);
          if (toggleBtn) {
            toggleBtn.click();
          }

          // Smooth scroll to element with top clearance
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });

          // Subtle pulse highlight so user immediately locates it
          targetEl.classList.add("auto-scroll-highlight");
          setTimeout(() => {
            targetEl?.classList.remove("auto-scroll-highlight");
          }, 2000);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(tryScroll, 50);
        }
      };

      tryScroll();
    };

    // Run on route/search changes
    const timeout = setTimeout(performScroll, 50);

    // Listen to hash changes and popstate
    window.addEventListener("hashchange", performScroll);
    window.addEventListener("popstate", performScroll);

    // Intercept clicks on anchor tags pointing to hashes
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href*='#']");
      if (anchor) {
        try {
          const url = new URL(anchor.href, window.location.href);
          if (url.pathname === window.location.pathname && url.hash) {
            setTimeout(performScroll, 20);
          }
        } catch {
          // ignore
        }
      }
    };
    document.addEventListener("click", handleClick);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      window.removeEventListener("hashchange", performScroll);
      window.removeEventListener("popstate", performScroll);
      document.removeEventListener("click", handleClick);
    };
  }, [pathname, searchParams]);

  return null;
}
