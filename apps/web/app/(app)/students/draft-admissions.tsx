"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  deleteAdmissionDraft,
  formatDraftDate,
  getAdmissionDrafts,
  type AdmissionDraft,
} from "@/lib/admission-drafts";
import { buttonClass, cx } from "@/components/ui";

export function DraftAdmissionsTrigger() {
  const [drafts, setDrafts] = useState<AdmissionDraft[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const update = () => setDrafts(getAdmissionDrafts());
    update();
    const onToggle = (e: Event) => {
      const custom = e as CustomEvent<{ open?: boolean }>;
      if (custom.detail?.open !== undefined) {
        setIsOpen(custom.detail.open);
      } else {
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("admission-drafts-changed", update);
    window.addEventListener("storage", update);
    window.addEventListener("toggle-draft-admissions", onToggle);
    return () => {
      window.removeEventListener("admission-drafts-changed", update);
      window.removeEventListener("storage", update);
      window.removeEventListener("toggle-draft-admissions", onToggle);
    };
  }, []);

  if (!mounted) return null;

  const count = drafts.length;

  const handleClick = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    window.dispatchEvent(new CustomEvent("toggle-draft-admissions", { detail: { open: nextState } }));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cx(
        "relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer",
        isOpen
          ? "border-accent bg-accent text-white shadow-xs"
          : count > 0
            ? "border-accent/40 bg-accent-soft text-accent-ink hover:bg-accent/15"
            : "border-gray-300 bg-surface text-gray-700 hover:bg-subtle"
      )}
      title="View draft admissions saved manually or before class management"
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 shrink-0 opacity-80"
        aria-hidden="true"
      >
        <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
      </svg>
      <span>Draft admissions</span>
      <span
        className={cx(
          "ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
          isOpen
            ? "bg-white/20 text-white"
            : count > 0
              ? "bg-accent text-white"
              : "bg-gray-200 text-gray-600"
        )}
      >
        {count}
      </span>
    </button>
  );
}

interface MasterItem {
  id: number;
  name: string;
}

interface SectionMasterItem extends MasterItem {
  classId: number;
}

export function DraftAdmissionsList({
  classes = [],
  sections = [],
}: {
  classes?: MasterItem[];
  sections?: SectionMasterItem[];
}) {
  const [drafts, setDrafts] = useState<AdmissionDraft[]>([]);
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      listRef.current.classList.add("auto-scroll-highlight");
      const timer = setTimeout(() => {
        listRef.current?.classList.remove("auto-scroll-highlight");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    const update = () => setDrafts(getAdmissionDrafts());
    update();

    if (searchParams.get("view") === "drafts" || searchParams.get("drafts") === "1") {
      setOpen(true);
      window.dispatchEvent(new CustomEvent("toggle-draft-admissions", { detail: { open: true } }));
    }

    const onToggle = (e: Event) => {
      const custom = e as CustomEvent<{ open?: boolean }>;
      if (custom.detail?.open !== undefined) {
        setOpen(custom.detail.open);
      } else {
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("admission-drafts-changed", update);
    window.addEventListener("storage", update);
    window.addEventListener("toggle-draft-admissions", onToggle);
    return () => {
      window.removeEventListener("admission-drafts-changed", update);
      window.removeEventListener("storage", update);
      window.removeEventListener("toggle-draft-admissions", onToggle);
    };
  }, [searchParams]);

  if (!open) return null;

  const handleClose = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("toggle-draft-admissions", { detail: { open: false } }));
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Discard draft admission for ${name || "this student"}?`)) {
      deleteAdmissionDraft(id);
    }
  };

  return (
    <div ref={listRef} className="mb-6 overflow-hidden rounded-xl border border-accent/30 bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent/15 bg-accent-soft/60 px-5 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white shadow-xs">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
              <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
            </svg>
          </span>
          <div>
            <h3 className="text-sm font-bold text-ink">
              Draft Admissions ({drafts.length})
            </h3>
            <p className="text-xs text-gray-500">
              Incomplete admissions saved manually or auto-saved before navigating to class setup.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-ink cursor-pointer"
          title="Close drafts"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {drafts.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">
          No draft admissions found. Any admission details filled before navigating to class settings or saved via &ldquo;Save as draft&rdquo; will appear here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class-Section</th>
                <th>Guardian / Mobile</th>
                <th>Saved</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => {
                const resolvedClass =
                  (d.classId && classes.length > 0
                    ? classes.find((c) => String(c.id) === String(d.classId))?.name
                    : undefined) ||
                  d.className ||
                  (d.classId ? `Class ${d.classId}` : undefined);

                const rawSec =
                  (d.sectionId && sections.length > 0
                    ? sections.find((s) => String(s.id) === String(d.sectionId))?.name
                    : undefined) ||
                  d.sectionName;

                const cleanSec = rawSec ? rawSec.replace(/^Section\s+/i, "").trim() : undefined;

                return (
                  <tr key={d.id}>
                    <td>
                      <div className="font-semibold text-ink">
                        {d.studentName || "(Untitled draft)"}
                      </div>
                      {d.reason === "redirect" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-accent-ink">
                          Auto-saved on redirect
                        </span>
                      )}
                    </td>
                    <td>
                      {resolvedClass ? (
                        <span className="font-semibold text-ink">
                          {resolvedClass}
                          {cleanSec ? `-${cleanSec}` : ""}
                        </span>
                      ) : cleanSec ? (
                        <span className="font-medium text-ink">Section {cleanSec}</span>
                      ) : (
                        <span className="italic text-gray-400">Not selected</span>
                      )}
                    </td>
                    <td>
                      <div className="text-sm text-gray-800">
                        {d.parentName || "—"}
                      </div>
                      {d.parentMobile && (
                        <div className="text-xs text-gray-500">{d.parentMobile}</div>
                      )}
                    </td>
                    <td>
                      <div className="text-xs text-gray-600">
                        {formatDraftDate(d.updatedAt)}
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/students/new?draftId=${encodeURIComponent(d.id)}`}
                          className={cx(
                            buttonClass("primary"),
                            "px-2.5 py-1 text-xs"
                          )}
                        >
                          Resume
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(d.id, d.studentName)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                        >
                          Discard
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
