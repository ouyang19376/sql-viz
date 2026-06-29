import type { ColorPalette } from '@/types/bi'
import { COLOR_PALETTES } from '@/types/bi'

interface Props {
  value: ColorPalette
  onChange: (palette: ColorPalette) => void
}

/** F-MD 颜色配置：图表配色方案四选一，色块条预览，写入 useBiStore.model.palette。 */
export default function ColorPaletteSelector({ value, onChange }: Props) {
  const keys = Object.keys(COLOR_PALETTES) as ColorPalette[]
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">图表配色</h3>
      <div className="grid grid-cols-2 gap-2">
        {keys.map((key) => {
          const { label, gradient, colors } = COLOR_PALETTES[key]
          const active = key === value
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(key)}
              className={
                'inline-flex flex-col items-start gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ' +
                (active
                  ? 'border-indigo-400 bg-indigo-50/60 text-indigo-700 dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-300'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/50')
              }
            >
              <span>{label}</span>
              {/* 渐变色带：地图 visualMap 用（低→高阶梯） */}
              <span
                className="h-3 w-full rounded"
                style={{ background: `linear-gradient(to right, ${gradient.join(', ')})` }}
              />
              {/* 离散色块：其他图表系列分色用 */}
              <span className="flex h-3 w-full overflow-hidden rounded">
                {colors.slice(0, 6).map((c) => (
                  <span key={c} className="flex-1" style={{ backgroundColor: c }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
