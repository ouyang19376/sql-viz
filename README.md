# SQL Viz — SQL 可视化学习 · 测试数据生成 · 血缘分析平台

> 一个面向 SQL 学习者与数据开发者的多功能工具平台：用 Canvas 动画「看见」SQL 函数的执行过程，用 LLM 一键生成测试数据集，并对 SQL/HQL 脚本做表级血缘分析。

前后端分离架构：**React 19 + Vite 7 + TypeScript**（前端）/ **FastAPI + Python**（后端）。

---

## ✨ 功能模块

| 模块 | 说明 |
|------|------|
| **SQL 函数可视化学习** | 覆盖 MySQL / PostgreSQL / Hive / Impala / SparkSQL / FlinkSQL / Cypher 7 种方言；按分类浏览函数，查看签名/参数/示例，并通过 Canvas 动画逐步骤演示 `WHERE` / `JOIN` / `GROUP BY` 等数据变换；支持 SQL 代码与动画联动高亮、全局搜索、收藏与最近查看。 |
| **测试数据集工具** | 用自然语言描述或自定义字段两种模式，调用 LLM 生成结构化测试数据，支持 xlsx / json / csv 一键导出；可上传 xlsx/csv 解析表头快速建表。 |
| **SQL 血缘分析** | 粘贴或上传 SQL/HQL 脚本，解析表级依赖，生成血缘图谱、依赖清单，并支持导出 Cypher / Excel / JSON、推送 Neo4j。 |

支持亮色 / 暗色主题切换、响应式布局、键盘快捷键（`Ctrl/Cmd+K` 搜索等）。

---

## 🧰 技术栈

**前端**：React 19 · Vite 7 · TypeScript 5 · React Router 7 · Zustand 5 · TanStack Query 5 · Tailwind CSS 4 · 原生 Canvas 2D · Shiki · @xyflow/react · Lucide · Sonner · xlsx
**后端**：FastAPI · Uvicorn · Pydantic 2 · OpenAI SDK（兼容 DeepSeek 等）· sqlglot · neo4j · pytest
**包管理**：前端 pnpm，后端 pip + requirements.txt

---

## 📁 目录结构

```
LLM_PROJ_BD/
├── frontend/              # React + Vite 前端
│   ├── src/
│   │   ├── pages/         # 页面：HomePage / SqlIndexPage / DialectPage / FunctionDetailPage / DataTestPage / LineagePage
│   │   ├── components/    # global / animation / code / datatest / lineage / shared
│   │   ├── engine/        # Canvas 动画引擎（CanvasEngine / AnimationController / renderers）
│   │   ├── stores/        # Zustand 全局状态
│   │   ├── api/           # 请求封装 + TanStack Query hooks
│   │   ├── hooks/ lib/ types/
│   │   └── App.tsx
│   ├── package.json  vite.config.ts  tsconfig.json
│
├── backend/              # FastAPI 后端
│   ├── app/
│   │   ├── main.py       # 入口：CORS + 路由注册
│   │   ├── routers/      # dialects / functions / search / datatest / lineage
│   │   ├── services/     # 业务逻辑
│   │   ├── core/         # 配置 / 加载器 / 响应封装 / 缓存
│   │   └── data/sql/     # 7 个方言 JSON 数据文件
│   ├── tests/            # pytest 测试
│   ├── requirements.txt
│   └── .env.example      # 环境变量模板（复制为 .env 后填写）
│
└── docs/                 # PRD、技术方案、设计文档
```

---

## 🚀 快速开始

### 环境要求
- Node.js ≥ 18，pnpm（`npm i -g pnpm`）
- Python ≥ 3.10

### 1. 启动后端（端口 8001）

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

# 配置环境变量：复制模板并填写你自己的密钥
cp .env.example .env      # Windows 用：copy .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY 等

uvicorn app.main:app --port 8001 --reload
```

### 2. 启动前端（端口 5173）

```bash
cd frontend
pnpm install
pnpm dev
```

打开浏览器访问 http://localhost:5173 。前端开发服务器会把 `/api` 请求代理到后端 `127.0.0.1:8001`。

### 环境变量

后端所需变量见 `backend/.env.example`，主要包括：

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | LLM API 密钥（测试数据 / 血缘分析功能需要） |
| `OPENAI_BASE_URL` | LLM 接口地址（如使用 DeepSeek：`https://api.deepseek.com`） |
| `LLM_MODEL` | 模型名 |
| `NEO4J_*` | 可选，血缘结果推送 Neo4j 时使用 |

> ⚠️ **切勿把真实的 `.env` 提交到仓库**。根目录 `.gitignore` 已忽略 `.env`，仅 `.env.example` 入库。

---

## 📜 可用脚本

**前端**（在 `frontend/` 下）
| 命令 | 作用 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 类型检查 + 生产构建 |
| `pnpm preview` | 预览构建产物 |
| `pnpm typecheck` | 仅类型检查 |

**后端**（在 `backend/` 下）
| 命令 | 作用 |
|------|------|
| `uvicorn app.main:app --port 8001 --reload` | 启动 API |
| `pytest` | 运行测试 |

---

## 📚 文档

详细的产品需求、技术方案与设计文档见 [`docs/`](./docs/)，包含 PRD、技术方案（tech-plan）、动画引擎设计、SQL 数据格式规范等。

---

## 📄 许可证

[MIT](./LICENSE) © 2026 \<YOUR NAME\>
