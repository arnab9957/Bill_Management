import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "School Billing", description: "Offline-first school fee management" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
