// Zustand import removed

/**
 * Flash Message Store (using Zustand for simplicity inside hook file if preferred, 
 * but since I didn't install zustand, I'll use React Context or simple state in Layout 
 * or just a custom hook with event bus?
 * 
 * Plan said "useFlash.js — Flash message state". 
 * Given checking dependencies... only react-query etc installed. 
 * I'll use a Context Provider approach.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const FlashContext = createContext(null);

export function FlashProvider({ children }) {
  const [message, setMessage] = useState(null); // { type: 'success'|'error'|'info', text: '...' }

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

export function useFlash() {
  const context = useContext(FlashContext);
  if (!context) {
    throw new Error('useFlash must be used within a FlashProvider');
  }
  return context;
}
