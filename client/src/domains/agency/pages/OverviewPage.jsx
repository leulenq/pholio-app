import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { getAgencyProfile } from '../api/agency';
import { useAgencyOverview, useRecentApplicants } from '../hooks/useAgencyOverview';
import { useBoards, useAgencyActivity } from '../hooks/useOverviewModules';
import {
  selectKpis, selectPipeline, selectPulse,
  buildNextMoves, mapApplicant,
} from '../components/overview/overviewData';
import TodayDocket from '../components/overview/TodayDocket';
import BoardsTable from '../components/overview/BoardsTable';
import ActivityFeed from '../components/overview/ActivityFeed';
import NextMoves from '../components/overview/NextMoves';
import TalentStrip from '../components/overview/TalentStrip';
import TeamModule from '../components/overview/TeamModule';
import { TalentPanel } from '../components/TalentPanel';
import { SkeletonRow, SkeletonCard, SkeletonStrip } from '../components/ui/AgencySkeleton';
import { EmptyErrorState } from '../../../shared/components/states';
import './OverviewPage.css';

// First-load placeholder — mirrors the real layout (masthead/ledger, top
// matches strip, boards table, bottom 3-column modules) instead of a
// centered spinner, so the page never looks empty while it is loading.
function OverviewSkeleton() {
  return (
    <div className="ov-skeleton">
      <div className="ov-skeleton-mast">
        <SkeletonRow count={1} />
      </div>
      <div className="ov-skeleton-ledger">
        <SkeletonStrip count={4} />
      </div>
      <div className="ov-skeleton-strip">
        <SkeletonCard count={6} />
      </div>
      <div className="ov-skeleton-table">
        <SkeletonRow count={5} />
      </div>
      <div className="ov-grid-3">
        <SkeletonRow count={4} compact />
        <SkeletonRow count={4} compact />
        <SkeletonRow count={4} compact />
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const [selected, setSelected] = useState(null);
  const { data: overview, isLoading, isError, refetch } = useAgencyOverview();
  const { data: applicants = [] } = useRecentApplicants(24);
  const { data: boards = [] } = useBoards();
  const { data: activity = [] } = useAgencyActivity(7);
  const { data: profile } = useQuery({ queryKey: ['agency-profile'], queryFn: getAgencyProfile, staleTime: 5 * 60 * 1000 });

  if (isLoading) {
    return (
      <motion.div className="ov-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <OverviewSkeleton />
      </motion.div>
    );
  }

  if (isError) {
    return (
      <motion.div className="ov-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <EmptyErrorState
          title="Could not load your overview"
          body="Today's briefing, boards, and activity did not load. Try again to refresh."
          retry={{ label: 'Try again', onClick: () => refetch() }}
        />
      </motion.div>
    );
  }

  const kpis = selectKpis(overview);
  const stages = selectPipeline(overview);
  const pulse = selectPulse(overview);
  const nextMoves = buildNextMoves(pulse);
  const incoming = applicants.map(mapApplicant);
  const recentTalent = incoming.slice(0, 20);
  const firstName = profile?.first_name || null;
  const agencyName = profile?.agency_name || null;

  // The day's ledger — three editorial figures the booker acts on.
  const deskStats = [
    { key: 'review', label: 'Awaiting review', value: kpis.pendingReview, to: '/dashboard/agency/submissions' },
    { key: 'closing', label: 'Boards closing', value: pulse.closingWeek, to: '/dashboard/agency/signing' },
    { key: 'new', label: 'New submissions', value: pulse.newToday, to: '/dashboard/agency/submissions' },
  ];
  const deskAllClear = deskStats.every((s) => !s.value);

  return (
    <motion.div className="ov-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <TodayDocket
        firstName={firstName}
        agencyName={agencyName}
        stats={deskStats}
        allClear={deskAllClear}
      />
      <TalentStrip
        title="Top matches today"
          talents={recentTalent}
        onSelect={setSelected}
        viewAllTo="/dashboard/agency/submissions"
      />
      <BoardsTable boards={boards} stages={stages} />

      <div className="ov-grid-3">
        <NextMoves moves={nextMoves} />
        <ActivityFeed items={activity} />
        <TeamModule />
      </div>

      <AnimatePresence>
        {selected && (
          <TalentPanel key={selected.id} talent={selected} context="overview" onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
