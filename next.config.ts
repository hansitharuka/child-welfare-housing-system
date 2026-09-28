import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone output is what the production Docker image runs (OPS-2).
  output: "standalone",
};

export default withNextIntl(nextConfig);
