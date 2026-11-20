import { ActionForm, Submit } from "@/components/action-form";
import { Card } from "@/components/ui";
import type { ActionState } from "@/lib/action";

/** Settings card: upload, replace or remove the school's logo (printed small on receipts and bills). */
export function LogoCard({ hasLogo, version, upload, remove }: {
  hasLogo: boolean;
  /** changes whenever the logo changes, so the browser shows the new picture */
  version: string;
  upload: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  remove: (fd: FormData) => Promise<void>;
}) {
  return (
    <Card title="School logo (optional)">
      <div className="flex flex-wrap items-center gap-4">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/branding/logo?v=${encodeURIComponent(version)}`} alt="School logo"
            className="h-16 max-w-48 rounded-lg border border-gray-200 bg-surface object-contain p-1" />
        ) : (
          <div className="text-sm text-gray-500">No logo yet. Receipts and bills print without one.</div>
        )}
        <ActionForm action={upload} className="flex flex-wrap items-center gap-2">
          <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" required />
          <Submit variant="secondary">{hasLogo ? "Replace logo" : "Upload logo"}</Submit>
        </ActionForm>
        {hasLogo && (
          <form action={remove}>
            <button className="text-sm text-red-600 hover:underline">Remove logo</button>
          </form>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">PNG, JPG or WebP, up to 1 MB. A wide, short picture works best; it is printed about 11 mm high.</p>
    </Card>
  );
}
