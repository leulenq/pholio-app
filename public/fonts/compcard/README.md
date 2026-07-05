# Comp card font library (vendored)

Static TTF instances of the composition engine's curated font library
(`src/domains/pdf/composition/font-library.js`), downloaded from Google Fonts
by `scripts/fetch-compcard-fonts.js`.

They serve two jobs:

1. **Measurement** — `composition/perception/font-files.js` parses them with
   opentype.js so name sizing uses real glyph advances, not estimates.
2. **Rendering** — the comp card templates `@font-face` these files locally,
   so PDF output does not depend on the fonts CDN at draw time.

All families are licensed under the SIL Open Font License 1.1 (Inter, Archivo,
Manrope, Playfair Display, Bodoni Moda, Cormorant Garamond, Fraunces,
Marcellus, Italiana, Noto Serif Display). The OFL permits bundling and
redistribution with software. Full license texts: https://openfontlicense.org
and each family's page on https://fonts.google.com.
