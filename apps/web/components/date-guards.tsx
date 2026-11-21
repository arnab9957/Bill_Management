"use client";
/**
 * Checks every date box in the app as the user types, and blocks the form with a clear message.
 * Rules come from attributes on the <input type="date">:
 *   data-after="startDate"   must be on/after the date in that field of the same form (end ≥ start)
 *   data-months="12"         with data-after: at most this many months after it (sessions, years)
 *   data-past                today or earlier (leaving date, day book)
 *   data-dob                 a date of birth: in the past, at most 30 years ago
 *   data-ahead="365"         at most this many days in the future (admission date)
 * Every date must be a real date between 2000 and 2099. The server checks the same rules again.
 */
import { useEffect } from "react";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const addDays = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y!, m! - 1, d! + n)); };
const addMonthsMinusDay = (s: string, months: number) => { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y!, m! - 1 + months, d! - 1)); };
const show = (s: string) => s.split("-").reverse().join("-");

function partner(el: HTMLInputElement): HTMLInputElement | null {
  const name = el.dataset.after;
  if (!name || !el.form) return null;
  const p = el.form.elements.namedItem(name);
  return p instanceof HTMLInputElement ? p : null;
}

/** Work out the allowed range for one box, set min/max (so the date picker greys out wrong days) and the message. */
function check(el: HTMLInputElement) {
  let min = "2000-01-01", max = "2099-12-31";
  let minMsg = "Date must be in 2000 or later", maxMsg = "Date must be in 2099 or earlier";
  const t = today();
  if (el.dataset.dob !== undefined) {
    min = `${Number(t.slice(0, 4)) - 30}${t.slice(4)}`; minMsg = "Date of birth is more than 30 years ago. Check the year";
    max = addDays(t, -1); maxMsg = "Date of birth must be in the past";
  }
  if (el.dataset.past !== undefined && t < max) { max = t; maxMsg = "This date can't be in the future"; }
  if (el.dataset.ahead) { const a = addDays(t, Number(el.dataset.ahead)); if (a < max) { max = a; maxMsg = `This date can't be more than ${el.dataset.ahead} days ahead`; } }
  const p = partner(el);
  if (p?.value) {
    const label = p.getAttribute("aria-label") || p.dataset.label || "the start date";
    if (p.value > min) { min = p.value; minMsg = `Must be on or after ${show(p.value)} (${label})`; }
    if (el.dataset.months) {
      const lim = addMonthsMinusDay(p.value, Number(el.dataset.months));
      if (lim < max) { max = lim; maxMsg = `At most ${el.dataset.months} months: must end by ${show(lim)}`; }
    }
  }
  el.min = min; el.max = max;
  let msg = "";
  if (el.value) {
    if (el.validity.badInput) msg = "Not a real date";
    else if (el.value < min) msg = minMsg;
    else if (el.value > max) msg = maxMsg;
  }
  el.setCustomValidity(msg);
  el.title = msg || el.dataset.title || "";
  el.toggleAttribute("aria-invalid", !!msg);
}

function checkAll(root: ParentNode) {
  root.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach(check);
}

export function DateGuards() {
  useEffect(() => {
    const onChange = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== "date") return;
      check(el);
      // the end date depends on the start date: re-check the boxes that point at this one
      if (el.form) el.form.querySelectorAll<HTMLInputElement>(`input[type="date"][data-after="${el.name}"]`).forEach(check);
      if (e.type === "change" && el.validationMessage) el.reportValidity();
    };
    const onSubmit = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      checkAll(form);
      if (!form.checkValidity()) {
        e.preventDefault();
        e.stopImmediatePropagation(); // don't let the action run
        form.reportValidity();
      }
    };
    document.addEventListener("input", onChange, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    // Check boxes already on the page (e.g. a saved wrong date shows red at once) and ones added later.
    checkAll(document);
    const mo = new MutationObserver((list) => { for (const m of list) m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) checkAll(n.parentNode ?? n); }); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("input", onChange, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("submit", onSubmit, true);
      mo.disconnect();
    };
  }, []);
  return null;
}
