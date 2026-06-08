import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { getAgencyProfile } from '../api/agency';
import { useAgencyOverview, useRecentApplicants } from '../hooks/useAgencyOverview';
import { useBoards, useAgencyActivity } from '../hooks/useOverviewModules';
import {
  selectKpis, selectPipeline, selectPulse, selectTalentMix,
  buildNextMoves, mapApplicant,
  buildAttentionItems, pickOverviewHero,
} from '../components/overview/overviewData';
import OverviewPulse from '../components/overview/OverviewPulse';
import BoardsTable from '../components/overview/BoardsTable';
import ActivityFeed from '../components/overview/ActivityFeed';
import NextMoves from '../components/overview/NextMoves';
import TalentStrip from '../components/overview/TalentStrip';
import TeamModule from '../components/overview/TeamModule';
import { TalentPanel } from '../components/TalentPanel';
import './OverviewPage.css';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const [selected, setSelected] = useState(null);
  const { data: overview } = useAgencyOverview();
  const { data: applicants = [] } = useRecentApplicants(24);
  const { data: boards = [] } = useBoards();
  const { data: activity = [] } = useAgencyActivity(7);
  const { data: profile } = useQuery({ queryKey: ['agency-profile'], queryFn: getAgencyProfile, staleTime: 5 * 60 * 1000 });

  const kpis = selectKpis(overview);
  const stages = selectPipeline(overview);
  const pulse = selectPulse(overview);
  const talentMix = selectTalentMix(overview);
  const nextMoves = buildNextMoves(pulse, talentMix);
  const incoming = applicants.map(mapApplicant);
  const topMatches = [...incoming].sort((a, b) => (b.match || 0) - (a.match || 0)).slice(0, 20);
  const firstName = profile?.first_name || 'there';

  const sublineParts = [
    pulse.newToday ? `${pulse.newToday} new today` : null,
    kpis.pendingReview ? `${kpis.pendingReview} to review` : null,
    pulse.closingWeek ? `${pulse.closingWeek} board${pulse.closingWeek === 1 ? '' : 's'} closing this week` : null,
  ].filter(Boolean);
  const subline = sublineParts.length ? sublineParts.join('   ·   ') : 'Your roster is all caught up.';

  const attention = buildAttentionItems(kpis, pulse);
  const hero = pickOverviewHero(attention);
  const pulseActions = attention.filter((a) => a.key !== hero.key && a.n > 0);

  return (
    <motion.div className="ov-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="ov-greeting">
        <div>
          <div className="ov-greeting-title">{greeting()}, {firstName}.</div>
          <div className="ov-greeting-sub">{subline}</div>
        </div>
      </div>

      <OverviewPulse hero={hero} actions={pulseActions} />
      <TalentStrip
        title="Top matches today"
        talents={topMatches}
        onSelect={setSelected}
        viewAllTo="/dashboard/agency/applicants"
      />
      <BoardsTable boards={boards} stages={stages} />

      <div className="ov-grid-3">
        <ActivityFeed items={activity} />
        <TeamModule />
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
