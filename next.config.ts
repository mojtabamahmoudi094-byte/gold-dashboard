import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // خروجی standalone برای میزبانی روی VPS — بیلد روی مک/CI انجام می‌شود و فقط
  // .next/standalone (بدون node_modules کامل) به سرور rsync می‌شود
  output: "standalone",
  // PostHog روی endpointهایی با اسلش انتهایی حساب می‌کند — ریدایرکت trailing-slash نکست خرابش می‌کند
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      // پروکسی معکوس PostHog — مسیر خنثی «masir» تا ad blockerها نشناسند
      {
        source: "/masir/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/masir/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/masir/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  async redirects() {
    return [
      // /team از قبل در گوگل ایندکس شده ولی صفحه‌ای نساخته بودیم — به‌جای 404 به contact هدایتش کن
      { source: "/team", destination: "/contact", permanent: true },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://us.i.posthog.com https://us-assets.i.posthog.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "connect-src 'self' https://www.google-analytics.com https://us.i.posthog.com https://us-assets.i.posthog.com https://jtrusonoqkolckhidgch.supabase.co wss://jtrusonoqkolckhidgch.supabase.co",
          "font-src 'self' data:",
          "frame-ancestors 'self'",
        ].join("; "),
      },
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
