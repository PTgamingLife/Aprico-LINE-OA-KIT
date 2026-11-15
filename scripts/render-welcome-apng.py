"""Welcome-card hero: summoning sigil spins and glows while the secretary materialises.
Usage: python3 scripts/render-welcome-apng.py public/secretaries/secretary-female-v2.png public/summoning-sigil.png public/welcome/welcome-female.png"""
import sys
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

W, H = 600, 338  # 16:9
BG = (0x29, 0x43, 0x37)
GOLD = (0xE7, 0xC5, 0xA8)
FRAMES, MS = 14, 140

sec_src, sigil_src, out = sys.argv[1:4]
sec = Image.open(sec_src).convert('RGBA')
sec = sec.crop(sec.getbbox())
sh = 308
sec = sec.resize((round(sec.width * sh / sec.height), sh), Image.LANCZOS)

# Sigil: use its alpha as line art, recoloured gold, squashed into a floor ellipse.
sig = Image.open(sigil_src).convert('RGBA')
lines = sig.getchannel('A').point(lambda a: min(255, a * 3))
gold = Image.new('RGBA', sig.size, GOLD + (0,))
gold.putalpha(lines)

def sigil_frame(t):
    s = gold.rotate(-t * 360 / FRAMES * 0.5, Image.BICUBIC)  # half a turn per loop
    s = s.resize((360, 124), Image.LANCZOS)  # floor perspective
    glow = s.filter(ImageFilter.GaussianBlur(8))
    return s, glow

def frame(t):
    img = Image.new('RGBA', (W, H), BG + (255,))
    k = min(1, max(0, (t - 1) / 8))
    light = Image.new('L', (W, H), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(light).ellipse([W / 2 - 150, 20, W / 2 + 150, H - 10], fill=int(90 + 80 * k))
    light = light.filter(ImageFilter.GaussianBlur(60))
    img.alpha_composite(Image.merge('RGBA', (*Image.new('RGB', (W, H), GOLD).split(), light)))
    s, glow = sigil_frame(t)
    pulse = 0.55 + 0.45 * abs(((t % 7) / 3.5) - 1)  # breathes twice per loop
    gx, gy = (W - s.width) // 2, H - s.height + 10
    g = glow.copy()
    g.putalpha(g.getchannel('A').point(lambda a: int(a * pulse)))
    img.alpha_composite(g, (gx, gy))
    img.alpha_composite(s, (gx, gy))
    # Secretary: ghost (15%, bright) -> solid over frames 4..14, then holds.
    k = min(1, max(0, (t - 1) / 8))
    body = Image.blend(Image.new('RGBA', sec.size, GOLD + (255,)), sec, 0.25 + 0.75 * k)
    body.putalpha(sec.getchannel('A').point(lambda a: int(a * (0.15 + 0.85 * k))))
    img.alpha_composite(body, ((W - sec.width) // 2, H - sec.height - 16))
    return img.convert('RGB')

frames = [frame(t) for t in range(FRAMES)]
# One shared palette keeps the APNG small and flicker-free.
pal = frames[10].quantize(colors=80, method=Image.Quantize.MEDIANCUT)
q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
durations = [MS] * FRAMES
durations[-1] = 1400  # hold the summoned secretary before looping
q[0].save(out, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True)
import os
print(out, os.path.getsize(out) // 1024, 'KB')
