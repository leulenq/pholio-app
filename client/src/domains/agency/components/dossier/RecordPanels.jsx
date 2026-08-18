import React from 'react';
import { Fact, Ledger, Quiet } from './DossierPrimitives';
import {
  fmtDate,
  representationLineText,
  representationRead,
  titleCase,
} from './dossierModel';
import './dossier.css';

/**
 * The Representation Record — the relationship map, not a status word.
 *
 * A model is commonly developed by a mother agency and placed non-exclusively
 * across markets. "Represented" alone tells a booker nothing; which agency
 * holds the mother relationship, in which market, and whether anything is
 * exclusive tells them whether a conversation is even possible. Names appear
 * only where the talent chose to disclose them.
 */
export function RepresentationRecord({ representation }) {
  const rep = representationRead(representation);
  const lines = rep.all || [];

  if (lines.length === 0) {
    return (
      <>
        <p className="dx-rep__head">{rep.headline}</p>
        <Quiet>{rep.detail}</Quiet>
      </>
    );
  }

  return (
    <div className="dx-rep">
      <p className="dx-rep__head">
        {rep.headline}
        {rep.status === 'exclusive_elsewhere' && (
          <span className="dx-rep__warn">Exclusive — a placement needs releasing first</span>
        )}
      </p>
      <ul className="dx-rep__list">
        {lines.map((line, i) => {
          const t = representationLineText(line);
          const ended = line.status === 'ended';
          return (
            <li key={`${t.kind}-${t.who}-${i}`} className={`dx-rep__row${ended ? ' is-ended' : ''}`}>
              <span className="dx-rep__kind">{t.kind}</span>
              <span className="dx-rep__who">
                {t.who}
                {t.exclusive && <em className="dx-rep__excl">exclusive</em>}
              </span>
              <span className="dx-rep__scope">{t.scope || '—'}</span>
              <span className="dx-rep__when">
                {ended
                  ? `ended ${fmtDate(line.ended_on) || '—'}`
                  : line.started_on
                    ? `since ${fmtDate(line.started_on)}`
                    : 'active'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const EXPERIENCE_LABELS = {
  new_face: 'New face',
  beginner: 'New face',
  developing: 'Developing',
  intermediate: 'Working',
  experienced: 'Experienced',
  professional: 'Established',
  advanced: 'Established',
};

/**
 * The Professional Record — everything about the working person that is not a
 * measurement: what they are trained for, what they can be booked for, where
 * they can travel, and what limits their casting.
 */
export function ProfessionalRecord({ talent }) {
  const pro = talent?.professional || {};
  const playingAge =
    pro.playing_age_min && pro.playing_age_max
      ? `${pro.playing_age_min}–${pro.playing_age_max}`
      : pro.playing_age_min || pro.playing_age_max || null;

  const facts = [
    { label: 'Discipline', value: pro.discipline ? titleCase(pro.discipline) : null },
    {
      label: 'Level',
      value: pro.experience_level
        ? EXPERIENCE_LABELS[pro.experience_level] || titleCase(pro.experience_level)
        : null,
    },
    { label: 'Specialties', value: [...(pro.specialties || []), ...(pro.specializations || [])] },
    { label: 'Training', value: pro.training },
    { label: 'Languages', value: talent?.languages?.length ? talent.languages : pro.languages },
    { label: 'Playing age', value: playingAge },
    { label: 'Union', value: pro.union_membership ? titleCase(pro.union_membership) : null },
    {
      label: 'Travel',
      value: pro.availability_travel ? titleCase(String(pro.availability_travel)) : null,
    },
    { label: 'Second base', value: pro.city_secondary },
    { label: 'Nationality', value: talent?.nationality },
    {
      label: 'Hair',
      value: [talent?.hair_color, pro.hair_length, pro.hair_type]
        .filter(Boolean)
        .map(titleCase)
        .join(', ') || null,
    },
    { label: 'Eyes', value: talent?.eye_color ? titleCase(talent.eye_color) : null },
    { label: 'Tattoos', value: pro.tattoos ? titleCase(String(pro.tattoos)) : null },
    { label: 'Piercings', value: pro.piercings ? titleCase(String(pro.piercings)) : null },
  ].filter((f) => f.value != null && f.value !== '' && (!Array.isArray(f.value) || f.value.length));

  if (facts.length === 0) {
    return <Quiet>The talent has not filled in a professional record yet.</Quiet>;
  }

  return (
    <Ledger columns={2}>
      {facts.map((f) => (
        <Fact key={f.label} label={f.label} value={f.value} />
      ))}
    </Ledger>
  );
}
