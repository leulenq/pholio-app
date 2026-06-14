import { Link } from 'react-router-dom';
import { ArrowRight, Check, Lock, ListChecks } from 'lucide-react';
import BlockedStatePanel from '../states/BlockedStatePanel';
import '../states/error-state-primitives.css';
import './ProfileGateBanner.css';

function toGroupSummary(missingByGroup = {}) {
  return Object.entries(missingByGroup)
    .filter(([, fields]) => fields?.length)
    .map(([group, fields]) => ({
      group,
      count: fields.length,
    }));
}

function taskFallback(field) {
  return {
    key: field.key,
    label: field.label,
    group: field.group,
    task: `Complete ${field.label}`,
    href: '/dashboard/talent/profile?gate=true',
    actionLabel: 'Open profile',
  };
}

export default function ProfileGateBanner({
  variant = 'banner',
  featureName = 'This feature',
  featureLabel = 'Profile gate',
  description = 'This feature relies on required profile essentials. Complete the missing fields to continue.',
  missingFields = [],
  missingTasks = [],
  missingByGroup = {},
  completionPercent = 0,
  completedCount = 0,
  totalRequired = 0,
  blockedReason,
}) {
  const safeCompletion = Math.max(0, Math.min(100, Number(completionPercent) || 0));
  const tasks = (missingTasks.length ? missingTasks : missingFields.map(taskFallback)).slice(
    0,
    variant === 'page' ? 8 : 5,
  );
  const groupSummary = toGroupSummary(missingByGroup);
  const missingCount = missingFields.length || missingTasks.length;
  const TitleTag = variant === 'page' ? 'h1' : 'h2';
  const primaryTask = tasks[0];

  if (variant === 'compact') {
    return (
      <div className="profile-gate profile-gate--compact">
        <BlockedStatePanel
          variant="compact"
          eyebrow={featureLabel || 'Profile requirement'}
          title={`${featureName} is locked`}
          body={description}
          primaryAction={{
            label: 'Start required tasks',
            onClick: () => {
              window.location.href = primaryTask?.href || '/dashboard/talent/profile?gate=true';
            },
          }}
          secondaryAction={{
            label: 'Open profile',
            onClick: () => {
              window.location.href = '/dashboard/talent/profile?gate=true';
            },
          }}
        />
      </div>
    );
  }

  return (
    <section className={`profile-gate profile-gate--${variant} profile-gate--blocked-pattern`} role="status" aria-live="polite">
      <div className="profile-gate__rule" aria-hidden />

      <div className="profile-gate__mast profile-gate__mast--blocked">
        <TitleTag className="profile-gate__title">
          <Lock size={14} aria-hidden />
          {featureName} needs a <em>complete</em> profile.
        </TitleTag>
        <p className="profile-gate__copy">{description}</p>
        {blockedReason && <p className="profile-gate__reason">{blockedReason}</p>}
      </div>

      <div className="profile-gate__index" aria-label="Gate progress">
        <div>
          <span>Readiness</span>
          <strong>{safeCompletion}%</strong>
        </div>
        <div>
          <span>Complete</span>
          <strong>
            {completedCount}/{totalRequired}
          </strong>
        </div>
        <div>
          <span>Missing</span>
          <strong>{missingCount}</strong>
        </div>
      </div>

      {groupSummary.length > 0 && (
        <div className="profile-gate__groups" aria-label="Missing categories">
          {groupSummary.map(({ group, count }) => (
            <span key={group}>
              {group}
              <strong>{count}</strong>
            </span>
          ))}
        </div>
      )}

      {tasks.length > 0 && (
        <ol className="profile-gate__tasks" aria-label="Required profile tasks">
          {tasks.map((task, index) => (
            <li key={task.key || task.label}>
              <span className="profile-gate__task-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="profile-gate__task-main">
                <strong>{task.task || task.label}</strong>
                <span>{task.group || 'Profile'}</span>
              </span>
              <Link to={task.href || '/dashboard/talent/profile?gate=true'} className="profile-gate__task-action">
                {task.actionLabel || 'Open profile'}
                <ArrowRight size={13} aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}

      <div className="profile-gate__actions">
        <Link
          to={primaryTask?.href || '/dashboard/talent/profile?gate=true'}
          className="profile-gate__primary"
        >
          <ListChecks size={14} aria-hidden />
          Start required tasks
          <ArrowRight size={14} aria-hidden />
        </Link>
        <Link to="/dashboard/talent/profile?gate=true" className="profile-gate__secondary">
          <Lock size={14} aria-hidden />
          Open profile
        </Link>
      </div>

      {missingCount === 0 && (
        <div className="profile-gate__clear">
          <Check size={14} aria-hidden />
          Required profile fields are complete.
        </div>
      )}
    </section>
  );
}
