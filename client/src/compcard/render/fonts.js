/**
 * The card type library. Self-hosted (Fontsource): the preview and the print
 * master set identical glyphs with no network dependency.
 *
 * Sixteen families, chosen for range rather than quantity — each has a job
 * the others can't do. `typefaces.js` describes their voices and how they
 * are cast together; directions never reach for a family directly.
 */
// Display serifs
import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource-variable/bodoni-moda/opsz-italic.css';
import '@fontsource/dm-serif-display/400.css';
import '@fontsource/dm-serif-display/400-italic.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/cormorant-garamond/wght.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource/gloock/400.css';
import '@fontsource/italiana/400.css';
// Sans
import '@fontsource-variable/inter-tight/wght.css';
import '@fontsource-variable/inter-tight/wght-italic.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
import '@fontsource-variable/hanken-grotesk/wght-italic.css';
import '@fontsource-variable/schibsted-grotesk/wght.css';
import '@fontsource-variable/archivo/standard.css';
import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource-variable/syne/wght.css';
import '@fontsource-variable/instrument-sans/standard.css';
import '@fontsource-variable/instrument-sans/standard-italic.css';
// Mono
import '@fontsource-variable/martian-mono/standard.css';

// Glyphs some faces lack (′ ″ ½) fall to a face that has them and sits close.
const SANS_FB = "'Inter Tight Variable', 'Bricolage Grotesque Variable', sans-serif";
const SERIF_FB = "'Newsreader Variable', 'Bodoni Moda Variable', serif";

export const FAMILY = {
  bodoni: `'Bodoni Moda Variable', ${SERIF_FB}`,
  dmserif: `'DM Serif Display', ${SERIF_FB}`,
  instrument: `'Instrument Serif', ${SERIF_FB}`,
  fraunces: `'Fraunces Variable', ${SERIF_FB}`,
  cormorant: `'Cormorant Garamond Variable', ${SERIF_FB}`,
  newsreader: `'Newsreader Variable', 'Bodoni Moda Variable', serif`,
  gloock: `'Gloock', ${SERIF_FB}`,
  italiana: `'Italiana', ${SERIF_FB}`,
  inter: `'Inter Tight Variable', 'Bricolage Grotesque Variable', sans-serif`,
  hanken: `'Hanken Grotesk Variable', ${SANS_FB}`,
  schibsted: `'Schibsted Grotesk Variable', ${SANS_FB}`,
  archivo: `'Archivo Variable', ${SANS_FB}`,
  bricolage: `'Bricolage Grotesque Variable', 'Inter Tight Variable', sans-serif`,
  syne: `'Syne Variable', ${SANS_FB}`,
  isans: `'Instrument Sans Variable', ${SANS_FB}`,
  mono: `'Martian Mono Variable', 'Inter Tight Variable', monospace`,
};

const PROBES = [
  "400 40px 'Bodoni Moda Variable'", "italic 400 40px 'Bodoni Moda Variable'", "500 40px 'Bodoni Moda Variable'",
  "400 40px 'DM Serif Display'", "italic 400 40px 'DM Serif Display'",
  "400 40px 'Instrument Serif'", "italic 400 40px 'Instrument Serif'",
  "400 40px 'Fraunces Variable'", "italic 300 40px 'Fraunces Variable'", "600 40px 'Fraunces Variable'",
  "300 40px 'Cormorant Garamond Variable'", "italic 300 40px 'Cormorant Garamond Variable'", "500 40px 'Cormorant Garamond Variable'",
  "400 40px 'Newsreader Variable'", "italic 400 40px 'Newsreader Variable'",
  "400 40px 'Gloock'", "400 40px 'Italiana'",
  "400 40px 'Inter Tight Variable'", "600 40px 'Inter Tight Variable'", "300 40px 'Inter Tight Variable'",
  "400 40px 'Hanken Grotesk Variable'", "500 40px 'Hanken Grotesk Variable'",
  "400 40px 'Schibsted Grotesk Variable'", "700 40px 'Schibsted Grotesk Variable'",
  "400 40px 'Archivo Variable'", "condensed 800 40px 'Archivo Variable'", "extra-condensed 900 40px 'Archivo Variable'",
  "400 40px 'Bricolage Grotesque Variable'", "700 40px 'Bricolage Grotesque Variable'",
  "800 40px 'Syne Variable'", "500 40px 'Syne Variable'",
  "400 40px 'Instrument Sans Variable'", "600 40px 'Instrument Sans Variable'",
  "400 40px 'Martian Mono Variable'", "semi-condensed 400 40px 'Martian Mono Variable'",
];

let ready = null;
const loadedText = new Set();
/**
 * Resolves once the library is loaded (needed before measuring). Pass the
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
