import React from 'react';
import { ArrowRight, Lock, Check } from 'lucide-react';
import LockedMetricCard from './LockedMetricCard';

export default function PremiumAnalyticsUnlock() {
  return (
    <div className="relative mt-12 rounded-[16px] overflow-hidden bg-[#0f172a] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] border border-[#1e293b]">
      {/* Brand Background Pattern - Subtle */}
      <div 
        className="absolute inset-0 z-0 opacity-40"
        style={{
          background: 'radial-gradient(circle at 50% 0%, #1e293b 0%, #0f172a 100%)',
        }}
      />
      
      {/* Brand Gold Glow - Top Center */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1/2 rounded-full opacity-10 blur-[80px] pointer-events-none"
        style={{ background: '#C9A55A' }}
      />

      <div className="relative z-10 p-12 md:p-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Column: Copy & CTA */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[4px] bg-[#C9A55A]/10 border border-[#C9A55A]/20">
                <span className="text-xs font-semibold tracking-wide text-[#C9A55A] uppercase">Pro Insights</span>
              </div>
              
              {/* H1 Headline - Scaled to Brand Guidelines (approx 2rem/32px-2.5rem) */}
              <h2 className="text-[2rem] md:text-[2.5rem] font-bold tracking-tight text-white leading-[1.1]" style={{ fontFamily: 'Inter, sans-serif' }}>
                See Who's <br />
                <span className="text-[#C9A55A]">Watching You</span>
              </h2>
              
              <p className="text-[1.05rem] text-[#94a3b8] max-w-md leading-relaxed">
                Unlock the full power of <span className="text-white font-medium">Studio+</span> to see exactly who is viewing your profile, from which agencies, and when.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[#cbd5e1] text-[0.95rem]">
                <Check size={18} className="text-[#C9A55A]" />
                <span>90-day history & trends</span>
              </div>
              <div className="flex items-center gap-3 text-[#cbd5e1] text-[0.95rem]">
                <Check size={18} className="text-[#C9A55A]" />
                <span>Visitor audience breakdown</span>
              </div>
              <div className="flex items-center gap-3 text-[#cbd5e1] text-[0.95rem]">
                <Check size={18} className="text-[#C9A55A]" />
                <span>Exportable PDF reports</span>
              </div>
            </div>

            <button 
              onClick={() => window.location.href = '/pricing'}
              className="group relative inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-[#C9A55A] hover:bg-[#b08d45] text-white font-medium rounded-[8px] transition-all duration-200 shadow-[0_4px_12px_rgba(201,165,90,0.2)] hover:shadow-[0_6px_16px_rgba(201,165,90,0.3)] hover:-translate-y-[1px]"
            >
              <span>Unlock Studio+</span>
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          {/* Right Column: Visual Teaser (Locked Cards) */}
          <div className="relative">
             {/* Decorative Elements */}
            <div className="absolute -inset-4 bg-[#C9A55A]/5 rounded-[16px] blur-xl opacity-30" />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
              <div className="sm:translate-y-6">
                <LockedMetricCard 
                  title="Engagement Score"
                  previewValue="High"
                  feature="Track interactions"
                  variant="dark"
                />
              </div>
              <div>
                 <LockedMetricCard 
                  title="Peak Activity"
                  previewValue="2PM"
                  feature="Best posting times"
                  variant="dark"
                />
              </div>
               <div className="sm:col-span-2">
                 <LockedMetricCard 
                  title="Audience Geography"
                  previewValue="New York, NY"
                  feature="Top location breakdown"
                  variant="dark"
                />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
