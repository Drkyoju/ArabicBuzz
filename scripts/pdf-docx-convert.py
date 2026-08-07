#!/usr/bin/env python3
"""Local PDF↔DOCX helper for ArabicBuzz agents (Mac / storage:sync).

Quality order (do not invent a worse path):
  1) LibreOffice soffice --headless (if installed)
  2) pdf2docx (layout) — WARN if Arabic ToUnicode looks broken
  3) Visual page-image DOCX (no gibberish, not text-editable)

Never use pdf-lib stamping for Arabic body text.
"""
from __future__ import annotations

import argparse
import io
import re
import shutil
import subprocess
import sys
from pathlib import Path


BROKEN_AR_HINTS = (
    "املادة",
    "الالئحة",
    "االسم",
    "األساسية",
    "واألهداف",
)


def arabic_text_looks_broken(sample: str) -> bool:
    hits = sum(1 for h in BROKEN_AR_HINTS if h in sample)
    if hits >= 2:
        return True
    # alef-lam often collapsed incorrectly: high ratio of اال / امل
    bad = len(re.findall(r"اال|امل[^ا]", sample))
    good = len(re.findall(r"ال[اأإ]|الم", sample))
    return bad > good * 1.5 and bad > 8


def find_soffice() -> str | None:
    candidates = [
        shutil.which("soffice"),
        shutil.which("libreoffice"),
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/local/bin/soffice",
        "/opt/homebrew/bin/soffice",
    ]
    for c in candidates:
        if c and Path(c).exists():
            return c
    return None


def convert_soffice(src: Path, out_dir: Path, to_ext: str) -> Path:
    soffice = find_soffice()
    if not soffice:
        raise RuntimeError("soffice غير متوفر")
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        soffice,
        "--headless",
        "--convert-to",
        to_ext,
        "--outdir",
        str(out_dir),
        str(src),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=300)
    out = out_dir / f"{src.stem}.{to_ext}"
    if not out.exists():
        raise RuntimeError(f"LibreOffice لم يُنتج {out.name}")
    return out


def convert_pdf2docx(src: Path, dest: Path) -> Path:
    from pdf2docx import Converter

    dest.parent.mkdir(parents=True, exist_ok=True)
    cv = Converter(str(src))
    try:
        cv.convert(str(dest))
    finally:
        cv.close()
    return dest


def convert_visual_docx(src: Path, dest: Path, dpi: int = 120) -> Path:
    import fitz
    from docx import Document
from docx.shared import Inches, Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement

    dest.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    for section in doc.sections:
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)
        section.top_margin = Cm(1.0)
        section.bottom_margin = Cm(1.0)
        section.left_margin = Cm(1.0)
        section.right_margin = Cm(1.0)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    pPr = p._p.get_or_add_pPr()
    pPr.append(OxmlElement("w:bidi"))
    run = p.add_run(
        "نسخة مرئية (صورة لكل صفحة) — للحفاظ على العربية بلا طلاسم عندما تكون طبقة PDF النصية معطوبة."
    )
    run.font.size = Pt(11)
    run.font.color.rgb = RGBColor(0x1B, 0x5E, 0x20)
    rPr = run._element.get_or_add_rPr()
    rPr.append(OxmlElement("w:rtl"))

    pdf = fitz.open(src)
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    width = Inches(7.3)
    for i, page in enumerate(pdf):
        if i:
            doc.add_page_break()
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = io.BytesIO(pix.tobytes("png"))
        para = doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        para.add_run().add_picture(img, width=width)
    doc.save(dest)
    return dest


def sample_pdf_text(src: Path, max_pages: int = 3) -> str:
    import fitz

    pdf = fitz.open(src)
    parts = []
    for i, page in enumerate(pdf):
        if i >= max_pages:
            break
        parts.append(page.get_text())
    return "\n".join(parts)


def main() -> int:
    ap = argparse.ArgumentParser(description="ArabicBuzz PDF↔DOCX local convert")
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--output", type=Path, required=True)
    ap.add_argument(
        "--mode",
        choices=["auto", "soffice", "pdf2docx", "visual"],
        default="auto",
    )
    args = ap.parse_args()
    src = args.input.expanduser().resolve()
    dest = args.output.expanduser().resolve()
    if not src.exists():
        print(f"missing: {src}", file=sys.stderr)
        return 2

    to_docx = src.suffix.lower() == ".pdf" and dest.suffix.lower() == ".docx"
    to_pdf = src.suffix.lower() in {".docx", ".doc"} and dest.suffix.lower() == ".pdf"

    mode = args.mode
    warnings: list[str] = []

    if to_docx:
        sample = sample_pdf_text(src)
        broken = arabic_text_looks_broken(sample)
        if broken:
            warnings.append(
                "طبقة Unicode في PDF تبدو معطوبة للعربية — تجنّب المسار النصّي؛ فضّل Google Drive / visual / OCR."
            )

        if mode == "auto":
            if find_soffice() and not broken:
                mode = "soffice"
            elif broken:
                mode = "visual"
            else:
                mode = "pdf2docx"

        try:
            if mode == "soffice":
                tmp = convert_soffice(src, dest.parent, "docx")
                if tmp != dest:
                    shutil.move(str(tmp), str(dest))
            elif mode == "pdf2docx":
                convert_pdf2docx(src, dest)
            else:
                convert_visual_docx(src, dest)
        except Exception as e:
            if mode != "visual":
                warnings.append(f"{mode} فشل ({e}); الانتقال للنسخة المرئية")
                convert_visual_docx(src, dest)
                mode = "visual"
            else:
                raise
    elif to_pdf:
        if mode in ("auto", "soffice"):
            tmp = convert_soffice(src, dest.parent, "pdf")
            if tmp != dest:
                shutil.move(str(tmp), str(dest))
            mode = "soffice"
        else:
            print("Word→PDF المحلي يحتاج LibreOffice (soffice)", file=sys.stderr)
            return 3
    else:
        print("زوج الصيغ غير مدعوم محلياً", file=sys.stderr)
        return 4

    print(f"ok engine={mode} out={dest}")
    for w in warnings:
        print(f"WARN: {w}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
