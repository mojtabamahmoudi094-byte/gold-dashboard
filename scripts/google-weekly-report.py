#!/usr/bin/env python3
"""گزارش هفتگی گوگل (GA4 + Search Console) → تلگرام شخصی ادمین.

هر هفته مقایسه ۷ روز اخیر با ۷ روز قبلش رو می‌فرسته.
اجرا روی سرور آلمان (168.222.43.75) — تلگرام مستقیم باز است.

env لازم:
  GOOGLE_APPLICATION_CREDENTIALS  مسیر JSON سرویس‌اکانت
  GA4_PROPERTY_ID                 عدد property (مثل 545527005)
  GSC_PROPERTY                    مثل sc-domain:bourssanj.ir
  TELEGRAM_BOT_TOKEN              توکن بات
  TELEGRAM_CHAT_ID                چت مقصد
"""
import os
import sys
import json
import urllib.request
from datetime import date, timedelta

from google.oauth2 import service_account
from googleapiclient.discovery import build
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange, Dimension, Metric, RunReportRequest,
)

GA4_PROPERTY = os.environ["GA4_PROPERTY_ID"]
GSC_PROPERTY = os.environ["GSC_PROPERTY"]
BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]
SA_PATH = os.environ["GOOGLE_APPLICATION_CREDENTIALS"]

PERSIAN_DIGITS = str.maketrans("0123456789.", "۰۱۲۳۴۵۶۷۸۹٫")


def fa(n):
    if isinstance(n, float):
        n = round(n, 1)
        if n == int(n):
            n = int(n)
    return str(n).translate(PERSIAN_DIGITS)


def delta_badge(cur, prev):
    if prev == 0:
        return "🆕" if cur > 0 else "—"
    change = (cur - prev) / prev * 100
    arrow = "🔺" if change > 0 else ("🔻" if change < 0 else "◾️")
    return f"{arrow}{fa(abs(round(change)))}٪"


def ga4_organic(client, start, end):
    req = RunReportRequest(
        property=f"properties/{GA4_PROPERTY}",
        date_ranges=[DateRange(start_date=str(start), end_date=str(end))],
        dimensions=[Dimension(name="sessionDefaultChannelGroup")],
        metrics=[Metric(name="sessions"), Metric(name="totalUsers"),
                 Metric(name="screenPageViews")],
    )
    resp = client.run_report(req)
    out = {"sessions": 0, "users": 0, "pageviews": 0}
    for row in resp.rows:
        if "organic" in row.dimension_values[0].value.lower():
            out["sessions"] += int(row.metric_values[0].value)
            out["users"] += int(row.metric_values[1].value)
            out["pageviews"] += int(row.metric_values[2].value)
    return out


def ga4_top_pages(client, start, end, limit=5):
    req = RunReportRequest(
        property=f"properties/{GA4_PROPERTY}",
        date_ranges=[DateRange(start_date=str(start), end_date=str(end))],
        dimensions=[Dimension(name="landingPage"),
                    Dimension(name="sessionDefaultChannelGroup")],
        metrics=[Metric(name="sessions")],
        limit=200,
    )
    resp = client.run_report(req)
    pages = {}
    for row in resp.rows:
        if "organic" not in row.dimension_values[1].value.lower():
            continue
        page = row.dimension_values[0].value or "(خالی)"
        pages[page] = pages.get(page, 0) + int(row.metric_values[0].value)
    return sorted(pages.items(), key=lambda x: -x[1])[:limit]


def gsc_report(creds, start, end):
    svc = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    body = {"startDate": str(start), "endDate": str(end), "rowLimit": 1}
    totals_resp = svc.searchanalytics().query(siteUrl=GSC_PROPERTY, body=body).execute()
    body_q = {"startDate": str(start), "endDate": str(end),
              "dimensions": ["query"], "rowLimit": 100}
    q_resp = svc.searchanalytics().query(siteUrl=GSC_PROPERTY, body=body_q).execute()
    rows = q_resp.get("rows", [])
    totals = {"clicks": sum(r["clicks"] for r in rows),
              "impressions": sum(r["impressions"] for r in rows)}
    # جمع کل بدون dimension دقیق‌تره اگر موجود باشه
    t_rows = totals_resp.get("rows", [])
    if t_rows:
        pass  # rowLimit=1 با dimension خالی جمع کل نمی‌دهد؛ از جمع کوئری‌ها استفاده می‌کنیم
    top_clicked = sorted([r for r in rows if r["clicks"] > 0],
                         key=lambda r: -r["clicks"])[:5]
    # فرصت: ایمپرشن بالا، کلیک صفر، جایگاه ≤ ۱۵
    opportunities = sorted(
        [r for r in rows if r["clicks"] == 0 and r["position"] <= 15],
        key=lambda r: -r["impressions"])[:5]
    return totals, top_clicked, opportunities


def send_telegram(text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = json.dumps({"chat_id": CHAT_ID, "text": text,
                       "parse_mode": "HTML",
                       "disable_web_page_preview": True}).encode()
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.load(r)
    if not resp.get("ok"):
        raise RuntimeError(f"Telegram error: {resp}")


def main():
    creds = service_account.Credentials.from_service_account_file(
        SA_PATH, scopes=[
            "https://www.googleapis.com/auth/analytics.readonly",
            "https://www.googleapis.com/auth/webmasters.readonly",
        ])
    ga_client = BetaAnalyticsDataClient(credentials=creds)

    # GSC داده‌اش ~۲ روز تأخیر دارد؛ پنجره را ۲ روز عقب می‌بریم
    end = date.today() - timedelta(days=2)
    start = end - timedelta(days=6)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=6)

    cur = ga4_organic(ga_client, start, end)
    prev = ga4_organic(ga_client, prev_start, prev_end)
    top_pages = ga4_top_pages(ga_client, start, end)

    gsc_totals, top_clicked, opps = gsc_report(creds, start, end)
    gsc_prev_totals, _, _ = gsc_report(creds, prev_start, prev_end)

    lines = []
    lines.append("📊 <b>گزارش هفتگی گوگل — بورس سنج</b>")
    lines.append(f"🗓 {fa(start.strftime('%m/%d'))} تا {fa(end.strftime('%m/%d'))} "
                 f"(مقایسه با هفته قبل)")
    lines.append("")
    lines.append("<b>🟢 ترافیک ارگانیک (GA4)</b>")
    lines.append(f"• سشن: {fa(cur['sessions'])} {delta_badge(cur['sessions'], prev['sessions'])}")
    lines.append(f"• کاربر: {fa(cur['users'])} {delta_badge(cur['users'], prev['users'])}")
    lines.append(f"• بازدید صفحه: {fa(cur['pageviews'])} {delta_badge(cur['pageviews'], prev['pageviews'])}")
    lines.append("")
    lines.append("<b>🔵 سرچ کنسول</b>")
    lines.append(f"• کلیک: {fa(gsc_totals['clicks'])} {delta_badge(gsc_totals['clicks'], gsc_prev_totals['clicks'])}")
    lines.append(f"• ایمپرشن: {fa(gsc_totals['impressions'])} {delta_badge(gsc_totals['impressions'], gsc_prev_totals['impressions'])}")
    if top_pages:
        lines.append("")
        lines.append("<b>📄 صفحات فرود برتر</b>")
        for page, sessions in top_pages:
            lines.append(f"• <code>{page}</code> — {fa(sessions)} سشن")
    if top_clicked:
        lines.append("")
        lines.append("<b>🔑 کوئری‌های کلیک‌خورده</b>")
        for r in top_clicked:
            lines.append(f"• {r['keys'][0]} — {fa(r['clicks'])} کلیک "
                         f"(جایگاه {fa(round(r['position'], 1))})")
    if opps:
        lines.append("")
        lines.append("<b>🎯 فرصت‌ها (صفحه اول، بدون کلیک)</b>")
        for r in opps:
            lines.append(f"• {r['keys'][0]} — {fa(r['impressions'])} ایمپرشن، "
                         f"جایگاه {fa(round(r['position'], 1))}")
    lines.append("")
    lines.append("🤖 گزارش خودکار هفتگی")

    text = "\n".join(lines)
    if "--dry-run" in sys.argv:
        print(text)
        return
    send_telegram(text)
    print("گزارش ارسال شد ✅")


if __name__ == "__main__":
    main()
