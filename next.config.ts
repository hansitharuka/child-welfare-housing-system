import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { staticSecurityHeaders } from "./src/server/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone output is what the production Docker image runs (OPS-2).
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: staticSecurityHeaders({ production: process.env.APP_ENV === "production" }) },
    ];
  },
};

export default withNextIntl(nextConfig);
