# Arabic presentation QA

## Contents

- QA layers
- Acceptance corpus
- Application matrix
- Failure interpretation

## QA layers

Use three independent QA layers:

1. **Structural QA:** inspect the PPTX package and DrawingML properties with `arabic_pptx.py audit --strict`.
2. **Layout QA:** render every slide and inspect geometry, overflow, wrapping, spacing, contrast, and overlap.
3. **Application QA:** inspect actual text order and shaping in the target presentation application.

Passing one layer does not imply the others passed.

## Acceptance corpus

Include these cases in a test slide or ensure equivalent cases appear in the deck. Compare the visible output with the logical string, not with another potentially broken renderer.

| Case | Logical source text | Inspect |
| --- | --- | --- |
| Arabic only | الاتصال يصنع التفوق. | Joining, punctuation, right edge |
| Western digits | بدأ النظام عام 1969 وانتهى عام 1991. | Year order and sentence punctuation |
| Arabic-Indic digits | بدأت المرحلة ١ عام ١٩٦٩. | Digit sequence |
| Percentage | ارتفعت القدرة بنسبة 25%. | Number and percent sign stay together |
| Acronym inside | يعتمد النظام على GPS وSATCOM. | Acronym order and Arabic conjunction |
| Acronym first | C4ISR يربط القيادة بالاستطلاع. | Leading acronym remains readable |
| Parentheses | الشبكة (Network) تعمل باستمرار. | Parentheses do not flip |
| Version and date | الإصدار v2.1 صدر في 10 July 2026. | Dot, spaces, and date order |
| Protocol | يدعم النظام TCP/IP وLink 16. | Slash and trailing number |
| URL | https://example.com/report?id=25 | Keep in a separate LTR box |
| Native bullets | ثلاث فقرات عربية قصيرة | Bullet appears on the right and wraps correctly |
| Multiple paragraphs | سطر أول ثم سطر ثان | Each paragraph independently RTL |

For each case, inspect:

- Arabic letters connect and shape normally.
- Words read in the intended order.
- Latin acronyms are not reversed.
- Multi-digit numbers remain intact.
- `%`, parentheses, colon, slash, dash, and terminal punctuation stay with the intended token.
- Line wrapping does not move a neutral punctuation mark to the wrong visual edge.
- Bullets remain on the right after wrapping.

## Application matrix

| Surface | Role | What it can prove |
| --- | --- | --- |
| Microsoft PowerPoint desktop | Canonical editable PPTX viewer | Primary visual bidi, shaping, bullets, charts, and editing behavior |
| Keynote | Secondary compatibility target | Whether Apple's import/layout differs from PowerPoint |
| Google Slides | Secondary compatibility target | Import behavior, web bidi, and cloud-font substitution |
| Codex/LibreOffice preview | Layout diagnostic only for Arabic | Geometry and overflow; never authoritative Arabic word order |
| PDF exported by PowerPoint/Keynote | Fixed distribution artifact | Appearance on systems without the authoring font; not editability |

Do not infer PowerPoint behavior from a Codex preview. Do not infer Google Slides font availability from a local macOS installation.

## Failure interpretation

- **Arabic is reversed everywhere:** logical text may have been reversed before export or native paragraph RTL is absent.
- **Arabic is correct but English/numbers move:** paragraph RTL may be absent, bidi controls may be competing with native direction, or mixed content is too complex for one paragraph.
- **Only one line in a multiline box breaks:** a bidi wrapper probably started in one paragraph and ended in another, or only the first paragraph received direction metadata.
- **Bullets move to the left:** the bullet is probably a typed glyph or the paragraph lacks native RTL.
- **PowerPoint is correct but Google Slides differs:** Google import or font substitution is the compatibility boundary; preserve the valid PPTX and report the difference.
- **PowerPoint and Keynote agree but Codex preview is scrambled:** treat it as a renderer limitation. Use the preview only for layout and file an upstream renderer bug with a minimal fixture.
- **Typeface changes on another computer:** the font is unavailable or substituted. Supply installation guidance or PDF; do not claim the font is embedded unless package inspection proves it.

