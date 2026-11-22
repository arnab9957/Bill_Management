"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { cx, LinkButton } from "@/components/ui";
import { useActionResult } from "@/components/action-form";

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

  const actionResult = useActionResult();
  const feeStructureMissing = (actionResult?.data as { feeStructureMissing?: boolean; structureUrl?: string; className?: string } | undefined)?.feeStructureMissing;
  const missingData = actionResult?.data as { structureUrl?: string; className?: string } | undefined;

  const handleSetupRedirect = (url: string) => {
    const form = getAdmissionFormElement();
    if (form) {
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

      saveAdmissionDraft({
        id: activeDraftId,
        data,
        studentName: data.name,
        classId: data.classId,
        sectionId: data.sectionId,
        className: clsName,
        sectionName: secName,
        reason: "redirect",
      });
    }
    window.location.href = url;
  };

  return (
    <>
      {feeStructureMissing && missingData?.structureUrl && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50/80 p-4 shadow-sm animate-fade-in" role="alert">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-xl leading-none">⚠️</span>
              <div>
                <h4 className="text-sm font-semibold text-red-900">
                  Fee structure not set up yet
                </h4>
                <p className="mt-0.5 text-xs text-red-700">
                  Admission cannot proceed because Class <b>{missingData.className || "selected"}</b> has no fee heads or amounts configured. Please configure the fee structure first.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleSetupRedirect(missingData.structureUrl!)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              <span>Set up fee structure</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}

      {activeDraft && (
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
      )}

      {suggestedDraft && !dismissed && (
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
      )}
    </>
  );
}

export function CollectNowCheckbox({
  yearId,
  configuredClassIds,
}: {
  yearId: number;
  configuredClassIds: number[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checked, setChecked] = useState(false);
  const [warnModal, setWarnModal] = useState<{ open: boolean; className?: string; classId?: number }>({ open: false });

  // Read classId from form
  const getSelectedClass = () => {
    const form = getAdmissionFormElement();
    if (!form) return { classId: 0, className: "" };
    const classSelect = form.querySelector('select[name="classId"]') as HTMLSelectElement | null;
    const cid = Number(classSelect?.value || 0);
    const opt = classSelect?.selectedOptions?.[0];
    const cname = opt && opt.value && !opt.disabled ? opt.text.trim() : "";
    return { classId: cid, className: cname };
  };

  const handleCheckboxClick = (e: React.MouseEvent<HTMLInputElement>) => {
    const willBeChecked = !checked;
    if (willBeChecked) {
      const { classId, className } = getSelectedClass();
      if (classId) {
        const isConfigured = configuredClassIds.includes(classId);
        if (!isConfigured) {
          e.preventDefault();
          setWarnModal({ open: true, className, classId });
          return;
        }
      }
    }
    setChecked(willBeChecked);
  };

  const handleRedirectToFeeStructure = (classId: number) => {
    const form = getAdmissionFormElement();
    if (form) {
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

      saveAdmissionDraft({
        id: activeDraftId,
        data,
        studentName: data.name,
        classId: data.classId,
        sectionId: data.sectionId,
        className: clsName,
        sectionName: secName,
        reason: "redirect",
      });
    }
    router.push(`/fees/structure/${yearId}/${classId}`);
  };

  return (
    <>
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 p-4 transition-colors hover:border-gray-400">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            name="collectNow"
            value="true"
            checked={checked}
            onClick={handleCheckboxClick}
            onChange={() => {}}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
          />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-gray-900">
              Collect Fee Now
            </span>
            <p className="text-xs text-gray-500">
              Check this to generate due bills right upon admission and open the fee collection counter directly. Uncheck to save admission and go to the student profile.
            </p>
          </div>
        </label>
      </div>

      {warnModal.open && warnModal.classId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl border border-gray-200">
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none">⚠️</span>
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Fee Structure Not Set Up
                </h3>
                <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">
                  Fee collection cannot be enabled for <b>{warnModal.className || "this class"}</b> because no fee structure has been configured for it yet. Please configure the fee structure first.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setWarnModal({ open: false })}
                className="rounded-lg border border-gray-300 bg-surface px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRedirectToFeeStructure(warnModal.classId!)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition cursor-pointer"
              >
                <span>Set up fee structure</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
