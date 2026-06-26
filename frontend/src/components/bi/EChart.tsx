import { forwardRef, useImperativeHandle, useRef, type CSSProperties } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface Props {
  option: EChartsOption
  /** ECharts 事件回调，如 { click: (params) => ... }（F-VZ-03 点击下钻）。 */
  onEvents?: Record<string, (params: any) => void>
  loading?: boolean
  style?: CSSProperties
}

/** 暴露给外部的命令式句柄（F-EX-01 导出 PNG）。 */
export interface EChartHandle {
  /** 当前图表的 PNG dataURL；实例未就绪时返回 undefined。 */
  getPngDataURL: () => string | undefined
}

/** echarts-for-react 薄封装（PRD §4.3）。
 *  notMerge=false 保留 setOption 的补间过渡动画（F-VZ-03 下钻平滑，难点 5）。
 *  forwardRef 暴露 getPngDataURL，供 ExportToolbar 导出图片（F-EX-01）。 */
const EChart = forwardRef<EChartHandle, Props>(function EChart(
  { option, onEvents, loading, style },
  ref,
) {
  const chartRef = useRef<ReactECharts>(null)

  useImperativeHandle(ref, () => ({
    getPngDataURL: () =>
      chartRef.current
        ?.getEchartsInstance()
        .getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' }),
  }))

  return (
    <ReactECharts
      ref={chartRef}
      option={option}
      notMerge={false}
      lazyUpdate
      showLoading={loading}
      onEvents={onEvents}
      style={{ height: 380, width: '100%', ...style }}
    />
  )
})

export default EChart
