// فراخوانی مدل تولید متن فارسی (JSON خروجی) — سه مسیر مشترک این تابع را صدا می‌زنند
// (signal-narrative, annual-audit-narrative, quarterly-deep-narrative).
// OpenRouter (کلید شارژ‌شده، سقف بالاتر از تیر رایگان Google) ترجیح دارد؛ اگر کلیدش
// تنظیم نشده بود، به کلید مستقیم Gemini fallback می‌شود — سرویس هرگز کامل قطع نمی‌شود.

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
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite'
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
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
