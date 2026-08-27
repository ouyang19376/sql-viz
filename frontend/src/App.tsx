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
// 数据探查（PRD-dataprofile）：4 Tab 单页，lazy 懒加载
const DataProfilePage = lazy(() => import('@/pages/dataprofile'))
// RAG for NL2SQL（PRD-rag-sql）：3 Tab 单页，lazy 懒加载（含 CodeEditor）
const RagSqlPage = lazy(() => import('@/pages/rag-sql'))
// 知识库问答（kbqa）：多会话聊天单页，lazy 懒加载（含 react-markdown）
const KbqaPage = lazy(() => import('@/pages/kbqa'))

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
      {
        path: 'dataprofile',
        element: (
          <Suspense fallback={<Skeleton lines={6} />}>
            <DataProfilePage />
          </Suspense>
        ),
      },
      {
        path: 'rag-sql',
        element: (
          <Suspense fallback={<Skeleton lines={6} />}>
            <RagSqlPage />
          </Suspense>
        ),
      },
      {
        path: 'kbqa',
        element: (
          <Suspense fallback={<Skeleton lines={6} />}>
            <KbqaPage />
          </Suspense>
        ),
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
