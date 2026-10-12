import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { startAnalytics } from '../lib/google-analytics';

export default function GoogleAnalytics() {
  const { pathname } = useLocation();
  const tracker = useRef(null);
  useEffect(() => {
    const instance = startAnalytics();
    tracker.current = instance;
    return () => { instance.destroy(); tracker.current = null; };
  }, []);
  useEffect(() => { tracker.current?.page(pathname); }, [pathname]);
  return null;
}
