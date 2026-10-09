import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ArrowDown, ArrowLeft } from 'lucide-react';
import { getTalentDossier } from '../api/agency';
import { useTalentActions } from '../hooks/useTalentActions';
import { ago, date, readSitting, src } from './read';
import { Viewer } from './Viewer';
import { Actions, Record } from './Agency';
import './profile.css';

/**
 * The talent profile — set the way a great agency sets a model page.
 * The cover is the photograph and the name; the book is laid like magazine
 * pages; everything else is type, composed and quiet.
 */

const HALTS = {
  410: ['This submission was withdrawn', 'The talent withdrew it, and access to what they sent was revoked with it.'],
  403: ['Guardian authorisation required', 'This talent is under 18. A current guardian authorisation and your permission to view minors are both needed first.'],
  404: ['Not found', 'This profile may have been removed, or it belongs to another agency.'],
};

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };
const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-8% 0px' },
  transition: { ...SPRING, delay },
});

/* ── photographs ─────────────────────────────────────────────────────── */

function Photo({ img, onOpen, className = '', ratio, onRatio, eager = false }) {
  const [state, setState] = useState('wait');
  if (state === 'gone') return null;
  return (
    <button
      type="button"
      className={`pf-photo ${className}${state === 'in' ? ' is-in' : ''}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
      onClick={onOpen}
      aria-label="Open photograph"
    >
      <img
        src={src(img)}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        onLoad={(e) => {
          setState('in');
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
          if (w && h) onRatio?.(img.id, w / h);
        }}
        onError={() => setState('gone')}
      />
    </button>
  );
}

/**
 * Lays the book out as spreads: a large frame against a smaller one, a run of
 * three, a single frame given room, then the first spread mirrored.
 */
function spreads(frames, ratios) {
  const cycle = ['pair', 'trio', 'solo', 'pairR'];
  const out = [];
  let i = 0;
  let c = 0;
  while (i < frames.length) {
    let kind = cycle[c % cycle.length];
    const left = frames.length - i;
    if (kind === 'trio' && left < 3) kind = left === 2 ? 'pair' : 'solo';
    if ((kind === 'pair' || kind === 'pairR') && left < 2) kind = 'solo';
    const take = kind === 'trio' ? 3 : kind === 'solo' ? 1 : 2;
    const items = frames.slice(i, i + take);
    out.push({ kind, items, wide: kind === 'solo' && (ratios[items[0].id] || 0.75) > 1.1 });
    i += take;
    c += 1;
  }
  return out;
}

function Book({ frames, onOpen }) {
  const [ratios, setRatios] = useState({});
  const onRatio = (id, r) => setRatios((p) => (p[id] ? p : { ...p, [id]: r }));
  const rows = spreads(frames, ratios);
  return (
    <div className="pf-book">
      {rows.map((row, r) => (
        <motion.div key={r} className={`pf-spread pf-spread--${row.kind}${row.wide ? ' is-wide' : ''}`} {...rise()}>
          {row.items.map((img) => (
            <Photo key={img.id} img={img} onOpen={() => onOpen(img)} onRatio={onRatio} />
          ))}
        </motion.div>
      ))}
    </div>
  );
}

/* ── the page ────────────────────────────────────────────────────────── */

export default function TalentProfile() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const actions = useTalentActions(applicationId);
  const [viewing, setViewing] = useState(null);
  const [past, setPast] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['talent-dossier', applicationId],
    queryFn: () => getTalentDossier(applicationId),
    enabled: Boolean(applicationId),
    retry: (count, err) => ![403, 404, 410].includes(err?.status) && count < 2,
  });
  const s = useMemo(() => (data ? readSitting(data) : null), [data]);

  useEffect(() => {
    const on = () => setPast(window.scrollY > window.innerHeight * 0.7);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard/agency/submissions'));
  const to = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (isLoading) return <div className="pf pf--wait" aria-busy="true" aria-label="Loading" />;

  if (error || !s) {
    const [title, body] = HALTS[error?.status] || ['This profile could not be opened', error?.message || 'Try again in a moment.'];
    return (
      <div className="pf pf--halt">
        <button type="button" className="pf-back" onClick={back}><ArrowLeft size={16} strokeWidth={1.25} aria-hidden /> Back</button>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    );
  }

  const { hero, book, slots } = s.frames;
  const pages = book.filter((img) => img !== hero);
  const digitals = slots.filter((x) => x.frame);
  const order = [hero, ...pages, ...digitals.map((d) => d.frame)].filter((img, i, a) => img && a.indexOf(img) === i);
  const open = (img) => setViewing(Math.max(0, order.indexOf(img)));

  const b = s.body;
  const stats = [
    b.heightCm && { k: 'Height', v: b.heightCm, u: 'cm', alt: b.heightImperial },
    ...b.measures.map((m) => ({ k: m.label, v: m.cm, u: 'cm', alt: m.inches ? `${m.inches}″` : null })),
    ...b.sizes.filter((z) => z.label === 'Dress' || z.label === 'Suit' || z.label === 'Shoe').map((z) => ({ k: z.label, v: z.value })),
  ].filter(Boolean);

  const rep = s.representation;
  const mother = rep.lines.find((l) => l.role === 'Mother agency' && l.active);
  const repLine = mother
    ? `${mother.who === 'Name not shared' ? 'Mother agency' : mother.who}${mother.where ? `, ${mother.where}` : ''}`
    : rep.headline;
  const nextAway = s.calendar.spans[0];
  const availLine = s.calendar.status
    ? `${s.calendar.status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}${nextAway ? ` · next away ${date(nextAway.from, { month: 'short', day: 'numeric' })}` : ''}`
    : null;
  const where = [s.place, s.nationality, s.minor ? 'Under 18' : s.age].filter((x) => x != null && x !== '');

  const chapters = [
    pages.length && ['pf-book', 'Book'],
    digitals.length && ['pf-digitals', 'Digitals'],
    ['pf-about', 'Profile'],
    ['pf-agency', 'Notes'],
  ].filter(Boolean);

  return (
    <MotionConfig reducedMotion="user">
      <div className="pf">
        <header className={`pf-bar${past ? ' is-solid' : ''}`}>
          <button type="button" className="pf-back" onClick={back}><ArrowLeft size={16} strokeWidth={1.25} aria-hidden /> <span>Back</span></button>
          <AnimatePresence>
            {past && (
              <motion.nav
                className="pf-bar__mid"
                aria-label="Sections"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="pf-bar__name">{s.name.full}</span>
                {chapters.map(([id, label]) => (
                  <button key={id} type="button" onClick={() => to(id)}>{label}</button>
                ))}
              </motion.nav>
            )}
          </AnimatePresence>
          <Actions s={s} actions={actions} />
        </header>

        {/* ── Cover ── */}
        <section className="pf-cover">
          <div className="pf-cover__photo">
            {hero && (
              <motion.button
                type="button"
                onClick={() => open(hero)}
                aria-label="Open photographs"
                initial={{ scale: 1.08, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <img src={src(hero)} alt={s.name.full} />
              </motion.button>
            )}
          </div>

          <div className="pf-cover__type">
            {where.length > 0 && (
              <motion.p className="pf-cover__where" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }}>
                {where.join('   ·   ')}
              </motion.p>
            )}
            <h1 className="pf-name" aria-label={s.name.full}>
              <span className="pf-mask"><motion.span initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ ...SPRING, delay: 0.2 }}>{s.name.first}</motion.span></span>
              {s.name.last && <span className="pf-mask"><motion.span initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ ...SPRING, delay: 0.32 }}>{s.name.last}</motion.span></span>}
            </h1>

            {s.identity.disputed && (
              <p className="pf-cover__alert">The person behind this email says they did not submit this application.</p>
            )}

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.55 }}>
              {stats.length > 0 ? (
                <dl className="pf-stats">
                  {stats.map((x) => (
                    <div key={x.k}>
                      <dt>{x.k}</dt>
                      <dd>{x.v}{x.u && <small>{x.u}</small>}</dd>
                      {x.alt && <span>{x.alt}</span>}
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="pf-soft">{s.minor ? 'Measurements are withheld for an under-18 talent.' : 'No measurements given.'}</p>
              )}
              <div className="pf-cover__lines">
                <p><span>Representation</span>{repLine}</p>
                {availLine && <p><span>Availability</span>{availLine}</p>}
              </div>
            </motion.div>

            {pages.length > 0 && (
              <button type="button" className="pf-cover__more" onClick={() => to('pf-book')}>
                {pages.length + digitals.length} photographs <ArrowDown size={14} strokeWidth={1.25} aria-hidden />
              </button>
            )}
          </div>
        </section>

        {/* ── Book ── */}
        {pages.length > 0 && (
          <section id="pf-book" className="pf-section">
            <motion.header className="pf-head" {...rise()}>
              <h2>Book</h2>
              <span>{pages.length} photographs</span>
            </motion.header>
            <Book frames={pages} onOpen={open} />
          </section>
        )}

        {/* ── Digitals ── */}
        {digitals.length > 0 && (
          <section id="pf-digitals" className="pf-section">
            <motion.header className="pf-head" {...rise()}>
              <h2>Digitals</h2>
              <span>Unretouched{digitals[0].frame.captured_at ? ` · shot ${ago(digitals.map((d) => d.frame.captured_at).filter(Boolean).sort().pop())}` : ''}</span>
            </motion.header>
            <div className="pf-digitals" style={{ '--n': digitals.length }}>
              {digitals.map((d, i) => (
                <motion.figure key={d.key} {...rise(i * 0.06)}>
                  <Photo img={d.frame} onOpen={() => open(d.frame)} ratio="3 / 4" />
                  <figcaption>{d.label}</figcaption>
                </motion.figure>
              ))}
            </div>
          </section>
        )}

        {/* ── Profile ── */}
        <section id="pf-about" className="pf-section pf-about">
          <motion.div className="pf-about__lead" {...rise()}>
            <h2>{s.name.first}</h2>
            {s.bio ? <p className="pf-bio">{s.bio}</p> : <p className="pf-soft">No biography yet.</p>}
          </motion.div>
          <motion.div className="pf-about__facts" {...rise(0.08)}>
            <Group title="Measurements" rows={[
              ['Height', b.heightCm && `${b.heightCm} cm · ${b.heightImperial || ''}`],
              ...b.measures.map((m) => [m.label, `${m.cm} cm${m.inches ? ` · ${m.inches}″` : ''}`]),
              ...b.sizes.map((z) => [z.label, z.value]),
              ['Hair', b.hair], ['Eyes', b.eyes],
            ]} note={(b.heightCm || b.measures.length) ? `Self-reported${b.updated ? `, updated ${ago(b.updated)}` : ''}` : null} />
            <Group title="Work" rows={[
              ['Discipline', s.discipline], ['Experience', s.level], ...s.particulars,
              ['Languages', s.languages.join(', ')], ['Also works from', s.secondBase],
            ]} />
            <Group title="Representation" rows={rep.lines.length
              ? rep.lines.map((l) => [l.role, `${l.who}${l.exclusive ? ', exclusive' : ''}${l.where ? ` — ${l.where}` : ''}${l.active ? (l.since ? `, since ${date(l.since, { month: 'short', year: 'numeric' })}` : '') : ' (ended)'}`])
              : [['Status', rep.headline]]} />
            <Group title="Availability" rows={[
              ['Now', availLine || 'Not stated'],
              ...s.calendar.spans.map((x) => [
                `${date(x.from, { month: 'short', day: 'numeric' })}${x.to && x.to !== x.from ? ` – ${date(x.to, { month: 'short', day: 'numeric' })}` : ''}`,
                x.kind === 'bookout' ? `Away · ${x.label}` : x.label,
              ]),
            ]} />
            <Group title="Contact" rows={[
              ['Email', s.contact?.email && <a href={`mailto:${s.contact.email}`}>{s.contact.email}</a>],
              ['Phone', s.contact?.phone && <a href={`tel:${s.contact.phone}`}>{s.contact.phone}</a>],
              ...s.socials.map((x) => [x.platform.replace(/^\w/, (c) => c.toUpperCase()), <a key={x.platform} href={x.url || '#'} target="_blank" rel="noreferrer">{x.handle ? `@${String(x.handle).replace(/^@/, '')}` : 'Open'}</a>]),
              ['Comp card', s.compCard && <a href={s.compCard.viewUrl} target="_blank" rel="noreferrer">View</a>],
            ]} />
          </motion.div>
        </section>

        {/* ── Your agency ── */}
        <section id="pf-agency" className="pf-section pf-agency">
          <motion.header className="pf-head" {...rise()}>
            <h2>Your agency</h2>
            <span>Only your team sees this</span>
          </motion.header>
          <Record s={s} applicationId={applicationId} />
        </section>

        <AnimatePresence>
          {viewing !== null && order.length > 0 && <Viewer frames={order} start={viewing} onClose={() => setViewing(null)} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function Group({ title, rows, note }) {
  const shown = rows.filter(([, v]) => v != null && v !== '' && v !== false);
  if (!shown.length) return null;
  return (
    <div className="pf-group">
      <h3>{title}</h3>
      <dl>
        {shown.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {note && <p className="pf-soft">{note}</p>}
    </div>
  );
}
