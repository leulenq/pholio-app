import React from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';

/**
 * Restrained onboarding actions, modelled on the shell's top-left Back control:
 * borderless, uppercase, letter-spaced, faint → gold on hover, with a chevron
 * that slides. Deliberately not traditional buttons.
 *
 * CinematicNextButton — forward primary action (Continue / Next / Confirm / Finish).
 * CinematicBackButton — quiet secondary action (Back / Edit).
 */

export const CinematicNextButton = ({ onClick, children, icon: Icon = ArrowRight, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} className="cine-next">
    <span>{children}</span>
    <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
  </button>
);

export const CinematicBackButton = ({ onClick, children = 'Back' }) => (
  <button type="button" onClick={onClick} className="cine-sub cine-sub--back">
    <ArrowLeft size={13} strokeWidth={1.6} aria-hidden="true" />
    <span>{children}</span>
  </button>
);
