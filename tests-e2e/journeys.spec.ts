import { test, expect, type Page } from '@playwright/test'

// سفرهای دودی فقط‌خواندنی — بدون لاگین، بدون نوشتن. هر سفر: صفحه باز شود،
// محتوای کلیدی رندر شود، برند درست باشد. روی لایو یا BASE_URL لوکال.

// گارد برند روی متن رندرشده — «بورسنج» هرگز نباید در خروجی نهایی باشد
async function expectBrandClean(page: Page) {
  const body = await page.locator('body').innerText()
  expect(body).not.toContain('بورسنج')
  expect(body).not.toContain('دیدبان')
}

test('صفحه اصلی: هیرو + لینک‌های اصلی', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('هوشمندانه بسنجید')
  await expect(page.locator('a[href="https://t.me/bourssanjj"]').first()).toBeAttached()
  await expectBrandClean(page)
})

test('هاب صندوق‌ها بدون لاگین: دروازه عضویت رندر می‌شود', async ({ page }) => {
  // /funds هم پشت AuthGate است — بدون لاگین کارت عضویت با دکمه‌های ورود/ثبت‌نام
  await page.goto('/funds')
  await expect(page.getByRole('heading', { name: 'دیده‌بان صندوق‌ها' })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('a[href="/auth?tab=register"]').first()).toBeAttached()
  await expectBrandClean(page)
})

test('دسته طلا بدون لاگین: دروازه عضویت (نه صفحه خالی/خطا)', async ({ page }) => {
  // /funds/[cat] پشت AuthGate است — بدون لاگین باید کارت عضویت بیاید
  await page.goto('/funds/gold')
  await expect(page.getByRole('heading', { name: 'دیده‌بان صندوق‌ها' })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('body')).toContainText('ثبت‌نام')
  await expectBrandClean(page)
})

test('صفحه صندوق تابش: حباب + بنر کانال تلگرام', async ({ page }) => {
  // صفحهٔ خود صندوق عمومی است (فقط بخش انتهایی گیت دارد)
  await page.goto('/fund/IRTKTABA0001')
  await expect(page.locator('body')).toContainText('حباب', { timeout: 25_000 })
  // بنر جدید کانال تلگرام (رشد ۰۷-۲۳) — top-level است، نه پشت fetch
  await expect(page.locator('[data-cta="telegram-channel"]')).toBeAttached({ timeout: 15_000 })
  await expectBrandClean(page)
})

test('صفحه سهم شبندر: هدر قیمت رندر می‌شود', async ({ page }) => {
  // شبندر: نماد بزرگ و حاضر در snapshot صنایع. (فولاد عمداً نه — متوقف و کلاً غایب از پایپلاین، یافتهٔ ۰۷-۲۳)
  await page.goto(`/stock/${encodeURIComponent('شبندر')}`)
  await expect(page.locator('body')).toContainText('قیمت پایانی', { timeout: 30_000 })
  await expectBrandClean(page)
})

test('رکورد عملکرد سیگنال‌ها: شفافیت عمومی بدون لاگین', async ({ page }) => {
  await page.goto('/track-record')
  await expect(page.getByRole('heading', { name: 'رکورد عملکرد سیگنال‌ها' })).toBeVisible()
  await expectBrandClean(page)
})

test('آتی: صفحه قراردادها بالا می‌آید', async ({ page }) => {
  await page.goto('/futures')
  await expect(page.getByRole('heading', { name: 'قراردادهای آتی' })).toBeVisible({ timeout: 20_000 })
  await expectBrandClean(page)
})

test('صفحه VIP بدون لاگین: گیت نرم با لیست امکانات (نه صفحه خالی)', async ({ page }) => {
  await page.goto('/vip/hot-money')
  await expect(page.locator('body')).toContainText('پول داغ', { timeout: 20_000 })
  await expect(page.locator('body')).toContainText('ثبت‌نام رایگان')
  // اسکلت پیش‌نمایش بلورشده پشت کارت
  await expect(page.locator('body')).toContainText('عضویت رایگان است')
  await expectBrandClean(page)
})

test('تکنیکال بدون لاگین: دروازه عضویت رندر می‌شود', async ({ page }) => {
  await page.goto('/technical')
  await expect(page.locator('body')).toContainText(/تحلیل تکنیکال|ثبت‌نام/, { timeout: 20_000 })
  await expectBrandClean(page)
})
