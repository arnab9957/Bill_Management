import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Fee Billing", description: "Offline fee billing for schools and colleges" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. ones adding data-qb-installed) edit
    // <html>/<body> before React loads. This only ignores attribute differences on these two tags.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
