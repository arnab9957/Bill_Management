"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { compareClasses } from "@/lib/classes";
import {
  extractAdmissionFormData,
  getAdmissionDraft,
  getAdmissionFormElement,
  saveAdmissionDraft,
  type AdmissionDraft,
} from "@/lib/admission-drafts";
import { FieldError } from "@/components/action-form";
import type { Student, Guardian } from "@sb/db";

interface MasterData {
  years: { id: number; name: string; isCurrent: boolean }[];
  classes: { id: number; name: string }[];
  sections: { id: number; classId: number; name: string }[];
}

function formatLabel(label: ReactNode): ReactNode {
  if (typeof label === "string") {
    if (!label.includes("*")) return label;
    const parts = label.split("*");
    return (
      <>
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {index < parts.length - 1 && <span className="font-semibold text-red-600">*</span>}
          </span>
        ))}
      </>
    );
  }
  return label;
}

function L({ label, name, className, children }: { label: ReactNode; name: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <label htmlFor={name}>{formatLabel(label)}</label>
      {children}
      <FieldError name={name} />
    </div>
  );
}

// -------------------------------- Input Sanitizers / Keystroke Handlers --------------------------------

function handleAdmissionNoKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.metaKey || e.key.length > 1) return;
  if (e.key === " " || !/^[a-zA-Z0-9\-_/.]$/.test(e.key)) {
    e.preventDefault();
    return;
  }
  if (e.currentTarget.value.length >= 32 && e.currentTarget.selectionStart === e.currentTarget.selectionEnd) {
    e.preventDefault();
  }
}

function handleAdmissionNoInput(e: React.FormEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  const cleaned = input.value.replace(/[^a-zA-Z0-9\-_/.]/g, "").slice(0, 32);
  if (input.value !== cleaned) {
    input.value = cleaned;
  }
}

function handleRollNoKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.metaKey || e.key.length > 1) return;
  if (e.key === " " || !/^[a-zA-Z0-9-]$/.test(e.key)) {
    e.preventDefault();
    return;
  }
  if (e.currentTarget.value.length >= 16 && e.currentTarget.selectionStart === e.currentTarget.selectionEnd) {
    e.preventDefault();
  }
}

function handleRollNoInput(e: React.FormEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  const cleaned = input.value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 16);
  if (input.value !== cleaned) {
    input.value = cleaned;
  }
}

function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.metaKey || e.key.length > 1) return;
  if (!/^[a-zA-Z\s.'-]$/.test(e.key)) {
    e.preventDefault();
    return;
  }
  if (e.key === " " && (e.currentTarget.selectionStart ?? 0) === 0) {
    e.preventDefault();
  }
}

function handleNameInput(e: React.FormEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  const cursor = input.selectionStart;
  const cleaned = input.value
    .replace(/[^a-zA-Z\s.'-]/g, "")
    .replace(/^\s+/, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 128);
  if (input.value !== cleaned) {
    input.value = cleaned;
    if (cursor != null) input.setSelectionRange(cursor, cursor);
  }
}

function handleMobileKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.metaKey || e.key.length > 1) return;
  if (!/^\d$/.test(e.key)) {
    e.preventDefault();
    return;
  }
  const pos = e.currentTarget.selectionStart ?? 0;
  if (pos === 0 && !/^[6-9]$/.test(e.key)) {
    e.preventDefault();
    return;
  }
  if (e.currentTarget.value.length >= 10 && e.currentTarget.selectionStart === e.currentTarget.selectionEnd) {
    e.preventDefault();
  }
}

function handleMobileInput(e: React.FormEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  let val = input.value.replace(/\D/g, "");
  if (val.length === 12 && val.startsWith("91")) val = val.slice(2);
  else if (val.length === 11 && val.startsWith("0")) val = val.slice(1);
  if (val.length > 0 && !/^[6-9]/.test(val)) {
    val = val.replace(/^[^6-9]+/, "");
  }
  val = val.slice(0, 10);
  if (input.value !== val) {
    input.value = val;
  }
}

function handleEmailKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === " ") {
    e.preventDefault();
  }
}

function handleEmailInput(e: React.FormEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  const cleaned = input.value.replace(/\s/g, "").slice(0, 128);
  if (input.value !== cleaned) {
    input.value = cleaned;
  }
}

// -------------------------------- Student Inputs Component --------------------------------

export function computeNextRoll(
  rollsByClassSection: Record<string, string[]>,
  cId: number | "",
  sId: number | "",
  currentStudentRoll?: string | null,
  rollFormat?: { digits?: number; prefixSection?: boolean; startNumber?: number },
  sectionName?: string | null,
): string {
  if (!cId) return "1";
  const key = `${cId}_${sId || ""}`;
  let existing = rollsByClassSection[key] || [];
  if (currentStudentRoll) {
    existing = existing.filter((r) => r !== currentStudentRoll);
  }
  const padLen = rollFormat?.digits && rollFormat.digits >= 1 ? rollFormat.digits : 1;
  const startNum = rollFormat?.startNumber && rollFormat.startNumber >= 1 ? rollFormat.startNumber : 1;
  const rollPrefix = rollFormat?.prefixSection && sectionName ? `${sectionName}-` : "";

  const existingSet = new Set(existing.map((r) => r.trim()));
  let maxNum = 0;
  for (const r of existing) {
    const trimmed = r.trim();
    if (rollPrefix ? trimmed.startsWith(rollPrefix) : true) {
      const sub = trimmed.slice(rollPrefix.length).match(/^(\d+)$/);
      if (sub && sub[1] !== undefined) {
        const val = parseInt(sub[1], 10);
        if (val > maxNum) {
          maxNum = val;
        }
      }
    }
  }

  let next = maxNum > 0 ? maxNum + 1 : startNum;
  let candidate = `${rollPrefix}${String(next).padStart(padLen, "0")}`;
  while (existingSet.has(candidate)) {
    next++;
    candidate = `${rollPrefix}${String(next).padStart(padLen, "0")}`;
  }
  return candidate;
}

export function StudentInputs({
  m,
  s,
  yearId,
  yearLocked,
  cls,
  sec,
  roll,
  nextAdmissionNo = "1001",
  existingAdmissionNos = [],
  rollsByClassSection = {},
  rollFormat,
}: {
  m: MasterData;
  s?: Student;
  yearId?: number;
  yearLocked?: boolean;
  cls?: number | null;
  sec?: number | null;
  roll?: string | null;
  nextAdmissionNo?: string;
  existingAdmissionNos?: { id: number; admissionNo: string }[];
  rollsByClassSection?: Record<string, string[]>;
  rollFormat?: { digits?: number; prefixSection?: boolean; startNumber?: number };
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isNew = !s;
  const router = useRouter();
  const searchParams = useSearchParams();

  const getSectionName = (secId: number | "") =>
    secId ? m.sections.find((section) => section.id === secId)?.name : null;

  // Class and Section selection
  const sortedClasses = useMemo(() => [...m.classes].sort(compareClasses), [m.classes]);
  const defaultClass = cls ?? (isNew && sortedClasses[0] ? sortedClasses[0].id : "");
  const [selectedClassId, setSelectedClassId] = useState<number | "">(defaultClass);

  const availableSections = selectedClassId
    ? m.sections.filter((section) => section.classId === selectedClassId)
    : [];

  const defaultSection = sec ?? (isNew && availableSections[0] ? availableSections[0].id : "");
  const [selectedSectionId, setSelectedSectionId] = useState<number | "">(defaultSection);

  // Roll No state
  const initialRoll =
    roll ??
    (isNew
      ? computeNextRoll(
        rollsByClassSection,
        defaultClass,
        defaultSection,
        undefined,
        rollFormat,
        getSectionName(defaultSection),
      )
      : "");
  const [rollVal, setRollVal] = useState<string>(initialRoll);
  const [rollCustomized, setRollCustomized] = useState(false);
  const [rollError, setRollError] = useState("");
  const rollRef = useRef<HTMLInputElement>(null);

  // Admission No state
  const initialAdmission = s?.admissionNo ?? (isNew ? nextAdmissionNo : "");
  const [admissionVal, setAdmissionVal] = useState<string>(initialAdmission);
  const [admissionError, setAdmissionError] = useState("");
  const admissionRef = useRef<HTMLInputElement>(null);

  // Restore draft into controlled states if active or triggered (only class & section; admissionNo & rollNo are never drafted)
  useEffect(() => {
    const applyDraft = (draft: AdmissionDraft) => {
      const cId = draft.classId || draft.data.classId;
      const sId = draft.sectionId || draft.data.sectionId;
      const parsedClassId = cId ? Number(cId) : "";
      const parsedSectionId = sId ? Number(sId) : "";

      if (parsedClassId) {
        setSelectedClassId(parsedClassId);
        const classSecs = m.sections.filter((sec) => sec.classId === parsedClassId);
        const validSection =
          parsedSectionId && classSecs.some((sec) => sec.id === parsedSectionId)
            ? parsedSectionId
            : (classSecs[0]?.id ?? "");
        setSelectedSectionId(validSection);

        // Auto compute next roll dynamically for this class and section
        if (isNew || !rollCustomized) {
          const autoRoll = computeNextRoll(
            rollsByClassSection,
            parsedClassId,
            validSection,
            s?.rollNo,
            rollFormat,
            getSectionName(validSection)
          );
          setRollVal(autoRoll);
          setRollError("");
          rollRef.current?.setCustomValidity("");
        }
      }
    };

    const draftId = searchParams?.get("draftId");
    if (draftId) {
      const draft = getAdmissionDraft(draftId);
      if (draft) applyDraft(draft);
    }

    const onRestored = (e: Event) => {
      const custom = e as CustomEvent<{ draft: AdmissionDraft }>;
      if (custom.detail?.draft) {
        applyDraft(custom.detail.draft);
      }
    };

    window.addEventListener("admission-draft-restored", onRestored);
    return () => window.removeEventListener("admission-draft-restored", onRestored);
  }, [searchParams, m.sections, rollsByClassSection, rollFormat, isNew, s]);

  // Validate admission number uniqueness in real-time
  const validateAdmission = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) {
      setAdmissionError("");
      admissionRef.current?.setCustomValidity("");
      return;
    }
    const isDup = existingAdmissionNos.some((other) => {
      if (s && other.id === s.id) return false;
      return other.admissionNo.toLowerCase() === trimmed.toLowerCase();
    });
    if (isDup) {
      const msg = "Admission number already used by another student";
      setAdmissionError(msg);
      admissionRef.current?.setCustomValidity(msg);
    } else {
      setAdmissionError("");
      admissionRef.current?.setCustomValidity("");
    }
  };

  // Validate roll number uniqueness in real-time
  const validateRoll = (val: string, cId: number | "", sId: number | "") => {
    const trimmed = val.trim();
    if (!trimmed || !cId) {
      setRollError("");
      rollRef.current?.setCustomValidity("");
      return;
    }
    const key = `${cId}_${sId || ""}`;
    const existing = rollsByClassSection[key] || [];
    const isDup = existing.some((r) => {
      if (s && r === (s.rollNo ?? "")) return false;
      return r.toLowerCase() === trimmed.toLowerCase();
    });
    if (isDup) {
      const msg = "Roll number already assigned to another student in this class and section";
      setRollError(msg);
      rollRef.current?.setCustomValidity(msg);
    } else {
      setRollError("");
      rollRef.current?.setCustomValidity("");
    }
  };

  const draftAndRedirectToSettings = (formEl: HTMLFormElement | null) => {
    const form = formEl ?? getAdmissionFormElement();
    if (form) {
      const data = extractAdmissionFormData(form);
      delete data.admissionNo;
      delete data.rollNo;
      const clsObj = m.classes.find((c) => String(c.id) === String(data.classId));
      const secObj = m.sections.find((s) => String(s.id) === String(data.sectionId));
      const activeDraftId = searchParams?.get("draftId") || undefined;
      saveAdmissionDraft({
        id: activeDraftId,
        data,
        studentName: data.name,
        classId: data.classId,
        sectionId: data.sectionId,
        className: clsObj?.name,
        sectionName: secObj?.name,
        reason: "redirect",
      });
    }
    router.push("/settings?open=classes-sections#classes-sections");
  };

  const handleManageClassesClick = (e: React.MouseEvent) => {
    e.preventDefault();
    draftAndRedirectToSettings((e.currentTarget as HTMLElement).closest("form"));
  };

  const handleManageSectionsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    draftAndRedirectToSettings((e.currentTarget as HTMLElement).closest("form"));
  };

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "__manage_class__") {
      e.target.value = String(selectedClassId);
      draftAndRedirectToSettings(e.target.closest("form"));
      return;
    }
    const newClassId = e.target.value ? Number(e.target.value) : "";
    setSelectedClassId(newClassId);

    const newSections = newClassId
      ? m.sections.filter((sec) => sec.classId === newClassId)
      : [];
    let newSectionId: number | "" = "";
    if (newSections.some((sec) => sec.id === selectedSectionId)) {
      newSectionId = selectedSectionId;
    } else {
      newSectionId = newSections[0] ? newSections[0].id : "";
      setSelectedSectionId(newSectionId);
    }

    const isClassChanged = Boolean(cls && newClassId !== cls);
    if (isNew || isClassChanged || !rollCustomized) {
      const autoRoll = computeNextRoll(
        rollsByClassSection,
        newClassId,
        newSectionId,
        isClassChanged ? undefined : s?.rollNo,
        rollFormat,
        getSectionName(newSectionId),
      );
      setRollVal(autoRoll);
      setRollCustomized(false);
      setRollError("");
      rollRef.current?.setCustomValidity("");
    } else {
      validateRoll(rollVal, newClassId, newSectionId);
    }
  };

  const handleSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "__manage_section__") {
      e.target.value = String(selectedSectionId);
      draftAndRedirectToSettings(e.target.closest("form"));
      return;
    }
    const newSectionId = e.target.value ? Number(e.target.value) : "";
    setSelectedSectionId(newSectionId);

    const isClassChanged = Boolean(cls && selectedClassId !== cls);
    if (isNew || isClassChanged || !rollCustomized) {
      const autoRoll = computeNextRoll(
        rollsByClassSection,
        selectedClassId,
        newSectionId,
        isClassChanged ? undefined : s?.rollNo,
        rollFormat,
        getSectionName(newSectionId),
      );
      setRollVal(autoRoll);
      setRollCustomized(false);
      setRollError("");
      rollRef.current?.setCustomValidity("");
    } else {
      validateRoll(rollVal, selectedClassId, newSectionId);
    }
  };

  const handleAdmissionChange = (e: React.FormEvent<HTMLInputElement>) => {
    handleAdmissionNoInput(e);
    setAdmissionVal(e.currentTarget.value);
    validateAdmission(e.currentTarget.value);
  };

  const handleRollChange = (e: React.FormEvent<HTMLInputElement>) => {
    handleRollNoInput(e);
    setRollVal(e.currentTarget.value);
    setRollCustomized(true);
    validateRoll(e.currentTarget.value, selectedClassId, selectedSectionId);
  };

  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold tracking-tight text-gray-950">Student</h3>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        {/* Row 1: Academic Year, Admission No, Full Name */}
        <L label={yearLocked ? "Academic year" : "Academic year *"} name="academicYearId">
          {yearLocked ? (
            <>
              <input type="hidden" name="academicYearId" value={yearId} />
              <div className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
                {m.years.find((y) => y.id === yearId)?.name}
              </div>
            </>
          ) : (
            <select id="academicYearId" name="academicYearId" defaultValue={yearId} required>
              {m.years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </select>
          )}
        </L>

        <L label={s ? "Admission no." : "Admission no. *"} name="admissionNo">
          {s ? (
            <>
              <input type="hidden" name="admissionNo" value={admissionVal} />
              <div className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
                {admissionVal}
              </div>
            </>
          ) : (
            <>
              <input
                ref={admissionRef}
                id="admissionNo"
                name="admissionNo"
                value={admissionVal}
                required
                maxLength={32}
                placeholder="e.g. 2026/001"
                autoComplete="off"
                onKeyDown={handleAdmissionNoKeyDown}
                onInput={handleAdmissionChange}
                onChange={handleAdmissionChange}
              />
              {admissionError && <p className="text-xs font-medium text-red-700">{admissionError}</p>}
            </>
          )}
        </L>

        <L label="Full name *" name="name">
          <input
            id="name"
            name="name"
            defaultValue={s?.name}
            required
            minLength={2}
            maxLength={128}
            placeholder="Student's full name"
            autoComplete="name"
            onKeyDown={handleNameKeyDown}
            onInput={handleNameInput}
          />
        </L>

        {/* Row 2: Class, Section, Roll No */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="classId">
              Class <span className="font-semibold text-red-600">*</span>
            </label>
            <button
              type="button"
              onClick={handleManageClassesClick}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink transition hover:bg-accent-soft cursor-pointer"
              title="Add or manage classes in settings"
            >
              Manage Classes
            </button>
          </div>
          <select
            id="classId"
            name="classId"
            value={selectedClassId}
            onChange={handleClassChange}
            required
          >
            <option value="">Select class</option>
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <optgroup label="Actions">
              <option
                value="__manage_class__"
                className="bg-indigo-100 font-semibold text-indigo-900"
                style={{ backgroundColor: "#e0e7ff", color: "#3730a3", fontWeight: 600 }}
              >
                Manage Classes
              </option>
            </optgroup>
          </select>
          <FieldError name="classId" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="sectionId">Section</label>
            <button
              type="button"
              onClick={handleManageSectionsClick}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink transition hover:bg-accent-soft cursor-pointer"
              title="Add or manage sections in settings"
            >
              Manage Sections
            </button>
          </div>
          <select
            id="sectionId"
            name="sectionId"
            value={selectedSectionId}
            onChange={handleSectionChange}
          >
            <option value="">
              {!selectedClassId
                ? "Select class first"
                : availableSections.length === 0
                  ? "No sections"
                  : "Select section"}
            </option>
            {availableSections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name}
              </option>
            ))}
            <optgroup label="Actions">
              <option
                value="__manage_section__"
                className="bg-indigo-100 font-semibold text-indigo-900"
                style={{ backgroundColor: "#e0e7ff", color: "#3730a3", fontWeight: 600 }}
              >
                Manage Sections
              </option>
            </optgroup>
          </select>
          <FieldError name="sectionId" />
        </div>

        <L label="Roll no." name="rollNo">
          <input
            ref={rollRef}
            id="rollNo"
            name="rollNo"
            value={rollVal}
            maxLength={16}
            placeholder="e.g. 1"
            autoComplete="off"
            onKeyDown={handleRollNoKeyDown}
            onInput={handleRollChange}
            onChange={handleRollChange}
          />
          {rollError && <p className="text-xs font-medium text-red-700">{rollError}</p>}
        </L>

        {/* Row 3: Date of Birth, Gender, Admission Date */}
        <L label="Date of birth" name="dob">
          <input
            id="dob"
            type="date"
            name="dob"
            data-dob
            defaultValue={s?.dob ?? ""}
            max={today}
            min="1990-01-01"
            onChange={(e) => {
              if (e.currentTarget.value && e.currentTarget.value > today) {
                e.currentTarget.value = today;
              }
            }}
          />
        </L>

        <L label="Gender" name="gender">
          <select id="gender" name="gender" defaultValue={s?.gender ?? ""}>
            <option value="">Select gender</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
          </select>
        </L>

        <L label="Admission date *" name="admissionDate">
          <input
            id="admissionDate"
            type="date"
            name="admissionDate"
            data-ahead="365"
            defaultValue={s?.admissionDate ?? today}
            required
            min="2000-01-01"
            max="2099-12-31"
          />
        </L>
      </fieldset>
    </div>
  );
}

// -------------------------------- Guardian Inputs Component --------------------------------

export function GuardianInputs({ g, prefix = "" }: { g?: Guardian; prefix?: string }) {
  const n = (k: string) => `${prefix}${k}`;
  const searchParams = useSearchParams();
  const mobileRef = useRef<HTMLInputElement>(null);
  const whatsappRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const initialMobile = g?.mobile ?? "";
  const initialWhatsapp = g?.whatsappNo ?? "";
  const initialEmail = g?.email ?? "";
  const [mobile, setMobile] = useState(initialMobile);
  const [whatsapp, setWhatsapp] = useState(initialWhatsapp);
  const [email, setEmail] = useState(initialEmail);
  const [sameAsMobile, setSameAsMobile] = useState(
    Boolean(initialMobile && initialWhatsapp && initialMobile === initialWhatsapp)
  );

  // Input validity checks (determines whether related checkbox is editable)
  const hasMobile = Boolean(mobile && mobile.trim().length === 10);
  const hasWhatsapp = Boolean(whatsapp && whatsapp.trim().length === 10);
  const hasEmail = Boolean(email && email.trim().length > 3 && email.includes("@"));

  // Initial checkbox states based on input values from the beginning
  const [notifySms, setNotifySms] = useState(
    g ? Boolean(hasMobile && (g.notifySms ?? true)) : false
  );
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(
    g ? Boolean(hasWhatsapp && (g.notifyWhatsapp ?? true)) : false
  );
  const [notifyEmail, setNotifyEmail] = useState(
    g ? Boolean(hasEmail && (g.notifyEmail ?? true)) : false
  );
  const [messagingConsent, setMessagingConsent] = useState(
    g ? Boolean(g.messagingConsent) : false
  );

  // Track if user explicitly unchecked a channel while input still has a valid value
  const smsManuallyUnchecked = useRef(false);
  const whatsappManuallyUnchecked = useRef(false);
  const emailManuallyUnchecked = useRef(false);

  useEffect(() => {
    const hasEither = Boolean(whatsapp.trim() || email.trim());
    const errorMsg = hasEither ? "" : "Please provide either a WhatsApp number or an Email address.";
    whatsappRef.current?.setCustomValidity(errorMsg);
    emailRef.current?.setCustomValidity(errorMsg);
  }, [whatsapp, email]);

  useEffect(() => {
    const applyDraft = (draft: AdmissionDraft) => {
      const mVal = draft.data[n("mobile")] ?? "";
      const wVal = draft.data[n("whatsappNo")] ?? "";
      const eVal = draft.data[n("email")] ?? "";
      if (mVal) setMobile(mVal);
      if (wVal) setWhatsapp(wVal);
      if (eVal) setEmail(eVal);
      if (mVal && wVal && mVal === wVal) {
        setSameAsMobile(true);
      } else {
        setSameAsMobile(false);
      }
      const mOk = mVal.trim().length === 10;
      const wOk = wVal.trim().length === 10;
      const eOk = eVal.trim().length > 3 && eVal.includes("@");

      if (draft.data[n("notifySms")] !== undefined) {
        setNotifySms(mOk && draft.data[n("notifySms")] === "true");
      } else if (mOk) {
        setNotifySms(true);
      }
      if (draft.data[n("notifyWhatsapp")] !== undefined) {
        setNotifyWhatsapp(wOk && draft.data[n("notifyWhatsapp")] === "true");
      } else if (wOk) {
        setNotifyWhatsapp(true);
      }
      if (draft.data[n("notifyEmail")] !== undefined) {
        setNotifyEmail(eOk && draft.data[n("notifyEmail")] === "true");
      } else if (eOk) {
        setNotifyEmail(true);
      }
      if (draft.data[n("messagingConsent")] !== undefined) {
        setMessagingConsent(draft.data[n("messagingConsent")] === "true");
      } else if (mOk || wOk || eOk) {
        setMessagingConsent(true);
      }
    };

    const draftId = searchParams?.get("draftId");
    if (draftId) {
      const draft = getAdmissionDraft(draftId);
      if (draft) applyDraft(draft);
    }

    const onRestored = (e: Event) => {
      const custom = e as CustomEvent<{ draft: AdmissionDraft }>;
      if (custom.detail?.draft) applyDraft(custom.detail.draft);
    };

    window.addEventListener("admission-draft-restored", onRestored);
    return () => window.removeEventListener("admission-draft-restored", onRestored);
  }, [searchParams, prefix]);

  const onMobileInput = (e: React.FormEvent<HTMLInputElement>) => {
    handleMobileInput(e);
    const val = e.currentTarget.value;
    setMobile(val);
    if (sameAsMobile) {
      setWhatsapp(val);
    }

    if (val.trim().length === 10) {
      if (!smsManuallyUnchecked.current) {
        setNotifySms(true);
        setMessagingConsent(true);
      }
      if (sameAsMobile && !whatsappManuallyUnchecked.current) {
        setNotifyWhatsapp(true);
        setMessagingConsent(true);
      }
    } else {
      // Incomplete or empty: uncheck SMS
      setNotifySms(false);
      smsManuallyUnchecked.current = false;
      if (sameAsMobile) {
        setNotifyWhatsapp(false);
        whatsappManuallyUnchecked.current = false;
      }
      const otherActive = (email.trim().length > 3 && email.includes("@")) || (!sameAsMobile && whatsapp.trim().length === 10);
      if (!otherActive) {
        setMessagingConsent(false);
      }
    }
  };

  const handleSameAsMobileToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setSameAsMobile(checked);
    if (checked) {
      setWhatsapp(mobile);
      if (mobile.trim().length === 10) {
        setNotifyWhatsapp(true);
        whatsappManuallyUnchecked.current = false;
        setMessagingConsent(true);
      } else {
        setNotifyWhatsapp(false);
      }
    } else {
      // Unchecked: clear WhatsApp field, uncheck & disable its notification channel
      setWhatsapp("");
      setNotifyWhatsapp(false);
      whatsappManuallyUnchecked.current = false;
      const otherActive = (mobile.trim().length === 10) || (email.trim().length > 3 && email.includes("@"));
      if (!otherActive) {
        setMessagingConsent(false);
      }
      setTimeout(() => whatsappRef.current?.focus(), 0);
    }
  };

  const onWhatsAppInput = (e: React.FormEvent<HTMLInputElement>) => {
    handleMobileInput(e);
    const val = e.currentTarget.value;
    setWhatsapp(val);
    if (sameAsMobile && val !== mobile) {
      setSameAsMobile(false);
    }

    if (val.trim().length === 10) {
      if (!whatsappManuallyUnchecked.current) {
        setNotifyWhatsapp(true);
        setMessagingConsent(true);
      }
    } else {
      // Incomplete or empty: uncheck WhatsApp
      setNotifyWhatsapp(false);
      whatsappManuallyUnchecked.current = false;
      const otherActive = (mobile.trim().length === 10) || (email.trim().length > 3 && email.includes("@"));
      if (!otherActive) {
        setMessagingConsent(false);
      }
    }
  };

  const onEmailInput = (e: React.FormEvent<HTMLInputElement>) => {
    handleEmailInput(e);
    const val = e.currentTarget.value;
    setEmail(val);

    if (val.trim().length > 3 && val.includes("@")) {
      if (!emailManuallyUnchecked.current) {
        setNotifyEmail(true);
        setMessagingConsent(true);
      }
    } else {
      // Incomplete or empty: uncheck Email
      setNotifyEmail(false);
      emailManuallyUnchecked.current = false;
      const otherActive = (mobile.trim().length === 10) || (whatsapp.trim().length === 10);
      if (!otherActive) {
        setMessagingConsent(false);
      }
    }
  };

  const handleToggleSms = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasMobile) return;
    const next = e.target.checked;
    setNotifySms(next);
    smsManuallyUnchecked.current = !next;
    if (next) {
      setMessagingConsent(true);
    } else {
      if (!notifyWhatsapp && !notifyEmail) {
        setMessagingConsent(false);
      }
    }
  };

  const handleToggleWhatsapp = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasWhatsapp) return;
    const next = e.target.checked;
    setNotifyWhatsapp(next);
    whatsappManuallyUnchecked.current = !next;
    if (next) {
      setMessagingConsent(true);
    } else {
      if (!notifySms && !notifyEmail) {
        setMessagingConsent(false);
      }
    }
  };

  const handleToggleEmail = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasEmail) return;
    const next = e.target.checked;
    setNotifyEmail(next);
    emailManuallyUnchecked.current = !next;
    if (next) {
      setMessagingConsent(true);
    } else {
      if (!notifySms && !notifyWhatsapp) {
        setMessagingConsent(false);
      }
    }
  };

  const handleToggleConsent = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setMessagingConsent(next);
    if (!next) {
      // Parent refused consent: turn off messaging channels
      setNotifySms(false);
      setNotifyWhatsapp(false);
      setNotifyEmail(false);
      smsManuallyUnchecked.current = true;
      whatsappManuallyUnchecked.current = true;
      emailManuallyUnchecked.current = true;
    } else {
      // Consent granted: enable all channels that have valid values
      if (hasMobile) {
        setNotifySms(true);
        smsManuallyUnchecked.current = false;
      }
      if (hasWhatsapp) {
        setNotifyWhatsapp(true);
        whatsappManuallyUnchecked.current = false;
      }
      if (hasEmail) {
        setNotifyEmail(true);
        emailManuallyUnchecked.current = false;
      }
      if (!hasMobile && !hasWhatsapp && !hasEmail) {
        mobileRef.current?.focus();
      }
    }
  };

  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold tracking-tight text-gray-950">Parent / guardian (receives fee messages)</h3>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <L label="Name *" name={n("name")}>
          <input
            id={n("name")}
            name={n("name")}
            defaultValue={g?.name}
            required
            minLength={2}
            maxLength={128}
            placeholder="Parent or guardian's full name"
            autoComplete="name"
            onKeyDown={handleNameKeyDown}
            onInput={handleNameInput}
          />
        </L>

        <L label="Relation" name={n("relation")}>
          <select id={n("relation")} name={n("relation")} defaultValue={g?.relation ?? "Father"}>
            {g?.relation && !["Father", "Mother", "Guardian"].includes(g.relation) && (
              <option value={g.relation}>{g.relation}</option>
            )}
            <option value="Father">Father</option>
            <option value="Mother">Mother</option>
            <option value="Guardian">Guardian</option>
          </select>
        </L>

        <L label="Mobile * (10 digits)" name={n("mobile")}>
          <input
            ref={mobileRef}
            id={n("mobile")}
            type="tel"
            name={n("mobile")}
            value={mobile}
            required
            inputMode="numeric"
            maxLength={10}
            minLength={10}
            pattern="[6-9][0-9]{9}"
            placeholder="10-digit mobile number"
            title="10-digit Indian mobile number starting with 6, 7, 8, or 9"
            autoComplete="tel"
            onKeyDown={handleMobileKeyDown}
            onInput={onMobileInput}
            onChange={onMobileInput}
          />
        </L>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={n("whatsappNo")}>
              WhatsApp no. <span className="font-semibold text-red-600">*</span>{" "}
              <span className="text-xs font-normal text-gray-500">(or Email)</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-ink cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sameAsMobile}
                onChange={handleSameAsMobileToggle}
                className="h-3.5 w-3.5 rounded border-gray-300 text-accent focus:ring-accent"
              />
              Same as Mobile No.
            </label>
          </div>
          <input
            ref={whatsappRef}
            id={n("whatsappNo")}
            type="tel"
            name={n("whatsappNo")}
            value={whatsapp}
            inputMode="numeric"
            maxLength={10}
            pattern="[6-9][0-9]{9}"
            placeholder="10-digit WhatsApp number"
            title="10-digit mobile number starting with 6, 7, 8, or 9 (or provide Email)"
            onKeyDown={handleMobileKeyDown}
            onInput={onWhatsAppInput}
            onChange={onWhatsAppInput}
          />
          <FieldError name={n("whatsappNo")} />
        </div>

        <L
          label={
            <span>
              Email <span className="font-semibold text-red-600">*</span>{" "}
              <span className="text-xs font-normal text-gray-500">(or WhatsApp)</span>
            </span>
          }
          name={n("email")}
        >
          <input
            ref={emailRef}
            id={n("email")}
            type="email"
            name={n("email")}
            value={email}
            maxLength={128}
            placeholder="parent@example.com"
            autoComplete="email"
            title="Valid email address (or provide WhatsApp number)"
            onKeyDown={handleEmailKeyDown}
            onInput={onEmailInput}
            onChange={onEmailInput}
          />
        </L>

        <L label="Language" name={n("preferredLanguage")}>
          <select id={n("preferredLanguage")} name={n("preferredLanguage")} defaultValue={g?.preferredLanguage ?? "en"}>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </L>

        <div className="sm:col-span-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3.5 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Fee Messages & Notifications
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <label
                  onClick={(e) => {
                    if (!hasMobile) {
                      e.preventDefault();
                      mobileRef.current?.focus();
                    }
                  }}
                  className={`inline-flex items-center gap-2 select-none transition-colors ${
                    hasMobile
                      ? "cursor-pointer text-gray-900 font-medium"
                      : "cursor-not-allowed text-gray-400 opacity-60"
                  }`}
                  title={hasMobile ? "Toggle SMS fee messages" : "Enter a 10-digit mobile number to enable SMS"}
                >
                  <input
                    type="checkbox"
                    name={n("notifySms")}
                    checked={hasMobile && notifySms}
                    disabled={!hasMobile}
                    onChange={handleToggleSms}
                    className={`h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent ${
                      hasMobile ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                    }`}
                  />
                  <span>
                    SMS
                    {!hasMobile && (
                      <span className="ml-1 text-xs font-normal text-gray-400">
                        {!mobile.trim() ? "(no mobile)" : "(needs 10 digits)"}
                      </span>
                    )}
                  </span>
                </label>

                <label
                  onClick={(e) => {
                    if (!hasWhatsapp) {
                      e.preventDefault();
                      whatsappRef.current?.focus();
                    }
                  }}
                  className={`inline-flex items-center gap-2 select-none transition-colors ${
                    hasWhatsapp
                      ? "cursor-pointer text-gray-900 font-medium"
                      : "cursor-not-allowed text-gray-400 opacity-60"
                  }`}
                  title={hasWhatsapp ? "Toggle WhatsApp fee messages" : "Enter a 10-digit WhatsApp number to enable WhatsApp"}
                >
                  <input
                    type="checkbox"
                    name={n("notifyWhatsapp")}
                    checked={hasWhatsapp && notifyWhatsapp}
                    disabled={!hasWhatsapp}
                    onChange={handleToggleWhatsapp}
                    className={`h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent ${
                      hasWhatsapp ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                    }`}
                  />
                  <span>
                    WhatsApp
                    {!hasWhatsapp && (
                      <span className="ml-1 text-xs font-normal text-gray-400">
                        {!whatsapp.trim() ? "(no WhatsApp)" : "(needs 10 digits)"}
                      </span>
                    )}
                  </span>
                </label>

                <label
                  onClick={(e) => {
                    if (!hasEmail) {
                      e.preventDefault();
                      emailRef.current?.focus();
                    }
                  }}
                  className={`inline-flex items-center gap-2 select-none transition-colors ${
                    hasEmail
                      ? "cursor-pointer text-gray-900 font-medium"
                      : "cursor-not-allowed text-gray-400 opacity-60"
                  }`}
                  title={hasEmail ? "Toggle Email fee notifications" : "Enter a valid email address to enable Email"}
                >
                  <input
                    type="checkbox"
                    name={n("notifyEmail")}
                    checked={hasEmail && notifyEmail}
                    disabled={!hasEmail}
                    onChange={handleToggleEmail}
                    className={`h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent ${
                      hasEmail ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                    }`}
                  />
                  <span>
                    Email
                    {!hasEmail && (
                      <span className="ml-1 text-xs font-normal text-gray-400">
                        {!email.trim() ? "(no email)" : "(valid email required)"}
                      </span>
                    )}
                  </span>
                </label>
              </div>
            </div>

            <div className="pt-2 sm:pt-0 sm:border-l sm:border-gray-200 sm:pl-5">
              <label
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer select-none"
                title="Confirmation that parent consented to receive fee messages on the admission form"
              >
                <input
                  type="checkbox"
                  name={n("messagingConsent")}
                  checked={messagingConsent}
                  onChange={handleToggleConsent}
                  className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent cursor-pointer"
                />
                <span>Parent consented to fee messages (admission form)</span>
              </label>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
