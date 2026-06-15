#!/usr/bin/env python3
"""Verwijder de (witte) achtergrond rond een bal-foto, maar behoud het witte
lichaam van de bal zelf. Werkt via floodfill vanuit de hoeken: alleen de met de
rand verbonden achtergrond wordt transparant, niet het ingesloten wit van de bal.

Gebruik:  python3 scripts/remove_bg.py invoer.png archief/wk-bal.png [thresh]
thresh (standaard 40) bepaalt hoe streng het wit-matchen is (hoger = meer weg).
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

def main():
    if len(sys.argv) < 3:
        print("Gebruik: remove_bg.py <invoer> <uitvoer> [thresh]")
        sys.exit(1)
    inp, outp = sys.argv[1], sys.argv[2]
    thresh = int(sys.argv[3]) if len(sys.argv) > 3 else 40

    im = Image.open(inp).convert("RGBA")
    w, h = im.size

    # Floodfill op een kopie: markeer de achtergrond met een onwaarschijnlijke kleur
    marker = (255, 0, 255, 255)
    flood = im.copy()
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
                   (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        try:
            ImageDraw.floodfill(flood, corner, marker, thresh=thresh)
        except Exception:
            pass

    # Bouw een alpha-masker: gemarkeerde pixels = achtergrond → transparant
    src = im.load()
    fl = flood.load()
    alpha = Image.new("L", (w, h), 255)
    al = alpha.load()
    for y in range(h):
        for x in range(w):
            if fl[x, y] == marker:
                al[x, y] = 0

    # Randje verzachten zodat de bal geen harde/gekartelde rand krijgt
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))

    im.putalpha(alpha)

    # Bijsnijden naar de zichtbare bal (transparante rand weg) + klein marge
    bbox = im.getbbox()
    if bbox:
        pad = 4
        bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                min(w, bbox[2] + pad), min(h, bbox[3] + pad))
        im = im.crop(bbox)

    im.save(outp)
    print(f"Klaar: {outp}  ({im.size[0]}x{im.size[1]})  thresh={thresh}")

if __name__ == "__main__":
    main()
