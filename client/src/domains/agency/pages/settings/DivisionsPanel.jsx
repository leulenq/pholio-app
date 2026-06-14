import { Layers, Sparkles } from 'lucide-react';

// The career-stage board ladder every fashion house runs talent through.
const LADDER = [
  { stage: 'New Faces', text: 'Freshly scouted. No book yet — digitals and polaroids only.' },
  { stage: 'Development', text: 'Tests shot, a starter book forming. Building toward the floor.' },
  { stage: 'Main Board', text: 'Working talent — castings, options, and tearsheets.' },
];

// Standard divisions a house signs across. Illustrative of the model, not saved data.
const DIVISIONS = ['Women', 'Men', 'New Faces', 'Development', 'Curve', 'Commercial', 'Runway', 'Talent'];

export default function DivisionsPanel() {
  return (
    <>
      <div className="st-notice">
        <span className="st-notice-icon"><Layers size={18} /></span>
        <div>
          <span className="st-notice-title">Your roster is organized into divisions and boards</span>
          <span className="st-notice-text">
            Divisions split the house by gender and specialty; boards track each model’s stage from
            scouting to the floor. Your house structure is configured with your Pholio account team.
          </span>
        </div>
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">The board ladder</h3>
          <p className="st-fieldset-sub">How talent progresses through the house.</p>
        </div>
        <div className="st-ladder">
          {LADDER.map((s, i) => (
            <div className="st-ladder-step" key={s.stage}>
              <span className="st-ladder-rung">{i + 1}</span>
              <div>
                <span className="st-ladder-stage">{s.stage}</span>
                <span className="st-ladder-text">{s.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Divisions <span className="st-soon">Soon</span></h3>
          <p className="st-fieldset-sub">The boards your house signs across. Editing arrives with the Divisions module.</p>
        </div>
        <div className="st-chips">
          {DIVISIONS.map((d) => <span className="st-chip" key={d}>{d}</span>)}
        </div>
      </div>

      <div className="st-fieldset st-fieldset--last">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Board standards <span className="st-soon">Soon</span></h3>
          <p className="st-fieldset-sub">Per-division specs used to qualify and filter talent.</p>
        </div>
        <div className="st-empty-inline">
          <Sparkles size={20} />
          <span>Set height, bust · chest, waist, hips, and shoe ranges per division to auto-qualify new faces.</span>
        </div>
      </div>
    </>
  );
}
