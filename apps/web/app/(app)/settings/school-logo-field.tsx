"use client";

import { useEffect, useState } from "react";

export function SchoolLogoField({
  hasLogo,
  version,
}: {
  hasLogo: boolean;
  version: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [markedForRemoval, setMarkedForRemoval] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  // Clean up object URL on unmount or when previewUrl changes
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="sm:col-span-2 flex flex-col gap-2 rounded-xl border border-gray-200/90 bg-gray-50/60 p-4 transition-colors">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700">
          School logo <span className="text-xs font-normal text-gray-500 lowercase">(optional — printed on bills & receipts)</span>
        </span>
        {hasLogo && !markedForRemoval && !previewUrl && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active logo
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-1">
        {/* Preview box */}
        <div className="relative flex h-16 w-44 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white p-1.5 shadow-2xs overflow-hidden">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="New logo preview" className="h-full w-full object-contain" />
          ) : hasLogo && !markedForRemoval ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/branding/logo?v=${encodeURIComponent(version)}`}
              alt="Current school logo"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="text-center text-xs text-gray-400 font-medium">
              {markedForRemoval ? (
                <span className="font-semibold text-red-600">Will be removed</span>
              ) : (
                "No logo set"
              )}
            </div>
          )}
        </div>

        {/* Input & controls */}
        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              key={inputKey}
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              disabled={markedForRemoval}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(URL.createObjectURL(file));
                  setMarkedForRemoval(false);
                } else {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }
              }}
              className="text-xs text-gray-700 file:mr-2.5 file:cursor-pointer file:rounded-md file:border-0 file:bg-gray-200/90 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-gray-800 hover:file:bg-gray-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />

            {previewUrl && (
              <button
                type="button"
                onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setInputKey((k) => k + 1);
                }}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {hasLogo && !previewUrl && (
            <label className="flex items-center gap-2 text-xs font-normal normal-case text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                name="removeLogo"
                value="true"
                checked={markedForRemoval}
                onChange={(e) => setMarkedForRemoval(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 accent-red-600 focus:ring-red-500"
              />
              <span className={markedForRemoval ? "font-semibold text-red-600" : ""}>
                Remove current logo on save
              </span>
            </label>
          )}

          <p className="text-[11px] leading-relaxed text-gray-400">
            PNG, JPG or WebP, up to 1 MB. Recommended wide proportion; printed at the top of bills & receipts.
          </p>
        </div>
      </div>
    </div>
  );
}
