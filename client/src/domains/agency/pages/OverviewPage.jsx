import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgencyOverview, useRecentApplicants } from '../hooks/useAgencyOverview';
import { selectKpis, selectPipeline, selectAlerts, mapApplicant } from '../components/overview/overviewData';
import PipelineCommandHero from '../components/overview/PipelineCommandHero';
import StatLedger from '../components/overview/StatLedger';
import CastingPipelineBar from '../components/overview/CastingPipelineBar';
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

  const kpis = selectKpis(overview);
  const stages = selectPipeline(overview);
  const alerts = selectAlerts(overview);
  const incoming = applicants.map(mapApplicant);
  const total = stages.reduce((s, x) => s + x.count, 0);
  const firstName = overview?.firstName || 'there';

  const ledger = [
    { label: 'Active Castings', value: kpis.activeCastings, delta: kpis.activeCastings ? 'in market' : '—', deltaTone: 'gold' },
    { label: 'Roster Size', value: kpis.rosterSize, deltaTone: 'up' },
    { label: 'Placement Rate', value: kpis.placementRate, suffix: '%', deltaTone: 'up' },
    { label: 'In Market', value: kpis.utilization, delta: 'on submission', deltaTone: 'neutral' },
  ];

  return (
    <motion.div className="ov-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ display: 'flex', gap: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ov-greeting">
            <div>
              <div className="ov-greeting-title">{greeting()}, {firstName}.</div>
              <div className="ov-greeting-sub">
                {kpis.pendingReview > 0 ? `${kpis.pendingReview} decisions need you today.` : 'Your roster is all caught up.'}
              </div>
            </div>
          </div>

          <PipelineCommandHero
            pendingReview={kpis.pendingReview}
            heroImage={incoming[0]?.photo || HERO_FALLBACK}
            onReview={() => navigate('/dashboard/agency/applicants')}
            onNewCasting={() => navigate('/dashboard/agency/casting')}
          />

          <StatLedger stats={ledger} />
          <CastingPipelineBar stages={stages} total={total} />
        </div>

        <aside className="ag-rightcol">
          <div className="ag-grain" style={{ opacity: .03, mixBlendMode: 'multiply' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <IncomingList applicants={incoming} onSelect={setSelected} />
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
