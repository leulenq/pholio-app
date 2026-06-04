import { motion } from "motion/react";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  onCream?: boolean;
}

export const Logo = ({ size = "md", onCream = false }: LogoProps) => {
  const sizes = {
    sm: { text: "text-[14px] tracking-[0.28em]", sweep: "w-[40px]", gap: "gap-1" },
    md: { text: "text-[24px] tracking-[0.24em]", sweep: "w-[72px]", gap: "gap-2" },
    lg: { text: "text-[40px] tracking-[0.22em]", sweep: "w-[120px]", gap: "gap-3" },
    xl: { text: "text-[64px] tracking-[0.22em]", sweep: "w-[180px]", gap: "gap-4" },
  };

  const current = sizes[size];
  const goldColor = "text-gold-warm";
  const sweepGradient = "bg-gradient-to-r from-transparent via-gold-warm to-transparent";

  return (
    <div className={`inline-flex flex-col items-center ${current.gap}`}>
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`font-serif uppercase ${current.text} ${goldColor}`}
      >
        Pholio
      </motion.div>
      <motion.div 
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={`h-[1px] ${current.sweep} ${sweepGradient}`}
      />
    </div>
  );
};

export const Pill = ({ 
  type = "studio", 
  label, 
  size = "md",
  className = ""
}: { 
  type?: "free" | "studio" | "ultra" | "enterprise" | "status"; 
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) => {
  const base = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition-all duration-300 pointer-events-none";
  const sizeClasses = {
    sm: "px-2 py-0.5 text-[9px]",
    md: "px-3 py-1 text-[10px]",
    lg: "px-4 py-1.5 text-[11px] tracking-[0.2em]",
  };

  const variants = {
    free: "border-white/10 text-white/40 bg-transparent",
    studio: "border-gold bg-gold text-ink",
    ultra: "font-serif italic capitalize tracking-normal border-gold/55 bg-ink text-gold-warm px-4",
    enterprise: "border-white/60 text-white bg-transparent",
    status: "border-white/5 bg-white/5 text-white/60",
  };

  return (
    <span className={`${base} ${sizeClasses[size]} ${variants[type]} ${className}`}>
      {type === "enterprise" && <span className="h-1 w-1 rounded-full bg-gold" />}
      {type === "status" && <span className="h-1 w-1 rounded-full bg-white/20" />}
      {label}
    </span>
  );
};

export const Divider = ({ className = "" }: { className?: string }) => (
  <div className={`h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent ${className}`} />
);
