import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import Layout from '@/components/global/Layout'
import Skeleton from '@/components/shared/Skeleton'
import HomePage from '@/pages/HomePage'
import SqlIndexPage from '@/pages/SqlIndexPage'
import DialectPage from '@/pages/DialectPage'
import FunctionDetailPage from '@/pages/FunctionDetailPage'

// xlsx 库 ~400KB（gzip ~100KB），路由级懒加载，首屏不拖累（plan §6.4）
const DataTestPage = lazy(() => import('@/pages/DataTestPage'))
const LineagePage = lazy(() => import('@/pages/LineagePage'))
// ECharts 体积大，/bi 路由级懒加载（plan §1.2）
const BiReportPage = lazy(() => import('@/pages/BiReportPage'))

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'sql', element: <SqlIndexPage /> },
      // PRD-final §3 routes: SQL 方言页与函数详情页保持无 /sql 前缀。
      { path: 'dialect/:dialectId', element: <DialectPage /> },
      { path: 'dialect/:dialectId/function/:functionId', element: <FunctionDetailPage /> },
      // 兼容已拆分多工具入口后的 /sql/* 历史路径。
      { path: 'sql/dialect/:dialectId', element: <DialectPage /> },
      { path: 'sql/dialect/:dialectId/function/:functionId', element: <FunctionDetailPage /> },
      {
        path: 'datatest',
        element: (
          <Suspense fallback={<Skeleton lines={6} />}>
            <DataTestPage />
          </Suspense>
        ),
      },
      {
        path: 'lineage',
        element: (
          <Suspense fallback={<Skeleton lines={6} />}>
            <LineagePage />
          </Suspense>
        ),
      },
      {
        path: 'bi',
        element: (
          <Suspense fallback={<Skeleton lines={6} />}>
            <BiReportPage />
          </Suspense>
        ),
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
