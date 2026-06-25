import { Search } from 'lucide-react'

interface Props {
  /** 点击 / 聚焦时调用，由父组件打开 SearchModal */
  onOpen: () => void
}

/** 全局搜索触发条（Navbar 使用）。
 *
 * 仅作入口：视觉上是个「准输入框」，但点击后实际打开 SearchModal 进行搜索。
 * 这样省去同步一份 query state 在 Navbar 与 Modal 之间。
 */
export default function SearchBox({ onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="打开搜索"
      className="group flex flex-1 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-left text-sm text-gray-400 transition-colors hover:border-gray-400 focus:border-[var(--dialect-color)] focus:outline-none focus:ring-1 focus:ring-[var(--dialect-color)] sm:max-w-sm"
    >
      <Search className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 truncate">搜索函数…</span>
      <kbd className="hidden flex-shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 sm:inline">
        Ctrl K
      </kbd>
    </button>
  )
}
