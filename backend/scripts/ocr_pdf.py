"""扫描版 PDF -> 文本 OCR（kbqa 种子文档用，rapidocr_onnxruntime + pypdfium2）。

用法（backend/ 下执行）：
  python -m scripts.ocr_pdf --in path/to/扫描件.pdf --out path/to/输出.txt

逐页渲染（scale=2）-> RapidOCR 识别 -> 按页拼接（页间空行分隔，
便于 rag_sql_kb.chunk_doc 的段落优先切片以页为语义单元）。
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("ocr_pdf")


def main() -> None:
    parser = argparse.ArgumentParser(description="扫描版 PDF OCR 转文本")
    parser.add_argument("--in", dest="src", required=True, help="输入 PDF 路径")
    parser.add_argument("--out", dest="dst", required=True, help="输出 txt 路径")
    parser.add_argument("--scale", type=float, default=2.0, help="渲染放大倍率（默认 2.0）")
    parser.add_argument("--pages", default=None, help="仅处理指定页（如 1-10），调试用")
    args = parser.parse_args()

    import pypdfium2 as pdfium
    from rapidocr_onnxruntime import RapidOCR

    src = Path(args.src)
    if not src.is_file():
        sys.exit(f"文件不存在：{src}")

    pdf = pdfium.PdfDocument(str(src))
    n = len(pdf)
    indices = range(n)
    if args.pages:
        lo, hi = (int(x) for x in args.pages.split("-"))
        indices = range(lo - 1, min(hi, n))

    ocr = RapidOCR()
    pages_text: list[str] = []
    t0 = time.time()
    for i in indices:
        img = pdf[i].render(scale=args.scale).to_pil()
        result, _ = ocr(img)
        lines = [r[1] for r in (result or []) if r and r[1]]
        pages_text.append("\n".join(lines))
        if (i + 1) % 10 == 0 or i == indices[-1]:
            logger.info(
                "%d/%d 页完成，累计 %d 字符，%.1fs",
                i + 1,
                len(list(indices)),
                sum(len(t) for t in pages_text),
                time.time() - t0,
            )

    out = Path(args.dst)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n\n".join(pages_text), encoding="utf-8")
    logger.info("已写出：%s（%d 页，%d 字符）", out, len(pages_text), sum(len(t) for t in pages_text))


if __name__ == "__main__":
    main()
