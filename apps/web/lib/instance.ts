const raw = (process.env.SB_INSTANCE ?? "default").trim().toLowerCase();
const code = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) ? raw : "default";
const suffix = code === "default" ? "" : `_${code.replace(/-/g, "_")}`;

export const INSTANCE_CODE = code;
export const SESSION_COOKIE = `sb_session${suffix}`;
export const YEAR_COOKIE = `sb_year${suffix}`;
