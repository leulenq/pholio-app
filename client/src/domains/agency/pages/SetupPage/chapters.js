/**
 * Agency setup — chapter model.
 *
 * Setup runs after review and approval, so it CONFIRMS the record Pholio
 * already holds (from the approved access request) and then collects only the
 * decisions that request never asked for. Each chapter owns one category and
 * commits its own backend steps when the booker continues.
 *
 * Backend steps covered: profile + defaults (record), boards, roster, team,
 * open_call (intake), privacy (custody). All seven are required to complete.
 */

export const AGENCY_TYPES = [
  {
    value: 'Mother agency',
    hint: 'You scout and develop talent, then place them with agencies in other markets.',
  },
  {
    value: 'Market agency',
    hint: 'You represent talent for bookings in your own market.',
  },
  {
    value: 'Management',
    hint: 'You manage careers across multiple agencies and territories.',
  },
];

export const BOARD_PRESETS = [
  { name: 'Women', hint: 'Main women’s board' },
  { name: 'Men', hint: 'Main men’s board' },
  { name: 'New Faces', hint: 'Development and new talent' },
  { name: 'Commercial', hint: 'Lifestyle and catalogue work' },
  { name: 'Curve', hint: 'Curve and plus representation' },
  { name: 'E-comm', hint: 'Studio and e-commerce rates' },
  { name: 'Fit', hint: 'Fit and showroom work' },
  { name: 'Kids/Teens', hint: 'Minors — consent required', minors: true },
];

export const ROSTER_PATHS = [
  {
    value: 'blank',
    label: 'Open with a blank roster',
    hint: 'Start empty and build the boards as you sign.',
  },
  {
    value: 'manual',
    label: 'Add talent yourself',
    hint: 'Enter your existing roster one talent at a time.',
  },
  {
    value: 'import',
    label: 'Request import support',
    hint: 'A Pholio operator takes your roster file and maps it in for you.',
  },
];

/** Maps the access request's migration answer onto a roster path. */
export function rosterPathFromMigrationInterest(value) {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return null;
  if (/(yes|import|migrat|help|assist|concierge)/.test(normalized)) return 'import';
  if (/(no|later|self|manual|none)/.test(normalized)) return 'manual';
  return null;
}

export const TEAM_ROLES = [
  { value: 'AGENT', label: 'Booker', hint: 'Runs castings, submissions, and the roster day to day.' },
  { value: 'SCOUT', label: 'Scout', hint: 'Reviews open-call submissions and develops new faces.' },
  { value: 'ADMIN', label: 'Administrator', hint: 'Full workspace access including team and settings.' },
  { value: 'VIEWER', label: 'View only', hint: 'Can see the roster and boards but cannot change them.' },
];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

export const UNIT_OPTIONS = [
  { value: 'imperial_metric', label: 'Imperial and metric' },
  { value: 'metric', label: 'Metric only' },
  { value: 'imperial', label: 'Imperial only' },
];

/**
 * `steps` lists the backend step keys a chapter completes. Every required step
 * appears exactly once across the chapters.
 */
export const CHAPTERS = [
  {
    id: 'record',
    name: 'The record',
    title: 'Confirm the agency of record.',
    lede: 'This is what Pholio reviewed and approved. Correct anything that has changed.',
    voice: {
      heading: 'You are already approved.',
      body: 'These details came from the request we reviewed, so nothing here is a fresh application. Every submission, package, and comp card Pholio sends carries this name — confirm it reads the way it does on your contracts.',
    },
    steps: ['profile', 'defaults'],
  },
  {
    id: 'boards',
    name: 'The boards',
    title: 'How is the roster divided?',
    lede: 'Standing boards organise representation. Casting boards stay separate, opened per brief.',
    voice: {
      heading: 'Boards are how your bookers see the day.',
      body: 'The division a talent sits on decides which briefs they surface for. We have pre-selected the boards you named in your request; add or retire any of them now or once the workspace is open.',
    },
    steps: ['boards'],
  },
  {
    id: 'roster',
    name: 'The roster',
    title: 'How does the roster arrive?',
    lede: 'Choose how your existing talent enters Pholio.',
    voice: {
      heading: 'An established book does not have to be retyped.',
      body: 'Most agencies open empty and sign into it. If you are moving an existing roster across, ask for import support and a Pholio operator handles the file, the mapping, and the image transfer.',
    },
    steps: ['roster'],
  },
  {
    id: 'team',
    name: 'The team',
    title: 'Who comes in with you?',
    lede: 'Invite the bookers and scouts who will work this roster. You can do this later instead.',
    voice: {
      heading: 'Access is granted per person, not per agency.',
      body: 'Each invitation is a named login with its own role. Talent records, measurements, and minor data are visible only to the people you admit here, and every export is attributed to the booker who made it.',
    },
    steps: ['team'],
  },
  {
    id: 'intake',
    name: 'Intake',
    title: 'How do new faces reach you?',
    lede: 'Your open-call routing, and what talent see when they submit.',
    voice: {
      heading: 'A controlled front door, not another inbox.',
      body: 'An open-call link sends submissions into your Pholio inbox instead of your email. You review, shortlist, and decide. Nothing enters a board and nothing becomes visible to a client until a booker puts it there.',
    },
    steps: ['open_call'],
  },
  {
    id: 'custody',
    name: 'Custody',
    title: 'Talent data is held in custody.',
    lede: 'Declare whether this workspace will hold minor records, and accept custody of the data inside it.',
    voice: {
      heading: 'The roster’s data belongs to the roster.',
      body: 'Digitals, measurements, and contact details stay behind your team’s access controls. Boards or imports involving minors remain in review until guardian consent and visibility handling are confirmed.',
    },
    steps: ['privacy'],
  },
];
