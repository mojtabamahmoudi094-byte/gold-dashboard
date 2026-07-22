// فراخوانی مدل تولید متن فارسی (JSON خروجی) — سه مسیر مشترک این تابع را صدا می‌زنند
// (signal-narrative, annual-audit-narrative, quarterly-deep-narrative).
// کلید مستقیم Gemini (رایگان، بدون billing) ترجیح دارد؛ فقط وقتی شکست بخورد (از جمله
// سقف روزانه‌ی رایگان تمام شود) به OpenRouter (پولی، شارژ‌شده) fallback می‌شود.

import { GEMINI_BASE, OPENROUTER_BASE } from './upstreams'

type JsonSchema = Record<string, unknown>

export type LlmResult = { ok: true; text: string } | { ok: false; error: string }

export async function callOpenRouter(
  apiKey: string,
  system: string,
  user: string,
  schema: JsonSchema,
  schemaName: string,
  maxTokens: number,
): Promise<LlmResult> {
  try {
    // ۲۵.۷.۲۰۲۶: gemini-2.5-flash-lite رو بک‌اند گوگل با خطای «no longer available to new
    // users» رد می‌شه (باگ/قطعی زودهنگام گوگل، قبل تاریخ رسمی deprecate اکتبر) — تا اطلاع
    // ثانوی نسل بعدی (پایدار، پشتیبانی تا می ۲۰۲۷) پیش‌فرض است.
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-3.1-flash-lite'
    const res = await fetch(`${OPENROUTER_BASE}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: maxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: { name: schemaName, strict: true, schema },
        },
      }),
      signal: AbortSignal.timeout(45_000),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` }
    const raw: string | undefined = data?.choices?.[0]?.message?.content
    if (!raw) return { ok: false, error: 'پاسخ خالی از OpenRouter' }
    return { ok: true, text: raw }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}

// Gemini مستقیم — responseSchema به فرمت Google (نه JSON Schema استاندارد: type ها UPPERCASE)
export async function callGemini(
  apiKey: string,
  system: string,
  user: string,
  responseSchema: JsonSchema,
  maxTokens: number,
): Promise<LlmResult> {
  try {
    // fallback مسیر مستقیم Gemini: 2.5-flash-lite رو بک‌اند گوگل الان خطای «no longer
    // available» می‌ده (۲۵.۷.۲۰۲۶) — 2.5-flash کامل هنوز جواب می‌ده، فقط quota محدودتره
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    const url = `${GEMINI_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: user }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
      signal: AbortSignal.timeout(45_000),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` }
    const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) return { ok: false, error: 'پاسخ خالی از Gemini' }
    return { ok: true, text: raw }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}

// اول Gemini رایگان را امتحان می‌کند؛ اگر شکست بخورد (شامل تمام‌شدن سقف روزانهٔ رایگان،
// معمولاً HTTP 429 / پیام حاوی quota یا RESOURCE_EXHAUSTED) و کلید OpenRouter موجود باشد،
// به آن پولی fallback می‌کند. اگر کلید Gemini اصلاً تنظیم نشده بود، مستقیم سراغ OpenRouter می‌رود.
export async function callNarrate(
  geminiKey: string | undefined,
  openrouterKey: string | undefined,
  system: string,
  user: string,
  geminiSchema: JsonSchema,
  openrouterSchema: JsonSchema,
  schemaName: string,
  maxTokens: number,
): Promise<LlmResult> {
  if (geminiKey) {
    const viaGemini = await callGemini(geminiKey, system, user, geminiSchema, maxTokens)
    if (viaGemini.ok) return viaGemini
    if (!openrouterKey) return viaGemini
    console.error(`[llmNarrate] Gemini شکست خورد (${viaGemini.error}) — fallback به OpenRouter پولی`)
    return callOpenRouter(openrouterKey, system, user, openrouterSchema, schemaName, maxTokens)
  }
  if (openrouterKey) return callOpenRouter(openrouterKey, system, user, openrouterSchema, schemaName, maxTokens)
  return { ok: false, error: 'GEMINI_API_KEY/OPENROUTER_API_KEY تنظیم نشده' }
}
