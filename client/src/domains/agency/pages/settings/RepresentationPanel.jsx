import { ScrollText, Globe } from 'lucide-react';

const MARKETS = ['New York', 'Paris', 'Milan', 'London', 'Tokyo'];

export default function RepresentationPanel() {
  return (
    <>
      <div className="st-notice">
        <span className="st-notice-icon"><ScrollText size={18} /></span>
        <div>
          <span className="st-notice-title">Representation is governed by contract, not subscription</span>
          <span className="st-notice-text">
            Your house terms — exclusivity, commission, and placement — are held with your Pholio
            account team. This is where they’ll surface for reference and renewal.
          </span>
        </div>
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Commission</h3>
          <p className="st-fieldset-sub">The standard split across the network.</p>
        </div>
        <div className="st-split">
          <div className="st-split-bar">
            <span className="st-split-mother" style={{ width: '33.3%' }}>Mother · 10%</span>
            <span className="st-split-placement" style={{ width: '66.7%' }}>Placement · 20%</span>
          </div>
          <p className="st-help">
            Mother agencies take ~10% for guiding a career; placement agencies in-market take ~20%.
            Your house rates are set with your account team.
          </p>
        </div>
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Representation terms <span className="st-soon">Soon</span></h3>
          <p className="st-fieldset-sub">How talent is signed to the house.</p>
        </div>
        <div className="st-terms">
          <div className="st-term">
            <span className="st-term-label">Exclusivity</span>
            <span className="st-term-value">Exclusive · by market &amp; division</span>
          </div>
          <div className="st-term">
            <span className="st-term-label">Standard term</span>
            <span className="st-term-value">3 years</span>
          </div>
          <div className="st-term">
            <span className="st-term-label">Scope</span>
            <span className="st-term-value">Per market, per board</span>
          </div>
        </div>
      </div>

      <div className="st-fieldset st-fieldset--last">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Placement network <span className="st-soon">Soon</span></h3>
          <p className="st-fieldset-sub">Markets your house places talent into.</p>
        </div>
        <div className="st-chips">
          {MARKETS.map((m) => (
            <span className="st-chip st-chip--market" key={m}><Globe size={11} /> {m}</span>
          ))}
        </div>
      </div>
    </>
  );
}
