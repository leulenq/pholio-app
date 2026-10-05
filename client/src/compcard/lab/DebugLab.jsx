// Development harness (compcard.html?lab=…); not shipped in the print entry.
import { useEffect } from 'react';
import { analyzeImage } from '../perception/analyze';
import { buildPool } from '../model/curate';
import { BATTERY } from './battery';

export default function DebugLab() {
  useEffect(() => {
    (async () => {
      const fx = new URLSearchParams(location.search).get('fx') || 'messy';
      const imgs = [];
      for (const im of BATTERY[fx].images) {
        const p = await analyzeImage(im.src);
        imgs.push({ ...im, width: p.width, height: p.height, perception: p });
      }
      const pool = buildPool(imgs);
      window.__labDone = pool.map((p) => ({ id: p.id, q: +p.quality.toFixed(2), flags: p.flags, framing: p.subject.framing, calm: p.subject.calm?.toFixed(2), face: p.subject.face && { size: +p.subject.face.size.toFixed(2), yaw: +p.subject.face.yaw.toFixed(2), eye: p.subject.face.eyeOpen, fromPose: p.subject.face.fromPose }, people: p.subject.people, aspect: +p.subject.aspect.toFixed(2) }));
      window.__labDone.dupes = pool.duplicates;
      console.log(JSON.stringify({ pool: window.__labDone, dupes: pool.duplicates }));
    })();
  }, []);
  return null;
}
