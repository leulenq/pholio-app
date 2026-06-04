import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase } from 'lucide-react';

const CastingPage = () => {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('all');

  const castings = [
    {
      id: 1,
      name: "SS26 Campaign",
      client: "Prada",
      type: "Campaign",
      location: "Milan",
      deadline: "Mar 3, 2026",
      status: "Reviewing",
      applicants: 24,
      shortlisted: 8,
      updated: "2h ago"
    },
    {
      id: 2,
      name: "FW26 Lookbook",
      client: "Zara",
      type: "Lookbook",
      location: "New York",
      deadline: "Mar 8, 2026",
      status: "Active",
      applicants: 31,
      shortlisted: 12,
      updated: "4h ago"
    },
    {
      id: 3,
      name: "Beauty Editorial",
      client: "Harper's Bazaar",
      type: "Editorial",
      location: "New York",
      deadline: "Mar 12, 2026",
      status: "Active",
      applicants: 11,
      shortlisted: 3,
      updated: "Yesterday"
    },
    {
      id: 4,
      name: "RTW Show",
      client: "Stella McCartney",
      type: "Runway",
      location: "London",
      deadline: "Feb 28, 2026",
      status: "Reviewing",
      applicants: 18,
      shortlisted: 5,
      updated: "3h ago"
    },
    {
      id: 5,
      name: "Resort '26 Campaign",
      client: "Jacquemus",
      type: "Campaign",
      location: "Paris",
      deadline: "Mar 20, 2026",
      status: "Draft",
      applicants: 0,
      shortlisted: 0,
      updated: "1d ago"
    },
    {
      id: 6,
      name: "Swimwear Catalogue",
      client: "Vix",
      type: "Commercial",
      location: "Miami",
      deadline: "Apr 1, 2026",
      status: "Active",
      applicants: 9,
      shortlisted: 2,
      updated: "6h ago"
    }
  ];

  const filters = [
    { label: 'All', value: 'all', count: castings.length },
    { label: 'Active', value: 'active', count: castings.filter(c => c.status.toLowerCase() === 'active').length },
    { label: 'Draft', value: 'draft', count: castings.filter(c => c.status.toLowerCase() === 'draft').length },
    { label: 'Reviewing', value: 'reviewing', count: castings.filter(c => c.status.toLowerCase() === 'reviewing').length },
    { label: 'Closed', value: 'closed', count: castings.filter(c => c.status.toLowerCase() === 'closed').length }
  ];

  const filteredCastings = activeFilter === 'all'
    ? castings
    : castings.filter(c => c.status.toLowerCase() === activeFilter);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return '#22c55e';
      case 'Draft': return '#94a3b8';
      case 'Reviewing': return '#C9A55A';
      case 'Closed': return '#e2e8f0';
      default: return '#e2e8f0';
    }
  };

  const getDeadlineColor = (deadline) => {
    const now = new Date(2026, 1, 25, 18, 50, 0); // Feb 25, 2026 6:50 PM
    const dlDate = new Date(deadline);
    const diffDays = (dlDate - now) / (1000 * 60 * 60 * 24);
    return diffDays <= 7 ? '#ef4444' : 'var(--gray-refined)';
  };

  const handleNewCasting = () => {
    navigate('/dashboard/agency/casting/new');
  };

  return (
    <div className="p-6 bg-[var(--white-warm)] overflow-y-auto h-full w-full">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="font-[var(--font-heading)] font-serif text-[2.5rem] font-medium text-[var(--black-rich)] tracking-[-0.02em]">
            Casting
          </h1>
          <p className="text-[0.9375rem] text-[var(--gray-refined)]">
            Manage your casting briefs
          </p>
        </div>
        <button
          onClick={handleNewCasting}
          className="bg-gradient-to-br from-[var(--black-rich)] to-[var(--black-soft)] text-white rounded-[12px] px-[1.75rem] py-[0.875rem] text-[0.9375rem] font-semibold shadow-[0_8px_16px_-4px_rgba(15,23,42,0.3)] hover:bg-gradient-to-br hover:from-[var(--gold-primary)] hover:to-[var(--gold-dark)] hover:-translate-y-[2px] transition-all duration-300"
        >
          + New Casting Brief
        </button>
      </div>

      <div className="flex gap-[0.75rem] mb-[2rem]">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={`px-[1.25rem] py-[0.5rem] rounded-full text-[0.8125rem] font-semibold ${
              activeFilter === f.value
                ? 'bg-[var(--black-rich)] text-white border-[1.5px] border-[var(--black-rich)]'
                : 'bg-white border-[1.5px] border-[#e2e8f0] text-[var(--gray-refined)]'
            }`}
          >
            {f.label} <span className="opacity-70">{f.count}</span>
          </button>
        ))}
      </div>

      {filteredCastings.length === 0 ? (
        <div className="py-16 text-center">
          <Briefcase size={28} className="mx-auto text-[#d1d5db]" />
          <p className="mt-3 text-[0.9375rem] font-medium text-[#94a3b8]">
            No casting brief here
          </p>
          <p className="mt-1 text-[0.8125rem] text-[#cbd5e1]">
            Adjust your filter or create a new casting brief
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCastings.map((casting, index) => (
            <div
              key={casting.id}
              className="bg-white rounded-[20px] p-[1.75rem] px-[2rem] shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] cursor-pointer transition-all duration-300 hover:-translate-y-[3px] hover:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.12)] hover:border-l-[3px] hover:border-l-[var(--gold-primary)] grid grid-cols-[1fr_auto_auto] items-center gap-[2rem]"
              style={{ animation: `cardEntrance 0.5s cubic-bezier(0.4,0,0.2,1) both ${index * 0.08}s` }}
            >
              <div>
                <div className="flex items-center gap-[0.75rem]">
                  <div
                    className={`w-[10px] h-[10px] rounded-full ${casting.status === 'Reviewing' ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: getStatusColor(casting.status) }}
                  />
                  <span className="text-[1.0625rem] font-semibold text-[var(--black-rich)]">
                    {casting.name}
                  </span>
                  <span className="bg-[#f1f5f9] text-[var(--gray-refined)] text-[0.75rem] font-semibold uppercase tracking-[0.08em] px-[0.625rem] py-[0.25rem] rounded-[6px]">
                    {casting.client}
                  </span>
                </div>
                <div className="flex gap-[1.5rem] mt-[0.5rem]">
                  <span className="text-[0.8125rem] text-[var(--gray-refined)]">
                    {casting.type}
                  </span>
                  <span className="text-[0.8125rem]" style={{ color: getDeadlineColor(casting.deadline) }}>
                    · Deadline: {casting.deadline}
                  </span>
                  <span className="text-[0.8125rem] text-[var(--gray-refined)]">
                    · {casting.location}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[#94a3b8] block mb-[0.5rem]">
                  APPLICANTS
                </span>
                <span className="text-[1.75rem] font-bold text-[var(--black-rich)] leading-none">
                  {casting.applicants}
                </span>
                <span className="text-[0.75rem] text-[var(--gold-primary)] font-medium block">
                  {casting.shortlisted} shortlisted
                </span>
                <div className="mt-[0.75rem] w-32 h-[1.5] bg-[#f1f5f9] rounded-full">
                  <div
                    className="h-full bg-[var(--gold-primary)] rounded-full"
                    style={{ width: `${casting.applicants > 0 ? (casting.shortlisted / casting.applicants) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={() => navigate(`/dashboard/agency/casting/${casting.id}`)}
                  className="border-[1.5px] border-[#e2e8f0] text-[var(--gray-refined)] rounded-[10px] px-[1.25rem] py-[0.625rem] text-[0.8125rem] font-semibold hover:border-[var(--gold-primary)] hover:text-[var(--gold-primary)] hover:-translate-y-[1px] transition-all duration-300"
                >
                  Review →
                </button>
                <span className="text-[0.6875rem] text-[#94a3b8]">
                  Updated {casting.updated}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CastingPage;
