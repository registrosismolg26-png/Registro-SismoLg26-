import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,

  experimental: {
    // Tree-shake unused exports from large packages on the client bundle
    optimizePackageImports: ["react", "react-dom"],
  },

  async headers() {
    return [
      {
        // Immutable long-cache for versioned Next.js static chunks (JS, CSS)
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Short cache for HTML documents — always re-validate
        source: "/:path*.html",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
      {
        // Static public assets (icons, manifest, sw.js)
        source: "/:file(.*\\.(?:png|ico|svg|webp|json|txt))",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        // sw.js must never be cached by HTTP — browser handles SW lifecycle
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
