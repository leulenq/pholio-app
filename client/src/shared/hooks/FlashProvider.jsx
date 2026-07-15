import { useCallback, useState } from 'react';
import { FlashContext } from './FlashContext';

export default function FlashProvider({ children }) {
  const [message, setMessage] = useState(null);

  const flash = useCallback((type, text, duration = 5000) => {
    setMessage({ type, text });
    if (duration > 0) {
      setTimeout(() => setMessage(null), duration);
    }
  }, []);

  const clearFlash = useCallback(() => setMessage(null), []);

  return (
    <FlashContext.Provider value={{ message, flash, clearFlash }}>
      {children}
    </FlashContext.Provider>
  );
}
