/**
 * Card typefaces. Self-hosted (Fontsource) so the preview and the print
 * master set identical glyphs with no network dependency.
 *
 *  bodoni    Bodoni Moda (opsz)        mastheads, italic names, foil
 *  archivo   Archivo (wdth 62–125)     spaced show caps, compressed letters
 *  noto      Noto Serif Display        the spine, the wordmark
 *  mono      JetBrains Mono            digitals
 *  inter     Inter                     booking lines
 */
import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource-variable/bodoni-moda/opsz-italic.css';
import '@fontsource-variable/archivo/standard.css';
import '@fontsource-variable/noto-serif-display/standard.css';
import '@fontsource-variable/noto-serif-display/standard-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/inter/opsz.css';

export const FAMILY = {
  bodoni: "'Bodoni Moda Variable', 'Noto Serif Display Variable', serif",
  archivo: "'Archivo Variable', 'Inter Variable', sans-serif",
  noto: "'Noto Serif Display Variable', 'Bodoni Moda Variable', serif",
  mono: "'JetBrains Mono Variable', 'Inter Variable', monospace",
  inter: "'Inter Variable', 'Archivo Variable', sans-serif",
};

const PROBES = [
  "400 40px 'Bodoni Moda Variable'", "500 40px 'Bodoni Moda Variable'", "italic 400 40px 'Bodoni Moda Variable'",
  "500 40px 'Archivo Variable'", "700 40px 'Archivo Variable'", "extra-condensed 900 40px 'Archivo Variable'",
  "300 40px 'Noto Serif Display Variable'", "400 40px 'Noto Serif Display Variable'", "italic 400 40px 'Noto Serif Display Variable'",
  "400 40px 'JetBrains Mono Variable'", "500 40px 'JetBrains Mono Variable'",
  "400 40px 'Inter Variable'", "500 40px 'Inter Variable'",
];

let ready = null;
const loadedText = new Set();
/**
 * Resolves once every face is loaded (needed before measuring). Pass the
 * card's own text so accented / extended-Latin subsets load first.
 */
export function fontsReady(text = '') {
  if (!ready) {
    const sample = 'AaBbHhÉé0123456789′″·—½';
    ready = Promise.all(PROBES.map((f) => document.fonts.load(f, sample).catch(() => null))).then(() => document.fonts.ready);
  }
  const extra = [...new Set(String(text))].filter((ch) => ch.charCodeAt(0) > 127 && !loadedText.has(ch)).join('');
  if (!extra) return ready;
  for (const ch of extra) loadedText.add(ch);
  return ready.then(() => Promise.all(PROBES.map((f) => document.fonts.load(f, extra).catch(() => null)))).then(() => document.fonts.ready);
}
