"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(defaultQ ?? "");
  const [selectedClassId, setSelectedClassId] = useState(defaultClassId ?? "");

  const initialSection = defaultSection ?? (defaultSectionId ? sections.find((s) => String(s.id) === String(defaultSectionId))?.name : "") ?? "";
  const [selectedSection, setSelectedSection] = useState(initialSection);
  const [selectedStatus, setSelectedStatus] = useState(defaultStatus ?? "active");

  const isFirstRender = useRef(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const spQ = searchParams.get("q") ?? "";
    const isQInputActive = document.activeElement?.getAttribute("name") === "q" || document.activeElement?.getAttribute("placeholder")?.includes("Search");
    if (!isQInputActive) {
      setQ(spQ);
    }
    setSelectedClassId(searchParams.get("classId") ?? "");
    setSelectedSection(searchParams.get("section") ?? "");
    setSelectedStatus(searchParams.get("status") ?? "active");
  }, [searchParams]);

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

  const applyFilters = useCallback(
    (searchQ: string, classId: string, section: string, status: string) => {
      const params = new URLSearchParams();
      if (searchQ.trim()) params.set("q", searchQ.trim());
      if (classId) params.set("classId", classId);
      if (section) params.set("section", section);
      if (status && status !== "active") params.set("status", status);

      // Preserve view=drafts if currently present
      if (searchParams.get("view") === "drafts") params.set("view", "drafts");

      const qs = params.toString();
      const targetUrl = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => {
        router.replace(targetUrl, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  // Debounced auto-search for query text input (350ms for smooth non-blocking input)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      applyFilters(q, selectedClassId, selectedSection, selectedStatus);
    }, 350);
    return () => clearTimeout(timer);
  }, [q, selectedClassId, selectedSection, selectedStatus, applyFilters]);

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newClassId = e.target.value;
    if (newClassId === "__manage_class__") {
      e.target.value = selectedClassId;
      router.push("/settings?open=classes-sections#classes-sections");
      return;
    }
    setSelectedClassId(newClassId);

    // Keep the current section if it exists in the newly selected class; otherwise reset to All sections
    let nextSection = selectedSection;
    if (newClassId) {
      const classSecs = new Set(sections.filter((s) => String(s.classId) === String(newClassId)).map((s) => s.name.trim()));
      if (!classSecs.has(selectedSection)) {
        nextSection = "";
        setSelectedSection("");
      }
    }
    applyFilters(q, newClassId, nextSection, selectedStatus);
  };

  const handleSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSection = e.target.value;
    if (newSection === "__manage_section__") {
      e.target.value = selectedSection;
      router.push("/settings?open=classes-sections#classes-sections");
      return;
    }
    setSelectedSection(newSection);
    applyFilters(q, selectedClassId, newSection, selectedStatus);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setSelectedStatus(newStatus);
    applyFilters(q, selectedClassId, selectedSection, newStatus);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    applyFilters(q, selectedClassId, selectedSection, selectedStatus);
  };

  return (
    <form className="toolbar mb-6" onSubmit={handleSubmit} method="GET">
      <div className="relative w-full sm:w-72">
        <input
          type="text"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, admission no., guardian mobile"
          className="w-full pr-8 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden [&::-ms-clear]:hidden"
          autoComplete="off"
          autoFocus
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              applyFilters("", selectedClassId, selectedSection, selectedStatus);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer text-xs"
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

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

      <select
        name="section"
        value={selectedSection}
        onChange={handleSectionChange}
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

      <select
        name="status"
        value={selectedStatus}
        onChange={handleStatusChange}
        aria-label="Filter by status"
      >
        <option value="active">Active</option>
        <option value="left">Left</option>
        <option value="alumni">Alumni</option>
        <option value="">All</option>
      </select>
    </form>
  );
}
