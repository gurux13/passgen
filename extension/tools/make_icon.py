#!/usr/bin/env python3
"""Draw the extension icon: a key with three asterisks (a masked password).

Writes extension/icons/icon{16,32,48,128}.png and the site's favicon
(py/static/favicon.ico, 16/32/48). Drawn at 8x and downscaled, so
edges are smooth; the 16 px version uses dots instead of asterisks, which would
blur into blobs at that size.

    python extension/tools/make_icon.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "icons"
FAVICON = Path(__file__).resolve().parents[2] / "py" / "static" / "favicon.ico"
SIZES = [16, 32, 48, 128]
SS = 8  # supersampling factor

BG = (31, 31, 31, 255)  # --bg of the extension UI
KEY = (76, 175, 80, 255)  # --accent
STAR = (236, 236, 236, 255)  # --text


def bar(draw, cx, cy, length, width, angle_deg, fill):
    """A rounded bar centred on (cx, cy)."""
    a = math.radians(angle_deg)
    dx, dy = math.cos(a) * length / 2, math.sin(a) * length / 2
    draw.line([(cx - dx, cy - dy), (cx + dx, cy + dy)], fill=fill, width=round(width))
    r = width / 2
    for x, y in ((cx - dx, cy - dy), (cx + dx, cy + dy)):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def draw_icon(size: int) -> Image.Image:
    s = size * SS / 128  # design units are 0..128
    img = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = lambda v: v * s  # noqa: E731

    d.rounded_rectangle([0, 0, u(128) - 1, u(128) - 1], radius=u(26), fill=BG)

    # Key: ring on the left, shaft to the right with two teeth.
    small = size <= 16
    cy = u(84) if not small else u(80)
    ring_r, hole_r = (u(24), u(10)) if not small else (u(30), u(12))
    ring_cx = u(38)
    d.ellipse([ring_cx - ring_r, cy - ring_r, ring_cx + ring_r, cy + ring_r], fill=KEY)
    d.ellipse([ring_cx - hole_r, cy - hole_r, ring_cx + hole_r, cy + hole_r], fill=BG)
    shaft_h = u(12) if not small else u(18)
    d.rectangle([ring_cx + ring_r - u(4), cy - shaft_h / 2, u(112), cy + shaft_h / 2], fill=KEY)
    tooth_w = u(10) if not small else u(14)
    tooth_h = u(14) if not small else u(16)
    for x in (u(86), u(104)) if not small else (u(98),):
        d.rectangle([x - tooth_w / 2, cy + shaft_h / 2 - 1, x + tooth_w / 2, cy + shaft_h / 2 + tooth_h], fill=KEY)

    # Three asterisks above the key ("***", a masked password).
    star_y = u(38) if not small else u(34)
    for cx in (u(36), u(64), u(92)):
        if small:
            r = u(11)
            d.ellipse([cx - r, star_y - r, cx + r, star_y + r], fill=STAR)
        else:
            for angle in (90, 30, 150):
                bar(d, cx, star_y, u(22), u(6.5), angle, STAR)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    icons = {size: draw_icon(size) for size in SIZES}
    for size, img in icons.items():
        img.save(OUT / f"icon{size}.png")
    print(f"Wrote {', '.join(f'icon{s}.png' for s in SIZES)} -> {OUT}")

    # The site's favicon (pinned: run sync_ethalon.py afterwards and deploy it).
    icons[48].save(FAVICON, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[icons[16], icons[32]])
    print(f"Wrote {FAVICON}")


if __name__ == "__main__":
    main()
