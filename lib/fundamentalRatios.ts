// نسبت‌های مالی از روی گزارش‌های کدال (RQuarter[]) — بدون فراخوانی شبکه، فقط محاسبه
// همه مبالغ ورودی میلیون ریال (همان واحد stock_reports)، قیمت سهم به ریال (همان stock_industries.pl)
// ارزش اسمی هر سهم در بورس تهران ۱۰۰۰ ریال است؛ تعداد سهم = سرمایه(م.ریال) × ۱۰۰۰

import type { RQuarter } from './stockInsights'

export type FundamentalRatios = {
  period: string          // دوره سالانه مبنای محاسبه (months === 12)
  pe: number | null       // از قیمت لحظه‌ای، نه از stock_industries (برای اتساق با eps گزارش)
  pb: number | null
  roe: number | null      // سود خالص / حقوق صاحبان سهام (سالانه)
  roa: number | null      // سود خالص / جمع دارایی‌ها (سالانه)
  netMargin: number | null
  opMargin: number | null
  assetTurnover: number | null   // درآمد / جمع دارایی‌ها
  equityMultiplier: number | null // جمع دارایی‌ها / حقوق صاحبان سهام
  debtToEquity: number | null
  bookValuePerShare: number | null
  marketCap: number | null       // میلیون ریال
  enterpriseValue: number | null // EV = ارزش بازار + بدهی بهره‌دار (تسهیلات مالی جاری+بلندمدت) − موجودی نقد
  evToEbit: number | null        // EV/EBIT — نه EV/EBITDA: استهلاک جدا از صورت سود/زیان کدال قابل پارس مطمئن نیست
}

const div = (a: number | null | undefined, b: number | null | undefined): number | null => {
  if (a == null || b == null || b === 0) return null
  const r = a / b
  return isFinite(r) ? r : null
}

// آخرین گزارش سالانه (۱۲ ماهه) با سود خالص واقعی — همان انتخاب app/api/valuation-screener
function latestAnnual(quarters: RQuarter[]): RQuarter | null {
  const annual = quarters
    .filter(q => q.months === 12 && q.net != null)
    .sort((a, b) => a.period.localeCompare(b.period))
  return annual.length ? annual[annual.length - 1] : null
}

export function computeFundamentals(quarters: RQuarter[], price: number | null): FundamentalRatios | null {
  const q = latestAnnual(quarters)
  if (!q) return null

  const shares = q.capital != null ? q.capital * 1000 : null           // تعداد سهم (هزار سهم × ۱، واحد: سهم)
  const bookValuePerShare = shares && q.equity != null ? (q.equity * 1_000_000) / shares : null
  const pe = price != null && q.eps ? price / q.eps : null
  const pb = price != null && bookValuePerShare ? price / bookValuePerShare : null

  // ارزش بازار میلیون ریال = قیمت(ریال) × تعداد سهم / ۱۰۰۰۰۰۰ = قیمت × سرمایه / ۱۰۰۰
  const marketCap = price != null && q.capital != null ? (price * q.capital) / 1000 : null
  const netDebt = q.debt_lt != null && q.debt_st != null && q.cash != null
    ? q.debt_lt + q.debt_st - q.cash
    : null
  const enterpriseValue = marketCap != null && netDebt != null ? marketCap + netDebt : null

  return {
    period: q.period,
    pe,
    pb,
    roe: div(q.net, q.equity),
    roa: div(q.net, q.assets),
    netMargin: div(q.net, q.revenue),
    opMargin: div(q.op, q.revenue),
    assetTurnover: div(q.revenue, q.assets),
    equityMultiplier: div(q.assets, q.equity),
    debtToEquity: div(q.liabilities, q.equity),
    bookValuePerShare,
    marketCap,
    enterpriseValue,
    evToEbit: div(enterpriseValue, q.op),
  }
}
