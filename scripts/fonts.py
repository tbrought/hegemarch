"""The game's own touches to its typefaces (src/fonts), made once and kept with it:

  python scripts/fonts.py        (needs Python 3 with fontTools and brotli: pip install fonttools brotli)

- Pixelify Sans's 5 is redrawn. Its own has the S's hooked top and reads as one ("Crowned S", "x1.2S"); this
  one has a flat top with a square corner, which an S never has. Same pixel grid, and the bold follows the
  font's own rule for each edge. (The font has no Reserved Font Name, so it keeps its name: OFL-pixelify-sans.txt.)
- The Legacy mark, the diamond (U+25C6), is drawn on each face's pixel grid as a font of one glyph:
  legacy-mark-display.woff2 for Press Start 2P, legacy-mark-body.woff2 for Pixelify Sans. Neither face has
  the glyph, so the browser took it from a system font: small, soft and low, like a dot ("·545"), and
  taller, so a line with one in it stood higher than the rest. Each mark has its face's line metrics, so a
  line is no taller for it; the stacks name it after its face (src/styles.css, site/index.html).

Running it again changes nothing.
"""
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import ttProgram
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
from fontTools.ttLib.tables.TupleVariation import TupleVariation

FONTS = Path(__file__).resolve().parent.parent / 'src' / 'fonts'


def area(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2


def redraw_five():
    path = FONTS / 'pixelify-sans.woff2'
    f = TTFont(path, recalcTimestamp=False)
    glyf = f['glyf']
    gvar = f['gvar'].variations
    bold = gvar['five'][0]  # (read before the glyph changes: its deltas are read against its points)
    five = glyf['five']
    # Clockwise from the foot of the bottom bar: the foot, its hook and the bowl as the font's 5 and S have
    # them; then the middle bar out to the left side, square up to the top, and along the top square to the right.
    pts = [(151, -12), (151, 78), (60, 78), (60, 179), (161, 179), (161, 88), (423, 88), (423, 260),
           (60, 260), (60, 631), (525, 631), (525, 530), (161, 530), (161, 359), (433, 359), (433, 270),
           (525, 270), (525, 78), (433, 78), (433, -12)]
    # How far each edge moves at the bold, as it does in the font's other glyphs on this grid.
    dx = {60: 0, 151: -2, 161: 27, 423: -9, 433: 20, 525: 17}
    dy = {-12: 1, 78: -4, 88: 37, 179: 32, 260: -14, 270: 27, 359: 22, 530: -29, 631: 7}
    old, _, _ = five.getCoordinates(glyf)
    assert (area(list(old)) > 0) == (area(pts) > 0), 'the 5 must wind as the font does'
    five.coordinates = GlyphCoordinates(pts)
    five.endPtsOfContours = [len(pts) - 1]
    five.flags = bytearray([1] * len(pts))
    five.program = ttProgram.Program()
    five.program.fromBytecode(b'')
    five.recalcBounds(glyf)
    phantom = bold.coordinates[-4:]
    gvar['five'] = [TupleVariation(dict(bold.axes), [(dx[x], dy[y]) for x, y in pts] + list(phantom))]
    f.save(path)
    print('redrew the 5 in', path.name)


# name: (its face, one pixel of the face in font units, its left edge, the foot of a capital, advance)
FACES = {
    'display': ('press-start-2p.woff2', 125, 0, 125, 1000),
    'body': ('pixelify-sans.woff2', 92, 60, -12, 764),
}
HALF = [0, 1, 2, 3, 2, 1, 0]  # a diamond seven pixels high and wide, a capital's height, from its foot


def build_mark(name):
    face, u, x0, y0, adv = FACES[name]
    parent = TTFont(FONTS / face)
    x = lambda col: x0 + col * u
    y = lambda row: y0 + row * u
    # Clockwise: across the top, down the right-hand steps, back along the foot and up the left-hand steps.
    pts = [(x(3), y(7)), (x(4), y(7))]
    for r in range(6, -1, -1):
        pts += [(x(4 + HALF[r]), y(r + 1)), (x(4 + HALF[r]), y(r))]
    for r in range(7):
        pts += [(x(3 - HALF[r]), y(r)), (x(3 - HALF[r]), y(r + 1))]
    pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
    pen = TTGlyphPen(None)
    pen.moveTo(pts[0])
    for p in pts[1:]:
        pen.lineTo(p)
    pen.closePath()
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(['.notdef', 'legacy'])
    fb.setupCharacterMap({0x25C6: 'legacy'})
    fb.setupGlyf({'.notdef': TTGlyphPen(None).glyph(), 'legacy': pen.glyph()})
    fb.setupHorizontalMetrics({'.notdef': (adv, 0), 'legacy': (adv, x0)})
    # Its face's line metrics, all of them (the browser takes a line's height from every face in it).
    hh, os2 = parent['hhea'], parent['OS/2']
    fb.setupHorizontalHeader(ascent=hh.ascent, descent=hh.descent, lineGap=hh.lineGap)
    fb.setupNameTable({'familyName': f'Legacy Mark {name.title()}', 'styleName': 'Regular',
                       'copyright': 'Hegemarch: the Legacy mark, drawn for the game'})
    fb.setupOS2(version=4, sTypoAscender=os2.sTypoAscender, sTypoDescender=os2.sTypoDescender,
                sTypoLineGap=os2.sTypoLineGap, usWinAscent=os2.usWinAscent, usWinDescent=os2.usWinDescent,
                fsSelection=(os2.fsSelection & 0x80) | 0x40)
    fb.setupPost()
    fb.font['head'].created = fb.font['head'].modified = parent['head'].modified
    fb.font.recalcTimestamp = False
    fb.font.flavor = 'woff2'
    out = FONTS / f'legacy-mark-{name}.woff2'
    fb.save(out)
    print('drew the Legacy mark in', out.name)


if __name__ == '__main__':
    redraw_five()
    build_mark('display')
    build_mark('body')
