import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon and pdf-parse ships a CJS build that
  // resolves pdfjs assets at runtime — neither survives bundling.
  serverExternalPackages: ["better-sqlite3", "pdf-parse"],
};

export default nextConfig;
