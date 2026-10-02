import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { staticSecurityHeaders } from "./src/server/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone output is what the production Docker image runs (OPS-2).
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Each upload is its own request of at most 10 MB (CASE-2), plus room for the form's own bytes.
    // The proxy buffers request bodies too, and above its limit it would silently cut them short.
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
  },
  async headers() {
    return [
      { source: "/:path*", headers: staticSecurityHeaders({ production: process.env.APP_ENV === "production" }) },
    ];
  },
};

export default withNextIntl(nextConfig);
