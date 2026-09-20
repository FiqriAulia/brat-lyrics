#!/usr/bin/env python3
"""Brat-style lyric video generator.

Usage:
  python3 brat_lyrics.py search.json -o out.mp4
  python3 brat_lyrics.py search.json --index 1 --audio song.mp3 --size 1080x1920
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Narrow.ttf",
    "/Library/Fonts/Arial Narrow.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]
LINE_RE = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)")


def parse_synced(synced, duration):
    """[(start_sec, end_sec, text)] from LRC; empty lines only mark end times."""
    raw = []
    for line in synced.splitlines():
        m = LINE_RE.match(line)
        if m:
            raw.append((int(m[1]) * 60 + float(m[2]), m[3].strip()))
    out = []
    for i, (start, text) in enumerate(raw):
        end = raw[i + 1][0] if i + 1 < len(raw) else duration
        if text and end > start:
            out.append((start, end, text))
    return out


def find_font(path):
    for p in [path] if path else FONT_CANDIDATES:
        if p and Path(p).exists():
            return p
    sys.exit("Font tidak ketemu, pakai --font /path/ke/font.ttf")


def wrap(draw, text, font, max_w):
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if cur and draw.textlength(trial, font=font) > max_w:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def render_card(text, w, h, args, font_path):
    img = Image.new("RGB", (w, h), args.bg)
    if not text:
        return img
    text = text.lower()
    draw = ImageDraw.Draw(img)
    box_w, box_h = w * 0.86, h * 0.80
    lo, hi = 20, int(min(w, h) * 0.5)
    best = None
    while lo <= hi:  # largest font size whose wrapped text fits the box
        mid = (lo + hi) // 2
        font = ImageFont.truetype(font_path, mid)
        lines = wrap(draw, text, font, box_w)
        line_h = mid * 1.05
        widest = max(draw.textlength(l, font=font) for l in lines)
        if len(lines) * line_h <= box_h and widest <= box_w:
            best = (font, lines, line_h)
            lo = mid + 1
        else:
            hi = mid - 1
    font, lines, line_h = best or (ImageFont.truetype(font_path, 20), [text], 21)
    size = font.size
    # cap so short lines don't become absurdly huge
    cap = int(min(w, h) * args.max_font)
    if size > cap:
        font = ImageFont.truetype(font_path, cap)
        lines = wrap(draw, text, font, box_w)
        line_h = cap * 1.05
    total_h = len(lines) * line_h
    y = (h - total_h) / 2 if args.valign == "middle" else h * 0.08

    layer = Image.new("L", (w, h), 0)
    ld = ImageDraw.Draw(layer)
    x0 = w * 0.07
    for i, line in enumerate(lines):
        ld.text((x0, y + i * line_h), line, font=font, fill=255)
    layer = layer.filter(ImageFilter.GaussianBlur(args.blur * font.size / 100))
    ink = Image.new("RGB", (w, h), args.fg)
    img.paste(ink, (0, 0), layer)
    return img


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("json")
    ap.add_argument("-o", "--output", default="lyrics.mp4")
    ap.add_argument("--index", type=int, default=0, help="item ke-berapa di JSON")
    ap.add_argument("--audio", help="file audio opsional")
    ap.add_argument("--size", default="1080x1080", help="WxH, mis. 1080x1920 untuk vertikal")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--bg", default="#8ACE00")
    ap.add_argument("--fg", default="#000000")
    ap.add_argument("--blur", type=float, default=2.2, help="blur, %% dari ukuran font")
    ap.add_argument("--max-font", type=float, default=0.22, help="ukuran font maks (rasio sisi terpendek)")
    ap.add_argument("--valign", choices=["middle", "top"], default="middle")
    ap.add_argument("--font")
    ap.add_argument("--start", type=float, default=0, help="mulai dari detik ke-n")
    ap.add_argument("--end", type=float, help="berhenti di detik ke-n")
    args = ap.parse_args()

    w, h = map(int, args.size.lower().split("x"))
    font_path = find_font(args.font)
    data = json.load(open(args.json))
    item = data[args.index] if isinstance(data, list) else data
    lines = parse_synced(item["syncedLyrics"], item["duration"])
    if not lines:
        sys.exit("Tidak ada syncedLyrics")
    print(f"{item['trackName']} - {item['artistName']}: {len(lines)} baris")

    # timeline: (duration, text) segments including gaps, clipped to [start, end]
    total = args.end if args.end else item["duration"]
    segs, t = [], 0.0
    for s, e, text in lines:
        if s > t:
            segs.append((t, s, ""))
        segs.append((s, e, text))
        t = e
    if t < total:
        segs.append((t, total, ""))
    segs = [(max(a, args.start), min(b, total), x) for a, b, x in segs if b > args.start and a < total]

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        concat = []
        for i, (a, b, text) in enumerate(segs):
            p = tmp / f"{i:04d}.png"
            render_card(text, w, h, args, font_path).save(p)
            concat.append(f"file '{p}'\nduration {b - a:.3f}")
        concat.append(f"file '{tmp / f'{len(segs) - 1:04d}.png'}'")  # concat demuxer quirk
        (tmp / "list.txt").write_text("\n".join(concat))

        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt")]
        if args.audio:
            cmd += ["-ss", str(args.start), "-i", args.audio]
        cmd += ["-t", f"{total - args.start:.3f}"]
        cmd += ["-vf", f"fps={args.fps},format=yuv420p", "-c:v", "libx264", "-crf", "18"]
        if args.audio:
            cmd += ["-c:a", "aac", "-b:a", "192k", "-shortest"]
        cmd += [args.output]
        subprocess.run(cmd, check=True)
    print("Selesai ->", args.output)


if __name__ == "__main__":
    main()
