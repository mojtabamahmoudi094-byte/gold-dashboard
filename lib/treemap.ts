// الگوریتم squarified treemap (Bruls et al.) — چیدمان مستطیل‌ها با نسبت ابعاد نزدیک به مربع
export type Rect = { x: number; y: number; w: number; h: number }

function worstRatio(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0)
  const max = Math.max(...row)
  const min = Math.min(...row)
  if (sum === 0 || min === 0) return Infinity
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
}

export function squarify(sizes: number[], x: number, y: number, w: number, h: number): Rect[] {
  const total = sizes.reduce((a, b) => a + b, 0)
  if (total <= 0 || sizes.length === 0 || w <= 0 || h <= 0) return []
  const scale = (w * h) / total
  const areas = sizes.map(s => Math.max(s * scale, 0.0001))

  const result: Rect[] = []
  let rx = x, ry = y, rw = w, rh = h
  let i = 0

  while (i < areas.length) {
    const side = Math.min(rw, rh)
    let row = [areas[i]]
    let rowSum = areas[i]
    let worst = worstRatio(row, side)
    let j = i + 1
    while (j < areas.length) {
      const testRow = [...row, areas[j]]
      const testWorst = worstRatio(testRow, side)
      if (testWorst <= worst) {
        row = testRow
        rowSum += areas[j]
        worst = testWorst
        j++
      } else break
    }

    const rowLength = side > 0 ? rowSum / side : 0
    let offset = 0
    const vertical = rw >= rh // ردیف به‌صورت ستون در سمت چپ چیده می‌شود
    for (const a of row) {
      const thickness = rowLength > 0 ? a / rowLength : 0
      if (vertical) result.push({ x: rx, y: ry + offset, w: rowLength, h: thickness })
      else result.push({ x: rx + offset, y: ry, w: thickness, h: rowLength })
      offset += thickness
    }

    if (vertical) { rx += rowLength; rw -= rowLength }
    else { ry += rowLength; rh -= rowLength }
    i += row.length
  }

  return result
}
