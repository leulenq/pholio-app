/**
 * Agency setup — chapter model.
 *
 * Setup runs after review and approval, so it CONFIRMS the record Pholio
 * already holds (from the approved access request) and then collects only the
 * decisions that request never asked for. Each chapter owns one category and
 * commits its own backend steps when the booker continues.
 *
 * Backend steps covered: profile + defaults (record), boards, team,
 * open_call (intake), privacy (custody). All six are required to complete.
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

export const TEAM_ROLES = [
  { value: 'AGENT', label: 'Booker', hint: 'Runs submissions, shortlists, and representation decisions.' },
  { value: 'SCOUT', label: 'Scout', hint: 'Reviews open-call submissions and develops new faces.' },
  { value: 'ADMIN', label: 'Administrator', hint: 'Full workspace access including team and settings.' },
  { value: 'VIEWER', label: 'View only', hint: 'Can see submissions and boards but cannot change them.' },
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
    title: 'How is the agency divided?',
    lede: 'Agency boards route submissions to the right bookers. Casting boards stay separate, opened per brief.',
    voice: {
      heading: 'Boards are how your bookers see the day.',
      body: 'Boards decide where a submission is reviewed and which team owns the decision. We have pre-selected the boards you named in your request; add or retire any of them now or once the workspace is open.',
    },
    steps: ['boards'],
  },
  {
    id: 'team',
    name: 'The team',
    title: 'Who comes in with you?',
    lede: 'Invite the bookers and scouts who will review submissions. You can do this later instead.',
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
      heading: 'Talent data remains purpose-bound.',
      body: 'Digitals, measurements, and contact details stay behind your team’s access controls. Boards or imports involving minors remain in review until guardian consent and visibility handling are confirmed.',
    },
    steps: ['privacy'],
  },
];
