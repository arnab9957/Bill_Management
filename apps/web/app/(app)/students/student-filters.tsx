"use client";

import { useMemo, useState } from "react";

interface ClassItem {
  id: number;
  name: string;
}

interface SectionItem {
  id: number;
  classId: number;
  name: string;
}

export function StudentFilters({
  classes,
  sections,
  defaultQ,
  defaultClassId,
  defaultSection,
  defaultSectionId,
  defaultStatus,
}: {
  classes: ClassItem[];
  sections: SectionItem[];
  defaultQ?: string;
  defaultClassId?: string;
  defaultSection?: string;
  defaultSectionId?: string;
  defaultStatus?: string;
}) {
  const [selectedClassId, setSelectedClassId] = useState(defaultClassId ?? "");

  const initialSection = defaultSection ?? (defaultSectionId ? sections.find((s) => String(s.id) === String(defaultSectionId))?.name : "") ?? "";
  const [selectedSection, setSelectedSection] = useState(initialSection);

  // If a class is selected, show section names for that class.
  // If "All classes" is selected, show all distinct section names across all classes.
  const availableSectionNames = useMemo(() => {
    const pool = selectedClassId
      ? sections.filter((s) => String(s.classId) === String(selectedClassId))
      : sections;

    const names = Array.from(new Set(pool.map((s) => s.name.trim()).filter(Boolean)));
    names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    return names;
  }, [sections, selectedClassId]);

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newClassId = e.target.value;
    setSelectedClassId(newClassId);

    // Keep the current section if it exists in the newly selected class; otherwise reset to All sections
    if (newClassId) {
      const classSecs = new Set(sections.filter((s) => String(s.classId) === String(newClassId)).map((s) => s.name.trim()));
      if (!classSecs.has(selectedSection)) {
        setSelectedSection("");
      }
    }
  };

  return (
    <form className="toolbar mb-6" method="GET">
      <input
        name="q"
        defaultValue={defaultQ}
        placeholder="Name, admission no., guardian mobile"
        className="w-full sm:w-72"
        autoFocus
      />
      <select
        name="classId"
        value={selectedClassId}
        onChange={handleClassChange}
        aria-label="Filter by class"
      >
        <option value="">All classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        name="section"
        value={selectedSection}
        onChange={(e) => setSelectedSection(e.target.value)}
        aria-label="Filter by section"
      >
        <option value="">All sections</option>
        {availableSectionNames.map((name) => {
          const label = name.toLowerCase().startsWith("section") ? name : `Section ${name}`;
          return (
            <option key={name} value={name}>
              {label}
            </option>
          );
        })}
      </select>

      <select name="status" defaultValue={defaultStatus ?? "active"} aria-label="Filter by status">
        <option value="active">Active</option>
        <option value="left">Left</option>
        <option value="alumni">Alumni</option>
        <option value="">All</option>
      </select>
      <button className="filter-button" type="submit">Search</button>
    </form>
  );
}
