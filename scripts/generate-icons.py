"""Regenerate the derived app icons in assets/ from assets/adaptive-icon.png.

Usage: python scripts/generate-icons.py [--fit 0.34]
Needs: pip install pillow numpy

The source is a full-bleed icon on a flat background. The background colour is
sampled from the corner and keyed out to make the transparent layers, so keep
it a single flat colour. Update BACKGROUND in app.json (adaptiveIcon and the
splash plugin) if the source colour changes; the script prints it.
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "assets"
SOURCE = ASSETS / "adaptive-icon.png"
SIZE = 1024
# Android masks the 108dp adaptive canvas down to a 72dp window, so only the
# centre 66% is guaranteed visible. FIT is the radius of the artwork as a
# fraction of the canvas; 1/3 touches the edge of a circular mask.
DEFAULT_FIT = 0.32


def key_layers(rgb, bg):
    diff = np.abs(rgb - bg).max(axis=2)
    alpha = np.clip((diff - 8) / 172, 0, 1)
    colour = np.clip(bg + (rgb - bg) / np.maximum(alpha, 1e-3)[..., None], 0, 255)
    silhouette = np.clip((diff - 35) / 40, 0, 1)
    return colour, alpha, silhouette


def fit_transform(alpha, fit):
    ys, xs = np.where(alpha > 0.5)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    radius = np.hypot(xs - cx, ys - cy).max()
    return cx, cy, fit * SIZE / radius


def place(layer, cx, cy, scale):
    h, w = layer.shape[:2]
    src = Image.fromarray(layer)
    nw, nh = round(w * scale), round(h * scale)
    scaled = src.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new(src.mode, (SIZE, SIZE), (0,) * len(src.getbands()))
    canvas.paste(scaled, (round(SIZE / 2 - cx * scale), round(SIZE / 2 - cy * scale)))
    return canvas


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fit", type=float, default=DEFAULT_FIT)
    fit = parser.parse_args().fit

    src = Image.open(SOURCE).convert("RGB")
    rgb = np.asarray(src).astype(float)
    bg = np.median(rgb[:40, :40].reshape(-1, 3), axis=0)
    colour, alpha, silhouette = key_layers(rgb, bg)
    cx, cy, scale = fit_transform(alpha, fit)

    src.resize((512, 512), Image.LANCZOS).save(ASSETS / "play-store-icon-512.png", optimize=True)

    rgba = np.dstack([colour, alpha * 255]).astype(np.uint8)
    place(rgba, cx, cy, scale).save(ASSETS / "adaptive-icon-foreground.png", optimize=True)

    mono = np.full(rgb.shape[:2] + (4,), 255, np.uint8)
    mono[..., 3] = (silhouette * 255).astype(np.uint8)
    place(mono, cx, cy, scale).save(ASSETS / "adaptive-icon-monochrome.png", optimize=True)

    print("background #%02X%02X%02X" % tuple(int(round(c)) for c in bg))
    print("wrote play-store-icon-512, adaptive-icon-foreground, adaptive-icon-monochrome")


if __name__ == "__main__":
    sys.exit(main())
