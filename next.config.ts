import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @libsql/client's local-file mode pulls in a native binding via optional
  // platform packages, and pdf-parse ships a CJS build that resolves pdfjs
  // assets at runtime — neither survives bundling.
  serverExternalPackages: ["@libsql/client", "pdf-parse"],
};

export default nextConfig;
