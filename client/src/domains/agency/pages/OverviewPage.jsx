import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { getAgencyProfile } from '../api/agency';
import { useAgencyOverview, useRecentApplicants } from '../hooks/useAgencyOverview';
import { useBoards, useAgencyActivity } from '../hooks/useOverviewModules';
import {
  selectKpis, selectPipeline, selectPulse, selectTalentMix,
  buildNextMoves, mapApplicant, buildDocket,
} from '../components/overview/overviewData';
import TodayDocket from '../components/overview/TodayDocket';
import BoardsTable from '../components/overview/BoardsTable';
import ActivityFeed from '../components/overview/ActivityFeed';
import NextMoves from '../components/overview/NextMoves';
import TalentStrip from '../components/overview/TalentStrip';
import TeamModule from '../components/overview/TeamModule';
import { TalentPanel } from '../components/TalentPanel';
import './OverviewPage.css';

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

  const docket = buildDocket(kpis, pulse, boards, incoming);

  return (
    <motion.div className="ov-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <TodayDocket firstName={firstName} rows={docket.rows} allClear={docket.allClear} />
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
