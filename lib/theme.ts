export const darkTheme = {
  bg:          '#080a10',
  surface:     '#0d1017',
  panel:       'rgba(13,16,23,0.9)',
  panelSolid:  '#0d1017',
  border:      'rgba(255,255,255,0.07)',
  borderStrong:'rgba(255,255,255,0.12)',
  borderData:  'rgba(59,130,246,0.15)',
  text:        '#eef1f8',
  textBright:  '#FFFFFF',
  muted:       '#a9b0c2',
  faint:       '#3a4258',
  brand:       '#3b82f6',
  brand2:      '#8b5cf6',
  accent:      '#3b82f6',
  green:       'oklch(0.74 0.17 155)',
  red:         'oklch(0.68 0.2 25)',
  inputBg:     '#0d1017',
  headerBg:    'rgba(8,10,16,0.97)',
  cardShadow:  '0 4px 24px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04)',
}

export const lightTheme = {
  bg:          '#F8F5EE',
  surface:     '#FFFCF4',
  panel:       'rgba(255,252,244,0.95)',
  panelSolid:  '#FFFCF4',
  border:      'rgba(59,130,246,0.14)',
  borderStrong:'rgba(59,130,246,0.3)',
  borderData:  'rgba(59,130,246,0.14)',
  text:        '#1A1205',
  textBright:  '#0A0805',
  muted:       '#6B5A3A',
  faint:       '#A09070',
  brand:       '#2563eb',
  brand2:      '#7c3aed',
  accent:      '#2563eb',
  green:       '#059669',
  red:         '#DC2626',
  inputBg:     '#FFFCF4',
  headerBg:    'rgba(248,245,238,0.97)',
  cardShadow:  '0 2px 16px rgba(0,0,0,0.08), 0 1px 0 rgba(59,130,246,0.08)',
}

export type Theme = typeof darkTheme

// اگر کاربر قبلاً دستی حالت رو انتخاب نکرده، ترجیح سیستم‌عامل رو معیار قرار بده
export const shouldUseDark = (): boolean => {
  const saved = window.localStorage.getItem('theme')
  if (saved === 'light') return false
  if (saved === 'dark') return true
  return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
}
