"""Build the hero's depth layers from the two flattened workshop scenes.

The two source images share one camera: the same workshop with the machines
opened up for repair (before) and finished (after). This script

1. removes the text that is baked into the mockups, so the page can render it as HTML,
2. cuts the machines + concrete platform out of each scene (GrabCut seeded with boxes),
3. builds one clean workshop plate behind them, and adds a subtle depth-of-field
   blur towards its edges,
4. deepens the contact shadows under the machine feet on the platform top.

Usage:  python3 tools/build_layers.py
Needs:  opencv-python-headless, numpy, Pillow (with WebP)
Writes: assets/img/hero-bg.webp, hero-fg-before.webp, hero-fg-after.webp, hero-layers.json
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "source"
OUT = ROOT / "assets" / "img"

# Concrete platform outline in source pixels (1672 x 941), clockwise from the back-left corner.
PLATFORM = np.array([(411, 788), (1295, 786), (1328, 820), (1328, 867), (466, 881), (411, 826)], np.int32)

# Seed boxes for GrabCut: (x0, y0, x1, y1[, inner top margin]). Doors get a large top margin
# because their top edge is slanted and the wall shows through above it.
BOXES = {
    "after": [(495, 400, 700, 820), (699, 396, 970, 815), (964, 406, 1216, 812)],
    "before": [(360, 340, 470, 808, 70), (468, 398, 692, 808), (705, 366, 792, 808, 60),
               (786, 398, 992, 812), (986, 406, 1230, 812), (800, 792, 1010, 822, 0)],
}

# Text baked into the mockups (logo, nav, headline, subtitle), plus the button and pill shapes.
TEXT_BOXES = [(50, 25, 285, 72), (1440, 30, 1625, 64), (540, 95, 1135, 252), (585, 255, 1090, 295)]
SHAPES = [(700, 305, 972, 366), (655, 845, 1020, 905)]


def remove_text(im):
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    mask = np.zeros(g.shape, np.uint8)
    for x0, y0, x1, y1 in TEXT_BOXES:
        m = (g[y0:y1, x0:x1] < 175).astype(np.uint8) * 255
        mask[y0:y1, x0:x1] = cv2.dilate(m, np.ones((7, 7), np.uint8))
    for x0, y0, x1, y1 in SHAPES:
        cv2.rectangle(mask, (x0, y0), (x1, y1), 255, -1)
    res = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA)
    blur = cv2.GaussianBlur(res, (0, 0), 6)
    mf = cv2.GaussianBlur(mask, (0, 0), 4).astype(np.float32)[..., None] / 255
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 3.2, im.shape).astype(np.float32)
    return (res * (1 - mf) + (blur + noise) * mf).clip(0, 255).astype(np.uint8)


def cut_out(im, boxes):
    h, w = im.shape[:2]
    m = np.full((h, w), cv2.GC_BGD, np.uint8)
    for b in boxes:
        x0, y0, x1, y1 = b[:4]
        cv2.rectangle(m, (x0 - 8, y0 - 8), (x1 + 8, y1 + 6), int(cv2.GC_PR_FGD), -1)
    for b in boxes:
        x0, y0, x1, y1 = b[:4]
        top = b[4] if len(b) > 4 else 16
        if top >= 10:
            cv2.rectangle(m, (x0 + 14, y0 + top), (x1 - 14, y1 - 20), int(cv2.GC_FGD), -1)
    cv2.fillPoly(m, [PLATFORM], int(cv2.GC_FGD))
    bgm, fgm = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(im, m, None, bgm, fgm, 6, cv2.GC_INIT_WITH_MASK)
    fg = np.where((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    # largest piece only, with small holes closed
    _, lab, st, _ = cv2.connectedComponentsWithStats(fg)
    fg = np.where(lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(255 - fg)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 4000:
            fg[lab == i] = 255
    return fg


def contact_shadow(im, fg):
    """Darken the platform top just around the machine feet."""
    h, w = fg.shape
    plat = np.zeros((h, w), np.uint8)
    cv2.fillPoly(plat, [PLATFORM], 255)
    bodies = fg.copy()
    bodies[plat > 0] = 0                      # machine bodies above the platform
    bodies[:700] = 0                          # only the lower part casts onto the top
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 13))
    shade = cv2.GaussianBlur(cv2.dilate(bodies, k), (0, 0), 7).astype(np.float32) / 255
    shade = np.roll(shade, 6, axis=0)         # light comes from above, shadow falls forward
    top_surface = np.zeros((h, w), np.uint8)
    cv2.fillPoly(top_surface, [np.array([(411, 788), (1295, 786), (1328, 820), (466, 831)], np.int32)], 255)
    shade *= cv2.GaussianBlur(top_surface, (0, 0), 2).astype(np.float32) / 255
    return (im.astype(np.float32) * (1 - 0.38 * shade[..., None])).clip(0, 255).astype(np.uint8)


def depth_of_field(im):
    h, w = im.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # sharp ellipse around the platform, softening towards the workshop edges
    d = np.sqrt(((xx - w * 0.5) / (w * 0.36)) ** 2 + ((yy - h * 0.66) / (h * 0.55)) ** 2)
    wgt = np.clip((d - 0.75) / 0.6, 0, 1)[..., None]
    soft = cv2.GaussianBlur(im, (0, 0), 2.2)
    return (im * (1 - wgt) + soft * wgt).astype(np.uint8)


def to_rgba(im, alpha):
    return Image.fromarray(np.dstack([cv2.cvtColor(im, cv2.COLOR_BGR2RGB), alpha]))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    scenes = {k: remove_text(cv2.imread(str(SRC / f"scene-{k}.png"))) for k in ("before", "after")}
    masks = {k: cut_out(scenes[k], BOXES[k]) for k in scenes}

    # Clean plate: the before scene wherever its machines are absent, the after scene where
    # only the before machines stood, and inpainting where both have machines (always hidden).
    plate = scenes["before"].copy()
    only_before = (masks["before"] > 0) & (masks["after"] == 0)
    plate[only_before] = scenes["after"][only_before]
    both = cv2.dilate(((masks["after"] > 0) & (masks["before"] > 0)).astype(np.uint8) * 255, np.ones((9, 9), np.uint8))
    plate = cv2.inpaint(plate, both, 7, cv2.INPAINT_TELEA)
    # the platform itself is in the foreground layer; replace it in the plate with floor
    plat = np.zeros(plate.shape[:2], np.uint8)
    cv2.fillPoly(plat, [PLATFORM], 255)
    plate = cv2.inpaint(plate, cv2.dilate(plat, np.ones((9, 9), np.uint8)), 7, cv2.INPAINT_TELEA)
    plate = depth_of_field(plate)
    Image.fromarray(cv2.cvtColor(plate, cv2.COLOR_BGR2RGB)).save(OUT / "hero-bg.webp", quality=86, method=6)

    union = cv2.bitwise_or(masks["before"], masks["after"])
    x, y, bw, bh = cv2.boundingRect(union)
    pad = 4
    x, y = max(0, x - pad), max(0, y - pad)
    bw, bh = bw + 2 * pad, bh + 2 * pad
    meta = {"source": [plate.shape[1], plate.shape[0]], "fg_box": [x, y, bw, bh],
            "platform": PLATFORM.tolist()}
    for k in ("before", "after"):
        im = contact_shadow(scenes[k], masks[k])
        a = cv2.erode(masks[k], np.ones((2, 2), np.uint8))
        a = cv2.GaussianBlur(a, (0, 0), 0.7)
        to_rgba(im, a).crop((x, y, x + bw, y + bh)).save(OUT / f"hero-fg-{k}.webp", quality=90, method=6)
    (OUT / "hero-layers.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
