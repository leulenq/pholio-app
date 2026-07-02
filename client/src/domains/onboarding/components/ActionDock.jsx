import React from 'react';
import { useActionDockConfig } from './ActionDockContext';
import './ActionDock.css';

/**
 * ActionDock — the single fixed, bottom-center action for the whole flow.
 *
 * Always mounted with a reserved height (118px) so it never repositions between
 * steps. Reads the current config from ActionDockContext; renders nothing (but
 * keeps its reserved space) when no step has published a config.
 */
export default function ActionDock() {
  const config = useActionDockConfig();
  const { label, enabled = false, onAdvance, skip } = config || {};
  // A step can publish { label: null } to keep the dock reserved but empty
  // (e.g. the entry choice screen, where the auth doors are the action).
  const show = !!label;

  React.useEffect(() => {
    const handleGlobalEnter = (e) => {
      if (e.key === 'Enter') {
        const active = document.activeElement;
        
        // Let textareas handle Enter (newlines)
        if (active && active.tagName === 'TEXTAREA') {
          return;
        }
        
        // Let input elements handle Enter (like submitting SpotlightField name/email/date)
        if (active && (active.tagName === 'INPUT' || active.isContentEditable)) {
          return;
        }

        if (enabled && onAdvance) {
          e.preventDefault();
          onAdvance();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalEnter);
    return () => window.removeEventListener('keydown', handleGlobalEnter);
  }, [enabled, onAdvance]);

  return (
    <div className="action-dock">
      <div className="action-dock-inner">
        {show && (
          <>
            <button
              type="button"
              className="action-dock-cta"
              disabled={!enabled}
              onClick={enabled ? onAdvance : undefined}
            >
              <span>{label}</span>
              <span className="action-dock-arw" aria-hidden="true">→</span>
            </button>

            {skip && (
              <button
                type="button"
                className="action-dock-cta action-dock-cta--text"
                onClick={skip.onClick}
              >
                {skip.label || 'Skip for now'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
