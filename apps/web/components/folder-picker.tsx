"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { listFolders, makeFolder, type FolderList } from "@/lib/folders";

/** Text input with a "Browse…" button that opens a folder browser of the server's disk. */
export function FolderPicker({ name, defaultValue, placeholder }: { name: string; defaultValue?: string; placeholder?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<FolderList | null>(null);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const go = (dir: string) => start(async () => { setMsg(""); setList(await listFolders(dir)); });
  const browse = () => { setOpen(true); go(value); };
  const create = () => start(async () => {
    if (!list?.path) return;
    const r = await makeFolder(list.path, newName);
    if (r.error) { setMsg(r.error); return; }
    setNewName(""); setList(await listFolders(r.path!));
  });

  return (
    <>
      <span className="flex gap-2">
        <input name={name} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="flex-1" />
        <Button type="button" variant="secondary" onClick={browse}>Browse…</Button>
      </span>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <Button type="button" variant="secondary" disabled={list?.parent == null || pending} onClick={() => go(list!.parent!)}>↑ Up</Button>
              <span className="truncate font-mono text-sm" title={list?.path}>{list?.path || "This computer"}</span>
            </div>
            <div className="min-h-48 flex-1 overflow-y-auto rounded border">
              {pending && !list ? <p className="p-3 text-sm text-gray-500">Loading…</p> :
                list?.error ? <p className="p-3 text-sm text-red-700">{list.error}</p> :
                list?.folders.length === 0 ? <p className="p-3 text-sm text-gray-500">No folders inside.</p> :
                list?.folders.map((f) => (
                  <button key={f} type="button" onClick={() => go(f)} className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-indigo-50">
                    📁 {list.path ? f.slice(list.path.replace(/[\/]$/, "").length + 1) : f}
                  </button>
                ))}
            </div>
            {list?.path && (
              <div className="mt-2 flex gap-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New folder name" className="flex-1" />
                <Button type="button" variant="secondary" disabled={!newName.trim() || pending} onClick={create}>Create</Button>
              </div>
            )}
            {msg && <p className="mt-1 text-sm text-red-700">{msg}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" disabled={!list?.path} onClick={() => { setValue(list!.path); setOpen(false); }}>Use this folder</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
