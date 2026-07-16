// سرور-فقط: کلید sms.ir از env می‌آید، هرگز در کلاینت import نشود.

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`متغیر محیطی ${name} ست نشده است`)
  return v
}

/** ارسال کد تایید از طریق Verify API سامانه sms.ir (الگوی پیش‌تعریف‌شده در پنل). */
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const apiKey = requireEnv('SMS_IR_API_KEY')
  const templateId = Number(requireEnv('SMS_IR_TEMPLATE_ID'))

  const res = await fetch('https://api.sms.ir/v1/send/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/plain',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      mobile: phone,
      templateId,
      parameters: [{ name: 'Code', value: code }],
    }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok || !body || body.status !== 1) {
    throw new Error(`ارسال پیامک ناموفق بود: ${body?.message || res.status}`)
  }
}
