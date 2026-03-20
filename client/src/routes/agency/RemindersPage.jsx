import React from 'react';
import ReminderList from '../../components/agency/ReminderList';
import DueReminders from '../../components/agency/DueReminders';
import './RemindersPage.css';

/**
 * RemindersPage
 * Agency dashboard page for managing reminders
 */
export default function RemindersPage() {
  return (
    <div className="reminders-page">
      <div className="reminders-header">
        <h1>Reminders</h1>
        <p>Manage your follow-up reminders and stay organized</p>
      </div>

      <div className="reminders-layout">
        {/* Main reminder list */}
        <div className="reminders-main">
          <ReminderList />
        </div>

        {/* Due reminders sidebar */}
        <div className="reminders-sidebar">
          <DueReminders limit={10} />
        </div>
      </div>
    </div>
  );
}
