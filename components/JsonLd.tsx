// چاپ امن JSON-LD در سرور — escape توالی "</script>" تا از شکستن تگ توسط مقادیر رشته‌ای (مثلاً نام نماد) جلوگیری شود
export default function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
