/** 缓动与插值函数（animation-engine-design.md §6） */
import type { Point } from '@/types/engine'

export type EasingFn = (t: number) => number

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)

export const easeOut: EasingFn = (t) => 1 - Math.pow(1 - t, 3)
export const easeIn: EasingFn = (t) => t * t * t
export const easeInOut: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
export const linear: EasingFn = (t) => t

/** step-end：在区间边界跳变，用于 transform_values 逐格翻转 */
export const stepEnd = (t: number, steps: number): number =>
  Math.min(steps, Math.floor(t * steps + 1e-9))

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

/** 解析 #rrggbb / #rgb / rgb() / rgba() 为 RGBA */
export function parseRGBA(color: string): RGBA {
  const c = color.trim()
  if (c.startsWith('#')) {
    let hex = c.slice(1)
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((ch) => ch + ch)
        .join('')
    }
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return { r, g, b, a: 1 }
  }
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
    return {
      r: parts[0] ?? 0,
      g: parts[1] ?? 0,
      b: parts[2] ?? 0,
      a: parts[3] ?? 1,
    }
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}

export function toRGBAStr(c: RGBA): string {
  return `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, ${c.a})`
}

export function lerpColor(a: string, b: string, t: number): string {
  const ca = parseRGBA(a)
  const cb = parseRGBA(b)
  return toRGBAStr({
    r: lerp(ca.r, cb.r, t),
    g: lerp(ca.g, cb.g, t),
    b: lerp(ca.b, cb.b, t),
    a: lerp(ca.a, cb.a, t),
  })
}

export function lerpPosition(start: Point, end: Point, t: number): Point {
  return { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) }
}

/** hex + alpha → rgba 字符串（用于派生方言高亮底色） */
export function hexWithAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseRGBA(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
