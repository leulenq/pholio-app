import React from 'react';
import { Edit2, Layout, ExternalLink, ArrowRight, FileDown, Sparkles, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MomentumChart } from './MomentumChart';
import { useAuth } from '../../../auth/hooks/useAuth';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import './RightSidebar.css';

export const RightSidebar = ({ nextPriority }) => {
  const { subscription, profile } = useAuth();
  return (
    <aside className="space-y-6 w-full right-sidebar">
      
      {/* Zone 1: Next Priority */}
      {nextPriority && (
        <Link 
          to={nextPriority.link || '#'} 
          className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-[#C9A55A] transition-all hover:shadow-md block group decoration-0"
        >
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">
                {nextPriority.title}
              </h3>
              <p 
                className="text-lg font-bold text-slate-900 mt-1 group-hover:text-[#C9A55A] transition-colors"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {nextPriority.action}
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-[#C9A55A] group-hover:translate-x-1 transition-all" />
          </div>
        </Link>
      )}

      {/* Zone 2: Quick Actions */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-sm font-medium text-slate-900 mb-4">Quick Actions</h3>
        <ul className="space-y-2">
          <li>
            <Link to="/dashboard/talent/profile?tab=details" className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left group decoration-0">
               <Edit2 className="w-4 h-4 text-slate-400 group-hover:text-[#C9A55A] transition-colors" />
               <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">Edit Profile</span>
            </Link>
          </li>
          <li>
            <a
              href={`/portfolio/${profile?.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left group decoration-0"
            >
               <Layout className="w-4 h-4 text-slate-400 group-hover:text-[#C9A55A] transition-colors" />
               <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">View Public Profile</span>
            </a>
          </li>
          <li>
            <PholioButton
              variant="tertiary"
              fullWidth
              onClick={() => {
                toast.info('Comp card download is not available yet — we will add it in a future update.');
              }}
            >
               <FileDown className="w-4 h-4 text-slate-400 group-hover:text-[#C9A55A] transition-colors" />
               <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">Download Comp Card</span>
            </PholioButton>
          </li>
        </ul>
      </div>

      {/* Zone 3: Momentum - No Extra Card Styling */}
      <div className="mt-6">
         <h3 className="text-sm font-medium text-slate-900 mb-4 px-1">Momentum</h3>
         <div className="-ml-2">
            <MomentumChart />
         </div>
      </div>

      {/* Zone 4: Studio+ Upsell */}
      {!subscription?.isPro && (
        <div className="mt-8 bg-white p-7 rounded-2xl shadow-card border-l-4 border-[#C9A55A] relative overflow-hidden transition-all hover:shadow-elevation-2">
          {/* Subtle Background Watermark */}
          <Sparkles className="absolute -top-4 -right-4 w-24 h-24 text-slate-50 opacity-50 pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
               <h3 className="text-[#0f172a] font-bold text-2xl tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                Studio<span className="text-[#C9A55A]">+</span>
              </h3>
            </div>

            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              14-day free trial, then $9.99/month or $95.88/year.
            </p>

            <ul className="space-y-3 mb-8">
              {/* Studio+ sells only what the talent keeps for themselves.
                  Never reach, ranking, review speed, or submission volume. */}
              {[
                'Premium PDF themes',
                'Advanced insights',
              ].map((benefit) => (
                <li key={benefit} className="relative pl-3.5 text-xs text-slate-600">
                  <span
                    className="absolute left-0 top-[0.55em] w-1.5 h-px bg-[#C9A55A]"
                    aria-hidden="true"
                  />
                  {benefit}
                </li>
              ))}
            </ul>

            <PholioButton
              to="/dashboard/talent/settings/studio"
              variant="primary"
              fullWidth
            >
              <span>Upgrade Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </PholioButton>
          </div>
        </div>
      )}

    </aside>
  );
};
