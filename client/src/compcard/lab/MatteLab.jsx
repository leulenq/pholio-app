// Development harness (compcard.html?lab=matte): matting quality check.
import { useEffect, useState } from 'react';
import { matteImage } from '../perception/matte';

const SRCS = (new URLSearchParams(location.search).get('imgs') || 'c/25,c/21,c/35,c/26,c/18,c/13').split(',').map((s) => `/compcard-lab/${s}.img`);

export default function MatteLab() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    (async () => {
      const out = [];
      for (const src of SRCS) {
        const t = performance.now();
        try {
          const m = await matteImage(src);
          out.push({ src, m, ms: Math.round(performance.now() - t) });
        } catch (e) {
          out.push({ src, err: e.message });
        }
        setRows([...out]);
      }
      window.__labDone = out.map((r) => ({ src: r.src, ms: r.ms, err: r.err, cov: r.m?.coverage }));
    })();
  }, []);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12, background: '#fff' }}>
      {rows.map((r) => (
        <div key={r.src} style={{ font: '11px monospace' }}>
          {r.err ? <div>{r.err}</div> : (
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ width: 460, height: 460 * (r.m.height / r.m.width), background: '#C8553D', position: 'relative' }}>
                <img src={r.m.url} style={{ width: '100%', height: '100%', display: 'block' }} />
              </div>
            </div>
          )}
          <div>{r.src.split('/').pop()} {r.ms}ms</div>
        </div>
      ))}
    </div>
  );
}
