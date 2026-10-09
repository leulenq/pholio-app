import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Arrival } from './ArrivalPage';
import './arrival.css';

/**
 * Dev-only replay of the agency arrival: /dev/preview/agency-arrival
 *
 * Uses the signed-in agency's real record when there is one (even if it has
 * already finished onboarding), otherwise a fixture agency. Nothing is
 * written. Query params:
 *
 *   ?fixture=1        ignore the live record
 *   ?name=...         override the agency name (try a long one)
 *   ?mark=1           drop the logo so the mark scene appears
 *   ?terms=0          skip the policies scene
 *   ?role=AGENT       see what a non-owner member gets
 *   ?brand=%23C0392B  override the brand colour
 */

const FIXTURE_INTRO = {
  agency: {
    name: 'Maison Nord Models',
    location: 'Copenhagen, Denmark',
    city: 'Copenhagen',
    website: 'https://maisonnord.dk',
    description: null,
    logoPath: null,
    brandColor: null,
    instagram: null,
    agencyType: 'Mother agency',
    completedAt: null,
  },
  approval: {
    requestedAt: new Date(Date.now() - 9 * 86400000).toISOString(),
    approvedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    agencyName: 'Maison Nord Models',
    city: 'Copenhagen',
    country: 'Denmark',
    agencyType: 'Mother agency',
    boards: ['Women', 'Men', 'New Faces'],
    contactName: 'Ida Holm',
    contactRole: 'Director',
    additionalLocations: ['Stockholm', 'Oslo'],
    rosterSize: '50-150',
    teamSize: '4-10',
    timezone: 'Europe/Copenhagen',
  },
  verification: null,
  viewer: { firstName: 'Ida', email: 'ida@maisonnord.dk', role: 'OWNER' },
  memberCount: 1,
  boards: {
    chosen: ['Women', 'Men', 'New Faces'],
    offered: ['Women', 'Men', 'New Faces', 'Commercial', 'Curve', 'Runway'],
    source: 'request',
  },
  reviewWindow: { days: 30, options: [14, 21, 30, 45, 60] },
  units: 'metric',
};

const FIXTURE_POLICIES = {
  needsAcceptance: true,
  manifestVersion: 'preview',
  policies: [
    { key: 'terms', title: 'Terms of Service', version: 'preview', url: '#', copy: 'I accept the current Terms of Service for my individual agency login.' },
    { key: 'privacy', title: 'Privacy Policy', version: 'preview', url: '#', copy: 'I have reviewed how Pholio processes portfolio, submission, and workspace data.' },
    { key: 'workspace', title: 'Workspace Use', version: 'preview', url: '#', copy: 'I will use this workspace only for legitimate representation, scouting, and booking operations.' },
  ],
};

async function readLive(path) {
  try {
    const response = await fetch(`/api/agency${path}`, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.success === true && body.data !== undefined ? body.data : body;
  } catch {
    return null;
  }
}

export default function ArrivalPreview() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const [state, setState] = useState(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const useLive = params.get('fixture') !== '1';
      const [liveIntro, liveLegal] = useLive
        ? await Promise.all([readLive('/setup/arrival'), readLive('/legal-status')])
        : [null, null];
      if (cancelled) return;
      const base = liveIntro || FIXTURE_INTRO;
      const intro = {
        ...base,
        agency: {
          ...base.agency,
          completedAt: null,
          ...(params.get('name') ? { name: params.get('name') } : {}),
          ...(params.get('mark') === '1' ? { logoPath: null } : {}),
          ...(params.get('brand') ? { brandColor: params.get('brand') } : {}),
        },
        viewer: { ...base.viewer, ...(params.get('role') ? { role: params.get('role') } : {}) },
      };
      const policies = liveLegal?.policies?.length ? liveLegal : FIXTURE_POLICIES;
      const legal = params.get('terms') === '0' ? { needsAcceptance: false } : { ...policies, needsAcceptance: true };
      setState({ intro, legal, live: Boolean(liveIntro) });
    })();
    return () => {
      cancelled = true;
    };
    // Params are read once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state) return <main className="arv" aria-busy="true" />;

  return (
    <Arrival
      key={run}
      intro={state.intro}
      legal={state.legal}
      preview={{
        // A live agency that has already opened lands in its real dashboard,
        // so the hand-off can be seen; the fixture replays from the start.
        onDone: () => (state.live ? navigate('/dashboard/agency') : setRun((n) => n + 1)),
      }}
    />
  );
}
