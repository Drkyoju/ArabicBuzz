#!/usr/bin/env python3
"""
High-quality Arabic PDF find/replace using PyMuPDF insert_htmlbox (HarfBuzz).

Do NOT use insert_textbox / pdf-lib character reverse for Arabic — glyphs disconnect.

Usage:
  python scripts/pdf-arabic-replace.py \\
    --input in.pdf --output out.pdf \\
    --find "عبدالله بن نايف عوض عبدالرزاق" \\
    --replace "عبدالله بن نايف بن عبدالرزاق التويمان"

Also accepts JSON on stdin when --stdin-json:
  {"inputPath","outputPath","replacements":[{"find","replace"}], "fontPath"?}
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import pymupdf as fitz
except ImportError:
    print(
        json.dumps(
            {
                "ok": False,
                "error": "pymupdf غير مثبت. pip install pymupdf",
            },
            ensure_ascii=False,
        )
    )
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FONTS = [
    ROOT / "assets" / "fonts" / "NotoNaskhArabic-Regular.ttf",
    ROOT / "tmp" / "NotoNaskhArabic-Regular.ttf",
    Path("/System/Library/Fonts/SFArabic.ttf"),
]

# Text-layer variants often seen in Arabic PDFs (lam-alef encoding quirks)
VARIANT_MAP = {
    "عبدالله": ["عبدهللا", "عبد الله", "عبداللّه"],
    "الله": ["هللا", "اللّه"],
}


def resolve_font(explicit: str | None = None) -> Path:
    if explicit:
        p = Path(explicit)
        if p.is_file():
            return p
    for p in DEFAULT_FONTS:
        if p.is_file():
            return p
    raise FileNotFoundError(
        "لا خط عربي. ضع NotoNaskhArabic-Regular.ttf في assets/fonts/"
    )


def expand_find_variants(find: str) -> list[str]:
    out = [find]
    for canonical, variants in VARIANT_MAP.items():
        if canonical in find:
            for v in variants:
                alt = find.replace(canonical, v)
                if alt not in out:
                    out.append(alt)
    # Also try without spaces normalization
    compact = " ".join(find.split())
    if compact not in out:
        out.append(compact)
    return out


def rgb_from_int(c: int) -> tuple[int, int, int]:
    return ((c >> 16) & 255), ((c >> 8) & 255), (c & 255)


def span_style_near(page: fitz.Page, rect: fitz.Rect) -> tuple[float, tuple[int, int, int]]:
    size = 12.0
    color = (20, 20, 20)
    mid = (rect.y0 + rect.y1) / 2
    d = page.get_text("dict")
    best = None
    for b in d.get("blocks", []):
        if b.get("type") != 0:
            continue
        for line in b.get("lines", []):
            for span in line.get("spans", []):
                sb = fitz.Rect(span["bbox"])
                if abs(((sb.y0 + sb.y1) / 2) - mid) > 8:
                    continue
                if sb.intersects(rect):
                    inter = sb & rect
                    try:
                        area = float(inter.get_area())  # type: ignore[attr-defined]
                    except Exception:
                        area = float(abs(inter)) if inter else 0.0
                    if best is None or area > best[0]:
                        best = (
                            area,
                            float(span.get("size") or 12),
                            int(span.get("color") or 0),
                        )
    if best:
        size = best[1]
        color = rgb_from_int(best[2])
    return size, color


def union_search(page: fitz.Page, needle: str) -> fitz.Rect | None:
    hits = page.search_for(needle)
    if not hits:
        return None
    # search_for on shaped Arabic often returns per-glyph rects
    u = fitz.Rect(hits[0])
    for r in hits[1:]:
        # Only merge nearby glyphs on same line
        if abs(r.y0 - u.y0) < 6 and abs(r.y1 - u.y1) < 10:
            u |= r
        elif r.y0 > u.y1 + 2:
            break
    # Re-union all same-line hits
    u = None
    y_ref = None
    for r in hits:
        if y_ref is None:
            y_ref = (r.y0 + r.y1) / 2
            u = fitz.Rect(r)
            continue
        if abs(((r.y0 + r.y1) / 2) - y_ref) < 8:
            u |= r
    return u


def replace_on_page(
    page: fitz.Page,
    find: str,
    replace: str,
    font: Path,
    archive_dir: Path,
) -> int:
    count = 0
    for variant in expand_find_variants(find):
        while True:
            rect = union_search(page, variant)
            if rect is None or rect.is_empty:
                break
            # Expand slightly for longer replacement; keep vertical band
            pad_x = max(8.0, (len(replace) - len(find)) * 2.5)
            box = fitz.Rect(
                max(0, rect.x0 - pad_x),
                rect.y0 - 0.5,
                min(page.rect.width, rect.x1 + 2),
                rect.y1 + 0.5,
            )
            size, (r, g, b) = span_style_near(page, rect)
            page.add_redact_annot(box, fill=(1, 1, 1))
            page.apply_redactions()

            css = f"""
@font-face {{
  font-family: AbNaskh;
  src: url('{font.name}');
}}
* {{
  font-family: AbNaskh, sans-serif;
  font-size: {size}px;
  color: rgb({r},{g},{b});
  direction: rtl;
  text-align: right;
  margin: 0;
  padding: 0;
  line-height: {max(box.height, size * 1.15)}px;
}}
p {{ margin: 0; padding: 0; }}
"""
            arch = fitz.Archive(str(archive_dir))
            spare, scale = page.insert_htmlbox(
                box,
                f"<p>{replace}</p>",
                css=css,
                archive=arch,
                scale_low=0.55,
            )
            if spare < 0:
                raise RuntimeError(
                    f"تعذّر ملاءمة النص في المستطيل (scale={scale}). قصّر البديل أو وسّع المنطقة."
                )
            count += 1
            # safety: avoid infinite loop if search still finds presentation forms
            if count > 50:
                break
        if count:
            break
    return count


def run_replace(
    input_path: Path,
    output_path: Path,
    replacements: list[dict],
    font_path: str | None = None,
) -> dict:
    font = resolve_font(font_path)
    archive_dir = font.parent
    doc = fitz.open(input_path)
    total = 0
    details: list[dict] = []
    for item in replacements:
        find = str(item.get("find") or item.get("from") or "").strip()
        replace = str(item.get("replace") or item.get("to") or "")
        if not find:
            continue
        n = 0
        for page in doc:
            n += replace_on_page(page, find, replace, font, archive_dir)
        total += n
        details.append({"find": find, "replace": replace, "count": n})
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {
        "ok": True,
        "engine": "pymupdf-htmlbox",
        "totalReplacements": total,
        "details": details,
        "font": str(font),
        "outputPath": str(output_path),
        "messageAr": (
            f"استُبدل {total} موضعاً بمحرّك PyMuPDF (HarfBuzz/insert_htmlbox)."
            if total
            else "لم يُعثر على النص المطلوب في طبقة PDF — جرّب صيغة بديلة أو OCR."
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input")
    ap.add_argument("--output")
    ap.add_argument("--find", action="append", default=[])
    ap.add_argument("--replace", action="append", default=[])
    ap.add_argument("--font")
    ap.add_argument("--stdin-json", action="store_true")
    args = ap.parse_args()

    if args.stdin_json:
        payload = json.load(sys.stdin)
        result = run_replace(
            Path(payload["inputPath"]),
            Path(payload["outputPath"]),
            list(payload.get("replacements") or []),
            payload.get("fontPath"),
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result.get("ok") and result.get("totalReplacements", 0) > 0 else 1

    if not args.input or not args.output or not args.find:
        ap.error("--input --output --find/--replace مطلوبة (أو --stdin-json)")
    if len(args.replace) != len(args.find):
        ap.error("عدد --find يجب أن يساوي --replace")
    reps = [{"find": f, "replace": r} for f, r in zip(args.find, args.replace)]
    result = run_replace(Path(args.input), Path(args.output), reps, args.font)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
