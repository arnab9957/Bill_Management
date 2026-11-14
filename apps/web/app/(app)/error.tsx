"use client";
import { useEffect } from "react";

/** Shown instead of a frozen screen when a page or action fails unexpectedly. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="max-w-xl rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900">
      <h2 className="text-base font-semibold">Something went wrong</h2>
      <p className="mt-1">The last action may or may not have been saved. Reload the page to see the current state before trying again.</p>
      {error.digest && <p className="mt-1 text-xs text-red-700">Reference: {error.digest}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={() => window.location.reload()} className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white">Reload page</button>
        <button onClick={reset} className="rounded-md border border-red-300 bg-white px-3 py-1.5">Try again</button>
      </div>
    </div>
  );
}
