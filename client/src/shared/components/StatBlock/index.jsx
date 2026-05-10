import './StatBlock.css';

/**
 * @param {object}   props
 * @param {string|number} props.number   Displayed value (e.g. "1.4k", 89, 3)
 * @param {string}   props.label         All-caps label below number
 * @param {{ text: string, direction: 'up'|'down' }} [props.delta]  Optional delta badge
 * @param {string}   [props.subLine]     Optional muted context line
 * @param {'default'|'pending'|'accepted'|'declined'} [props.color]
 */
export default function StatBlock({ number, label, delta, subLine, color = 'default' }) {
  return (
    <div className="sb-block">
      <div className="sb-label">{label}</div>
      <div className={`sb-number sb-number--${color}`}>
        {number}
        {delta && (
          <span className={`sb-delta sb-delta--${delta.direction ?? 'up'}`}>
            {delta.text}
          </span>
        )}
      </div>
      {subLine && <div className="sb-sub">{subLine}</div>}
    </div>
  );
}
