import { useState } from 'react'

interface Props {
  /** 函数签名，多签名以 " | " 分隔，如 "COUNT(expr) | COUNT(DISTINCT expr)" */
  signature: string
}

/** 多签名切换（F-FD-02）：将 signature 按 " | " 拆为多个 tab，点击切换展示。
 * 仅一个签名时不渲染 tab。 */
export default function SignatureTabs({ signature }: Props) {
  const signatures = signature.split(/\s*\|\s*/).filter(Boolean)
  const [active, setActive] = useState(0)

  if (signatures.length <= 1) {
    return (
      <code className="block rounded-lg bg-gray-50 px-3 py-2 font-mono text-sm text-gray-800 dark:bg-gray-800/50 dark:text-gray-200">
        {signature}
      </code>
    )
  }

  const safeActive = Math.min(active, signatures.length - 1)

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {signatures.map((sig, i) => (
          <button
            key={sig}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === safeActive}
            className={`rounded-md px-2.5 py-1 font-mono text-xs transition-colors ${
              i === safeActive
                ? 'dialect-bg text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {sig}
          </button>
        ))}
      </div>
      <code className="mt-2 block rounded-lg bg-gray-50 px-3 py-2 font-mono text-sm text-gray-800 dark:bg-gray-800/50 dark:text-gray-200">
        {signatures[safeActive]}
      </code>
    </div>
  )
}
