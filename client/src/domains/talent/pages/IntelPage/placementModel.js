/**
 * Intel (Placement): every sentence the page says, composed from the payload.
 *
 * Pure, so the language can be tested against the rules it lives under
 * (pholio-app-language): typical ranges are context in the industry's own
 * terms, never a verdict on a person; no scores, odds or percentages; no
 * outcome promises; no em-dashes or exclamation marks.
 */

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function listJoin(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function feetInches(cm) {
  if (cm == null) return null;
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return `${ft}′${inch}″`;
}

export function heightLabel(cm) {
  return cm == null ? null : `${Math.round(cm)} cm (${feetInches(cm)})`;
}

export function formatDay(value, opts = { day: 'numeric', month: 'long' }) {
  if (!value) return null;
  const d = new Date(String(value).length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, opts);
}

function boardBy(filing, slug) {
  return filing?.boards?.find((b) => b.slug === slug) || null;
}

function lower(label) {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

const GENDER_BOARD = { female: 'women', male: 'men' };

/** The page's opening statement: where the talent would usually be filed. */
export function filingHeadline(filing) {
  const missing = filing?.facts?.missing || [];
  if (missing.includes('height') || missing.includes('gender')) {
    const need = [missing.includes('height') && 'height', missing.includes('gender') && 'gender'].filter(Boolean);
    return {
      text: 'Where you would be filed starts with your stats.',
      sub: `Add your ${listJoin(need)} and this page places you against the boards agencies run.`,
      link: { label: `Add ${listJoin(need)}`, to: '/dashboard/talent/profile?tab=appearance' },
    };
  }
  const filed = (filing.filed || []).map((slug) => lower(boardBy(filing, slug).label));
  const h = heightLabel(filing.facts.heightCm);
  if (filed.length) {
    return {
      text: `On your stats, agencies would usually file you for ${listJoin(filed)}.`,
      sub: `From your height of ${h} and the boards you list on your profile.`,
    };
  }
  return {
    text: 'Your height sits outside the boards that cast to a height range.',
    sub: 'Most of the market does not cast to height. List the boards you work toward on your profile and they are placed here.',
    link: { label: 'Set your booking lanes', to: '/dashboard/talent/profile?tab=discipline' },
  };
}

/**
 * Plain statements about boards whose typical range the stats sit outside.
 * Said with numbers, never as a judgement, because applying there blind is
 * the most common wasted effort.
 */
export function outsideLines(filing) {
  if (!filing?.facts?.heightCm || !filing.facts.gender) return [];
  const g = GENDER_BOARD[filing.facts.gender];
  const h = heightLabel(filing.facts.heightCm);
  const lines = [];
  for (const slug of filing.declaredOutside || []) {
    const b = boardBy(filing, slug);
    if (!b?.range) continue;
    lines.push(
      `You list ${lower(b.label)}. ${b.label} boards typically cast ${g} from ${heightLabel(b.range[0])} to ${heightLabel(b.range[1])}; you are ${h}.`,
    );
  }
  // Only when no declared board already said it: one range, said once.
  const fashion = (lines.length ? [] : filing.fashionOutside || []).map((slug) => boardBy(filing, slug)).filter((b) => b?.range);
  if (fashion.length) {
    const r = fashion[0].range;
    lines.push(
      `${listJoin(fashion.map((b) => b.label))} boards typically cast ${g} from ${heightLabel(r[0])}. Agencies with other boards may still represent you.`,
    );
  }
  return lines;
}

export function openBoardsLine(filing) {
  const open = (filing?.boards || []).filter((b) => b.rule === 'open');
  if (!open.length) return null;
  const declared = open.filter((b) => b.declared).map((b) => lower(b.label));
  const all = listJoin(open.map((b) => lower(b.label)));
  const head = `${all.charAt(0).toUpperCase()}${all.slice(1)} boards do not cast to a height range.`;
  return declared.length
    ? `${head} You list ${listJoin(declared)}.`
    : `${head} Your profile lists none of them yet.`;
}

export function countsLine(agencies) {
  const n = (g) => agencies.filter((a) => a.group === g).length;
  const parts = [];
  if (n('go')) parts.push(`${plural(n('go'), 'agency', 'agencies')} to approach now`);
  if (n('waiting')) parts.push(`${n('waiting')} waiting to hear`);
  if (n('later')) parts.push(`${n('later')} to try again later`);
  return parts.length ? `${listJoin(parts)}.`.replace(/^./, (c) => c.toUpperCase()) : null;
}

export function shotsHeadline(shots) {
  if (!shots?.length) return null;
  const missing = shots.filter((s) => s.state === 'missing');
  const unconfirmed = shots.filter((s) => s.state === 'unconfirmed');
  if (missing.length) {
    const top = missing[0];
    return `${plural(top.agencies, 'agency', 'agencies')} ask for a ${lower(top.label)} shot. Your book does not have one yet.`;
  }
  if (unconfirmed.length) {
    return `Your book likely has the shots agencies ask for. Confirm ${plural(unconfirmed.length, 'shot type')} in Media so agencies see them as published.`;
  }
  return 'Your book has every shot agencies most often ask for.';
}

export function digitalsLine(d, now = new Date()) {
  if (!d?.has) return 'No digitals in your book yet. Agencies review digitals first.';
  const taken = formatDay(d.capturedOn);
  const due = formatDay(d.dueOn);
  if (d.state === 'stale') return `Your digitals were taken ${taken}, more than three months ago. Agencies expect current digitals.`;
  if (d.state === 'undated') return 'Your digitals have no date. Agencies expect digitals from the last three months.';
  if (!due) return `Digitals taken ${taken}.`;
  const past = new Date(`${String(d.dueOn).slice(0, 10)}T23:59:59`) < now;
  return past
    ? `Digitals taken ${taken}. Due for a new set since ${due}; agencies expect digitals from the last three months.`
    : `Digitals taken ${taken}. Current until ${due}.`;
}

const SAYS_SHORT = {
  board_full: 'Board was full',
  not_a_fit: 'Not right for the board they are building',
  materials: 'Could not assess the materials',
  market: 'Another market suits you better',
  experience: 'Looking for more experience',
  unstated: 'Passed without a reason',
  kept_on_file: 'Kept you on file',
  closed_no_response: 'Closed with no reply',
};

export function standingLine(agency) {
  const h = agency.history;
  if (!h) return null;
  if (h.standing === 'represented') return 'Represents you';
  if (h.standing === 'your_move') return 'Asked you for more';
  if (h.standing === 'moving') return 'In conversation';
  if (h.standing === 'waiting') {
    const closes = formatDay(h.closesAt);
    return closes ? `Submitted. Closes ${closes} if they do not reply.` : 'Submitted';
  }
  const said = SAYS_SHORT[h.reason] || 'Passed';
  if (h.again === 'never') return `${said}.`;
  if (h.again === 'on_new_digitals') return `${said}. Worth sending again once you have new digitals.`;
  if (h.again === 'later') return `${said}. Worth trying again from ${formatDay(h.againOn)}.`;
  return `${said}. Long enough ago to try again.`;
}

export function approachLabel(agency) {
  if (!agency.approach) return null;
  if (agency.approach.kind === 'pholio') return 'Apply through Pholio';
  return 'Apply on their site';
}

const WEEKDAY = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function clock(minute) {
  if (minute == null) return null;
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ap}`;
}

/** "America/New_York" → "New York time". Times stay in the agency's zone. */
export function zoneName(timezone) {
  const city = String(timezone || '').split('/').pop();
  return city ? `${city.replace(/_/g, ' ')} time` : null;
}

export function windowLine(w) {
  const from = clock(w.startMinute);
  const to = clock(w.endMinute);
  const zone = from ? zoneName(w.timezone) : null;
  const time = from && to ? `, ${from} to ${to}` : from ? `, from ${from}` : '';
  return `${w.label || 'Open call'}, ${WEEKDAY[w.weekday] || ''}${time}${zone ? ` ${zone}` : ''}`;
}

export function eventLine(e) {
  if (e.kind === 'open_call') {
    const from = clock(e.startMinute);
    const to = clock(e.endMinute);
    const zone = from ? zoneName(e.timezone) : null;
    return {
      who: e.name,
      what: `${e.label || 'Open call'}${from && to ? `, ${from} to ${to}` : ''}${zone ? ` ${zone}` : ''}`,
    };
  }
  if (e.kind === 'again') return { who: e.name, what: 'Worth trying again from today' };
  if (e.kind === 'closes') return { who: e.name, what: 'Your submission closes if they have not replied' };
  if (e.kind === 'digitals') return { who: 'Your digitals', what: 'Three months old today' };
  return { who: e.name, what: '' };
}

/** Events grouped into week rows starting on the calendar's first day. */
export function calendarWeeks(calendar) {
  const start = new Date(`${calendar.from}T12:00:00Z`);
  const weeks = [];
  for (let w = 0; w < Math.ceil(calendar.days / 7); w += 1) {
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start.getTime() + (w * 7 + i) * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, events: calendar.events.filter((e) => e.date === key) });
    }
    weeks.push(days);
  }
  return weeks;
}
