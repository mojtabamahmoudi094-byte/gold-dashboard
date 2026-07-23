import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// گارد برند (چک‌لیست AGENTS.md):
// - نام سایت «بورس سنج» است، نه «بورسنج»
// - «دیده‌بان» با نیم‌فاصله، نه «دیدبان»
// خط‌هایی که خودشان قاعده را یادآوری می‌کنند (شامل هر دو املا) مجازند.

const ROOT = join(__dirname, '..')
const DIRS = ['app', 'components', 'lib', 'scripts']
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (EXTS.has(p.slice(p.lastIndexOf('.')))) yield p
  }
}

function violations(bad: string, good: string): string[] {
  const out: string[] = []
  for (const dir of DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (line.includes(bad) && !line.includes(good)) {
          out.push(`${file.slice(ROOT.length + 1)}:${i + 1}: ${line.trim().slice(0, 80)}`)
        }
      })
    }
  }
  return out
}

describe('گارد برند', () => {
  it('«بورسنج» ممنوع — همیشه «بورس سنج»', () => {
    expect(violations('بورسنج', 'بورس سنج')).toEqual([])
  })
  it('«دیدبان» ممنوع — همیشه «دیده‌بان» با نیم‌فاصله', () => {
    expect(violations('دیدبان', 'دیده‌بان')).toEqual([])
  })
})
