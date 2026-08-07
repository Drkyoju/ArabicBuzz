# Arabic PPTX authoring rules

## Contents

- First principles
- Text construction
- Mixed-direction text
- Lists, tables, and diagrams
- Fonts
- OOXML invariants

## First principles

A PowerPoint text box contains a text body. The text body contains paragraphs, and each paragraph contains runs. Direction is a paragraph property; horizontal alignment is a different property. Right alignment alone does not establish an RTL paragraph.

PowerPoint stores these concepts in DrawingML:

| Concept | Native representation | Why it matters |
| --- | --- | --- |
| Paragraph base direction | `a:pPr/@rtl="1"` | Establishes the bidi base direction independently for every paragraph |
| Text-body/column direction | `a:bodyPr/@rtlCol="1"` | Matches PowerPoint's RTL text-box behavior |
| Alignment | `a:pPr/@algn="r"` | Places the paragraph at the right edge; does not replace RTL |
| Run language | `a:rPr/@lang="ar-SA"` | Gives PowerPoint language and proofing metadata |
| Complex-script font | `a:rPr/a:cs/@typeface` | Selects the intended Arabic typeface slot |
| Native bullet | `a:pPr/a:buChar` or `a:buAutoNum` | Keeps bullets attached to paragraph direction and indentation |
| Presentation reading order | `p:presentation/@rtl="1"` | Declares an Arabic-first deck at the presentation level |

Unicode bidi controls change the interpretation of a character stream. PPTX already provides native paragraph direction, so document-wide RLE/PDF or isolate wrappers create two competing direction systems. A wrapper spanning a newline is especially unsafe because PowerPoint serializes each line as a separate paragraph while the wrapper may start in one paragraph and end in another.

## Text construction

Use plain logical-order Unicode text:

```text
الاتصال يربط الاستشعار بالقرار.
```

Never reverse it for visual appearance. Never pre-shape Arabic into presentation forms. Keep normal Arabic code points and allow the text engine to perform shaping.

Treat every newline as a possible new paragraph. Apply native RTL to every resulting paragraph.

Use Arabic punctuation where linguistically correct, but do not move punctuation manually to compensate for a broken preview.

## Mixed-direction text

The Unicode Bidirectional Algorithm resolves short Latin and numeric sequences inside a native RTL paragraph. Preserve their logical position:

```text
بدأ المشروع عام 1969.
ارتفعت القدرة بنسبة 25%.
يعتمد النظام على GPS وSATCOM.
C4ISR يربط القيادة بالاستطلاع.
الإصدار v2.1 صدر في 10 July 2026.
```

Use a separate LTR text box when the LTR span is structurally independent or long:

- URL or email address
- source citation
- file path or command
- code sample
- English subtitle or paragraph

For a bilingual slide, prefer separate Arabic and English text boxes over one paragraph that switches base direction halfway through.

Do not insert LRI/PDI around every acronym or number. Native paragraph direction plus normal Unicode text is the compatibility baseline. Add a directional control only if a documented target-application defect is reproduced with a minimal test, and then record that exception; the bundled strict audit otherwise rejects controls.

## Lists, tables, and diagrams

Use `a:buChar` or `a:buAutoNum` for lists. A typed `•` is ordinary text: it can migrate to the wrong side, inherit the wrong direction, and wrap independently.

For Arabic tables:

- Right-align Arabic cell text and set each cell paragraph RTL.
- Decide column order semantically. The first concept an Arabic reader should encounter normally belongs on the right.
- Keep Latin identifiers and numeric measures in their own cells when possible.

For flows, timelines, steppers, and arrows, mirror the sequence only when the sequence is meant to be read in Arabic order. Do not mirror logos, maps, mathematical axes, media controls, or universally directional symbols without a semantic reason.

## Fonts

Choose a font that contains Arabic glyphs and the required weights. Set the Latin and complex-script slots intentionally when the authoring engine allows it.

Do not make font embedding part of this skill's reliability promise. Embedding depends on the font's licensing flags and the authoring application. For editable sharing, communicate the required font or choose a common Arabic-capable font. For fixed appearance, export PDF.

The bundled repair script can populate the complex-script slot from an explicit selected font, but it does not install, bundle, license, subset, or embed fonts.

## OOXML invariants

For every Arabic paragraph in the final PPTX:

1. Store logical-order text without manual bidi controls.
2. Require `a:pPr/@rtl="1"`.
3. Require explicit right, center, or justified alignment; reject left alignment.
4. Require the containing `a:bodyPr/@rtlCol="1"` when a text body exists.
5. Require Arabic `lang` metadata on Arabic runs or their paragraph default.
6. Require a complex-script font slot when an explicit Latin/typeface slot exists.
7. Reject typed leading bullet glyphs.

For an Arabic-first deck, also require `p:presentation/@rtl="1"`. Do not apply that deck-level flag automatically to an English-primary bilingual deck.

These invariants are structural. They do not establish that a specific viewer, operating system, or missing font will render identically.
