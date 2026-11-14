import type { NextConfig } from "next";
import { resolve } from "node:path";

const config: NextConfig = {
  // Standalone bundles need symlink rights on Windows (pnpm); default to `next start` instead.
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  transpilePackages: ["@sb/core", "@sb/db", "@sb/validation"],
  serverExternalPackages: ["@node-rs/argon2", "pg", "exceljs"],
  poweredByHeader: false,
  // Never let the browser or a proxy cache financial pages.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Frame-Options", value: "SAMEORIGIN" }] }];
  },
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};
export default config;
