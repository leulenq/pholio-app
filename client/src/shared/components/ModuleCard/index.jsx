import './ModuleCard.css';

/**
 * @param {object}          props
 * @param {string}          [props.label]    All-caps section label shown above content
 * @param {React.ReactNode} props.children
 */
export default function ModuleCard({ label, children }) {
  return (
    <div className="mc-card">
      {label && <div className="mc-label">{label}</div>}
      {children}
    </div>
  );
}
