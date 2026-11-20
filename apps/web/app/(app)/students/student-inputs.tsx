"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

  const getSectionName = (secId: number | "") =>
    secId ? m.sections.find((section) => section.id === secId)?.name : null;

  // Class and Section selection
  const defaultClass = cls ?? (isNew && m.classes[0] ? m.classes[0].id : "");
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

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newClassId = e.target.value ? Number(e.target.value) : "";
    setSelectedClassId(newClassId);

    const newSections = newClassId
      ? m.sections.filter((sec) => sec.classId === newClassId)
      : [];
    const newSectionId = newSections[0] ? newSections[0].id : "";
    setSelectedSectionId(newSectionId);

    if (isNew || !rollCustomized) {
      const autoRoll = computeNextRoll(
        rollsByClassSection,
        newClassId,
        newSectionId,
        s?.rollNo,
        rollFormat,
        getSectionName(newSectionId),
      );
      setRollVal(autoRoll);
      setRollError("");
      rollRef.current?.setCustomValidity("");
    } else {
      validateRoll(rollVal, newClassId, newSectionId);
    }
  };

  const handleSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSectionId = e.target.value ? Number(e.target.value) : "";
    setSelectedSectionId(newSectionId);

    if (isNew || !rollCustomized) {
      const autoRoll = computeNextRoll(
        rollsByClassSection,
        selectedClassId,
        newSectionId,
        s?.rollNo,
        rollFormat,
        getSectionName(newSectionId),
      );
      setRollVal(autoRoll);
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

        <L label="Admission no. *" name="admissionNo">
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
          <label htmlFor="classId">
            Class <span className="font-semibold text-red-600">*</span>
          </label>
          <select
            id="classId"
            name="classId"
            value={selectedClassId}
            onChange={handleClassChange}
            required
          >
            <option value="">Select class</option>
            {m.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <FieldError name="classId" />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="sectionId">Section</label>
          <select
            id="sectionId"
            name="sectionId"
            value={selectedSectionId}
            onChange={handleSectionChange}
            disabled={!selectedClassId || availableSections.length === 0}
          >
            <option value="">{availableSections.length === 0 ? "No sections" : "Select section"}</option>
            {availableSections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name}
              </option>
            ))}
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
  const whatsappRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [whatsapp, setWhatsapp] = useState(g?.whatsappNo ?? "");
  const [email, setEmail] = useState(g?.email ?? "");

  useEffect(() => {
    const hasEither = Boolean(whatsapp.trim() || email.trim());
    const errorMsg = hasEither ? "" : "Please provide either a WhatsApp number or an Email address.";
    whatsappRef.current?.setCustomValidity(errorMsg);
    emailRef.current?.setCustomValidity(errorMsg);
  }, [whatsapp, email]);

  const onWhatsAppInput = (e: React.FormEvent<HTMLInputElement>) => {
    handleMobileInput(e);
    setWhatsapp(e.currentTarget.value);
  };

  const onEmailInput = (e: React.FormEvent<HTMLInputElement>) => {
    handleEmailInput(e);
    setEmail(e.currentTarget.value);
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
            id={n("mobile")}
            type="tel"
            name={n("mobile")}
            defaultValue={g?.mobile}
            required
            inputMode="numeric"
            maxLength={10}
            minLength={10}
            pattern="[6-9][0-9]{9}"
            placeholder="10-digit mobile number"
            title="10-digit Indian mobile number starting with 6, 7, 8, or 9"
            autoComplete="tel"
            onKeyDown={handleMobileKeyDown}
            onInput={handleMobileInput}
          />
        </L>

        <L
          label={
            <span>
              WhatsApp no. <span className="font-semibold text-red-600">*</span>{" "}
              <span className="text-xs font-normal text-gray-500">(or Email)</span>
            </span>
          }
          name={n("whatsappNo")}
        >
          <input
            ref={whatsappRef}
            id={n("whatsappNo")}
            type="tel"
            name={n("whatsappNo")}
            defaultValue={g?.whatsappNo ?? ""}
            inputMode="numeric"
            maxLength={10}
            pattern="[6-9][0-9]{9}"
            placeholder="10-digit WhatsApp number"
            title="10-digit mobile number starting with 6, 7, 8, or 9 (or provide Email)"
            onKeyDown={handleMobileKeyDown}
            onInput={onWhatsAppInput}
            onChange={onWhatsAppInput}
          />
        </L>

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
            defaultValue={g?.email ?? ""}
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

        <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" name={n("notifySms")} defaultChecked={g?.notifySms ?? true} />
            SMS
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name={n("notifyWhatsapp")} defaultChecked={g?.notifyWhatsapp ?? true} />
            WhatsApp
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name={n("notifyEmail")} defaultChecked={g?.notifyEmail ?? true} />
            Email
          </label>
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name={n("messagingConsent")} defaultChecked={g?.messagingConsent ?? false} />
            Parent consented to fee messages (admission form)
          </label>
        </div>
      </fieldset>
    </div>
  );
}
