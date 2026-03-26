import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronRight, ChevronLeft, Search, Calendar, X } from 'lucide-react';

export default function CastingCallBuilder({
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  filteredBoards,
  activeCasting,
  onSelectCasting,
  castingSearch,
  setCastingSearch,
  getBoardProgress,
  getBoardStatus,
  formatDeadline,
  showNewForm,
  setShowNewForm,
  newRoleForm,
  setNewRoleForm,
  onSubmitNewRole,
  createBoardPending,
}) {
  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: isSidebarCollapsed ? 64 : 320 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex-shrink-0 bg-transparent flex flex-col relative shadow-[8px_0_32px_rgba(0,0,0,0.06)] z-20"
      >
        <div className={['px-6 py-8 flex flex-col gap-6 overflow-hidden', isSidebarCollapsed ? 'items-center' : ''].join(' ')}>
          <div className="flex items-center justify-between w-full">
            {!isSidebarCollapsed && (
              <h1 className="font-display text-[1.25rem] font-bold text-[#0f172a] tracking-tight whitespace-nowrap">Castings</h1>
            )}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className={['p-2 text-[#C9A84C] hover:bg-[#C9A84C]/10 rounded-lg transition-colors', isSidebarCollapsed ? 'mx-auto' : ''].join(' ')}
            >
              {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            {!isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => setShowNewForm(true)}
                className="px-3 py-1 bg-transparent text-[#C9A84C] text-[0.75rem] font-semibold border border-[#C9A84C] hover:bg-[#C9A84C] hover:text-white transition-all duration-200"
                style={{ borderRadius: '6px' }}
              >
                <Plus size={12} strokeWidth={3} className="inline mr-1" /> NEW
              </button>
            )}
          </div>

          {!isSidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative group"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C9A84C]/40" size={14} />
              <input
                type="text"
                placeholder="Search roles..."
                value={castingSearch}
                onChange={(e) => setCastingSearch(e.target.value)}
                className="w-full h-9 bg-[#C9A84C]/5 border border-[#C9A84C]/20 pl-10 pr-4 text-[0.8125rem] font-sans text-slate-600 focus:outline-none focus:border-[#C9A84C]/40 transition-all placeholder:text-[#C9A84C]/60"
                style={{ borderRadius: '6px' }}
              />
            </motion.div>
          )}
        </div>

        <div className={['flex-1 overflow-y-auto pb-8 flex flex-col gap-3 scrollbar-hide', isSidebarCollapsed ? 'px-2' : 'px-4'].join(' ')}>
          {filteredBoards.map((c) => {
            const isActive = activeCasting?.id === c.id;
            const progress = getBoardProgress(c);
            const boardStatus = getBoardStatus(c);
            const totalSlots = Number(c.target_slots) || Number(c.application_count) || 0;
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => onSelectCasting(c.id)}
                className={[
                  'group w-full text-left transition-all duration-300 relative flex flex-col gap-6 overflow-hidden',
                  isSidebarCollapsed ? 'p-3 items-center' : 'p-6',
                  isActive
                    ? 'bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)] border-l-[3px] border-l-[#C9A84C] z-10 scale-[1.02]'
                    : 'bg-transparent hover:bg-black/[0.02] border-l-[3px] border-l-transparent',
                ].join(' ')}
                style={{ borderRadius: isSidebarCollapsed ? '10px' : '12px' }}
              >
                {!isSidebarCollapsed ? (
                  <>
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="font-display text-[1rem] font-bold text-[#0f172a] leading-tight tracking-tight">{c.name}</span>
                        <span className="text-[0.6rem] font-bold text-[#C9A84C] uppercase tracking-[0.08em]">{c.client_name || 'Internal Casting'}</span>
                      </div>
                      {boardStatus === 'Closing Soon' && (
                        <span className="text-[0.5625rem] font-black px-2 py-0.5 rounded-[4px] tracking-tighter uppercase whitespace-nowrap bg-[#B8860B]/10 text-[#B8860B]" style={{ borderRadius: '4px' }}>
                          {boardStatus}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col">
                        <span className="text-[1.5rem] font-bold text-[#0f172a] leading-none tracking-tight">{c.submitted_count || 0}</span>
                        <span className="text-[0.5rem] font-black text-[#0f172a] uppercase tracking-widest mt-1.5 ml-0.5 opacity-60">Applied</span>
                      </div>
                      <div className="w-full">
                        <div className="flex justify-between items-end mb-1.5">
                          <span className="text-[0.625rem] font-black text-slate-500 uppercase tracking-widest">{c.booked_count || 0} of {totalSlots} Slots</span>
                          <span className="text-[0.625rem] font-black text-[#C9A84C]">{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-black/[0.08] overflow-hidden" style={{ height: '3px', borderRadius: '100px' }}>
                          <motion.div
                            className="h-full bg-[#C9A84C] rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-400/60 mt-1">
                        <Calendar size={11} />
                        <span className="text-[0.7rem] font-medium tracking-tight whitespace-nowrap">{formatDeadline(c.closes_at)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="relative">
                    <div className={['w-8 h-8 rounded-full flex items-center justify-center font-display text-sm font-bold transition-all duration-300', isActive ? 'bg-[#C9A84C] text-white' : 'bg-slate-100 text-slate-400'].join(' ')}>
                      {(c.name || '?').charAt(0)}
                    </div>
                    {isActive && (
                      <motion.div
                        layoutId="active-dot"
                        className="absolute -right-1 -top-1 w-2.5 h-2.5 bg-white border-2 border-[#C9A84C] rounded-full"
                      />
                    )}
                  </div>
                )}
              </button>
            );
          })}
          {filteredBoards.length === 0 && !isSidebarCollapsed && (
            <div className="px-2 pt-2 text-xs text-slate-400">No castings match that search.</div>
          )}
        </div>
      </motion.aside>

      <AnimatePresence>
        {showNewForm && (
          <>
            <motion.div className="fixed bg-slate-900/40 backdrop-blur-sm z-40" style={{ top: 0, right: 0, bottom: 0, left: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNewForm(false)} />
            <motion.div
              className="fixed w-[480px] h-full bg-white z-50 p-10 overflow-y-auto shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)]"
              style={{ top: 0, right: 0 }}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="font-display text-3xl font-normal text-slate-800 tracking-tight">Create New Role</h2>
                <button type="button" onClick={() => setShowNewForm(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 hover:text-slate-800 transition-all duration-200"><X size={18} /></button>
              </div>
              <form className="flex flex-col gap-6" onSubmit={onSubmitNewRole}>
                {[
                  { key: 'name', label: 'Role Name', type: 'text', placeholder: 'e.g. FW25 Runway Lead' },
                  { key: 'client_name', label: 'Client', type: 'text', placeholder: 'e.g. Prada' },
                  { key: 'closes_at', label: 'Deadline', type: 'date', placeholder: '' },
                  { key: 'target_slots', label: 'Target Slots', type: 'number', placeholder: 'e.g. 12' },
                ].map(({ key, label, type, placeholder }) => (
                  <div key={label} className="flex flex-col gap-2">
                    <label className="text-[0.625rem] font-semibold uppercase tracking-widest text-slate-500">{label}</label>
                    <input
                      type={type}
                      placeholder={placeholder}
                      value={newRoleForm[key]}
                      onChange={(e) => setNewRoleForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="px-4 py-3.5 bg-[#faf9f7] border border-transparent rounded-lg text-sm font-sans text-slate-800 transition-all duration-200 focus:outline-none focus:border-gold-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(201,165,90,0.1)]"
                      required={key === 'name'}
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-2">
                  <label className="text-[0.625rem] font-semibold uppercase tracking-widest text-slate-500">Brief</label>
                  <textarea
                    placeholder="Describe the requirements..."
                    rows={4}
                    value={newRoleForm.description}
                    onChange={(e) => setNewRoleForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="px-4 py-3.5 bg-[#faf9f7] border border-transparent rounded-lg text-sm font-sans text-slate-800 resize-none transition-all duration-200 focus:outline-none focus:border-gold-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(201,165,90,0.1)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={createBoardPending}
                  className="mt-4 w-full py-4 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-all duration-200 hover:-translate-y-0.5 font-sans disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {createBoardPending ? 'Creating...' : 'Create Role'}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
