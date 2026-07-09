import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
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
        ],
      },
    ];
  },
};

export default nextConfig;
