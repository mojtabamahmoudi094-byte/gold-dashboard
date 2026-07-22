import { defineConfig } from 'vitest/config'

// فاز ۱ تست: فقط توابع خالص lib/ و scripts/ — بدون Supabase، بدون jsdom، بدون شبکه
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
