/**
 * Split a changelog sentence into a scannable title + detail for mobile.
 * Prefers an em-dash or colon break so the legal substance stays intact.
 */
export function summarizeChange(change) {
  const text = typeof change === 'string' ? change.trim() : String(change ?? '');
  if (!text) return { title: '', detail: '' };

  const emDash = text.indexOf(' — ');
  const colon = text.indexOf(': ');
  let splitAt = -1;
  let sepLen = 0;

  if (emDash > 0 && emDash <= 90) {
    splitAt = emDash;
    sepLen = 3;
  } else if (colon > 0 && colon <= 90) {
    splitAt = colon;
    sepLen = 2;
  }

  if (splitAt > 0) {
    return {
      title: text.slice(0, splitAt).trim(),
      detail: text.slice(splitAt + sepLen).trim(),
    };
  }

  if (text.length <= 110) {
    return { title: text, detail: '' };
  }

  const soft = text.lastIndexOf(' ', 90);
  const at = soft > 40 ? soft : 90;
  return {
    title: `${text.slice(0, at).trim()}…`,
    detail: text,
  };
}
