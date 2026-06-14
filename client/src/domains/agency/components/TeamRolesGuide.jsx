import { Crown, ShieldCheck, Compass, Search } from 'lucide-react';

const ROLES = [
  { role: 'OWNER', title: 'Principal', icon: Crown, text: 'The house. Full control of identity, team, permissions, and every board.' },
  { role: 'ADMIN', title: 'Managing Agent', icon: ShieldCheck, text: 'Runs operations — roster, pipeline, team management, and custom access grants.' },
  { role: 'AGENT', title: 'Agent · Booker', icon: ShieldCheck, text: 'Signs talent, runs casting pipelines, messaging, and roster bookings.' },
  { role: 'SCOUT', title: 'Scout · Junior', icon: Compass, text: 'Discovers and shortlists — cannot sign, decline, or change house settings.' },
  { role: 'VIEWER', title: 'Observer', icon: Search, text: 'Read-only visibility across the dashboard.' },
];

export default function TeamRolesGuide() {
  return (
    <section className="tm-roles">
      <div className="tm-roles-head">
        <h2 className="tm-roles-title">Seats &amp; permissions</h2>
        <p className="tm-roles-sub">How access is governed across the house. Use a member&apos;s menu to change seats or grant custom access.</p>
      </div>
      <div className="tm-roles-grid">
        {ROLES.map((c) => {
          const Icon = c.icon;
          return (
            <div className="tm-role-card" key={c.role}>
              <span className="tm-role-card-icon"><Icon size={15} /></span>
              <div>
                <span className="tm-role-card-title">{c.title}</span>
                <span className="tm-role-card-text">{c.text}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
