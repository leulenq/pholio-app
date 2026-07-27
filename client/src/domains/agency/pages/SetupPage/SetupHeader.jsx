import React from 'react';

const ONE_LINE_MAX = 26;

/**
 * The setup header anchor.
 *
 * Centred PHOLIO · agency-name lockup, matching the co-brand treatment in the
 * agency dashboard rail (see CoBrandLockup / AgencyLayout.css) so the workspace
 * identity is the same object before and after setup completes. Sign out is the
 * only utility action.
 */
export default function SetupHeader({ agencyName, onSignOut, children }) {
  const name = (agencyName || '').trim();
  const isLong = name.length > ONE_LINE_MAX;

  return (
    <header className="stg-masthead">
      <div className="stg-masthead__inner">
        <div className="stg-cobrand">
          <span className="stg-cobrand__pholio">PHOLIO</span>
          {name ? (
            <>
              <span className="stg-cobrand__div" aria-hidden="true" />
              <span
                className={`stg-cobrand__name${isLong ? ' is-long' : ''}`}
                title={name}
              >
                {name}
              </span>
            </>
          ) : null}
        </div>

        <div className="stg-masthead__utility">
          <button type="button" className="stg-signout" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
      {children}
    </header>
  );
}
