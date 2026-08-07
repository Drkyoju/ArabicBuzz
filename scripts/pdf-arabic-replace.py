#!/usr/bin/env python3
"""
High-quality Arabic PDF find/replace.

Engines (best → fallback):
  1) embedded-font — extract the page's Arabic TTF (e.g. Sakkal Majalla) from the
     PDF, shape with arabic-reshaper + python-bidi (presentation forms), redact,
     then TextWriter. Closest visual match when the original font is embedded.
  2) htmlbox — PyMuPDF insert_htmlbox (HarfBuzz) with an external TTF
     (Noto Naskh / SF Arabic). Good shaping; not pixel-identical to Majalla.

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
import tempfile
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

ARABIC_FONT_HINTS = (
    "sakkal",
    "majalla",
    "naskh",
    "arabic",
    "trado",
    "scheherazade",
    "amiri",
    "ge_ss",
    "ge ss",
    "dubai",
    "tahoma",
)


def resolve_fallback_font(explicit: str | None = None) -> Path:
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
    compact = " ".join(find.split())
    if compact not in out:
        out.append(compact)
    return out


def rgb_from_int(c: int) -> tuple[float, float, float]:
    r = ((c >> 16) & 255) / 255.0
    g = ((c >> 8) & 255) / 255.0
    b = (c & 255) / 255.0
    return r, g, b


def rgb255_from_int(c: int) -> tuple[int, int, int]:
    return ((c >> 16) & 255), ((c >> 8) & 255), (c & 255)


def union_search(page: fitz.Page, needle: str) -> fitz.Rect | None:
    hits = page.search_for(needle)
    if not hits:
        return None
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


def span_near(page: fitz.Page, rect: fitz.Rect) -> dict | None:
    """Return the text span (dict) that best overlaps rect."""
    mid = (rect.y0 + rect.y1) / 2
    best = None
    d = page.get_text("dict")
    for b in d.get("blocks", []):
        if b.get("type") != 0:
            continue
        for line in b.get("lines", []):
            for span in line.get("spans", []):
                sb = fitz.Rect(span["bbox"])
                if abs(((sb.y0 + sb.y1) / 2) - mid) > 10:
                    continue
                if not sb.intersects(rect):
                    continue
                inter = sb & rect
                try:
                    area = float(inter.get_area())  # type: ignore[attr-defined]
                except Exception:
                    area = float(abs(inter)) if inter else 0.0
                if best is None or area > best[0]:
                    best = (area, span)
    return best[1] if best else None


def raw_span_near(page: fitz.Page, rect: fitz.Rect) -> dict | None:
    mid = (rect.y0 + rect.y1) / 2
    best = None
    d = page.get_text("rawdict")
    for b in d.get("blocks", []):
        if b.get("type") != 0:
            continue
        for line in b.get("lines", []):
            for span in line.get("spans", []):
                sb = fitz.Rect(span["bbox"])
                if abs(((sb.y0 + sb.y1) / 2) - mid) > 10:
                    continue
                if not sb.intersects(rect):
                    continue
                inter = sb & rect
                try:
                    area = float(inter.get_area())  # type: ignore[attr-defined]
                except Exception:
                    area = float(abs(inter)) if inter else 0.0
                if best is None or area > best[0]:
                    best = (area, span)
    return best[1] if best else None


def extract_embedded_font(doc: fitz.Document, page: fitz.Page, span_font: str) -> Path | None:
    """Extract a usable TTF for the span's font family from the PDF."""
    want = (span_font or "").lower().replace(" ", "")
    candidates: list[tuple[int, int, str]] = []  # score, xref, name
    for f in page.get_fonts(full=True):
        xref = int(f[0])
        name = str(f[3] or "")
        ext = str(f[1] or "").lower()
        if ext not in ("ttf", "otf"):
            continue
        nlow = name.lower().replace(" ", "").replace("+", "")
        score = 0
        if want and want in nlow:
            score += 100
        if any(h in nlow for h in ARABIC_FONT_HINTS):
            score += 40
        if "bold" in nlow:
            score -= 5
        if score > 0:
            candidates.append((score, xref, name))
    if not candidates:
        # any Arabic-hinted font on any page
        for i in range(doc.page_count):
            for f in doc[i].get_fonts(full=True):
                xref = int(f[0])
                name = str(f[3] or "")
                ext = str(f[1] or "").lower()
                if ext not in ("ttf", "otf"):
                    continue
                nlow = name.lower()
                if any(h in nlow for h in ARABIC_FONT_HINTS):
                    candidates.append((20, xref, name))
    if not candidates:
        return None
    candidates.sort(key=lambda x: -x[0])
    _, xref, name = candidates[0]
    try:
        info = doc.extract_font(xref)
    except Exception:
        return None
    payload = info[3] if len(info) > 3 else None
    ext = (info[1] or "ttf").lower()
    if not payload or len(payload) < 1000 or ext not in ("ttf", "otf"):
        return None
    tmp = Path(tempfile.mkdtemp(prefix="ab-font-")) / f"{name.replace('+', '_')}.{ext}"
    tmp.write_bytes(payload)
    return tmp


def shape_arabic(text: str) -> str:
    """Logical Arabic → visual presentation forms for fonts without GSUB."""
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
    except ImportError as e:
        raise RuntimeError(
            "للمحرّك المضمّن: pip install arabic-reshaper python-bidi"
        ) from e

    reshaper = arabic_reshaper.ArabicReshaper(
        configuration={
            "delete_harakat": True,
            "support_ligatures": True,
            "ARABIC LIGATURE ALLAH": True,
        }
    )
    visual = get_display(reshaper.reshape(text))
    return visual.replace("\xa0", " ").replace("\u00a0", " ")


def font_covers(font: fitz.Font, visual: str) -> bool:
    """Best-effort: reject if many chars measure as .notdef width."""
    try:
        # text_length of unknown glyphs often collapses oddly; check per char
        ok = 0
        for ch in visual:
            if ch == " ":
                ok += 1
                continue
            w = font.text_length(ch, fontsize=10)
            if w > 0.01:
                ok += 1
        return ok >= max(1, int(len(visual.replace(" ", "")) * 0.85))
    except Exception:
        return True


def replace_embedded(
    doc: fitz.Document,
    page: fitz.Page,
    find: str,
    replace: str,
) -> tuple[int, str | None]:
    """Redact + TextWriter using extracted embedded font. Returns (count, font_label)."""
    count = 0
    font_label = None
    for variant in expand_find_variants(find):
        while True:
            rect = union_search(page, variant)
            if rect is None or rect.is_empty:
                break

            span = span_near(page, rect)
            raw = raw_span_near(page, rect)
            size = float(span["size"]) if span else 12.0
            color_i = int(span["color"]) if span else 0
            span_font = str(span.get("font") or "") if span else ""

            baseline = (rect.y0 + rect.y1) * 0.78
            if raw and raw.get("chars"):
                # Prefer baseline of chars overlapping the find rect
                bases = [
                    float(c["origin"][1])
                    for c in raw["chars"]
                    if fitz.Rect(c["bbox"]).intersects(rect)
                ]
                if bases:
                    baseline = sum(bases) / len(bases)

            emb = extract_embedded_font(doc, page, span_font)
            if emb is None:
                return 0, None

            font = fitz.Font(fontfile=str(emb))
            visual = shape_arabic(replace)
            if not font_covers(font, visual):
                return 0, None

            width = font.text_length(visual, fontsize=size)
            # Right-align to original find right edge; allow slight left growth
            start_x = rect.x1 - width
            # Keep vertical band tight; horizontal: cover old + new extent
            box = fitz.Rect(
                min(rect.x0, start_x) - 1.0,
                rect.y0 - 0.35,
                rect.x1 + 0.8,
                rect.y1 + 0.35,
            )
            # Avoid eating far-left siblings in the same span (e.g. الرياض in another cell)
            if raw and raw.get("chars"):
                far_left = [
                    c
                    for c in raw["chars"]
                    if c.get("c", "").strip()
                    and float(c["origin"][0]) < rect.x0 - 40
                ]
                if far_left:
                    keep_right = max(float(c["bbox"][2]) for c in far_left) + 3.0
                    box.x0 = max(box.x0, keep_right)

            avail = rect.x1 - box.x0 - 1.0
            draw_size = size
            if width > avail > 10:
                draw_size = size * (avail / width) * 0.995
                width = font.text_length(visual, fontsize=draw_size)
                start_x = rect.x1 - width

            page.add_redact_annot(box, fill=(1, 1, 1))
            page.apply_redactions()

            color = rgb_from_int(color_i)
            tw = fitz.TextWriter(page.rect, color=color)
            tw.append(
                fitz.Point(start_x, baseline),
                visual,
                font=font,
                fontsize=draw_size,
            )
            tw.write_text(page)
            font_label = f"embedded:{emb.name} (from {span_font or 'pdf'})"
            count += 1
            if count > 50:
                break
        if count:
            break
    return count, font_label


def replace_htmlbox(
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
            span = span_near(page, rect)
            size = float(span["size"]) if span else 12.0
            color_i = int(span["color"]) if span else 0x141414
            r, g, b = rgb255_from_int(color_i)

            pad_x = max(8.0, (len(replace) - len(find)) * 2.5)
            box = fitz.Rect(
                max(0, rect.x0 - pad_x),
                rect.y0 - 0.5,
                min(page.rect.width, rect.x1 + 2),
                rect.y1 + 0.5,
            )
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
    prefer_embedded: bool = True,
) -> dict:
    fallback = resolve_fallback_font(font_path)
    archive_dir = fallback.parent
    doc = fitz.open(input_path)
    total = 0
    details: list[dict] = []
    engines_used: list[str] = []
    font_used = str(fallback)

    for item in replacements:
        find = str(item.get("find") or item.get("from") or "").strip()
        replace = str(item.get("replace") or item.get("to") or "")
        if not find:
            continue
        n = 0
        eng = None
        label = None
        if prefer_embedded:
            for page in doc:
                got, label = replace_embedded(doc, page, find, replace)
                if got:
                    n += got
                    eng = "pymupdf-embedded-font"
                    if label:
                        font_used = label
            if n:
                engines_used.append(eng or "embedded")
                total += n
                details.append(
                    {
                        "find": find,
                        "replace": replace,
                        "count": n,
                        "engine": eng,
                        "font": font_used,
                    }
                )
                continue

        # Fallback: HarfBuzz htmlbox with external font
        for page in doc:
            n += replace_htmlbox(page, find, replace, fallback, archive_dir)
        eng = "pymupdf-htmlbox"
        engines_used.append(eng)
        font_used = str(fallback)
        total += n
        details.append(
            {
                "find": find,
                "replace": replace,
                "count": n,
                "engine": eng,
                "font": font_used,
            }
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()

    primary = engines_used[0] if engines_used else "none"
    if primary == "pymupdf-embedded-font":
        msg = (
            f"استُبدل {total} موضعاً بخط مضمّن من PDF (Sakkal/Arabic + reshaper) — أقرب مطابقة بصرية."
            if total
            else "لم يُعثر على النص المطلوب في طبقة PDF — جرّب صيغة بديلة أو OCR."
        )
    else:
        msg = (
            f"استُبدل {total} موضعاً بمحرّك PyMuPDF (HarfBuzz/insert_htmlbox)."
            if total
            else "لم يُعثر على النص المطلوب في طبقة PDF — جرّب صيغة بديلة أو OCR."
        )

    return {
        "ok": True,
        "engine": primary,
        "engines": engines_used,
        "totalReplacements": total,
        "details": details,
        "font": font_used,
        "outputPath": str(output_path),
        "messageAr": msg,
        "qualityNoteAr": (
            "عند توفر الخط المضمّن (مثل Sakkal Majalla) تُعاد استخدام نفس ملف TTF من PDF. "
            "بدون جداول GSUB يُستخدم arabic-reshaper لأشكال العرض. "
            "البديل Noto Naskh عبر htmlbox قريب شكلياً وليس مطابقاً بكسلًا."
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input")
    ap.add_argument("--output")
    ap.add_argument("--find", action="append", default=[])
    ap.add_argument("--replace", action="append", default=[])
    ap.add_argument("--font")
    ap.add_argument("--no-embedded", action="store_true")
    ap.add_argument("--stdin-json", action="store_true")
    args = ap.parse_args()

    if args.stdin_json:
        payload = json.load(sys.stdin)
        result = run_replace(
            Path(payload["inputPath"]),
            Path(payload["outputPath"]),
            list(payload.get("replacements") or []),
            payload.get("fontPath"),
            prefer_embedded=not bool(payload.get("noEmbedded")),
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result.get("ok") and result.get("totalReplacements", 0) > 0 else 1

    if not args.input or not args.output or not args.find:
        ap.error("--input --output --find/--replace مطلوبة (أو --stdin-json)")
    if len(args.replace) != len(args.find):
        ap.error("عدد --find يجب أن يساوي --replace")
    reps = [{"find": f, "replace": r} for f, r in zip(args.find, args.replace)]
    result = run_replace(
        Path(args.input),
        Path(args.output),
        reps,
        args.font,
        prefer_embedded=not args.no_embedded,
    )
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
