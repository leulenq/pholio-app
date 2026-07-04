import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { MARKETING_SITE_URL } from '../../../../shared/lib/logout';

/* The one-time submission-program threshold body — the program's terms read as
   a calm editorial ledger (numbered, serif), not a settings-page legal block.
   The affirmative action that records the acknowledgment lives in the dossier
   foot ("I understand — begin submission"); this is the notice it confirms. */

const FALLBACK_SECTIONS = [
  {
    heading: 'Your package goes to the agency',
    body: 'Adult packages include name, age, city, contact details, measurements, selected digitals and book, comp card, note, and linked social profiles. Minor packages omit direct contact, social links, portfolio URL, optional note, and raw date of birth; agencies communicate through Pholio.',
  },
  {
    heading: 'Pholio is not a talent agency',
    body: 'Pholio gives you the tools to present your work professionally. Submitting does not create representation, and we do not guarantee a reply, a meeting, signing, or income.',
  },
  {
    heading: 'Retention and withdrawal',
    body: 'Pholio retains the package for up to 24 months. Withdrawing revokes agency access in Pholio, redacts the platform snapshot, and deletes the platform message thread, but cannot recall copies already downloaded or recorded by the agency.',
  },
];

const TERMS_URL = `${MARKETING_SITE_URL}/terms`;
const PRIVACY_URL = `${MARKETING_SITE_URL}/privacy`;

export default function SubmissionThreshold({ content }) {
  const sections =
    Array.isArray(content?.sections) && content.sections.length > 0
      ? content.sections
      : FALLBACK_SECTIONS;

  return (
    <div className="apply-threshold">
      <ol className="apply-threshold__points">
        {sections.map((section, index) => (
          <li key={section.heading || `section-${index}`} className="apply-threshold__point">
            <span className="apply-threshold__num" aria-hidden>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="apply-threshold__copy">
              {section.heading ? <h3>{section.heading}</h3> : null}
              {section.body ? <p>{section.body}</p> : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="apply-threshold__links" aria-label="Legal notices">
        <a
          href={TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="apply-threshold__link"
        >
          Terms
          <ArrowUpRight size={13} aria-hidden />
        </a>
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="apply-threshold__link"
        >
          Privacy notice
          <ArrowUpRight size={13} aria-hidden />
        </a>
      </div>
    </div>
  );
}
