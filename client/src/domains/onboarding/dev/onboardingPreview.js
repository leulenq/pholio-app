/**
 * Onboarding Preview (DEV ONLY)
 * -----------------------------
 * Realistic seed state + step map for the temporary onboarding review harness.
 * Everything here is gated behind `import.meta.env.DEV` at the call sites, so
 * it dead-code-eliminates out of production builds and never touches the real
 * flow. Purely for visual review / iteration speed.
 *
 * Deep-link via URL: /onboarding?preview=<view>[.<subStep>]
 *   e.g.  ?preview=measurements.bust   ?preview=profile.2   ?preview=scout
 */

// Realistic answers so seeded screens (fitting, profile, review) look like a
// real in-progress applicant rather than empty defaults. No weight, no AI
// predictions — both were removed from intake.
export const PREVIEW_SEED = {
  userName: 'Ava',
  profileData: {
    gender: 'Female',
    date_of_birth: '2001-04-12',
    city: 'Paris, France',
    height_cm: 178,
    bust_cm: 84,
    waist_cm: 61,
    hips_cm: 89,
  },
  photoData: {
    photo_url: '',
  },
};

// Every major step + its sub-steps, in flow order, for the dev panel.
export const PREVIEW_STEPS = [
  {
    view: 'entry',
    label: 'Entry · auth',
    subSteps: [
      { key: 'choice', label: 'Choice' },
      { key: 'google', label: 'Google sign-up' },
      { key: 'instagram', label: 'Instagram sign-up' },
      { key: 'name', label: 'Manual name' },
      { key: 'email', label: 'Manual email' },
      { key: 'password', label: 'Manual password' },
    ],
  },
  {
    view: 'greet',
    label: 'Greet beat',
    subSteps: [
      { key: 'google', label: 'Google Success' },
      { key: 'instagram', label: 'Instagram Success' },
      { key: 'email', label: 'Email Welcome' },
    ],
  },
  { view: 'birthdate', label: 'Birthdate', subSteps: null },
  { view: 'gender', label: 'Identity', subSteps: null },
  { view: 'scout', label: 'Digitals', subSteps: null },
  {
    view: 'measurements',
    label: 'Stats',
    subSteps: [
      { key: 'height', label: 'Height' },
      { key: 'fitting', label: 'Stats offer' },
      { key: 'bust_cm', label: 'Bust' },
      { key: 'waist_cm', label: 'Waist' },
      { key: 'hips_cm', label: 'Hips' },
      { key: 'review', label: 'Review' },
    ],
  },
  {
    view: 'profile',
    label: 'Details',
    subSteps: [
      { key: 1, label: 'Lanes' },
      { key: 2, label: 'Market' },
    ],
  },
  { view: 'finishing', label: 'Finishing · preloader', subSteps: null },
  { view: 'reveal', label: 'Reveal page', subSteps: null },
];

/**
 * Parse a `?preview=` value into { view, subStep } or null.
 * subStep is coerced to the step's native key type (string or number).
 */
export function parsePreviewParam(raw) {
  if (!raw) return null;
  const [view, sub] = String(raw).split('.');
  const stepDef = PREVIEW_STEPS.find((s) => s.view === view);
  if (!stepDef) return null;

  let subStep = null;
  if (sub != null && stepDef.subSteps) {
    const match = stepDef.subSteps.find((ss) => String(ss.key) === sub);
    subStep = match ? match.key : null;
  }
  return { view, subStep };
}
