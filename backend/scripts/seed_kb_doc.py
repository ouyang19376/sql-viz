"""知识库问答（kbqa）- 种子文档入库脚本。

将一份标准/规范文档（.txt / .md / .pdf）切片后入 kb_docs collection，
复用 rag_sql_kb.ingest_doc（覆盖探测 + 分片 + embed + Milvus 写入）。

用法（在 backend/ 目录下执行）：
  python -m scripts.seed_kb_doc --file path/to/标准.md \
      --title "保险基础数据模型（行业标准）" \
      --category modeling_standard --source-name "行业权威发布"

需要 .env 中 MILVUS_URI / EMBEDDING_* 可用（与 rag-sql 模块一致，无新增配置）。
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("seed_kb_doc")

# 允许的 kb_docs 类别（与 rag_sql_models.KbCategory 对齐）
CATEGORIES = [
    "sql_standard",
    "modeling_standard",
    "quality_sla",
    "best_code",
    "model_design",
]


def read_text(path: Path) -> str:
    """读取文档文本：.txt/.md 直读 UTF-8；.pdf 用 pypdf 提取。"""
    if path.suffix.lower() == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError:
            sys.exit("PDF 入库需要 pypdf：pip install pypdf（或已写入 requirements.txt 后重装依赖）")
        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n\n".join(p.strip() for p in pages if p.strip())
        logger.info("PDF 共 %d 页，提取有效文本 %d 字符", len(reader.pages), len(text))
        return text
    return path.read_text(encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="知识库种子文档入库（kb_docs）")
    parser.add_argument("--file", required=True, help="文档路径（.txt / .md / .pdf）")
    parser.add_argument("--title", required=True, help="文档标题（同标题视为同一文档，可覆盖）")
    parser.add_argument("--category", default="modeling_standard", choices=CATEGORIES)
    parser.add_argument("--source-name", default=None, help="来源标注（如「金融行业标准全文公开系统」）")
    parser.add_argument("--overwrite", action="store_true", help="同标题已入库时覆盖更新")
    args = parser.parse_args()

    path = Path(args.file)
    if not path.is_file():
        sys.exit(f"文件不存在：{path}")

    content = read_text(path)
    if not content.strip():
        sys.exit("文档内容为空（PDF 可能是扫描件，需先 OCR）")

    # 惰性导入：--help 与文件校验阶段不触发 Milvus/embedding 连接
    from app.services import rag_sql_milvus
    from app.services.rag_sql_embed import embed
    from app.services.rag_sql_kb import ingest_doc
    from app.services.rag_sql_models import KbDocInput

    inp = KbDocInput(
        title=args.title,
        category=args.category,
        content=content,
        sourceName=args.source_name,
        overwrite=args.overwrite,
    )
    result = ingest_doc(inp, embed_fn=embed, milvus=rag_sql_milvus)
    if not result.ingested:
        logger.warning("同名文档已存在：%s（加 --overwrite 覆盖更新）", args.title)
        return
    logger.info(
        "入库成功：%s（%d 个分片，%s）",
        result.title,
        result.chunkCount,
        "覆盖更新" if result.overwritten else "新增",
    )


if __name__ == "__main__":
    main()
