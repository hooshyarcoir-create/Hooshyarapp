#!/usr/bin/env python3
"""Generate the legacy (pre API-26) launcher PNGs without external deps."""
import os
import struct
import zlib

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'android', 'app', 'src', 'main', 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}


def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data +
            struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))


def draw(size):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            nx, ny = x * 108.0 / size, y * 108.0 / size
            radius = 16.0
            dx = max(radius - nx, nx - (108 - radius), 0.0)
            dy = max(radius - ny, ny - (108 - radius), 0.0)
            if dx * dx + dy * dy > radius * radius or not (0 <= nx <= 108 and 0 <= ny <= 108):
                row += bytes((0, 0, 0, 0))
                continue
            t = (nx + ny) / 216.0
            r, g, b = int(246 - 26 * t), int(178 - 62 * t), int(70 + 22 * t)
            # white receipt body
            if 33 <= nx <= 75 and 28 <= ny <= 78:
                if (nx < 38 and ny < 33) or (nx > 70 and ny < 33):
                    pass
                else:
                    r, g, b = 255, 255, 255
                    # zig-zag bottom edge
                    if ny > 75 and (int((nx - 33) / 7) % 2 == 1):
                        r, g, b = int(246 - 26 * t), int(178 - 62 * t), int(70 + 22 * t)
                    # printed lines
                    for ly, x2 in ((44, 66), (53, 66), (62, 58)):
                        if abs(ny - ly) < 1.7 and 42 <= nx <= x2:
                            r, g, b = 43, 33, 24
            row += bytes((r, g, b, 255))
        rows.append(bytes(row))
    return b''.join(b'\x00' + r for r in rows)


def png_bytes(size):
    raw = draw(size)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
            chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


for dens, size in SIZES.items():
    folder = os.path.join(ROOT, 'mipmap-' + dens)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, 'ic_launcher.png'), 'wb') as f:
        f.write(png_bytes(size))
    print('wrote', folder, size)
