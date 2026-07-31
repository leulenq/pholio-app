/**
 * Phone helpers: normalize digits (and optional leading +) without losing dialable info;
 * display formatting is cosmetic and reversible via normalizePhoneInput.
 */

const DIGITS_ONLY = /[^\d]/g;

// List of 3-digit ITU-T E.164 country calling codes
const THREE_DIGIT_COUNTRY_CODES = new Set([
  '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229',
  '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243',
  '244', '245', '246', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258',
  '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298',
  '299', '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371', '372',
  '373', '374', '375', '376', '377', '378', '380', '381', '382', '383', '385', '386', '387', '389',
  '420', '421', '423', '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590',
  '591', '592', '593', '594', '595', '596', '597', '598', '599', '670', '672', '673', '674', '675',
  '676', '677', '678', '679', '680', '681', '682', '683', '685', '686', '687', '688', '689', '690',
  '691', '692', '850', '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964',
  '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993',
  '994', '995', '996', '998'
]);

/**
 * @param {string | null | undefined} raw
 * @returns {string} Leading + only if present in input; otherwise digits only. Empty string if no digits.
 */
export function normalizePhoneInput(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(DIGITS_ONLY, '');
  if (!digits) return hasPlus ? '+' : '';

  return hasPlus ? `+${digits}` : digits;
}

/**
 * US 10-digit national number (no country code); formatted progressively.
 * @param {string} digits
 */
function formatUsNational(digits) {
  if (!digits) return '';
  const core = digits.slice(0, 10);
  const extra = digits.slice(10);
  let base;
  if (core.length <= 3) {
    base = `(${core}`;
  } else if (core.length <= 6) {
    base = `(${core.slice(0, 3)}) ${core.slice(3)}`;
  } else {
    base = `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6, 10)}`;
  }
  return extra ? `${base} ${extra}`.trim() : base;
}

/**
 * +1 NANP: show as +1 (XXX) XXX-XXXX.
 * @param {string} digitsAfterPlus digits only after stripping +
 */
function formatNanpInternational(digitsAfterPlus) {
  const rest = digitsAfterPlus.slice(1);
  if (rest.length === 0) return '+1';
  return `+1 ${formatUsNational(rest)}`.trim();
}

/**
 * International formatting with country code recognition and clean subscriber grouping.
 * @param {string} body digits after +
 */
function formatInternational(body) {
  if (!body) return '+';

  if (body.startsWith('1')) {
    return formatNanpInternational(body);
  }

  let ccLen = 2;
  if (body.length >= 3 && THREE_DIGIT_COUNTRY_CODES.has(body.slice(0, 3))) {
    ccLen = 3;
  } else if (body.length < 2) {
    ccLen = body.length;
  }

  const cc = body.slice(0, ccLen);
  const subscriber = body.slice(ccLen);

  if (!subscriber) return `+${cc}`;

  // Special subscriber layout for France (2-digit pairs: 1 42 68 53 00)
  if (cc === '33') {
    const pairs = [];
    if (subscriber.length >= 1) pairs.push(subscriber.slice(0, 1));
    for (let i = 1; i < subscriber.length; i += 2) {
      pairs.push(subscriber.slice(i, i + 2));
    }
    return `+33 ${pairs.join(' ')}`.trim();
  }

  // Special subscriber layout for UK (+44 7911 123456)
  if (cc === '44') {
    if (subscriber.length <= 4) {
      return `+44 ${subscriber}`;
    }
    return `+44 ${subscriber.slice(0, 4)} ${subscriber.slice(4)}`.trim();
  }

  // Special subscriber layout for India (+91 98765 43210)
  if (cc === '91') {
    if (subscriber.length <= 5) return `+91 ${subscriber}`;
    return `+91 ${subscriber.slice(0, 5)} ${subscriber.slice(5)}`.trim();
  }

  // Special subscriber layout for Japan (+81 90 1234 5678)
  if (cc === '81') {
    if (subscriber.length <= 2) return `+81 ${subscriber}`;
    if (subscriber.length <= 6) return `+81 ${subscriber.slice(0, 2)} ${subscriber.slice(2)}`;
    return `+81 ${subscriber.slice(0, 2)} ${subscriber.slice(2, 6)} ${subscriber.slice(6)}`.trim();
  }

  // Special subscriber layout for Germany (+49 30 12345678)
  if (cc === '49') {
    if (subscriber.length <= 2) return `+49 ${subscriber}`;
    return `+49 ${subscriber.slice(0, 2)} ${subscriber.slice(2)}`.trim();
  }

  // Default international grouping: CC then subscriber in 3-4 digit blocks
  const chunks = [];
  let i = 0;
  while (i < subscriber.length) {
    if (subscriber.length - i === 4) {
      chunks.push(subscriber.slice(i, i + 4));
      i += 4;
    } else {
      const chunkSize = Math.min(3, subscriber.length - i);
      chunks.push(subscriber.slice(i, i + chunkSize));
      i += chunkSize;
    }
  }

  return `+${cc} ${chunks.join(' ')}`.trim();
}

/**
 * Pretty-print for UI. Pass normalized or raw user string; internally normalizes first
 * so display matches stored value.
 *
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function formatPhoneDisplay(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const isInternational = trimmed.startsWith('+');
  const digits = trimmed.replace(DIGITS_ONLY, '');
  if (!digits) return isInternational ? '+' : '';

  if (isInternational) {
    return formatInternational(digits);
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return formatNanpInternational(digits);
  }

  if (digits.length <= 10) {
    return formatUsNational(digits);
  }

  // Extra digits without plus -> format 10 national and append rest
  return formatUsNational(digits);
}
