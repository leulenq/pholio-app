import React from 'react';
import { Edit2, Layout, ExternalLink, ArrowRight, FileDown, Sparkles, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MomentumChart } from './MomentumChart';
import { useAuth } from '../../../auth/hooks/useAuth';
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
            <button
              onClick={() => {
                toast.info('Comp card download is not available yet — we will add it in a future update.');
              }}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left group decoration-0 cursor-pointer border-0 bg-transparent"
            >
               <FileDown className="w-4 h-4 text-slate-400 group-hover:text-[#C9A55A] transition-colors" />
               <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">Download Comp Card</span>
            </button>
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
              Elevate your online presence with professional editorial tools.
            </p>

            <ul className="space-y-4 mb-8">
              {[
                'Premium PDF Themes',
                'Advanced Insights',
                'Priority Selection'
              ].map((benefit, i) => (
                <li key={i} className="flex items-center gap-3 text-xs font-medium text-slate-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#C9A55A]" />
                  {benefit}
                </li>
              ))}
            </ul>

            <a 
              href="https://www.pholio.studio/pricing"
              className="w-full py-3.5 bg-[#C9A55A] hover:bg-[#b08d45] text-white text-xs font-bold rounded-lg transition-all shadow-button-hover flex items-center justify-center gap-2 decoration-0 tracking-widest uppercase"
            >
              <span>Upgrade Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

    </aside>
  );
};
