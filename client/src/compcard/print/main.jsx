import { createRoot } from 'react-dom/client';
import PrintApp from './PrintApp';

const params = new URLSearchParams(window.location.search);
const root = createRoot(document.getElementById('root'));

if (import.meta.env.DEV && params.get('lab')) {
  const lab = params.get('lab');
  const mod = lab === 'card' ? import('../lab/CardLab.jsx') : lab === 'battery' ? import('../lab/BatteryLab.jsx') : lab === 'debug' ? import('../lab/DebugLab.jsx') : lab === 'review' ? import('../lab/Review.jsx') : lab === 'matte' ? import('../lab/MatteLab.jsx') : import('../lab/Lab.jsx');
  mod.then(({ default: Lab }) => root.render(<Lab mode={params.get('lab')} />));
} else {
  root.render(<PrintApp />);
}
