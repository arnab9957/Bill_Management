"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FieldError } from "@/components/action-form";
import { extractAdmissionFormData, getAdmissionFormElement, saveAdmissionDraft } from "@/lib/admission-drafts";

interface ClassItem {
  id: number;
  name: string;
}

interface SectionItem {
  id: number;
  classId: number;
  name: string;
}

export function ClassSectionSelects({
  classes,
  sections,
  defaultClassId,
  defaultSectionId,
}: {
  classes: ClassItem[];
  sections: SectionItem[];
  defaultClassId?: number | string | null;
  defaultSectionId?: number | string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedClassId, setSelectedClassId] = useState<string>(
    defaultClassId != null ? String(defaultClassId) : ""
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    defaultSectionId != null ? String(defaultSectionId) : ""
  );

  useEffect(() => {
    setSelectedClassId(defaultClassId != null ? String(defaultClassId) : "");
  }, [defaultClassId]);

  useEffect(() => {
    setSelectedSectionId(defaultSectionId != null ? String(defaultSectionId) : "");
  }, [defaultSectionId]);

  const availableSections = selectedClassId
    ? sections.filter((s) => String(s.classId) === String(selectedClassId))
    : [];

  const draftAndRedirect = (formEl: HTMLFormElement | null) => {
    const form = formEl ?? getAdmissionFormElement();
    if (form) {
      const data = extractAdmissionFormData(form);
      delete data.admissionNo;
      delete data.rollNo;
      const clsObj = classes.find((c) => String(c.id) === String(data.classId));
      const secObj = sections.find((s) => String(s.id) === String(data.sectionId));
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

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "__manage_class__") {
      e.target.value = selectedClassId;
      draftAndRedirect(e.target.closest("form"));
      return;
    }
    const newClassId = e.target.value;
    setSelectedClassId(newClassId);

    // If changing class, verify if previously selected section exists in the new class
    if (newClassId) {
      const match = sections.find(
        (s) => String(s.classId) === String(newClassId) && String(s.id) === String(selectedSectionId)
      );
      if (!match) {
        setSelectedSectionId("");
      }
    } else {
      setSelectedSectionId("");
    }
  };

  const handleSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "__manage_section__") {
      e.target.value = selectedSectionId;
      draftAndRedirect(e.target.closest("form"));
      return;
    }
    setSelectedSectionId(e.target.value);
  };

  const handleManageClassesClick = (e: React.MouseEvent) => {
    e.preventDefault();
    draftAndRedirect((e.currentTarget as HTMLElement).closest("form"));
  };

  const handleManageSectionsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    draftAndRedirect((e.currentTarget as HTMLElement).closest("form"));
  };

  return (
    <>
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
          {classes.map((c) => (
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
          title={selectedClassId ? "Select section" : "Select a class first"}
        >
          <option value="">
            {!selectedClassId
              ? "Select class first"
              : availableSections.length === 0
                ? "No sections defined"
                : "None"}
          </option>
          {availableSections.map((x) => {
            const label = x.name.toLowerCase().startsWith("section") ? x.name : `Section ${x.name}`;
            return (
              <option key={x.id} value={x.id}>
                {label}
              </option>
            );
          })}
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
    </>
  );
}
