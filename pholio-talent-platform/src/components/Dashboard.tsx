import { motion } from "motion/react";
import { 
  ArrowUpRight, 
  Image as ImageIcon, 
  User, 
  Briefcase, 
  BarChart3, 
  Settings, 
  LogOut,
  MapPin,
  Camera,
  Activity,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  TrendingUp,
  Download
} from "lucide-react";
import { Logo, Pill } from "./Branding";

const Sidebar = () => {
  const navItems = [
    { icon: User, label: "Identity", active: true },
    { icon: ImageIcon, label: "The Book", active: false },
    { icon: Briefcase, label: "Market", active: false },
    { icon: BarChart3, label: "Intelligence", active: false },
    { icon: Settings, label: "Config", active: false },
  ];

  return (
    <div className="flex h-full w-20 flex-col border-r border-white/5 bg-ink py-10 items-center">
      <div className="mb-12">
        <Logo size="sm" />
      </div>

      <nav className="flex-1 space-y-8">
        {navItems.map((item) => (
          <button
            key={item.label}
            title={item.label}
            className={`group relative flex w-full items-center justify-center transition-all duration-200 ${
              item.active 
                ? "text-gold" 
                : "text-white/20 hover:text-white"
            }`}
          >
            <item.icon className="h-5 w-5 stroke-[1.5px]" />
            <div className="absolute left-[calc(100%+12px)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-ink-panel border border-white/10 px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest pointer-events-none z-50 shadow-2xl">
              {item.label}
            </div>
            {item.active && (
              <motion.div 
                layoutId="active-nav"
                className="absolute -right-[1px] h-4 w-0.5 bg-gold shadow-[0_0_8px_rgba(201,165,90,0.5)]"
              />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/5 pt-6 flex flex-col items-center gap-6">
        <motion.div 
          whileHover={{ scale: 1.05 }}
          className="h-10 w-10 overflow-hidden rounded-full border border-white/10 p-0.5 cursor-pointer"
        >
          <img 
            src="https://picsum.photos/seed/pholio-talent/200/200" 
            alt="Talent Avatar" 
            className="h-full w-full rounded-full object-cover grayscale"
            referrerPolicy="no-referrer"
          />
        </motion.div>
        <button className="text-white/20 hover:text-white transition-colors">
          <LogOut className="h-4 w-4 stroke-[1.5px]" />
        </button>
      </div>
    </div>
  );
};

const ReadinessGuide = () => {
  const steps = [
    { id: 1, label: "Casting Polaroids", status: "Required", urgency: "critical", action: "Upload" },
    { id: 2, label: "Digital Resume", status: "Verified", urgency: "success", action: "View" },
    { id: 3, label: "Archetype Mapping", status: "In Sync", urgency: "success", action: "Review" },
    { id: 4, label: "Intro Reel (30s)", status: "Optional", urgency: "none", action: "Record" },
  ];

  return (
    <div className="col-span-4 flex flex-col rounded-2xl border border-white/10 bg-ink-soft p-8">
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <span className="label text-gold block mb-1">Readiness Guide</span>
          <h3 className="serif text-2xl font-light">The <em>Audit.</em></h3>
        </div>
        <span className="serif text-3xl text-white/60">62<span className="text-sm opacity-30">%</span></span>
      </div>

      <div className="space-y-2 flex-1">
        {steps.map((step) => (
          <motion.div 
            key={step.id} 
            whileHover={{ x: 4 }}
            className="flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-white/5 hover:bg-white/[0.02] transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className={`h-1.5 w-1.5 rounded-full ${
                step.urgency === 'critical' ? 'bg-red-400' : 
                step.urgency === 'success' ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]' : 
                'bg-white/10'
              }`} />
              <span className="text-[11px] font-medium text-white/70 group-hover:text-white transition-colors">{step.label}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[10px] mono text-white/20 uppercase tracking-widest">{step.status}</span>
              <ChevronRight className="h-3 w-3 text-white/10 group-hover:text-gold transition-colors" />
            </div>
          </motion.div>
        ))}
      </div>

      <motion.button 
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="mt-8 w-full py-4 rounded-full bg-white text-ink text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-gold transition-all shadow-xl"
      >
        Continue Audit
      </motion.button>
    </div>
  );
};

const PortfolioBook = () => {
  return (
    <div className="col-span-8 flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-4">
          <div>
            <span className="label text-white/30 block mb-1">Portfolio</span>
            <h2 className="serif text-3xl font-light">The <em>Book.</em></h2>
          </div>
          <div className="h-8 w-[1px] bg-white/5" />
          <div className="flex gap-2">
            <Pill label="Editorial" type="status" size="sm" />
            <Pill label="Casting" type="status" size="sm" className="opacity-40" />
          </div>
        </div>
        <button className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gold hover:text-gold-light transition-colors">
          Manage Frames <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <motion.div 
          whileHover={{ y: -4 }}
          className="col-span-2 row-span-2 group relative aspect-[3/4] overflow-hidden rounded-xl bg-ink-panel border border-white/5 cursor-pointer"
        >
          <img src="https://picsum.photos/seed/editorial1/800/1200" className="w-full h-full object-cover grayscale brightness-75 group-hover:grayscale-0 group-hover:brightness-100 transition-all duration-1000 ease-out" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-6 flex flex-col justify-end">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1">Featured Cover</span>
            <p className="serif text-lg leading-tight">Milan Fashion Week · SS26</p>
          </div>
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }} className="aspect-square bg-ink-panel rounded-xl border border-white/5 overflow-hidden cursor-pointer group relative">
          <img src="https://picsum.photos/seed/polaroid1/400/400" className="w-full h-full object-cover grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" referrerPolicy="no-referrer" />
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100">
            <Camera className="h-3 w-3 text-gold" />
          </div>
        </motion.div>
        
        <motion.div whileHover={{ scale: 1.02 }} className="aspect-square bg-ink-panel rounded-xl border border-white/5 overflow-hidden cursor-pointer group relative">
          <img src="https://picsum.photos/seed/polaroid2/400/400" className="w-full h-full object-cover grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" referrerPolicy="no-referrer" />
        </motion.div>
        
        <motion.div whileHover={{ scale: 1.02 }} className="aspect-square bg-ink-panel rounded-xl border border-white/5 overflow-hidden cursor-pointer">
          <img src="https://picsum.photos/seed/editorial2/400/400" className="w-full h-full object-cover grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all" referrerPolicy="no-referrer" />
        </motion.div>

        <motion.div 
          whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
          className="aspect-square bg-ink-panel rounded-xl border border-white/10 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors group"
        >
          <span className="mono text-white/20 group-hover:text-gold transition-colors">+18</span>
          <span className="text-[8px] font-bold uppercase tracking-widest text-white/10">Frames</span>
        </motion.div>
      </div>
    </div>
  );
};

const ExposureIntelligence = () => {
  return (
    <div className="col-span-6 rounded-2xl border border-white/10 bg-ink-soft p-8">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <span className="label text-white/30 block mb-1">Exposure Intelligence</span>
          <h3 className="serif text-2xl font-light">The <em>Market.</em></h3>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
          <TrendingUp className="h-3 w-3 text-gold" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/60">Top 12% in Editorial</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-12 gap-y-10">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-light tracking-tight">1,482</span>
            <span className="text-[10px] text-green-400 font-bold">+22%</span>
          </div>
          <p className="mono text-white/20 text-[9px] mt-1 uppercase font-semibold tracking-wider">Global Views (30d)</p>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-light tracking-tight text-gold">24</span>
            <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">New</span>
          </div>
          <p className="mono text-white/20 text-[9px] mt-1 uppercase font-semibold tracking-wider">Agency Board Saves</p>
        </div>
        <div className="col-span-2">
          <div className="flex justify-between items-end mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Visibility Index</span>
            <span className="text-[10px] text-gold-warm italic serif tracking-wider">Outperforming Category Avg (3.4x)</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full relative overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: "88%" }}
              transition={{ duration: 1.5, ease: "circOut" }}
              className="absolute h-full bg-gold shadow-[0_0_12px_rgba(201,165,90,0.4)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const IdentityArtifacts = () => {
  return (
    <div className="col-span-6 grid grid-cols-2 gap-6">
      <motion.div 
        whileHover={{ y: -4 }}
        className="rounded-2xl bg-white p-6 text-ink flex flex-col justify-between shadow-2xl transition-all cursor-pointer group"
      >
        <div>
          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-ink/5 mb-4">
            <FileText className="h-5 w-5 text-ink/40" />
          </div>
          <h4 className="serif text-xl mb-1">Digital <em>Comp Card</em></h4>
          <p className="text-[10px] font-medium leading-relaxed opacity-60">Generate professional specs with latest polaroids for agency submission.</p>
        </div>
        <div className="mt-6 flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-widest bg-ink/5 px-2 py-1 rounded">Ready</span>
          <div className="flex items-center gap-2 text-ink/40 group-hover:text-ink transition-colors">
             <span className="text-[9px] font-bold uppercase">Export</span>
             <Download className="h-3.5 w-3.5" />
          </div>
        </div>
      </motion.div>

      <motion.div 
        whileHover={{ y: -4 }}
        className="rounded-2xl border border-white/10 bg-ink-panel p-6 flex flex-col justify-between transition-all cursor-pointer group"
      >
        <div>
          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 mb-4">
             <Activity className="h-5 w-5 text-white/20 group-hover:text-gold transition-colors" />
          </div>
          <h4 className="serif text-xl mb-1 text-white/90">Intro <em>Reel</em></h4>
          <p className="text-[10px] font-medium leading-relaxed text-white/30">Capture a quick 30s screen-test to verify presence and personality.</p>
        </div>
        <div className="mt-6 flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gold italic serif">Missing</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-white/10 group-hover:text-gold transition-all" />
        </div>
      </motion.div>
    </div>
  );
};

export default function Dashboard() {
  return (
    <div className="flex h-screen overflow-hidden bg-ink text-white font-sans selection:bg-gold selection:text-ink">
      {/* Texture Layer */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] select-none z-0">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-paper.png')]" />
      </div>

      <Sidebar />
      
      <main className="flex-1 overflow-y-auto px-12 py-10 flex flex-col relative z-20">
        <header className="mb-14 flex justify-between items-end">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-4 mb-2">
              <span className="label text-white/30 tracking-[0.4em]">Dashboard</span>
              <Pill label="Studio+ Member" type="studio" size="sm" />
            </div>
            <h1 className="text-6xl font-light tracking-tight serif">
              Talia <span className="italic text-gold-warm">Mendez</span>
            </h1>
          </motion.div>
          <div className="flex flex-col items-end gap-3 text-right">
            <div className="flex items-center gap-3 py-2 px-4 rounded-full border border-white/10 bg-white/[0.02]">
              <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">Actively Seeking Work</p>
            </div>
            <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest">Global Discovery Primary</p>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-8 mb-12">
          {/* Main Tier */}
          <PortfolioBook />
          <ReadinessGuide />
          
          {/* Intelligence & Artifacts */}
          <ExposureIntelligence />
          <IdentityArtifacts />
        </div>

        <footer className="mt-auto flex justify-between items-center text-[10px] uppercase tracking-[0.4em] text-white/20 border-t border-white/5 py-8">
          <div className="flex gap-12 font-bold tracking-widest">
            <span className="text-white hover:text-gold cursor-pointer transition-all duration-500 hover:tracking-[0.6em] px-1">Overview</span>
            <span className="hover:text-gold cursor-pointer transition-all duration-500 hover:tracking-[0.6em] px-1">The Book</span>
            <span className="hover:text-gold cursor-pointer transition-all duration-500 hover:tracking-[0.6em] px-1">Market</span>
            <span className="hover:text-gold cursor-pointer transition-all duration-500 hover:tracking-[0.6em] px-1">Intel</span>
          </div>
          <div className="flex items-center gap-4 mono opacity-60">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-gold" />
              <span>Identity Node · PH-482-TM</span>
            </div>
            <div className="h-3 w-[1px] bg-white/20" />
            <span>© 2026</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
