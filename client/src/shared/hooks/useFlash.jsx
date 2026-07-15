import { useContext } from 'react';
import { FlashContext } from './FlashContext';

export function useFlash() {
  const context = useContext(FlashContext);
  if (!context) {
    throw new Error('useFlash must be used within a FlashProvider');
  }
  return context;
}
