/**
 * Agency setup — chapter model.
 *
 * The backend tracks seven required steps (profile, boards, team, roster,
 * open_call, defaults, privacy). Exposing seven forms at once is what made the
 * old screen read as configuration paperwork. These five chapters group those
 * steps into decisions an agency actually recognises, and each chapter commits
 * its own backend steps when the booker continues.
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

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

export const UNIT_OPTIONS = [
  { value: 'imperial_metric', label: 'Imperial and metric' },
  { value: 'metric', label: 'Metric only' },
  { value: 'imperial', label: 'Imperial only' },
];

/**
 * `steps` lists the backend step keys a chapter is responsible for completing.
 * Every required step must appear exactly once across the chapters.
 */
export const CHAPTERS = [
  {
    id: 'agency',
    name: 'The agency',
    title: 'Who represents this roster?',
    lede: 'The name bookers, clients, and talent will see on everything that leaves this workspace.',
    voice: {
      heading: 'This is the record, not a profile.',
      body: 'Every submission, package, and comp card Pholio sends carries this name. Set it the way it appears on your contracts — you can revise it later, but the roster inherits it from here.',
    },
    steps: ['profile'],
  },
  {
    id: 'boards',
    name: 'The boards',
    title: 'How is the roster divided?',
    lede: 'Standing boards organise representation. Casting boards stay separate, opened per brief.',
    voice: {
      heading: 'Boards are how your bookers see the day.',
      body: 'Women, Men, New Faces, Development — the division a talent sits on decides which briefs they surface for. Nothing here is permanent; boards can be added or retired once the workspace is open.',
    },
    steps: ['boards'],
  },
  {
    id: 'roster',
    name: 'The roster',
    title: 'How does the roster arrive?',
    lede: 'Choose how your existing talent enters Pholio, and whether your team comes in with you.',
    voice: {
      heading: 'An established book does not have to be retyped.',
      body: 'Most agencies open empty and sign into it. If you are moving an existing roster across, ask for import support and a Pholio operator handles the file, the mapping, and the image transfer.',
    },
    steps: ['roster', 'team'],
  },
  {
    id: 'intake',
    name: 'Intake',
    title: 'How do new faces reach you?',
    lede: 'Your open call routing, and the operating defaults your bookers work in.',
    voice: {
      heading: 'A controlled front door, not another inbox.',
      body: 'An open-call link sends submissions into your Pholio inbox instead of your email. You review, shortlist, and decide. Nothing enters a board and nothing becomes visible to a client until a booker puts it there.',
    },
    steps: ['open_call', 'defaults'],
  },
  {
    id: 'custody',
    name: 'Custody',
    title: 'Talent data is held in custody.',
    lede: 'Confirm how images, measurements, and minor records are handled inside your workspace.',
    voice: {
      heading: 'The roster’s data belongs to the roster.',
      body: 'Digitals, measurements, and contact details stay behind your team’s access controls. Boards or imports involving minors remain in review until guardian consent and visibility handling are confirmed.',
    },
    steps: ['privacy'],
  },
];
