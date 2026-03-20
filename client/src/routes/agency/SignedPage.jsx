import React from 'react';
import './SignedPage.css';
import { Users } from 'lucide-react';

export default function SignedPage() {
  return (
    <div className="signed-page">
      <div className="signed-header">
        <div>
          <h1>Signed Talent</h1>
          <p>Manage individuals currently signed to your agency roster.</p>
        </div>
      </div>

      <div className="signed-empty">
        <div className="signed-empty-icon">
          <Users size={32} />
        </div>
        <h2 className="signed-empty-title">No signed talent yet</h2>
        <p className="signed-empty-description">
          When you accept talent through the pipeline, they will appear here.
        </p>
      </div>
    </div>
  );
}
