import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const securityHeaders = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      {
        // fully-static pages default to a 1-year CDN cache; cap it so a bad
        // edge/deploy cache entry can't linger for a year — force periodic
        // revalidation against origin instead. Hashed /_next/static assets
        // and the API are excluded so their own (long/short) caching stands.
        source: "/((?!_next/static|_next/image|api/).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
          },
          ...securityHeaders,
        ],
      },
      {
        source: "/api/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
