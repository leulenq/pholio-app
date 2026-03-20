import * as ProfileStrengthModule from '../../../src/lib/shared/profile-strength.cjs';

// Defensive resolution for CJS/ESM/Browser global interop
const calculateProfileStrength = ProfileStrengthModule.calculateProfileStrength || 
                               (typeof window !== 'undefined' ? window.calculateProfileStrength : null);
const getStrengthUI = ProfileStrengthModule.getStrengthUI || 
                    (typeof window !== 'undefined' ? window.getStrengthUI : null);

export { calculateProfileStrength, getStrengthUI };
