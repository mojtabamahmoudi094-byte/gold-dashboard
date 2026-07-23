import { defineConfig, devices } from '@playwright/test'

// سفرهای دودی E2E — پیش‌فرض روی سایت لایو (فقط‌خواندنی، بدون لاگین).
// BASE_URL=http://localhost:3000 برای اجرا روی dev لوکال.
// عمداً در CI merge-gate نیست (وابسته به شبکه/سرور ایران) — اجرا: npm run test:e2e
export default defineConfig({
  testDir: 'tests-e2e',
  timeout: 45_000,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://bourssanj.ir',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
})
