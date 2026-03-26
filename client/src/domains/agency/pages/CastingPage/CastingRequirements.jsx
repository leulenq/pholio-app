import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CastingRequirements({
  briefExpanded,
  setBriefExpanded,
  activeCasting,
  getBoardStatus,
  formatDeadline,
  displayedStages,
  candidates,
}) {
  return (
    <aside
      className={[
        'flex-shrink-0 bg-white border-l border-slate-100 flex flex-col relative transition-all duration-300 ease-in-out overflow-hidden',
        briefExpanded ? 'w-[360px] shadow-[0_0_60px_-15px_rgba(0,0,0,0.12)] z-20' : 'w-11',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setBriefExpanded((v) => !v)}
        className="absolute left-0 top-0 w-11 h-full border-r border-slate-100 flex flex-col items-center justify-start pt-6 gap-4 text-slate-500 hover:text-[#0f172a] transition-colors duration-200 z-10 bg-white flex-shrink-0"
      >
        {briefExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        {!briefExpanded && (
          <span className="[writing-mode:vertical-rl] text-[0.75rem] font-bold uppercase tracking-[0.2em] text-slate-600">Brief</span>
        )}
      </button>
      <AnimatePresence>
        {briefExpanded && (
          <motion.div
            className="pl-14 pr-8 py-8 overflow-y-auto flex-1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <h2 className="font-display text-xl font-bold text-[#0f172a] leading-tight">{activeCasting?.name}</h2>
            <div className="flex gap-2 flex-wrap mt-3 mb-8">
              <span className="px-2.5 py-1 text-[0.5625rem] font-black uppercase tracking-widest rounded bg-[#C9A84C]/8 text-[#C9A84C] border border-[#C9A84C]/10">{activeCasting?.client_name || 'Internal Casting'}</span>
              <span
                className={[
                  'px-2.5 py-1 text-[0.5625rem] font-black uppercase tracking-widest rounded border',
                  getBoardStatus(activeCasting) === 'Closing Soon'
                    ? 'bg-orange-50 text-orange-600 border-orange-100'
                    : 'bg-slate-50 text-slate-400 border-slate-100',
                ].join(' ')}
              >
                {getBoardStatus(activeCasting)}
              </span>
            </div>
            {[
              { label: 'The Brief', body: activeCasting?.description || 'No creative brief has been added yet.' },
              { label: 'Delivery Window', body: `Casting closes ${formatDeadline(activeCasting?.closes_at)}.` },
            ].map((s) => (
              <div key={s.label} className="mb-8">
                <h4 className="font-display text-base font-bold italic text-[#0f172a] mb-3">{s.label}</h4>
                <p className="text-sm text-slate-700 leading-relaxed font-medium">{s.body}</p>
              </div>
            ))}
            <div className="mb-8">
              <h4 className="font-display text-base font-bold italic text-[#0f172a] mb-3">Pipeline Snapshot</h4>
              <div className="grid grid-cols-2 gap-3 mt-3">
                {displayedStages.map((stage) => (
                  <div key={stage} className="rounded-lg border border-slate-100 bg-[#faf9f7] px-4 py-3">
                    <div className="text-[0.625rem] font-black uppercase tracking-widest text-slate-400">{stage}</div>
                    <div className="mt-2 font-display text-2xl text-[#0f172a]">
                      {candidates.filter((candidate) => candidate.stage === stage).length}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
