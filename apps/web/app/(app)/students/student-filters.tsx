"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

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
  singleMatchId,
  exactMatchId,
}: {
  classes: ClassItem[];
  sections: SectionItem[];
  defaultQ?: string;
  defaultClassId?: string;
  defaultSection?: string;
  defaultSectionId?: string;
  defaultStatus?: string;
  /** the only student found by the current search (Enter opens it) */
  singleMatchId?: number;
  /** the only student found AND the search is exactly their admission no. (opened at once) */
  exactMatchId?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search as you type / pick: no Search button needed.
  const search = (delay = 0) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const fd = new FormData(formRef.current!);
      const qs = new URLSearchParams([...fd.entries()].filter(([, v]) => v !== "") as [string, string][]).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, delay);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Typed an exact admission number: open that student straight away.
  // replace (not push) so the browser's Back button doesn't land on this search and re-open the student.
  useEffect(() => { if (exactMatchId) router.replace(`${pathname}/${exactMatchId}`); }, [exactMatchId, pathname, router]);

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
    search(0);

    // Keep the current section if it exists in the newly selected class; otherwise reset to All sections
    if (newClassId) {
      const classSecs = new Set(sections.filter((s) => String(s.classId) === String(newClassId)).map((s) => s.name.trim()));
      if (!classSecs.has(selectedSection)) {
        setSelectedSection("");
      }
    }
  };

  return (
    <form ref={formRef} className="toolbar mb-6" method="GET" onSubmit={(e) => {
      e.preventDefault();
      // Enter: open the student if only one matches, otherwise just search now.
      if (singleMatchId) router.push(`${pathname}/${singleMatchId}`);
      else search();
    }}>
      <input
        name="q"
        defaultValue={defaultQ}
        placeholder="Name, admission no., guardian mobile"
        className="w-full sm:w-72"
        autoFocus
        autoComplete="off"
        onChange={() => search(350)}
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
        onChange={(e) => { setSelectedSection(e.target.value); search(0); }}
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

      <select name="status" defaultValue={defaultStatus ?? "active"} aria-label="Filter by status" onChange={() => search(0)}>
        <option value="active">Active</option>
        <option value="left">Left</option>
        <option value="alumni">Alumni</option>
        <option value="">All</option>
      </select>
    </form>
  );
}
