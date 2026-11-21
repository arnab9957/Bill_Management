"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  deleteAdmissionDraft,
  extractAdmissionFormData,
  formatDraftDate,
  getAdmissionDraft,
  getAdmissionDrafts,
  getAdmissionFormElement,
  restoreDraftIntoForm,
  saveAdmissionDraft,
  type AdmissionDraft,
} from "@/lib/admission-drafts";
import { cx } from "@/components/ui";

export function SaveDraftButton({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<string | null>(null);

  const handleSave = (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = getAdmissionFormElement() ?? e.currentTarget.closest("form");
    if (!form) return;

    const data = extractAdmissionFormData(form);
    const activeDraftId = searchParams?.get("draftId") || undefined;

    const classSelect = form.querySelector('select[name="classId"]') as HTMLSelectElement | null;
    const sectionSelect = form.querySelector('select[name="sectionId"]') as HTMLSelectElement | null;
    const selectedClassOpt = classSelect?.selectedOptions?.[0];
    const selectedSecOpt = sectionSelect?.selectedOptions?.[0];
    const clsName =
      selectedClassOpt && selectedClassOpt.value && selectedClassOpt.value !== "__manage_class__" && !selectedClassOpt.disabled && !selectedClassOpt.text.toLowerCase().startsWith("select")
        ? selectedClassOpt.text.trim()
        : undefined;
    const rawSec =
      selectedSecOpt && selectedSecOpt.value && selectedSecOpt.value !== "__manage_section__" && !selectedSecOpt.disabled && !selectedSecOpt.text.toLowerCase().startsWith("select")
        ? selectedSecOpt.text.trim()
        : undefined;
    const secName = rawSec ? rawSec.replace(/^Section\s+/i, "").trim() : undefined;

    const draft = saveAdmissionDraft({
      id: activeDraftId,
      data,
      studentName: data.name,
      classId: data.classId,
      sectionId: data.sectionId,
      className: clsName,
      sectionName: secName,
      reason: "manual",
    });

    setStatus(`Draft saved for ${draft.studentName || "admission"}!`);
    setTimeout(() => setStatus(null), 4000);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleSave}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-surface px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-soft hover:text-accent-ink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20",
          className
        )}
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 opacity-75"
          aria-hidden="true"
        >
          <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
          <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
        </svg>
        Save as draft
      </button>
      {status && (
        <span className="text-xs font-semibold text-brand-700 animate-fade-in">
          ✓ {status}
        </span>
      )}
    </div>
  );
}

export function DraftStatusBanner() {
  const searchParams = useSearchParams();
  const [activeDraft, setActiveDraft] = useState<AdmissionDraft | null>(null);
  const [suggestedDraft, setSuggestedDraft] = useState<AdmissionDraft | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const draftId = searchParams?.get("draftId");
    if (draftId) {
      const draft = getAdmissionDraft(draftId);
      if (draft) {
        setActiveDraft(draft);
        restoreDraftIntoForm(draft);
        return;
      }
    }

    // If no explicit draftId, check if there's a recent redirect draft (within 2 hours)
    const drafts = getAdmissionDrafts();
    const recent = drafts.find((d) => {
      const ageMs = Date.now() - new Date(d.updatedAt).getTime();
      return ageMs < 2 * 60 * 60 * 1000;
    });
    if (recent) {
      setSuggestedDraft(recent);
    }
  }, [searchParams]);

  // Clean up active draft from storage when form is submitted
  useEffect(() => {
    const form = getAdmissionFormElement();
    if (!form) return;
    const onSubmit = () => {
      const draftId = searchParams?.get("draftId") || activeDraft?.id;
      if (draftId) {
        deleteAdmissionDraft(draftId);
      }
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [searchParams, activeDraft]);

  const handleRestore = (draft: AdmissionDraft) => {
    setActiveDraft(draft);
    setSuggestedDraft(null);
    restoreDraftIntoForm(draft);
    const form = getAdmissionFormElement();
    if (form) {
      setTimeout(() => form.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };

  const handleDiscard = (id: string) => {
    if (window.confirm("Discard this draft admission?")) {
      deleteAdmissionDraft(id);
      setActiveDraft(null);
      setSuggestedDraft(null);
    }
  };

  if (activeDraft) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft/70 px-4 py-3 text-sm text-accent-ink">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-accent animate-pulse" />
          <span>
            <b>Resumed draft:</b> {activeDraft.studentName || "(Untitled)"}
            <span className="ml-2 text-xs opacity-75">
              (Saved {formatDraftDate(activeDraft.updatedAt)})
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleDiscard(activeDraft.id)}
            className="text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer"
          >
            Discard draft
          </button>
        </div>
      </div>
    );
  }

  if (suggestedDraft && !dismissed) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-highlight/40 bg-highlight-soft/60 px-4 py-3 text-sm text-ink">
        <div className="flex items-center gap-2">
          <span className="text-base">📝</span>
          <span>
            <b>Unsaved draft found:</b> {suggestedDraft.studentName || "(Untitled)"}
            <span className="ml-1.5 text-xs text-gray-600">
              ({formatDraftDate(suggestedDraft.updatedAt)})
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleRestore(suggestedDraft)}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 cursor-pointer"
          >
            Resume draft
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs text-gray-600 hover:text-ink cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return null;
}
