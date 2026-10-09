// Development harness: cutouts cached in IndexedDB across reloads.
import { matteImage } from '../perception/matte';

const DB = 'compcard-mattes';
const VERSION = 2; // bump when matte.js output changes

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('m');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function get(key) {
  const db = await open();
  return new Promise((res) => {
    const t = db.transaction('m').objectStore('m').get(key);
    t.onsuccess = () => res(t.result || null);
    t.onerror = () => res(null);
  });
}
async function put(key, v) {
  const db = await open();
  return new Promise((res) => {
    const t = db.transaction('m', 'readwrite').objectStore('m').put(v, key);
    t.onsuccess = () => res();
    t.onerror = () => res();
  });
}

export async function cutoutFor(src) {
  const key = `${VERSION}:${src}`;
  const hit = await get(key);
  if (hit) return hit;
  const m = await matteImage(src);
  await put(key, m);
  return m;
}
