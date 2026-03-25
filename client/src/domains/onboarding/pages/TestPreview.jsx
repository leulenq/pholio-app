
/**
 * Simple test page to verify routing works
 */

import React from 'react';
import CastingScout from './CastingScout';
import '../styles/CastingCinematic.css';

function TestPreview() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#000',
      color: '#C9A55A',
      fontFamily: 'serif',
      fontSize: '2rem'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1>✓ Routing Works!</h1>
        <p style={{ fontSize: '1rem', marginTop: '1rem', opacity: 0.5 }}>
          Test page loaded successfully
        </p>
      </div>
    </div>
  );
}

export default TestPreview;
