import type { ReactNode } from 'react'

interface Props {
  /** 标题：可内嵌 <Highlight> 标记荧光关键词 */
  children: ReactNode
}

/** 荧光笔标记（标志元素）：琥珀软底 + 小圆角 + 墨色文字。
 *  用于标题关键词，像真实荧光笔划过。仅在「强调/当前」语义上使用，勿当装饰。 */
export default function Highlight({ children }: Props) {
  return <mark className="highlight">{children}</mark>
}
