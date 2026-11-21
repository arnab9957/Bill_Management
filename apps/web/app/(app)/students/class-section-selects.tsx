"use client";

import { useEffect, useState } from "react";
import { FieldError } from "@/components/action-form";

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

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
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

  return (
    <>
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
          {classes.map((c) => (
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
          onChange={(e) => setSelectedSectionId(e.target.value)}
          disabled={!selectedClassId}
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
        </select>
        <FieldError name="sectionId" />
      </div>
    </>
  );
}
