/**
 * The authored agency brief pack.
 *
 * This is presentation content, not registry data: the spec registry stays the
 * factual source (routes, findings, evaluations — everything a form actually
 * enforces), and this file is the talent-facing narration written on top of
 * it — copy, reviewed like copy, not generated from the registry at read time.
 * Every fact traces back to `docs/spec-registry-rebuild-2026-08/<slug>.md`; the
 * entries below are converted verbatim from `entries-draft.json` (the authored
 * source handed off for this build) — nothing here rewrites an agency's
 * requirements, only how they're introduced.
 *
 * Two lookups are exported:
 *   - `briefForSeries(seriesId)` — exact match against a registry series id,
 *     never a fuzzy match by agency name (two agencies can share a name; a
 *     series id cannot).
 *   - `allBriefs()` — the whole pack, for surfaces that list every entry.
 *
 * `checkedOn` is the pack-level "as of" date every entry was authored against.
 * Individual entries don't carry their own — when a route has its own
 * `sourceCheckedOn`, prefer that (it's closer to the actual source); this date
 * is the fallback for entries the live registry doesn't (yet) date.
 */

export const checkedOn = '2026-08-19';

/**
 * Which registry series each authored entry answers for, added at conversion
 * time (never present in the authored source — the authors write about an
 * agency, not about the registry's internal ids).
 *
 * Ten entries map onto a live registry series. The remaining one doesn't have
 * one yet; it gets a `prospectiveSeriesId` instead so a future registry
 * series can be wired to this copy by construction rather than by guesswork.
 *
 * The six added on 2026-08-29 took the ids this file already predicted for
 * them (`<entry id>:online`), which is why each is a one-line addition rather
 * than a rewrite. State is the exception worth knowing about: the agency runs
 * a second, unlinked channel on Snapcast with different formats, a 3 MB cap
 * and the platform's own terms, and `state:online` is State's own form only.
 * The copy below sets the two side by side; a Snapcast series, if one is ever
 * published, needs its own entry rather than this one.
 */
const SERIES_ID_OVERRIDES = {
  bicoastal: ['bicoastal:online'],
  curv: ['curv:online'],
  'elite-na': ['elite-models-na:online-general'],
  ford: ['ford-models:selected-city-online'],
  jag: ['jag:online'],
  'muse-nyc': ['muse-model-management-nyc:email'],
  'one-management': ['one-management:online'],
  'q-management': ['q-management:online'],
  state: ['state:online'],
  wilhelmina: ['wilhelmina:selected-market-online'],
};

const PROSPECTIVE_SERIES_ID_OVERRIDES = {
  'fashion-week-brooklyn': 'fashion-week-brooklyn:event',
};

/** Converted verbatim from entries-draft.json — do not rewrite the copy here. */
const RAW_ENTRIES = [
  {
    id: 'muse-nyc',
    name: 'Muse Management',
    market: 'New York',
    kind: 'agency',
    registration: { authority: 'NY DOL', cert: '26-67AN4-LSFW' },
    officialApplyUrl: 'https://www.musenyc.com/contact',
    glance: {
      applyMethod: 'Email',
      prepSummary: '3 photos · measurements',
      gates: [],
      headsUp: true,
    },
    brief: {
      howYouApply:
        "You apply by email — one message to scouting@musenyc.com with your name, age, location, measurements, and photos. There's no online form. Muse also holds a walk-in open call every Thursday, 3–4 PM.",
      photos: {
        slots: ['Close-up, hair up', 'Close-up, hair down', 'Full length, head to toe'],
        rules: [
          'Natural light works best; keep the background free of clutter',
          "Relaxed and natural — don't pose",
          'Women: a simple, form-fitting outfit or a bikini — no heels, makeup, or jewelry',
          "Men: simple and form-fitting — shirtless is fine if you're comfortable",
          'Keep each photo around 1 MB',
        ],
      },
      yourDetails:
        'Name, age, and location, plus four measurements: height (in bare feet), bust, waist, and hips — Muse explains how to take each one on their page.',
      whoTheyWant:
        "Muse prefers women 5'9\" and taller, men 5'11\" and taller — and in the same breath says it represents models of all sizes, so don't rule yourself out. The Curve division has no separate application; the same email covers everyone.",
      under18:
        "Muse asks that your parents know about your modeling goals and says it follows New York State guidelines for minors — but there's no separate application step for minors. A parent should be involved in your email.",
      afterYouSubmit:
        "Muse says it can't respond to every submission. If they're interested, someone will contact you — otherwise, silence is the normal outcome here, not a mistake.",
      headsUps: [
        "The open call is Thursdays 3–4 PM, but Muse doesn't publish the address or what to bring — confirm with the agency before going in person.",
        'musetheagency.com is a completely different company. Muse Management NYC is only at musenyc.com.',
      ],
      finePrint: [
        'Office: 150 Broadway, Suite 300, New York, NY 10038',
        'info@musenyc.com is for general inquiries only — applications go to scouting@musenyc.com',
      ],
    },
    apply: {
      channel: 'email',
      emailTo: 'scouting@musenyc.com',
      photoChecks: [
        { slot: 'Close-up, hair up', format: 'JPG recommended (no format stated)', size: 'About 1 MB' },
        { slot: 'Close-up, hair down', format: 'JPG recommended (no format stated)', size: 'About 1 MB' },
        { slot: 'Full length, head to toe', format: 'JPG recommended (no format stated)', size: 'About 1 MB' },
      ],
      callouts: [
        "List your details in Muse's own order: name, age, location, then measurements",
        'The 1 MB size is Muse\'s guidance, not a hard cutoff — but oversized emails risk being ignored',
      ],
    },
  },
  {
    id: 'elite-na',
    name: 'Elite Model Management',
    market: 'New York',
    kind: 'agency',
    registration: { authority: 'NY DOL', cert: '26-69YIX-LSFW' },
    officialApplyUrl: 'https://www.elitemodels.com/become-elite',
    glance: {
      applyMethod: 'Online form or email',
      prepSummary: '6 photos · measurements · short bio',
      gates: ['Women only'],
      headsUp: true,
    },
    brief: {
      howYouApply:
        "Fill out the form at elitemodels.com/become-elite, or email your submission to becomeelite@elitemodels.com. Elite doesn't hold open calls — these are the only doors.",
      photos: {
        slots: [
          'Full length',
          'Full length profile',
          'Portrait length',
          'Close-up, hair pulled back',
          'Close-up profile, hair pulled back',
          'Personality photo',
        ],
        rules: [
          "Form-fitting clothing so your body shape is clearly visible",
          'No makeup, and no large accessories like hoop earrings or bracelets',
          'No smiling — relaxed and natural',
          'JPG, PNG, or WebP — convert iPhone photos to JPG first',
          'No size limit is stated',
        ],
      },
      yourDetails:
        "Contact details, date of birth, a short paragraph about yourself and your goals, whether you already have representation, and eight measurements: bust, waist, hips, height, shoe, hair color, eye color, and cup size. The form never says which units it wants — use what's standard for you.",
      whoTheyWant:
        'Elite\'s page says it typically scouts "female identified persons" ages 15 and up. No New York men\'s board is published. And despite what circulates online, Elite publishes no height or measurement minimums at all.',
      under18:
        "Elite says applicants under 18 need parental or guardian consent, and the form promises a place to provide it — but no such fields exist. If you're a minor, email becomeelite@elitemodels.com first and ask how to submit consent.",
      afterYouSubmit:
        "Elite doesn't say what happens next or how long to wait. Applications are accepted year-round.",
      headsUps: [
        "If you're under 18: the form's promised guardian step doesn't exist — sort consent out by email before applying.",
        "iPhone photos (HEIC) aren't on the accepted list, and the form won't warn you — convert to JPG so your photos don't silently fail.",
        'Elite Model Look is a separate worldwide contest run by a different company. It is not the US application.',
      ],
      finePrint: [
        'Office: 37 E 18th Street, New York — satellite offices in Los Angeles, Miami, and Toronto share this one application',
        "Elite's NY DOL registration certificate is published on its own website",
      ],
    },
    apply: {
      channel: 'form',
      photoChecks: [
        { slot: 'Full length', format: 'JPG, PNG, or WebP', size: 'No stated limit' },
        { slot: 'Full length profile', format: 'JPG, PNG, or WebP', size: 'No stated limit' },
        { slot: 'Portrait length', format: 'JPG, PNG, or WebP', size: 'No stated limit' },
        { slot: 'Close-up, hair pulled back', format: 'JPG, PNG, or WebP', size: 'No stated limit' },
        { slot: 'Close-up profile, hair pulled back', format: 'JPG, PNG, or WebP', size: 'No stated limit' },
        { slot: 'Personality photo', format: 'JPG, PNG, or WebP', size: 'No stated limit' },
      ],
      callouts: [
        'Measurements have no units on the form — enter consistently and expect the agency to re-measure later',
        'The submit button stays off until every photo is attached and the CAPTCHA is done',
      ],
    },
  },
  {
    id: 'ford',
    name: 'Ford Models',
    market: 'New York',
    kind: 'agency',
    registration: { authority: 'NY DOL', cert: '26-69V5K-LSFW' },
    officialApplyUrl: 'https://www.fordmodels.com/get-scouted',
    glance: {
      applyMethod: 'Online form',
      prepSummary: '2–4 photos · measurements',
      gates: [],
      headsUp: true,
    },
    brief: {
      howYouApply:
        'Go to fordmodels.com/get-scouted and pick your city — New York is the default. One form covers every city except Paris, which uses a separate system that requires creating an account.',
      photos: {
        slots: ['Close-up (required)', 'Full length (required)', 'Side profile (optional)', 'Upper body (optional)'],
        rules: [
          'Clean face with no makeup',
          'Hair pulled back',
          'A form-fitting outfit — they need to see the shape of your body',
          'JPG or PNG; no size limit is stated',
        ],
      },
      yourDetails:
        'Contact details, date of birth, socials, and a measurement block that follows your gender selection — height, bust or chest, waist, hips, plus dress or suit and shoe sizes.',
      whoTheyWant:
        "Ford publishes no height or measurement minimums. Boards and divisions are assigned by the agency after review — the form doesn't ask you to choose.",
      under18:
        "Ford's policy: 13 is the minimum age, and for anyone 13–17 a parent or legal guardian must be the one who registers. The form won't check or prompt for this — if you're applying for a minor, the parent should complete the form themselves.",
      afterYouSubmit:
        'Nothing is published about response times. Only the Chicago office currently runs open calls (Mon–Thu, 2–3 PM); every other city says it holds none.',
      headsUps: [
        "Applying for a 13–17-year-old? Ford requires the parent to register, but the form never says so — handle it on the parent's side.",
        "The Paris route is a different system with an account signup and different fields — only relevant if you're applying to Paris.",
      ],
      finePrint: ["Ford's privacy policy is dated May 2018"],
    },
    apply: {
      channel: 'form',
      photoChecks: [
        { slot: 'Close-up', format: 'JPG or PNG', size: 'No stated limit' },
        { slot: 'Full length', format: 'JPG or PNG', size: 'No stated limit' },
        { slot: 'Side profile (optional)', format: 'JPG or PNG', size: 'No stated limit' },
        { slot: 'Upper body (optional)', format: 'JPG or PNG', size: 'No stated limit' },
      ],
      callouts: [
        'Only two photos are strictly required — but sending all four gives the agency a complete look',
        'Your city choice routes the application; New York is pre-selected',
      ],
    },
  },
  {
    id: 'wilhelmina',
    name: 'Wilhelmina',
    market: 'New York',
    kind: 'agency',
    registration: { authority: 'NY DOL', cert: '26-69UG6-LSFW' },
    officialApplyUrl: 'https://www.wilhelmina.com/become-a-model',
    glance: {
      applyMethod: 'Online form',
      prepSummary: '4 photos · measurements',
      gates: ['18+'],
      headsUp: true,
    },
    brief: {
      howYouApply:
        "One form at wilhelmina.com/become-a-model — pick your market (New York, Miami, Los Angeles, or London). Wilhelmina is explicit that emailed submissions are not considered, so don't use the regional email addresses you may find online.",
      photos: {
        slots: ['Photo 1 — headshot', 'Photo 2', 'Photo 3', 'Photo 4 — full body'],
        rules: [
          'No written rules are published — match their example photos: plain background, minimal makeup, moving from headshot to full body',
          'iPhone photos are fine (JPG, PNG, WebP, and HEIC all accepted)',
          'No size limit is stated',
        ],
      },
      yourDetails:
        "Choose the Women or Men track. Women: height, shoe, bust, cup, waist, hips, hair and eye color. Men: height, shoe, waist, suit, inseam, collar, hair and eye color. No units are given — use your standard. You'll also confirm you can legally live and work in your chosen market. US applicants can tick interest in the Sports+Fitness and WillyMoves divisions.",
      whoTheyWant:
        'Wilhelmina describes itself as representing women, men, and fitness models. A Curve division exists with its own roster, but the form has no Curve option — apply through the Women track and the agency routes you internally. No height or measurement floors are published.',
      under18:
        "In practice you must be 18 or older: the form rejects any birth date after January 1, 2008. (The page mentions guardian authorization for minors, but a minor can't actually complete this form.)",
      afterYouSubmit: 'Nothing is published about response times or what happens next.',
      headsUps: [
        "The age cutoff is real and enforced — under-18s can't submit this form, whatever the guardian note suggests.",
        "The submit button stays greyed out with no explanation until everything, including the CAPTCHA, is complete — it's not broken.",
        "There's no Curve or non-binary option on the form itself.",
      ],
      finePrint: ['The many regional Wilhelmina email addresses are for existing business, not applications'],
    },
    apply: {
      channel: 'form',
      photoChecks: [
        { slot: 'Photo 1 — headshot', format: 'JPG, PNG, WebP, or HEIC', size: 'No stated limit' },
        { slot: 'Photo 2', format: 'JPG, PNG, WebP, or HEIC', size: 'No stated limit' },
        { slot: 'Photo 3', format: 'JPG, PNG, WebP, or HEIC', size: 'No stated limit' },
        { slot: 'Photo 4 — full body', format: 'JPG, PNG, WebP, or HEIC', size: 'No stated limit' },
      ],
      callouts: [
        'Date of birth must be on or before January 1, 2008',
        'Measurement fields have no units — enter consistently',
      ],
    },
  },
  {
    id: 'state',
    name: 'State Management',
    market: 'New York',
    kind: 'agency',
    registration: { authority: 'NY DOL', cert: '26-66CVV-LSFW' },
    officialApplyUrl: 'https://www.statemgmt.com/become-a-model',
    glance: {
      applyMethod: 'Online form',
      prepSummary: '4 photos · measurements',
      gates: [],
      headsUp: true,
    },
    brief: {
      howYouApply:
        "Two separate State applications exist and they aren't linked to each other. We recommend State's own form at statemgmt.com/become-a-model. The other one — a Snapcast-hosted form — makes you create an account and runs on the platform's own rules and terms.",
      channelDifferences: {
        labels: ["State's own form", 'Snapcast form'],
        rows: [
          { fact: 'iPhone photos (HEIC)', values: ['Accepted', 'Not accepted — convert to JPG'] },
          { fact: 'Photo size limit', values: ['None stated', '3 MB each, enforced'] },
          {
            fact: 'Whose terms you accept',
            values: ["State's", "Snapcast's — including a broad, permanent license to use your photos"],
          },
        ],
      },
      photos: {
        slots: ['Close-up', 'Waist up', 'Full length', '3/4 profile'],
        rules: [
          'Shot in natural daylight — not direct sunlight',
          'No makeup, hair down, neutral face',
          'Match the sample photos shown on the form',
        ],
      },
      yourDetails:
        "Contact details, date of birth, and measurements — height is required; bust, waist, hips, and shoe are optional on State's own form. The Snapcast form asks for more (chest, inseam, collar, dress or suit size) and offers Female, Male, and Non-binary options.",
      whoTheyWant:
        "State's divisions span kids to classic, petite to plus, fit, and lifestyle — with no published minimums. The form has no division picker; the agency routes you after review.",
      under18:
        "State's policy: a parent or guardian must submit for anyone under 18, with written consent — request the consent form from scouting@statemgmt.com. For the Kids division specifically, State's site says email kids@statemgmt.com, while the Snapcast form says repmykid@statemgmt.com. Use the address from the page you're on, and expect the consent step to happen over email either way.",
      afterYouSubmit:
        "If it's a no, State's policy says your submission is kept for six months and then deleted. No response timeline is published.",
      headsUps: [
        "Two unconnected application forms exist — pick one and stick with it. Pholio prepares you for State's own form.",
        "On the Snapcast form you accept the platform's terms, which include a broad permanent license to your photos — State's own form uses State's narrower terms.",
      ],
      finePrint: ['Offices in New York, Chicago, and Los Angeles', "State's own form runs on the Mainboard platform"],
    },
    apply: {
      channel: 'form',
      photoChecks: [
        { slot: 'Close-up', format: 'Any image, HEIC included', size: 'No stated limit' },
        { slot: 'Waist up', format: 'Any image, HEIC included', size: 'No stated limit' },
        { slot: 'Full length', format: 'Any image, HEIC included', size: 'No stated limit' },
        { slot: '3/4 profile', format: 'Any image, HEIC included', size: 'No stated limit' },
      ],
      callouts: ['If you use the Snapcast form instead: 3 MB per photo, JPG/PNG only, and you\'ll create an account'],
    },
  },
  {
    id: 'q-management',
    name: 'Q Management',
    market: 'New York',
    kind: 'agency',
    registration: { authority: 'NY DOL', cert: '26-6771P-LSFW' },
    officialApplyUrl: 'https://www.qmanagementinc.com/join',
    glance: {
      applyMethod: 'Online form',
      prepSummary: '4 photos · measurements',
      gates: [],
      headsUp: true,
    },
    brief: {
      howYouApply: 'One form at qmanagementinc.com/join covers both the New York and Los Angeles offices.',
      photos: {
        slots: ['Headshot', 'Full length', 'Profile', '3/4 length'],
        rules: [
          "JPG files no larger than 3 MB — Q's own instruction; stay within it even though the form doesn't strictly enforce it",
        ],
      },
      yourDetails: "Contact details and measurements. The form doesn't mark anything as required — fill in everything you reasonably can.",
      whoTheyWant:
        'Boards include Women (with a Curve division), Men, and Q Too. No height or measurement minimums are published, and the form has no board picker — the agency routes you.',
      under18:
        "Q publishes nothing about minors — no age minimum, no guardian process. If you're under 18, involve a parent and contact the agency before applying.",
      afterYouSubmit: 'Nothing is published about response times or what happens next.',
      headsUps: [
        "Ignore listings claiming a weekly Thursday open call — Q's own site announces no open calls, and its last word on the subject said they were on hold.",
      ],
      finePrint: ['Offices: 37 W 26th Street, New York, and Los Angeles'],
    },
    apply: {
      channel: 'form',
      photoChecks: [
        { slot: 'Headshot', format: 'JPG', size: 'Under 3 MB' },
        { slot: 'Full length', format: 'JPG', size: 'Under 3 MB' },
        { slot: 'Profile', format: 'JPG', size: 'Under 3 MB' },
        { slot: '3/4 length', format: 'JPG', size: 'Under 3 MB' },
      ],
      callouts: ["Q asks for JPG specifically — we'll convert other formats for you"],
    },
  },
  {
    id: 'one-management',
    name: 'ONE Management',
    market: 'New York',
    kind: 'agency',
    registration: { authority: 'NY DOL', cert: '26-69U8B-LSFW' },
    officialApplyUrl: 'https://onemanagement.com/submissions/application',
    glance: {
      applyMethod: 'Online form',
      prepSummary: '4 photos · 2 optional videos · measurements',
      gates: ['16+'],
      headsUp: true,
    },
    brief: {
      howYouApply:
        "One global form at onemanagement.com/submissions/application. There's no market or division choice — every office (New York, LA, Chicago, Spain, UK) shares this form and the agency routes you after review.",
      photos: {
        slots: ['Full length', 'Waist up', 'Close-up', 'Profile'],
        rules: [
          'Natural daylight, avoiding direct sunlight',
          'No makeup or hairstyling — hair down, no smiles, no selfie-style poses',
          'A white t-shirt or tank and skinny jeans are ideal',
          'JPG or PNG, maximum 600 KB per photo — the tightest limit of any agency here',
        ],
      },
      videos: {
        summary:
          "Two optional videos — a walking video and a get-to-know-you personality video, roughly 30 seconds each (ONE's FAQ says 15–40 seconds is fine). You don't upload them: post to YouTube and paste the links, or leave the fields blank and email links to info@onemanagement.com later.",
      },
      yourDetails:
        'Contact details, age, pronouns, gender (including trans and non-binary options), a skills list, and measurements in your choice of US, UK, or EU units — the form shows only the fields for the system you pick. Your Instagram and TikTok handles are required.',
      whoTheyWant:
        "ONE's FAQ says there's no height requirement (though clients may have preferences), and the agency represents all gender identities with a size-inclusive Curve division. The form routes divisions internally.",
      under18:
        "ONE's rules welcome 14–17-year-olds with a parent or guardian's consent — but the form only accepts ages 16 and up. If you're 14 or 15, the online form won't let you through; a parent should contact the agency directly. Age 13 or under: a parent or guardian must contact ONE's offices.",
      afterYouSubmit:
        "You'll get one confirmation email from submissions@onemanagement.com. If they're interested, expect a reply within one to two weeks — and ONE asks that you don't call or email to check status. There's never a fee, and ONE never asks for nude or lingerie photos.",
      headsUps: [
        "If you're 14–15: the form will reject your age no matter what the policy says — go through a parent, off-form.",
        'The videos are YouTube links, not uploads — and genuinely optional.',
        'Instagram and TikTok handles are required fields — have both ready.',
      ],
      finePrint: ['New York office: 42 Bond Street'],
    },
    apply: {
      channel: 'form',
      photoChecks: [
        { slot: 'Full length', format: 'JPG or PNG', size: 'Under 600 KB' },
        { slot: 'Waist up', format: 'JPG or PNG', size: 'Under 600 KB' },
        { slot: 'Close-up', format: 'JPG or PNG', size: 'Under 600 KB' },
        { slot: 'Profile', format: 'JPG or PNG', size: 'Under 600 KB' },
      ],
      callouts: [
        "600 KB is small — we'll compress your photos to fit without wrecking quality",
        'Pick one unit system (US, UK, or EU) before entering measurements; the form swaps fields to match',
        'Optional: YouTube links for a walking video and a personality video (15–40 seconds)',
      ],
    },
  },
  {
    id: 'jag',
    name: 'JAG Models',
    market: 'New York',
    kind: 'agency',
    registration: { authority: 'NY DOL', cert: '26-66BCS-LSFW' },
    officialApplyUrl: 'https://jagmodels.com/submissions/',
    glance: {
      applyMethod: 'Online form',
      prepSummary: '3 photos',
      gates: [],
      headsUp: false,
    },
    brief: {
      howYouApply:
        'One short form at jagmodels.com/submissions — email is only for verifying that someone claiming to be JAG is real, never for applying.',
      photos: {
        slots: ['Full length', 'Close-up', 'Profile'],
        rules: [
          'No styling rules are published — keep photos simple, recent, and true to how you look',
          "The three upload slots aren't labeled — use the order above, matching JAG's example photos",
        ],
      },
      yourDetails:
        'Only your name, email, and phone are required. Pronouns, date of birth, height (feet or centimeters — either works), homebase, and social handles are all optional, plus a free-text box for anything else.',
      whoTheyWant:
        'JAG is open to everyone — its own words: "removing barriers around size, weight, gender, and race." The form doesn\'t ask your gender, and the roster includes men and women. No minimums are published.',
      under18:
        "JAG publishes nothing about minors — no age minimum and no guardian process. If you're under 18, have a parent contact jag@jagmodels.com before applying.",
      afterYouSubmit: "JAG doesn't say whether or when they respond — don't count on a reply.",
      headsUps: [
        "Every real JAG employee's email ends in @jagmodels.com — verify anyone who contacts you by writing to jag@jagmodels.com.",
      ],
      finePrint: ['Offices in New York (416 W 13th Street) and Los Angeles'],
    },
    apply: {
      channel: 'form',
      photoChecks: [
        { slot: 'Full length', format: 'Common image formats', size: 'No practical limit' },
        { slot: 'Close-up', format: 'Common image formats', size: 'No practical limit' },
        { slot: 'Profile', format: 'Common image formats', size: 'No practical limit' },
      ],
      callouts: ['Leave the "LinkedIn" field empty — it\'s a spam trap, not a real question'],
    },
  },
  {
    id: 'curv',
    name: 'CURV Management',
    market: 'New York',
    kind: 'agency',
    registration: { authority: 'NY DOL', cert: '26-69SRC-LSFW' },
    officialApplyUrl: 'https://thecurvmanagement.com/submissions',
    glance: {
      applyMethod: 'Online form',
      prepSummary: '3–4 photos · measurements',
      gates: [],
      headsUp: true,
    },
    brief: {
      howYouApply:
        "Go directly to thecurvmanagement.com/submissions. Male applicants are routed to CURV's sister agency, Villains Management, on a separate site.",
      photos: {
        slots: ['Photo 1 (required)', 'Photo 2 (required)', 'Photo 3 (required)', 'Photo 4 (optional)'],
        rules: [
          'No makeup, as natural as possible, no filtered images',
          'Form-fitting clothing preferred — a fitted tank and skinny jeans work',
          'Pull long hair into a ponytail for profile shots',
          'JPG, PNG, or GIF; no size limit is stated',
        ],
      },
      yourDetails:
        'Pronouns (She, He, They, or Other), contact details, and stats in US units only: height, bust, waist, hips, dress size (0–26), shoe size, hair and eye color, plus a free-text box.',
      whoTheyWant:
        'Curve-focused, and broader than the name suggests: the roster spans dress sizes 0–4 through 18–20+, and the form accepts up to size 26. CURV\'s own words: "removing barriers around size, age, and race."',
      under18:
        "One rule is published: under-18s must have a parent or legal guardian's permission. The form won't ask for it or check your age — so make sure a parent has genuinely reviewed and approved your submission before you send it.",
      afterYouSubmit: 'Nothing is published — no response policy, no timeline.',
      headsUps: [
        'Skip the Contact page — its "Submissions" link currently points to a different agency\'s website. Go straight to thecurvmanagement.com/submissions.',
      ],
      finePrint: [
        'Office: 99 Madison Avenue, New York',
        'curvmanagement.com and curvmgmt.com are the same agency — thecurvmanagement.com is the main site',
      ],
    },
    apply: {
      channel: 'form',
      photoChecks: [
        { slot: 'Photo 1', format: 'JPG, PNG, or GIF', size: 'No stated limit' },
        { slot: 'Photo 2', format: 'JPG, PNG, or GIF', size: 'No stated limit' },
        { slot: 'Photo 3', format: 'JPG, PNG, or GIF', size: 'No stated limit' },
        { slot: 'Photo 4 (optional)', format: 'JPG, PNG, or GIF', size: 'No stated limit' },
      ],
      callouts: ['Stats are US units only — height in feet and inches, sizes in US sizing', 'A CAPTCHA appears at submission'],
    },
  },
  {
    id: 'bicoastal',
    name: 'Bicoastal Mgmt',
    market: 'New York',
    kind: 'agency',
    registration: { authority: 'NY DOL', cert: '26-675G6-LSFW' },
    officialApplyUrl: 'https://www.bicoastalmgmt.com/get-scouted',
    glance: {
      applyMethod: 'Online form',
      prepSummary: '4 photos · resume optional',
      gates: [],
      headsUp: true,
    },
    brief: {
      howYouApply:
        'One form at bicoastalmgmt.com/get-scouted. Department emails exist for questions (fit, fashion, commercial) — and the agency asks: no calls, please.',
      photos: {
        slots: ['Close-up', 'Full body', 'Side profile', 'Upper body'],
        rules: [
          'No written rules are published — their example photos suggest a plain light background, minimal makeup, and a fitted dark top',
          'iPhone photos are fine (HEIC accepted); no size limit is stated',
        ],
      },
      extras: 'A resume (PDF) and a video reel (MP4) are optional additions.',
      yourDetails:
        'Name, email, and date of birth are required; height is the only required measurement. Everything else — phone, city, ethnicity, bust, cup, hips, waist, dress and shoe size, socials — is optional, with sizes offered in US, UK, and EU. One quirk: the form starts with "Female" pre-selected, so set your own gender deliberately.',
      whoTheyWant:
        'Fit-modeling specialists ("all shapes and sizes") plus plus-size, commercial, print, and kids — with clients like Gap, Macy\'s, and Madewell. No numeric fit-model specs are published, so don\'t stress about hitting exact measurements.',
      under18:
        "Bicoastal's policy requires a parent or guardian to submit for anyone under 18, with written consent arranged by emailing billing@bicoastalmgmt.com — but the form never mentions this and won't check your age. Do the email step first.",
      afterYouSubmit:
        "Bicoastal is upfront that they can't answer every submission. If it's a no, their policy says your submission is kept about six months and then deleted. No timeline is published.",
      headsUps: [
        "The gender selector defaults to Female — an easy thing to submit wrong if you don't notice.",
        'Applying for a minor? The written-consent email step is required by their policy but invisible on the form.',
      ],
      finePrint: [
        'No upfront fees, ever — Bicoastal works on commission only (their own published policy)',
        'Offices in New York and Los Angeles',
      ],
    },
    apply: {
      channel: 'form',
      photoChecks: [
        { slot: 'Close-up', format: 'Any image, HEIC included', size: 'No stated limit' },
        { slot: 'Full body', format: 'Any image, HEIC included', size: 'No stated limit' },
        { slot: 'Side profile', format: 'Any image, HEIC included', size: 'No stated limit' },
        { slot: 'Upper body', format: 'Any image, HEIC included', size: 'No stated limit' },
      ],
      callouts: [
        'Optional: resume as PDF, video reel as MP4',
        'Check the gender selection before you submit — it starts on Female',
      ],
    },
  },
  {
    id: 'fashion-week-brooklyn',
    name: 'Fashion Week Brooklyn',
    market: 'Brooklyn',
    kind: 'event',
    registration: null,
    officialApplyUrl: 'https://www.fashionweekbrooklyn.com/model',
    glance: {
      applyMethod: 'Event registration',
      prepSummary: '2-minute form · no photos needed',
      gates: [],
      headsUp: true,
      eventDates: 'Oct 4–10, 2026',
    },
    brief: {
      howYouApply:
        "Register for Season 2 (October 4–10, 2026) with a short form — name, gender, whether you're 18 or older, phone, and optionally your Instagram and website. That's it: no photos, no measurements, no portfolio. There's also an in-person casting on Wednesday, August 26, 5–8 PM at Atolye, 236B 6th Street, Park Slope.",
      photos: null,
      yourDetails:
        "Five quick questions; two optional. The standing Brooklyn form does not ask for your email — your phone number is how they'll reach you, so double-check it.",
      whoTheyWant:
        "This is event casting for a Brooklyn fashion week — not agency representation. FWBK's team reviews registrations and reaches out to selected models to walk for the season's designers.",
      under18: "The form asks whether you're 18 or older, and that's the extent of it — no guardian process exists.",
      afterYouSubmit:
        'FWBK reviews and contacts selected models. No timeline is published, and no pay information is published either way — events like this are typically unpaid, but FWBK doesn\'t say.',
      headsUps: [
        'No email field on the standing form — the phone number you enter is your only contact channel. Get it right.',
        'Walking a show here is event casting, not signing with an agency.',
      ],
      finePrint: [
        'Produced by the BK Style Foundation, a 501(c)(3) nonprofit, since 2006',
        "Japan and London editions use identical forms; the Italy link currently doesn't work",
      ],
    },
    apply: {
      channel: 'event_form',
      photoChecks: [],
      callouts: [
        "Double-check your phone number — it's the only way FWBK can reach you on this form",
        'In-person casting: Wed Aug 26, 5–8 PM, Atolye, 236B 6th Street, Park Slope, Brooklyn',
      ],
    },
  },
];

function withSeriesIds(entry) {
  const overrideSeriesIds = SERIES_ID_OVERRIDES[entry.id];
  if (overrideSeriesIds) {
    return { ...entry, seriesIds: overrideSeriesIds };
  }
  const prospectiveSeriesId = PROSPECTIVE_SERIES_ID_OVERRIDES[entry.id] || `${entry.id}:online`;
  return { ...entry, seriesIds: [], prospectiveSeriesId };
}

const ENTRIES = RAW_ENTRIES.map(withSeriesIds);

/**
 * The authored brief for a registry series, or null.
 *
 * Exact match only, against `seriesIds` — never against `name`. Two agencies
 * can share a name; a series id can't, and a wrong match here would show a
 * talent someone else's requirements with full confidence.
 */
export function briefForSeries(seriesId) {
  if (!seriesId) return null;
  return ENTRIES.find((entry) => entry.seriesIds.includes(seriesId)) ?? null;
}

/** The whole pack, for surfaces that list every authored entry. */
export function allBriefs() {
  return ENTRIES;
}
