/**
 * Admission Drafts Manager
 * Handles local drafting for student admissions, supporting auto-drafting before
 * navigating to Class/Section setup, manual draft saves, and draft recovery.
 */

export interface AdmissionDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  studentName: string;
  admissionNo?: string;
  classId?: string;
  sectionId?: string;
  className?: string;
  sectionName?: string;
  parentName?: string;
  parentMobile?: string;
  reason?: "redirect" | "manual";
  data: Record<string, string>;
}

const DRAFTS_KEY = "sb_admission_drafts";

export function getAdmissionDrafts(): AdmissionDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function getAdmissionDraft(id: string): AdmissionDraft | null {
  const drafts = getAdmissionDrafts();
  return drafts.find((d) => d.id === id) ?? null;
}

export function saveAdmissionDraft(input: {
  id?: string;
  data: Record<string, string>;
  studentName?: string;
  admissionNo?: string;
  classId?: string;
  sectionId?: string;
  className?: string;
  sectionName?: string;
  parentName?: string;
  parentMobile?: string;
  reason?: "redirect" | "manual";
}): AdmissionDraft {
  const drafts = getAdmissionDrafts();
  const now = new Date().toISOString();

  let existingIndex = -1;
  if (input.id) {
    existingIndex = drafts.findIndex((d) => d.id === input.id);
  } else if (input.reason === "redirect") {
    // If auto-drafting on redirect without an active draft ID, reuse recent redirect draft (within 15 mins)
    existingIndex = drafts.findIndex((d) => {
      if (d.reason !== "redirect") return false;
      const ageMs = Date.now() - new Date(d.updatedAt).getTime();
      return ageMs < 15 * 60 * 1000;
    });
  }

  // Ensure admissionNo and rollNo are never saved in drafts
  delete input.data.admissionNo;
  delete input.data.rollNo;

  const existing = existingIndex >= 0 ? drafts[existingIndex] : undefined;
  const sName = input.studentName?.trim() || input.data.name?.trim() || "(Untitled draft)";
  const pName = input.parentName?.trim() || input.data["guardian.name"]?.trim() || "";
  const pMobile = input.parentMobile?.trim() || input.data["guardian.mobile"]?.trim() || "";
  const cName = input.className || input.data._className || existing?.className;
  const sNameResolved = input.sectionName || input.data._sectionName || existing?.sectionName;

  let draft: AdmissionDraft;
  if (existing) {
    draft = {
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now,
      studentName: sName,
      parentName: pName,
      parentMobile: pMobile,
      classId: input.classId ?? input.data.classId,
      sectionId: input.sectionId ?? input.data.sectionId,
      className: cName,
      sectionName: sNameResolved,
      reason: input.reason ?? existing.reason,
      data: input.data,
    };
    drafts[existingIndex] = draft;
  } else {
    draft = {
      id: input.id || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      updatedAt: now,
      studentName: sName,
      parentName: pName,
      parentMobile: pMobile,
      classId: input.classId ?? input.data.classId,
      sectionId: input.sectionId ?? input.data.sectionId,
      className: cName,
      sectionName: sNameResolved,
      reason: input.reason ?? "manual",
      data: input.data,
    };
    drafts.unshift(draft);
  }

  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    window.dispatchEvent(new CustomEvent("admission-drafts-changed", { detail: { draft } }));
  } catch (err) {
    console.error("Failed to save admission draft to localStorage", err);
  }

  return draft;
}

export function deleteAdmissionDraft(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const drafts = getAdmissionDrafts().filter((d) => d.id !== id);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    window.dispatchEvent(new CustomEvent("admission-drafts-changed", { detail: { deletedId: id } }));
  } catch (err) {
    console.error("Failed to delete admission draft from localStorage", err);
  }
}

export function clearAllAdmissionDrafts(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DRAFTS_KEY);
    window.dispatchEvent(new CustomEvent("admission-drafts-changed", { detail: { cleared: true } }));
  } catch (err) {
    console.error("Failed to clear admission drafts", err);
  }
}

export function getAdmissionFormElement(): HTMLFormElement | null {
  if (typeof document === "undefined") return null;
  return (
    (document.getElementById("admission-form") as HTMLFormElement | null) ??
    document.querySelector("form#admission-form") ??
    document.querySelector("form:has(#classId)") ??
    document.querySelector("form:has(input[name='admissionNo'])") ??
    null
  );
}

export function extractAdmissionFormData(form: HTMLFormElement): Record<string, string> {
  const data: Record<string, string> = {};
  const elements = form.elements;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!el.name) continue;
    if (el.tagName === "BUTTON" || el.type === "submit" || el.type === "button" || el.type === "reset") continue;
    // Do not save admissionNo or rollNo in draft
    if (el.name === "admissionNo" || el.name === "rollNo") continue;
    if (el.type === "checkbox") {
      const chk = el as HTMLInputElement;
      data[el.name] = chk.checked ? "true" : "false";
    } else if (el.type === "radio") {
      const rad = el as HTMLInputElement;
      if (rad.checked) data[el.name] = rad.value;
    } else {
      data[el.name] = el.value ?? "";
    }
  }

  // Auto capture selected class name and section name text from the form selects
  const classSelect = form.querySelector('select[name="classId"]') as HTMLSelectElement | null;
  const sectionSelect = form.querySelector('select[name="sectionId"]') as HTMLSelectElement | null;

  if (classSelect && classSelect.selectedIndex >= 0) {
    const opt = classSelect.options[classSelect.selectedIndex];
    if (opt && opt.value && opt.value !== "__manage_class__" && !opt.disabled) {
      const text = opt.text.trim();
      if (!text.toLowerCase().startsWith("select")) {
        data._className = text;
      }
    }
  }

  if (sectionSelect && sectionSelect.selectedIndex >= 0) {
    const opt = sectionSelect.options[sectionSelect.selectedIndex];
    if (opt && opt.value && opt.value !== "__manage_section__" && !opt.disabled) {
      const text = opt.text.trim();
      if (!text.toLowerCase().startsWith("select") && !text.toLowerCase().startsWith("no section") && !text.toLowerCase().startsWith("none")) {
        data._sectionName = text.replace(/^Section\s+/i, "").trim();
      }
    }
  }

  delete data.admissionNo;
  delete data.rollNo;
  return data;
}

function setNativeValue(element: HTMLElement, value: string) {
  const isInput = element instanceof HTMLInputElement;
  const isSelect = element instanceof HTMLSelectElement;
  const isTextArea = element instanceof HTMLTextAreaElement;

  if (isInput) {
    const proto = window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) {
      desc.set.call(element, value);
    } else {
      (element as HTMLInputElement).value = value;
    }
  } else if (isSelect) {
    const proto = window.HTMLSelectElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) {
      desc.set.call(element, value);
    } else {
      (element as HTMLSelectElement).value = value;
    }
  } else if (isTextArea) {
    const proto = window.HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) {
      desc.set.call(element, value);
    } else {
      (element as HTMLTextAreaElement).value = value;
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (element as any).value = value;
  }
}

type FormField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function populateAdmissionForm(form: HTMLFormElement, data: Record<string, string>): void {
  for (const [key, val] of Object.entries(data)) {
    // Never restore admissionNo or rollNo from draft
    if (key === "admissionNo" || key === "rollNo") continue;

    let el: FormField | null = null;
    try {
      el = form.querySelector(`[name="${CSS.escape(key)}"]`) as FormField | null;
    } catch {
      // Fallback
    }
    if (!el) {
      const named = form.elements.namedItem(key);
      if (named && !(named instanceof NodeList) && "tagName" in named) {
        el = named as FormField;
      }
    }
    if (!el) {
      el = document.getElementById(key) as FormField | null;
    }
    if (!el) continue;

    if (el.type === "checkbox") {
      (el as HTMLInputElement).checked = val === "true" || val === "on" || val === "1";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el.type === "radio") {
      const radios = form.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(key)}"]`);
      radios.forEach((r) => {
        r.checked = r.value === val;
        r.dispatchEvent(new Event("change", { bubbles: true }));
      });
    } else {
      setNativeValue(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

export function restoreDraftIntoForm(draft: AdmissionDraft, retries = 10): void {
  if (typeof window === "undefined") return;

  const run = (attemptsLeft: number) => {
    const form = getAdmissionFormElement();
    if (form) {
      populateAdmissionForm(form, draft.data);
      window.dispatchEvent(new CustomEvent("admission-draft-restored", { detail: { draft } }));
      return;
    }
    if (attemptsLeft > 0) {
      setTimeout(() => run(attemptsLeft - 1), 60);
    }
  };

  setTimeout(() => run(retries), 20);
}

export function formatDraftDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.round(diffMs / (60 * 1000));
    const diffHours = Math.round(diffMs / (60 * 60 * 1000));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}
