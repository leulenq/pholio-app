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
    body: 'When you submit, your digitals, stats, book, and comp card are shared with the agency you choose. They review your package and decide whether to represent you and where to place you.',
  },
  {
    heading: 'Pholio is not a talent agency',
    body: 'Pholio gives you the tools to present your work professionally. Submitting does not create representation, and we do not guarantee a reply, a meeting, signing, or income.',
  },
  {
    heading: 'You stay in control',
    body: 'You choose which agency receives your package, you can submit to more than one, and you can withdraw an active submission from your applications ledger at any time.',
  },
];

const FULL_NOTICE_URL = `${MARKETING_SITE_URL}/legal/submission-program`;

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

      <a
        href={FULL_NOTICE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="apply-threshold__link"
      >
        Read the full submission program notice
        <ArrowUpRight size={13} aria-hidden />
      </a>
    </div>
  );
}
