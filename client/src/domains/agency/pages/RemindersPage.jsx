import React from 'react';
import ReminderList from '../components/ReminderList';
import './RemindersPage.css';

/**
 * RemindersPage — the follow-up ledger.
 * Grouped lanes (Overdue / Due Today / Upcoming / Completed) replace the
 * old two-column list + due-count sidebar split; see ReminderList for the
 * data layer and row rendering.
 */
export default function RemindersPage() {
  return (
    <div className="rm-page">
      <header className="rm-header">
        <div>
          <h1 className="rm-page-title">Reminders</h1>
          <p className="rm-page-sub">Follow-ups and check-ins across your roster</p>
        </div>
      </header>

      <ReminderList />
    </div>
  );
}
