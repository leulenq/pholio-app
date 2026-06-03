import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { getAgencyProfile } from '../api/agency';
import { useAgencyOverview, useRecentApplicants } from '../hooks/useAgencyOverview';
import { useBoards, useAgencyActivity } from '../hooks/useOverviewModules';
import {
  selectKpis, selectPipeline, selectAlerts, selectPulse, selectTalentMix,
  buildNextMoves, mapApplicant,
} from '../components/overview/overviewData';
import PipelineCommandHero from '../components/overview/PipelineCommandHero';
import StatLedger from '../components/overview/StatLedger';
import CastingPipelineBar from '../components/overview/CastingPipelineBar';
import ActiveBoards from '../components/overview/ActiveBoards';
import ActivityFeed from '../components/overview/ActivityFeed';
import NextMoves from '../components/overview/NextMoves';
import IncomingList from '../components/overview/IncomingList';
import OnTheFloorList from '../components/overview/OnTheFloorList';
import { TalentPanel } from '../components/TalentPanel';
import './OverviewPage.css';

const HERO_FALLBACK = 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=600';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const { data: overview } = useAgencyOverview();
  const { data: applicants = [] } = useRecentApplicants(6);
  const { data: boards = [] } = useBoards();
  const { data: activity = [] } = useAgencyActivity(7);
  const { data: profile } = useQuery({ queryKey: ['agency-profile'], queryFn: getAgencyProfile, staleTime: 5 * 60 * 1000 });

  const kpis = selectKpis(overview);
  const stages = selectPipeline(overview);
  const alerts = selectAlerts(overview);
  const pulse = selectPulse(overview);
  const talentMix = selectTalentMix(overview);
  const nextMoves = buildNextMoves(pulse, talentMix);
  const incoming = applicants.map(mapApplicant);
  const total = stages.reduce((s, x) => s + x.count, 0);
  const firstName = profile?.first_name || 'there';

  const sublineParts = [
    pulse.newToday ? `${pulse.newToday} new today` : null,
    kpis.pendingReview ? `${kpis.pendingReview} to review` : null,
    pulse.closingWeek ? `${pulse.closingWeek} board${pulse.closingWeek === 1 ? '' : 's'} closing this week` : null,
  ].filter(Boolean);
  const subline = sublineParts.length ? sublineParts.join('  ·  ') : 'Your roster is all caught up.';

  const ledger = [
    { label: 'Active Castings', value: kpis.activeCastings, delta: kpis.castingsClosingToday ? `${kpis.castingsClosingToday} close today` : 'none closing', deltaTone: 'gold' },
    { label: 'Roster Size', value: kpis.rosterSize, delta: kpis.rosterChangeThisMonth ? `↑ ${kpis.rosterChangeThisMonth} this month` : 'steady', deltaTone: 'up' },
    { label: 'Placement Rate', value: kpis.placementRate, suffix: '%', delta: kpis.placementLastSeason != null ? `from ${kpis.placementLastSeason}%` : null, deltaTone: 'up' },
    { label: 'In Market', value: kpis.utilization, delta: 'on submission', deltaTone: 'neutral' },
  ];

  return (
    <motion.div className="ov-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="ov-layout">
        <div className="ov-layout-main">
          <div className="ov-greeting">
            <div>
              <div className="ov-greeting-title">{greeting()}, {firstName}.</div>
              <div className="ov-greeting-sub">{subline}</div>
            </div>
          </div>

          <PipelineCommandHero
            pendingReview={kpis.pendingReview}
            oldestDaysAgo={kpis.pendingOldestDaysAgo}
            heroImage={incoming[0]?.photo || HERO_FALLBACK}
            onReview={() => navigate('/dashboard/agency/applicants')}
            onNewCasting={() => navigate('/dashboard/agency/casting')}
          />

          <StatLedger stats={ledger} />
          <ActiveBoards boards={boards} />
          <CastingPipelineBar stages={stages} total={total} />
        </div>

        <aside className="ag-rightcol">
          <div className="ag-grain" style={{ opacity: .03, mixBlendMode: 'multiply' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <NextMoves moves={nextMoves} />
            <IncomingList applicants={incoming} onSelect={setSelected} />
            <ActivityFeed items={activity} />
            <OnTheFloorList alerts={alerts} />
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {selected && (
          <TalentPanel key={selected.id} talent={selected} context="overview" onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
