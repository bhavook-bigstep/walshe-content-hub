# Seed catalog images

Drop **real images** here to control exactly what the seeded catalog shows. At seed time the demo
uses, in priority order:

1. an image you placed here, else
2. a curated scenic stock photo (only when `SEED_FETCH_PHOTOS=1`), else
3. a drawn, labelled placeholder scene.

## How to provide images

For each catalog entry (see `MANIFEST.md`), create files under its slug folder:

```
seed-assets/catalog/<slug>/cover.jpg     # the card banner (portrait ~1080x1350 works best)
seed-assets/catalog/<slug>/photo-1.jpg   # a gallery image (square ~1080x1080)
seed-assets/catalog/<slug>/photo-2.jpg   # a gallery image (square ~1080x1080)
```

Accepted extensions: `.jpg`, `.jpeg`, `.png`, `.webp`. Any missing file falls back automatically,
so you can provide just the covers, or all three per entry. Re-run the dev launcher (or
`make seed`) to pick them up. You can also point elsewhere with `SEED_ASSETS_DIR=/abs/path`.
