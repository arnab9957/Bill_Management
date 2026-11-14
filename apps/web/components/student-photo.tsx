"use client";
import { useActionState, useRef, useState } from "react";
import type { ActionState } from "@/lib/action";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/** Read-only avatar: photo if there is one, otherwise initials. */
export function Avatar({ studentId, name, photoPath, size = 56 }: { studentId: number; name: string; photoPath: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (photoPath && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/students/${studentId}/photo?v=${encodeURIComponent(photoPath)}`} alt={name} style={style} onError={() => setBroken(true)}
      className="shrink-0 rounded-full border border-gray-200 bg-gray-100 object-cover" />;
  }
  return (
    <div style={{ ...style, fontSize: size / 2.8 }} className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">
      {initials(name)}
    </div>
  );
}

/**
 * Profile-banner photo with "Add / Change / Remove photo". Choosing a file uploads it right away.
 * On phones the picker offers the camera, so staff can photograph the student directly.
 */
export function StudentPhoto({ studentId, name, photoPath, canEdit, upload, remove }: {
  studentId: number; name: string; photoPath: string | null; canEdit: boolean;
  upload: (s: ActionState, fd: FormData) => Promise<ActionState>;
  remove: (s: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [upState, upAction, uploading] = useActionState(upload, null);
  const [rmState, rmAction, removing] = useActionState(remove, null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState(false);
  const msg = tooBig ? { ok: false, message: "Photo is larger than 3 MB. Use a smaller picture." } : (upState ?? rmState);
  const busy = uploading || removing;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button type="button" disabled={!canEdit || busy} onClick={() => inputRef.current?.click()}
        className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-default"
        title={canEdit ? (photoPath ? "Change photo" : "Add photo") : name}>
        <Avatar studentId={studentId} name={name} photoPath={photoPath} size={96} />
        {canEdit && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            {busy ? "Saving…" : photoPath ? "Change" : "Add photo"}
          </span>
        )}
        {busy && <span className="absolute inset-0 animate-pulse rounded-full bg-white/50" />}
      </button>
      {canEdit && (
        <div className="flex gap-2 text-xs">
          <form ref={formRef} action={upAction}>
            <input type="hidden" name="studentId" value={studentId} />
            <input ref={inputRef} type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 3 * 1024 * 1024) { setTooBig(true); e.target.value = ""; return; }
                setTooBig(false);
                formRef.current?.requestSubmit();
              }} />
            <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="text-brand-700 hover:underline disabled:opacity-50">
              {photoPath ? "Change photo" : "📷 Add photo"}
            </button>
          </form>
          {photoPath && (
            <form action={rmAction} onSubmit={(e) => { if (!window.confirm("Remove this photo?")) e.preventDefault(); }}>
              <input type="hidden" name="studentId" value={studentId} />
              <button disabled={busy} className="text-red-600 hover:underline disabled:opacity-50">Remove</button>
            </form>
          )}
        </div>
      )}
      {msg?.message && <p className={`max-w-40 text-center text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.message}</p>}
    </div>
  );
}
