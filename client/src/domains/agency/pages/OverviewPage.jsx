import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { getAgencyProfile } from '../api/agency';
import { useAgencyOverview, useRecentApplicants } from '../hooks/useAgencyOverview';
import { useBoards, useAgencyActivity } from '../hooks/useOverviewModules';
import {
  selectKpis, selectPipeline, selectPulse, selectTalentMix,
  buildNextMoves, mapApplicant,
} from '../components/overview/overviewData';
import StatLedger from '../components/overview/StatLedger';
import AttentionStrip from '../components/overview/AttentionStrip';
import BoardsTable from '../components/overview/BoardsTable';
import ActivityFeed from '../components/overview/ActivityFeed';
import NextMoves from '../components/overview/NextMoves';
import IncomingList from '../components/overview/IncomingList';
import { TalentPanel } from '../components/TalentPanel';
import './OverviewPage.css';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const [selected, setSelected] = useState(null);
  const { data: overview } = useAgencyOverview();
  const { data: applicants = [] } = useRecentApplicants(6);
  const { data: boards = [] } = useBoards();
  const { data: activity = [] } = useAgencyActivity(7);
  const { data: profile } = useQuery({ queryKey: ['agency-profile'], queryFn: getAgencyProfile, staleTime: 5 * 60 * 1000 });

  const kpis = selectKpis(overview);
  const stages = selectPipeline(overview);
  const pulse = selectPulse(overview);
  const talentMix = selectTalentMix(overview);
  const nextMoves = buildNextMoves(pulse, talentMix);
  const incoming = applicants.map(mapApplicant);
  const firstName = profile?.first_name || 'there';

  const sublineParts = [
    pulse.newToday ? `${pulse.newToday} new today` : null,
    kpis.pendingReview ? `${kpis.pendingReview} to review` : null,
    pulse.closingWeek ? `${pulse.closingWeek} board${pulse.closingWeek === 1 ? '' : 's'} closing this week` : null,
  ].filter(Boolean);
  const subline = sublineParts.length ? sublineParts.join('   ·   ') : 'Your roster is all caught up.';

  const ledger = [
    { label: 'Active Castings', value: kpis.activeCastings, delta: kpis.castingsClosingToday ? `${kpis.castingsClosingToday} close today` : 'none closing', deltaTone: 'gold' },
    { label: 'Roster Size', value: kpis.rosterSize, delta: kpis.rosterChangeThisMonth ? `↑ ${kpis.rosterChangeThisMonth} this month` : 'steady', deltaTone: 'up' },
    { label: 'Placement Rate', value: kpis.placementRate, suffix: '%', delta: kpis.placementLastSeason != null ? `from ${kpis.placementLastSeason}%` : null, deltaTone: 'up' },
    { label: 'In Market', value: kpis.utilization, delta: 'on submission', deltaTone: 'neutral' },
  ];

  const attention = [
    { key: 'review', n: kpis.pendingReview, label: 'Awaiting review', sub: kpis.pendingOldestDaysAgo ? `oldest ${kpis.pendingOldestDaysAgo}d` : 'all current', to: '/dashboard/agency/applicants', tone: (kpis.pendingOldestDaysAgo || 0) >= 14 ? 'urgent' : 'default' },
    { key: 'closing', n: pulse.closingWeek, label: 'Close this week', sub: kpis.castingsClosingToday ? `${kpis.castingsClosingToday} today` : 'across boards', to: '/dashboard/agency/casting', tone: kpis.castingsClosingToday > 0 ? 'urgent' : 'default' },
    { key: 'new', n: pulse.newToday, label: 'New today', sub: 'awaiting triage', to: '/dashboard/agency/applicants', tone: 'positive' },
    { key: 'idle', n: pulse.idleTalent, label: 'Idle bench', sub: 'unsubmitted 30d', to: '/dashboard/agency/roster', tone: 'default' },
  ];

  return (
    <motion.div className="ov-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="ov-greeting">
        <div>
          <div className="ov-greeting-title">{greeting()}, {firstName}.</div>
          <div className="ov-greeting-sub">{subline}</div>
        </div>
      </div>

      <StatLedger stats={ledger} />
      <AttentionStrip items={attention} />
      <BoardsTable boards={boards} stages={stages} />

      <div className="ov-grid-3">
        <ActivityFeed items={activity} />
        <IncomingList applicants={incoming} onSelect={setSelected} />
        <NextMoves moves={nextMoves} />
      </div>

      <AnimatePresence>
        {selected && (
          <TalentPanel key={selected.id} talent={selected} context="overview" onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
