"""TermFlow Lite agent critter — pixel-art source of truth.

Built with the pixel-art-studio skill (scripts/pixelstudio.py, Pillow only).
Draws every body pose of the critter in ramp *indices*, previews them in the
Claude orange, then writes `src/renderer/src/components/critterSprites.ts`.
The app recolors the same index maps with the agent's own color at runtime
(hue-shifted ramp, see critterRamp in companionScenes.ts), so Claude Code is
orange and Codex blue with identical shading.

Run:  python art/critter/build.py      (needs Pillow and the pixel-art-studio skill)
Never edit the generated .ts by hand; change this file and rerun.
"""

import json
import os
import sys
from pathlib import Path

SKILL = Path(os.environ.get("PIXEL_ART_STUDIO", Path.home() / ".claude/skills/pixel-art-studio/scripts"))
sys.path.insert(0, str(SKILL))
from pixelstudio import Sprite, ramp  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT_TS = HERE.parents[1] / "src/renderer/src/components/critterSprites.ts"

W, H = 22, 16
# Preview colors: the Claude orange ramp (index 0 = darkest).
RAMP = ramp("#d97757", 5)
OUTLINE = "#2a1a1f"
TOKENS = {OUTLINE: "o", RAMP[0]: "0", RAMP[1]: "1", RAMP[2]: "2", RAMP[3]: "3", RAMP[4]: "4"}

# Body box (inclusive) before squash/stretch: 12 x 9, a chunky square-ish critter.
BX0, BX1, BY0, BY1 = 5, 16, 2, 10
LEGS_X = (7, 9, 12, 14)


def body(s, dy=0, squash=0, arms="side", legs=(0, 0, 0, 0), sit=False):
    """One body pose. squash > 0 = wider & shorter (landing), < 0 = taller (in flight)."""
    x0, x1 = BX0 - max(0, squash), BX1 + max(0, squash)
    y0 = BY0 + dy + max(0, squash) + (2 if sit else 0)
    y1 = BY1 + dy + (2 if sit else 0)
    if squash < 0:
        y0 += squash
    # Legs first so the body overlaps their tops.
    if not sit:
        for i, lx in enumerate(LEGS_X):
            lift = legs[i]
            s.rect(lx, y1 + 1 - lift, lx, y1 + 3 - lift, RAMP[1])
    # Body: midtone fill, rounded corners.
    s.rect(x0, y0, x1, y1, RAMP[2])
    # Rounded corners: 2px on top, 1px at the bottom (it sits on its legs).
    for cx, cy in ((x0, y0), (x1, y0), (x0, y1), (x1, y1), (x0 + 1, y0), (x1 - 1, y0), (x0, y0 + 1), (x1, y0 + 1)):
        s.px(cx, cy, None)
    # Light from top-left: top band + left column lighter, a warm highlight cluster,
    # right column and bottom band in shadow (no pillow shading: the lit side stays light).
    s.rect(x0 + 2, y0, x1 - 2, y0, RAMP[3])
    s.px(x0 + 1, y0 + 1, RAMP[3])
    s.rect(x0, y0 + 2, x0, y1 - 2, RAMP[3])
    s.rect(x0 + 2, y0 + 1, x0 + 4, y0 + 1, RAMP[4])
    s.px(x0 + 1, y0 + 2, RAMP[4])
    s.rect(x1, y0 + 2, x1, y1 - 1, RAMP[1])
    s.rect(x0 + 1, y1, x1 - 1, y1, RAMP[1])
    s.rect(x0 + 2, y1 - 1, x1 - 1, y1 - 1, RAMP[1], only=RAMP[2])
    # Arms: little nubs on the sides, or raised.
    ay = y0 + 3
    if arms == "up":
        s.rect(x0 - 2, y0 - 3, x0 - 1, y0, RAMP[3])
        s.rect(x1 + 1, y0 - 3, x1 + 2, y0, RAMP[2])
    elif arms == "down":
        s.rect(x0 - 2, ay + 2, x0 - 1, ay + 3, RAMP[3])
        s.rect(x1 + 1, ay + 2, x1 + 2, ay + 3, RAMP[1])
    else:
        s.rect(x0 - 2, ay, x0 - 1, ay + 1, RAMP[3])
        s.rect(x1 + 1, ay, x1 + 2, ay + 1, RAMP[1])
    s.outline(OUTLINE, where="outside")
    # Selective outline: on the lit (upper-left) side the line takes the ramp's
    # darkest hue instead of near-black, so the form doesn't look cut out.
    cx_mid = (x0 + x1) / 2
    for y in range(H):
        for x in range(W):
            c = s.get(x, y)
            if c and "#%02x%02x%02x" % c[:3] == OUTLINE and (y <= y0 or (x < cx_mid and y < y1 - 2)):
                s.px(x, y, RAMP[0])
    # Where the eyes sit for this pose (left eye's top-left), for the runtime overlay.
    return {"eyes": [x0 + 3, y0 + 3], "eyeGap": 5}


def preview_eyes(s, eyes, gap):
    """Preview only (not exported): 2x3 dark eyes with a glint, drawn at runtime in the app."""
    for ex in (eyes[0], eyes[0] + gap):
        s.rect(ex, eyes[1], ex + 1, eyes[1] + 2, "#16161c")
        s.px(ex, eyes[1], "#f4f4f4")


POSES = {
    # idle breathing (ping-pong)
    "idle0": dict(),
    "idle1": dict(dy=1, squash=1),
    # 4-frame walk: contact (low) - passing (high) - contact - passing
    "walk0": dict(legs=(1, 0, 1, 0)),
    "walk1": dict(dy=-1, legs=(0, 0, 0, 0)),
    "walk2": dict(legs=(0, 1, 0, 1)),
    "walk3": dict(dy=-1, legs=(0, 0, 0, 0)),
    # hop: crouch (anticipation) - stretch (air) - land (squash)
    "crouch": dict(dy=1, squash=1, arms="down"),
    "air": dict(dy=-1, squash=-1, arms="up", legs=(1, 1, 1, 1)),
    "land": dict(dy=1, squash=1),
    "cheer": dict(dy=-1, arms="up"),
    "sit": dict(sit=True, arms="down"),
}


def export_rows(s, name):
    """The current frame as an index map (before preview-only eyes are drawn)."""
    rows = []
    for y in range(H):
        row = ""
        for x in range(W):
            c = s.get(x, y)
            row += "." if c is None else TOKENS.get("#%02x%02x%02x" % c[:3], "?")
        rows.append(row)
    assert not any("?" in r for r in rows), f"unmapped color in {name}"
    return rows


def main() -> None:
    s = Sprite(W, H)
    meta = {}
    names = list(POSES)
    sprites = {}
    for i, name in enumerate(names):
        if i:
            s.add_frame(copy=False)
        meta[name] = body(s, **POSES[name])
        sprites[name] = {"rows": export_rows(s, name), **meta[name]}
        preview_eyes(s, meta[name]["eyes"], meta[name]["eyeGap"])
    s.set_duration(140, "all")
    s.preview(str(HERE / "preview.png"), scale=8, labels=True, cols=6)
    s.save_gif(str(HERE / "walk.gif"), scale=8, bg="#1e1e1e")
    s.stats()


    ts = [
        "// GENERATED by art/critter/build.py (pixel-art-studio). Do not edit by hand:",
        "// change the build script and rerun `python art/critter/build.py`.",
        "//",
        "// Index maps: '.' transparent, 'o' outline, '0'..'4' the agent color's ramp",
        "// (dark -> light). `eyes` is the left eye's top-left pixel; the right eye is",
        "// `eyeGap` pixels further. Eyes are drawn at runtime so any pose shows any mood.",
        "",
        "export interface CritterSprite {",
        "  rows: string[]",
        "  eyes: [number, number]",
        "  eyeGap: number",
        "}",
        "",
        f"export const CRITTER_W = {W}",
        f"export const CRITTER_H = {H}",
        "",
        "export const CRITTER: Record<string, CritterSprite> = " + json.dumps(sprites, indent=2).replace('"rows"', "rows").replace('"eyes"', "eyes").replace('"eyeGap"', "eyeGap").replace('"', "'"),
        "",
    ]
    OUT_TS.write_text("\n".join(ts), encoding="utf-8")
    print("wrote", OUT_TS)


if __name__ == "__main__":
    main()
