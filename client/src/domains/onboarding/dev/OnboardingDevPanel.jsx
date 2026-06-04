/**
 * OnboardingDevPanel (DEV ONLY)
 * -----------------------------
 * Floating control panel to jump directly to any onboarding step / sub-step
 * with seeded state. Rendered only when import.meta.env.DEV is true, so it is
 * stripped from production builds. Self-contained inline styles keep it a
 * single removable file.
 */

import React, { useState } from 'react';

const C = {
  gold: '#C9A55A',
  panel: 'rgba(14, 13, 11, 0.94)',
  border: 'rgba(201, 165, 90, 0.25)',
  text: 'rgba(255,255,255,0.7)',
  faint: 'rgba(255,255,255,0.35)',
};

const mono = '"SFMono-Regular", ui-monospace, Menlo, monospace';

function chip(active) {
  return {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: '0.04em',
    padding: '4px 8px',
    borderRadius: 5,
    cursor: 'pointer',
    border: `1px solid ${active ? C.gold : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(201,165,90,0.16)' : 'rgba(255,255,255,0.03)',
    color: active ? C.gold : C.text,
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  };
}

export default function OnboardingDevPanel({ steps, current, onSelect, onExit }) {
  const [open, setOpen] = useState(true);

  const activeView = current?.view ?? null;
  const activeSub = current?.subStep ?? null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        width: open ? 260 : 'auto',
        fontFamily: mono,
        color: C.text,
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
        backdropFilter: 'blur(10px)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: open ? `1px solid rgba(255,255,255,0.08)` : 'none',
          cursor: 'pointer',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.12em', color: C.gold }}>
          ● DEV · ONBOARDING PREVIEW
        </span>
        <span style={{ fontSize: 11, color: C.faint }}>{open ? '▾' : '▸'}</span>
      </div>

      {open && (
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '70vh', overflowY: 'auto' }}>
          {steps.map((step) => {
            const isActiveView = activeView === step.view;
            return (
              <div key={step.view} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  style={chip(isActiveView)}
                  onClick={() =>
                    onSelect({
                      view: step.view,
                      subStep: step.subSteps ? step.subSteps[0].key : null,
                    })
                  }
                >
                  {step.label}
                </button>

                {step.subSteps && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 8 }}>
                    {step.subSteps.map((ss) => (
                      <button
                        key={String(ss.key)}
                        type="button"
                        style={{
                          ...chip(isActiveView && activeSub === ss.key),
                          fontSize: 9,
                          padding: '3px 6px',
                        }}
                        onClick={() => onSelect({ view: step.view, subStep: ss.key })}
                      >
                        {ss.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={onExit}
            style={{
              marginTop: 4,
              fontFamily: mono,
              fontSize: 10,
              letterSpacing: '0.08em',
              padding: '6px 8px',
              borderRadius: 5,
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: C.faint,
            }}
          >
            ⤫ Exit preview · resume real flow
          </button>

          <p style={{ margin: 0, fontSize: 9, lineHeight: 1.5, color: 'rgba(255,255,255,0.28)' }}>
            Dev only. Seeds realistic state and jumps locally — never writes to the
            server. Deep-link: <code>?preview=measurements.bust</code>
          </p>
        </div>
      )}
    </div>
  );
}
