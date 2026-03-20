import React from 'react';
import InterviewList from '../../components/agency/InterviewList';
import './InterviewsPage.css';

/**
 * InterviewsPage
 * Agency dashboard page for managing interviews
 */
export default function InterviewsPage() {
  return (
    <div className="interviews-page">
      <div className="interviews-header">
        <h1>Interviews</h1>
        <p>Manage your scheduled interviews with talent</p>
      </div>

      <InterviewList />
    </div>
  );
}
