"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { buttonClass, cx } from "@/components/ui";
import { PRESET_CLASSES, type PresetClass, compareClasses, isClassPresetMatch, findMatchingPreset } from "@/lib/classes";
import type { ActionState } from "@/lib/action";
import { CollapsibleSection, useSectionCollapse } from "./section-collapse";

function matchesClassPreset(p: PresetClass, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (p.name.toLowerCase().includes(q)) return true;
  if (p.keywords.some((k) => k === q || k.includes(q) || q.includes(k))) return true;
  return isClassPresetMatch(p, query);
}

function scoreClassPreset(p: PresetClass, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const nameLower = p.name.toLowerCase();
  if (nameLower === q) return 100;
  if (p.keywords.some((k) => k === q)) return 95;
  if (isClassPresetMatch(p, query)) return 90;
  if (nameLower.startsWith(q)) return 80;
  if (nameLower.includes(q)) return 60;
  if (p.keywords.some((k) => k.startsWith(q))) return 50;
  if (p.keywords.some((k) => k.includes(q))) return 30;
  if (p.keywords.some((k) => q.includes(k))) return 20;
  return 0;
}

const actionButtonBase = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition-all cursor-pointer shadow-2xs";
const renameLink = cx(actionButtonBase, "border border-gray-200 bg-white text-accent-ink hover:border-accent/40 hover:bg-accent-soft");
const createLink = cx(actionButtonBase, "border border-brand-200/80 bg-brand-50/80 text-brand-800 hover:bg-brand-100");
const deleteLink = cx(actionButtonBase, "border border-red-200/80 bg-red-50/70 text-red-700 hover:bg-red-100");

function TextSubmit({ children, confirm }: { children: ReactNode; confirm?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} className={deleteLink}>{pending ? "Working…" : children}</button>;
}

type StudentItem = { id: number; name: string; section: string | null };
type SectionItem = { id: number; name: string; used: boolean };
type ClassItem = { id: number; name: string; used: boolean; students: StudentItem[]; sections: SectionItem[] };
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type EditTarget = { mode: "class" | "section"; id: number };

export function ClassesSectionsManager({
  classes, add, removeClass, removeSection,
}: {
  classes: ClassItem[];
  add: Action;
  removeClass: Action;
  removeSection: Action;
}) {
  const { open } = useSectionCollapse("classes-sections");
  const [editing, setEditing] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [targetClassId, setTargetClassId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const comboboxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const focusForm = () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  const reset = useCallback(() => {
    setEdit(null);
    setClassName("");
    setSection("");
    setTargetClassId(null);
    setSelected(new Set());
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) {
      setEditing(false);
      reset();
    }
  }, [open, reset]);

  const startRenameClass = (c: ClassItem) => {
    setEditing(true);
    setEdit({ mode: "class", id: c.id });
    setTargetClassId(null);
    setClassName(c.name);
    setSection("");
    setSelected(new Set());
    setIsOpen(false);
    focusForm();
  };
  const startRenameSection = (c: ClassItem, sec: SectionItem) => {
    setEditing(true);
    setEdit({ mode: "section", id: sec.id });
    setTargetClassId(null);
    setClassName(c.name);
    setSection(sec.name);
    setSelected(new Set());
    setIsOpen(false);
    focusForm();
  };
  const startCreateSection = (c: ClassItem) => {
    setEditing(true);
    setEdit(null);
    setTargetClassId(c.id);
    setClassName(c.name);
    setSection("");
    setSelected(new Set(c.students.map((s) => s.id)));
    setIsOpen(false);
    focusForm();
  };

  const sortedClasses = useMemo(() => [...classes].sort(compareClasses), [classes]);
  const existingClassNames = useMemo(() => new Set(classes.map((c) => c.name.toLowerCase())), [classes]);

  const effectiveClassName = className.trim();

  // Filter and score presets
  const filteredPresets = useMemo(() => {
    const q = className.trim();
    if (!q) return PRESET_CLASSES;
    return PRESET_CLASSES
      .filter((p) => matchesClassPreset(p, q))
      .sort((a, b) => scoreClassPreset(b, q) - scoreClassPreset(a, q));
  }, [className]);

  const hasExactMatch = useMemo(() => {
    const q = className.trim();
    if (!q) return false;
    return Boolean(findMatchingPreset(q));
  }, [className]);

  const showCustomOption = Boolean(className.trim() && !hasExactMatch);
  const totalOptions = filteredPresets.length + (showCustomOption ? 1 : 0);

  const selectPreset = (name: string) => {
    setClassName(name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const selectCustom = (name: string) => {
    setClassName(name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (totalOptions > 0 ? (prev + 1) % totalOptions : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (totalOptions > 0 ? (prev - 1 + totalOptions) % totalOptions : -1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < filteredPresets.length) {
        e.preventDefault();
        selectPreset(filteredPresets[highlightedIndex]!.name);
      } else if (showCustomOption && highlightedIndex === filteredPresets.length) {
        e.preventDefault();
        selectCustom(className.trim());
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const classNameLocked = targetClassId != null || edit?.mode === "section";
  const isSectionDisabled = edit?.mode === "class";
  const isCreateClass = !edit && targetClassId == null;
  const isSectionRequired = !isSectionDisabled && !isCreateClass;
  const targetClass = targetClassId != null
    ? classes.find((c) => c.id === targetClassId) ?? null
    : !edit ? classes.find((c) => c.name.toLowerCase() === effectiveClassName.toLowerCase()) ?? null : null;
  const checklistStudents = targetClass?.students ?? [];
  const isFirstSection = targetClass?.sections.length === 0;
  const movingStudents = !edit && section.trim().length > 0 && checklistStudents.length > 0;
  const showChecklist = movingStudents && !isFirstSection;
  const submittedStudents = isFirstSection ? checklistStudents : checklistStudents.filter((s) => selected.has(s.id));
  const allSelected = checklistStudents.length > 0 && selected.size === checklistStudents.length;
  const targetKey = targetClass?.id ?? null;

  useEffect(() => {
    if (edit || targetKey == null) return;
    const c = classes.find((x) => x.id === targetKey);
    if (c) setSelected(new Set(c.students.map((s) => s.id)));
  }, [targetKey, edit, classes]);
  const groups = useMemo(() => {
    const map = new Map<string, StudentItem[]>();
    for (const s of checklistStudents) {
      const key = s.section ?? "No section";
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [checklistStudents]);

  const toggleStudent = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(checklistStudents.map((s) => s.id)));

  return (
    <CollapsibleSection
      id="classes-sections"
      title="Classes & Sections"
      subtitle="Create classes, rename sections and place students in them."
      overflowVisible={true}
      actions={
        open ? (
          !editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink shadow-2xs hover:bg-accent hover:text-white transition-all cursor-pointer"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L4.5 13.5l-3 1 1-3 9-9z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                reset();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer"
            >
              Done
            </button>
          )
        ) : undefined
      }
    >
      <div
        ref={formRef}
        className={cx(
          "rounded-xl border p-4 relative z-30 transition-all",
          edit || targetClassId != null
            ? "border-accent/60 bg-accent-soft/20 shadow-sm"
            : "border-gray-200/90 bg-subtle/70",
          !editing && "opacity-75"
        )}
      >
        <div className="eyebrow mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Add or edit</span>
            {edit?.mode === "class" ? (
              <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                Renaming class
              </span>
            ) : edit?.mode === "section" ? (
              <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                Renaming section
              </span>
            ) : targetClassId != null ? (
              <span className="rounded-full bg-brand-100 border border-brand-300 px-2 py-0.5 text-[10px] font-bold text-brand-800">
                Adding section to {targetClass?.name}
              </span>
            ) : editing ? (
              <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-semibold text-brand-800">
                Create new
              </span>
            ) : null}
          </div>
          {!editing && (
            <span className="inline-flex items-center gap-1 text-[11px] font-normal normal-case text-gray-500">
              🔒 Click &ldquo;Edit&rdquo; above to create or modify classes
            </span>
          )}
        </div>
        <fieldset disabled={!editing}>
        <ActionForm action={add} className="space-y-2" onSuccess={reset}>
          <input type="hidden" name="mode" value={targetClassId != null ? "createSection" : edit?.mode ?? "create"} />
          <input type="hidden" name="id" value={edit?.id ?? ""} />
          {targetClassId != null && <input type="hidden" name="classId" value={targetClassId} />}
          {classNameLocked && <input type="hidden" name="className" value={className} />}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2.5">
            {classNameLocked ? (
              <label className="field-stack w-full sm:min-w-[200px] sm:flex-1">
                <span>Class</span>
                <input value={className} disabled className="opacity-60 bg-gray-100 w-full" />
              </label>
            ) : (
              <div ref={comboboxRef} className="relative field-stack w-full sm:min-w-[220px] sm:flex-1">
                <span>
                  Class <span className="font-semibold text-red-600">*</span>
                  {edit?.mode === "class" && (
                    <span className="ml-1 text-[11px] font-normal text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.2">
                      Renaming
                    </span>
                  )}
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  name="className"
                  value={className}
                  onChange={(e) => {
                    const val = e.target.value;
                    setClassName(val);
                    setIsOpen(true);
                    setHighlightedIndex(-1);
                  }}
                  onFocus={() => setIsOpen(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search preset or type class name…"
                  autoComplete="off"
                  maxLength={32}
                  required
                  className="w-full text-sm"
                />

                {/* Auto-suggest dropdown menu */}
                {isOpen && (
                  <div
                    className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-2xl text-xs"
                  >
                    {/* Header hint */}
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                      <span>{className.trim() ? "Suggestions & Matching Classes" : "Standard Preset Classes"}</span>
                      <span className="text-[9px] text-gray-400 font-normal">Select or type custom</span>
                    </div>

                    {filteredPresets.length > 0 ? (
                      filteredPresets.map((p, index) => {
                        const isHighlighted = highlightedIndex === index;
                        const matchingClass = classes.find((c) => isClassPresetMatch(p, c.name));
                        const alreadyExists = Boolean(matchingClass);
                        const isCurrentClass = edit?.mode === "class" && matchingClass?.id === edit.id;
                        return (
                          <button
                            key={p.name}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectPreset(p.name);
                            }}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 border-b border-gray-50 last:border-b-0 transition ${
                              isHighlighted
                                ? "bg-accent/10 text-accent-ink font-semibold"
                                : "hover:bg-gray-50 text-gray-800"
                            }`}
                          >
                            <span className="font-medium text-xs">{p.name}</span>
                            {alreadyExists && !isCurrentClass && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-500">
                                In school
                              </span>
                            )}
                            {isCurrentClass && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 border border-amber-200">
                                Current
                              </span>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-2.5 text-center text-xs text-gray-500">
                        No matching preset class found.
                      </div>
                    )}

                    {/* Custom Class option when typing a unique name */}
                    {showCustomOption && (
                      <div className="border-t border-gray-100 p-1 bg-subtle/50">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectCustom(className.trim());
                          }}
                          className={`w-full text-left px-2.5 py-1.5 flex items-center gap-1.5 rounded-md text-xs font-semibold transition ${
                            highlightedIndex === filteredPresets.length
                              ? "bg-accent text-white"
                              : "text-accent-ink hover:bg-accent-soft"
                          }`}
                        >
                          <span>➕</span>
                          <span>
                            Use custom class: <strong>&ldquo;{className.trim()}&rdquo;</strong>
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <label className="field-stack w-full sm:w-44">
              <span>
                Section{" "}
                {isSectionDisabled ? null : isSectionRequired ? (
                  <span className="font-semibold text-red-600">*</span>
                ) : (
                  <span className="text-xs font-normal text-gray-500">(optional)</span>
                )}
              </span>
              <input
                name="section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder={isCreateClass ? "e.g. A (optional)" : "e.g. A"}
                maxLength={16}
                disabled={isSectionDisabled}
                required={isSectionRequired}
                className="w-full"
              />
            </label>

            <div className="flex items-center gap-2 pt-1 sm:pt-0 w-full sm:w-auto">
              <Submit className="flex-1 sm:flex-none cursor-pointer">
                {targetClassId != null ? "Create section" : edit ? "Save changes" : "Create class"}
              </Submit>
              {(edit || targetClassId != null || className) && (
                <button type="button" onClick={reset} className={cx(buttonClass("secondary"), "flex-1 sm:flex-none cursor-pointer")}>
                  Cancel
                </button>
              )}
            </div>
          </div>
          {movingStudents && submittedStudents.map((s) => <input key={s.id} type="hidden" name="studentIds" value={s.id} />)}
          {showChecklist && <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-700">Students to move into {section.trim()}</span>
                <label className="flex items-center gap-1.5 text-[11px] font-medium normal-case text-gray-600">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-ink" />
                  Select all ({checklistStudents.length})
                </label>
              </div>
              <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {groups.map(([label, list]) => (
                  <div key={label} className="rounded-md bg-subtle p-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
                    <div className="space-y-0.5">
                      {list.map((s) => (
                        <label key={s.id} className="flex items-center gap-1.5 text-xs font-normal normal-case text-gray-700">
                          <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleStudent(s.id)} className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-ink" />
                          <span className="truncate">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
          </div>}
          <FieldError name="className" />
          <FieldError name="section" />
        </ActionForm>
        </fieldset>
      </div>
      <p className="hint">{edit
        ? `Editing ${edit.mode === "class" ? "class name" : "section name"} — change the value above and save.`
        : movingStudents && isFirstSection
          ? `Creating the first section in ${targetClass?.name}. All ${checklistStudents.length} students will move into it automatically.`
          : targetClassId != null
            ? `Creating a section in ${className}. Select the students to move, then save.`
            : "Choose a preset or create a new class. Section is optional."}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sortedClasses.map((c) => {
          const isTargetClass = targetClassId === c.id;
          const isRenamingClass = edit?.mode === "class" && edit.id === c.id;
          const isEditingSection = edit?.mode === "section" && c.sections.some((s) => s.id === edit.id);
          const isHighlighted = isTargetClass || isRenamingClass || isEditingSection;

          return (
            <article
              key={c.id}
              className={cx(
                "overflow-hidden rounded-xl border bg-surface transition-all",
                isHighlighted
                  ? "border-accent ring-2 ring-accent/30 shadow-md bg-accent-soft/10"
                  : "border-gray-200/90 shadow-2xs hover:border-accent/40"
              )}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-sm font-bold tracking-tight text-ink">{c.name}</h3>
                      {isRenamingClass && (
                        <span className="rounded bg-amber-100 border border-amber-300 px-1.5 py-0.2 text-[9px] font-bold text-amber-800 animate-pulse">
                          Editing
                        </span>
                      )}
                      {isTargetClass && (
                        <span className="rounded bg-brand-100 border border-brand-300 px-1.5 py-0.2 text-[9px] font-bold text-brand-800 animate-pulse">
                          Adding Section
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 font-medium">
                      {c.students.length} {c.students.length === 1 ? "student" : "students"} · {c.sections.length} {c.sections.length === 1 ? "section" : "sections"}
                    </p>
                  </div>
                  <span
                    className={cx(
                      "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border",
                      c.used
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200/80"
                        : "bg-gray-100 text-gray-500 border-gray-200"
                    )}
                  >
                    {c.used && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />}
                    {c.used ? "In use" : "Empty"}
                  </span>
                </div>

                <div className="mt-4 space-y-1.5">
                  {c.sections.length ? c.sections.map((sec) => {
                    const count = c.students.filter((s) => s.section === sec.name).length;
                    const isCurrentSecEdit = edit?.mode === "section" && edit.id === sec.id;

                    return (
                      <div
                        key={sec.id}
                        className={cx(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                          isCurrentSecEdit
                            ? "border-amber-300 bg-amber-50/70 ring-1 ring-amber-200"
                            : "border-gray-200/70 bg-white"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{sec.name}</span>
                        <span
                          className={cx(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums border",
                            count > 0
                              ? "bg-accent-soft text-accent-ink border-accent/25 font-bold"
                              : "bg-gray-100 text-gray-400 border-gray-200"
                          )}
                          title={`${count} students in ${c.name} ${sec.name}`}
                        >
                          {count}
                        </span>
                        {editing && (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button type="button" onClick={() => startRenameSection(c, sec)} className={renameLink} aria-label={`Rename section ${sec.name}`}>Rename</button>
                            {!sec.used && (
                              <ActionForm action={removeSection} className="inline-flex">
                                <input type="hidden" name="id" value={sec.id} />
                                <TextSubmit confirm={`Remove section ${sec.name} from ${c.name}?`}>Delete</TextSubmit>
                              </ActionForm>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-3 py-3 text-center text-xs text-gray-400">
                      No sections yet — create the first one to place all students.
                    </div>
                  )}
                </div>

                {editing && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                    <button type="button" onClick={() => startRenameClass(c)} className={renameLink}>Rename</button>
                    <button type="button" onClick={() => startCreateSection(c)} className={createLink}>+ Section</button>
                    {!c.used && (
                      <ActionForm action={removeClass} className="inline-flex">
                        <input type="hidden" name="id" value={c.id} />
                        <TextSubmit confirm={`Remove class ${c.name}? Its empty sections and fee structure will also be removed.`}>Delete</TextSubmit>
                      </ActionForm>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="hint mt-3">Creating the first section of a class automatically moves all its students into it. Renaming keeps students assigned to the same class/section; lists and reports show the new name. Only classes and sections with no students can be deleted.</p>
    </CollapsibleSection>
  );
}
