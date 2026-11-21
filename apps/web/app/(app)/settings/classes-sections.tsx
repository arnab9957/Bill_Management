"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { buttonClass, cx } from "@/components/ui";
import type { ActionState } from "@/lib/action";
import { CollapsibleSection } from "./section-collapse";

const actionLink = "cursor-pointer text-xs font-semibold transition-colors";
const renameLink = cx(actionLink, "text-accent-ink hover:text-accent");
const createLink = cx(actionLink, "text-brand-700 hover:text-brand-800");
const deleteLink = cx(actionLink, "text-red-600 hover:text-red-700");

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
  const formRef = useRef<HTMLDivElement>(null);
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [targetClassId, setTargetClassId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const focusForm = () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  const reset = useCallback(() => {
    setEdit(null);
    setClassName("");
    setSection("");
    setTargetClassId(null);
    setSelected(new Set());
  }, []);

  const startRenameClass = (c: ClassItem) => {
    setEdit({ mode: "class", id: c.id });
    setTargetClassId(null);
    setClassName(c.name);
    setSection("");
    setSelected(new Set());
    focusForm();
  };
  const startRenameSection = (c: ClassItem, sec: SectionItem) => {
    setEdit({ mode: "section", id: sec.id });
    setTargetClassId(null);
    setClassName(c.name);
    setSection(sec.name);
    setSelected(new Set());
    focusForm();
  };
  const startCreateSection = (c: ClassItem) => {
    setEdit(null);
    setTargetClassId(c.id);
    setClassName(c.name);
    setSection("");
    setSelected(new Set(c.students.map((s) => s.id)));
    focusForm();
  };

  const classNameLocked = targetClassId != null || edit?.mode === "section";
  const targetClass = targetClassId != null
    ? classes.find((c) => c.id === targetClassId) ?? null
    : !edit ? classes.find((c) => c.name.toLowerCase() === className.trim().toLowerCase()) ?? null : null;
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
    <CollapsibleSection id="classes-sections" title="Classes & sections" subtitle="Create classes, rename sections and place students in them.">
      <div ref={formRef} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
        <div className="eyebrow mb-3">Add or edit</div>
        <ActionForm action={add} className="space-y-2" onSuccess={reset}>
          <input type="hidden" name="mode" value={targetClassId != null ? "createSection" : edit?.mode ?? "create"} />
          <input type="hidden" name="id" value={edit?.id ?? ""} />
          {targetClassId != null && <input type="hidden" name="classId" value={targetClassId} />}
          {classNameLocked && <input type="hidden" name="className" value={className} />}
          <div className="flex flex-wrap items-end gap-2">
            <label className="field-stack min-w-[200px] flex-1">Class name
              <input name="className" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. Class I" maxLength={32} required disabled={classNameLocked} className={classNameLocked ? "opacity-60" : undefined} />
            </label>
            <label className="field-stack w-40">Section
              <input name="section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. A" maxLength={16} disabled={edit?.mode === "class"} />
            </label>
            <Submit className="cursor-pointer">{targetClassId != null ? "Create section" : edit ? "Save changes" : "Create class"}</Submit>
            {(edit || targetClassId != null) && <button type="button" onClick={reset} className={cx(buttonClass("secondary"), "cursor-pointer")}>Cancel</button>}
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
      </div>
      <p className="hint">{edit
        ? `Editing ${edit.mode === "class" ? "class name" : "section name"} — change the value above and save.`
        : movingStudents && isFirstSection
          ? `Creating the first section in ${targetClass?.name}. All ${checklistStudents.length} students will move into it automatically.`
          : targetClassId != null
            ? `Creating a section in ${className}. Select the students to move, then save.`
            : "Enter a class name and optional section. If the class already exists, the section is added to it."}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {classes.map((c) => (
          <article key={c.id} className="overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-colors hover:border-gray-300">
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink">{c.name}</h3>
                  <p className="mt-1 text-xs text-gray-500">{c.students.length} students · {c.sections.length} {c.sections.length === 1 ? "section" : "sections"}</p>
                </div>
                <span className={cx("shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide", c.used ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-500")}>
                  {c.used ? "In use" : "Empty"}
                </span>
              </div>

              <div className="mt-4 space-y-1.5">
                {c.sections.length ? c.sections.map((sec) => (
                  <div key={sec.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">{sec.name}</span>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold tabular-nums text-gray-500 ring-1 ring-gray-200">{c.students.filter((s) => s.section === sec.name).length}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => startRenameSection(c, sec)} className={renameLink} aria-label={`Rename section ${sec.name}`}>Rename</button>
                      {!sec.used && <ActionForm action={removeSection} className="inline-flex">
                        <input type="hidden" name="id" value={sec.id} />
                        <TextSubmit confirm={`Remove section ${sec.name} from ${c.name}?`}>Delete</TextSubmit>
                      </ActionForm>}
                    </div>
                  </div>
                )) : <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-3 py-3 text-center text-xs text-gray-400">No sections yet — create the first one to place all students.</div>}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-3">
                <button type="button" onClick={() => startRenameClass(c)} className={renameLink}>Rename class</button>
                <button type="button" onClick={() => startCreateSection(c)} className={createLink}>Create section</button>
                {!c.used && <ActionForm action={removeClass} className="inline-flex">
                  <input type="hidden" name="id" value={c.id} />
                  <TextSubmit confirm={`Remove class ${c.name}? Its empty sections and fee structure will also be removed.`}>Delete class</TextSubmit>
                </ActionForm>}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="hint mt-3">Creating the first section of a class automatically moves all its students into it. Renaming keeps students assigned to the same class/section; lists and reports show the new name. Only classes and sections with no students can be deleted.</p>
    </CollapsibleSection>
  );
}
