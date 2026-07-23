import { defineConfig } from 'vitest/config'

// فاز ۱: توابع خالص lib/ و scripts/. فاز ۲: route handlerهای API با mock
// (بدون شبکه/Docker) — env ساختگی تا lib/env در import تست‌ها throw نکند.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_KEY: 'test-service-key',
    },
  },
})
