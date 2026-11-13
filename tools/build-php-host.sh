#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/release/php-host"
ZIP="$ROOT/release/hooshyar-php-host.zip"
rm -rf "$OUT"
mkdir -p "$OUT/public" "$OUT/private"
cp -a "$ROOT/webapp/." "$OUT/public/"
cp "$ROOT/backend/php/public/index.php" "$OUT/public/index.php"
cp "$ROOT/backend/php/public/.htaccess" "$OUT/public/.htaccess"
cp "$ROOT/backend/php/api.php" "$OUT/public/api.php"
cp "$ROOT/backend/php/config.example.php" "$OUT/private/config.php"
cp "$ROOT/backend/php/README.md" "$OUT/README-PHP.md"
python3 - "$OUT" "$ZIP" <<'PY'
import pathlib, sys, zipfile
root, archive = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
archive.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=7) as z:
    for path in root.rglob('*'):
        if path.is_file(): z.write(path, path.relative_to(root.parent))
print(f'Created {archive} ({archive.stat().st_size:,} bytes)')
PY
printf 'Upload public/ as the PHP document root and keep private/ one directory above it.\n'
printf 'Edit private/config.php before uploading; never publish database passwords in public/.\n'
