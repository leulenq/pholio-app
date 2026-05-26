import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Briefcase,
  Calendar,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  Sparkles,
  Star,
  Users2,
} from 'lucide-react';

import TalentDetailPanel from '../../components/TalentDetailPanel';
import { TalentMatchRing } from '../../components/ui/TalentMatchRing';
import {
  acceptApplication,
  declineApplication,
  getAgencyActivity,
  getAgencyOverview,
  getAgencyProfile,
  getAgencyTeam,
  getDiscoverableTalent,
  getDueRemindersCount,
  getInterviews,
  getMessageThreads,
  getRecentApplicants,
  inviteTalent,
  shortlistApplication,
} from '../../api/agency';
import './OverviewPage.css';

const PIPELINE_COLORS = {
  Submitted: '#5f6470',
  Shortlisted: '#111827',
  Booked: '#1f8a5b',
  Passed: '#d2d6de',
  Declined: '#c2564d',
};

const MIX_COLORS = ['#c9a55a', '#1f2937', '#7c8b9d', '#d8dce4', '#8a97a8', '#3f7d62'];

function formatRelativeTime(dateString) {
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return 'Recently';

  const diffMs = Date.now() - value.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return value.toLocaleDateString();
}

function formatDateTime(dateString) {
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return 'TBD';
  return value.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function cmToFeetInches(cm) {
  if (!cm) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AG';
}

function buildDynamicSubtitle(kpis, pulse, dueRemindersCount, unreadMessages) {
  const pending = kpis?.pendingReview?.count ?? 0;
  const oldest = kpis?.pendingReview?.oldestDaysAgo;
  const closingToday = kpis?.activeCastings?.closingToday ?? 0;

  if (pending > 0) {
    return `${pending} submissions need review${oldest != null ? `, oldest waiting ${oldest} days` : ''}.`;
  }
  if (closingToday > 0) {
    return `${closingToday} casting${closingToday === 1 ? '' : 's'} close today. Keep shortlists moving.`;
  }
  if (dueRemindersCount > 0) {
    return `${dueRemindersCount} reminder${dueRemindersCount === 1 ? '' : 's'} are due across the agency today.`;
  }
  if (unreadMessages > 0) {
    return `${unreadMessages} talent conversation${unreadMessages === 1 ? '' : 's'} need attention.`;
  }
  const idle = pulse?.idleTalent ?? 0;
  if (idle > 0) {
    return `${idle} rostered talent have not been submitted in 30 days.`;
  }
  return 'The queue is clear. Use Overview to decide what the agency team should tackle next.';
}

function mapScoutProfile(profile) {
  const primaryImage = profile.images?.find((image) => image.is_primary) || profile.images?.[0];
  return {
    id: profile.id,
    profileId: profile.id,
    name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unnamed Talent',
    image: primaryImage?.path || null,
    city: profile.city || 'Location not set',
    archetype: profile.archetype || 'Open',
    height: cmToFeetInches(profile.height_cm),
    experience: profile.experience_level || 'Experience not listed',
  };
}

function OverviewStat({ label, value, hint, urgent }) {
  return (
    <div className={`ov-top-stat${urgent ? ' ov-top-stat--urgent' : ''}`}>
      <span className="ov-top-stat__label">{label}</span>
      <strong className="ov-top-stat__value">{value}</strong>
      {hint ? <span className="ov-top-stat__hint">{hint}</span> : null}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="ov-section-head">
      <div className="ov-section-head__title">
        <span className="ov-section-head__icon">
          <Icon size={16} />
        </span>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export default function OverviewPage() {
  const [selectedPanel, setSelectedPanel] = useState(null);
  const [invitingIds, setInvitingIds] = useState(new Set());
  const queryClient = useQueryClient();

  const { data: overview, isLoading, isError } = useQuery({
    queryKey: ['agency', 'overview'],
    queryFn: getAgencyOverview,
    staleTime: 60000,
  });

  const { data: profile } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
    staleTime: 5 * 60 * 1000,
  });

  const { data: recentApplicants = [] } = useQuery({
    queryKey: ['agency', 'overview', 'recent-applicants'],
    queryFn: () => getRecentApplicants(6),
    staleTime: 60000,
  });

  const { data: team = [] } = useQuery({
    queryKey: ['agency', 'team'],
    queryFn: getAgencyTeam,
    staleTime: 5 * 60 * 1000,
  });

  const { data: activity = [] } = useQuery({
    queryKey: ['agency', 'activity'],
    queryFn: getAgencyActivity,
    staleTime: 60000,
  });

  const { data: interviews = [] } = useQuery({
    queryKey: ['agency', 'interviews', 'upcoming'],
    queryFn: () => getInterviews({ upcoming: true }),
    staleTime: 60000,
  });

  const { data: threads = [] } = useQuery({
    queryKey: ['agency', 'messages', 'threads'],
    queryFn: getMessageThreads,
    staleTime: 30000,
  });

  const { data: dueReminders } = useQuery({
    queryKey: ['agency', 'reminders', 'due-count'],
    queryFn: getDueRemindersCount,
    staleTime: 30000,
  });

  const { data: scoutData } = useQuery({
    queryKey: ['agency', 'overview', 'scout-radar'],
    queryFn: () => getDiscoverableTalent({ limit: 4, sort: 'newest' }),
    staleTime: 60000,
  });

  const kpis = overview?.kpis || {};
  const pulse = overview?.pulse || {};
  const pendingReview = kpis.pendingReview || { count: 0, oldestDaysAgo: null };
  const activeCastings = kpis.activeCastings || { count: 0, closingToday: 0 };
  const rosterSize = kpis.rosterSize || { count: 0, changeThisMonth: 0 };
  const utilization = kpis.utilization || { active: 0, total: 0, pct: 0 };
  const dueRemindersCount = dueReminders?.count ?? 0;
  const unreadMessages = threads.filter((thread) => thread.unread).length;

  const pipelineStages = useMemo(() => (
    (overview?.pipeline || []).map((stage) => ({
      ...stage,
      color: PIPELINE_COLORS[stage.label] || '#94a3b8',
    }))
  ), [overview?.pipeline]);

  const talentMix = useMemo(() => (
    (overview?.talentMix || []).map((item, index) => ({
      ...item,
      color: MIX_COLORS[index % MIX_COLORS.length],
    }))
  ), [overview?.talentMix]);

  const weakestMix = useMemo(() => (
    talentMix.length
      ? talentMix.reduce((lowest, item) => (item.pct < lowest.pct ? item : lowest), talentMix[0])
      : null
  ), [talentMix]);

  const strongestMix = useMemo(() => (
    talentMix.length
      ? talentMix.reduce((highest, item) => (item.pct > highest.pct ? item : highest), talentMix[0])
      : null
  ), [talentMix]);

  const controlSubtitle = buildDynamicSubtitle(kpis, pulse, dueRemindersCount, unreadMessages);

  const submissionCards = recentApplicants.map((app) => ({
    applicationId: app.applicationId,
    profileId: app.profileId,
    name: app.name,
    location: app.location,
    height: app.height || 'N/A',
    age: app.age || 'N/A',
    image: app.profileImage,
    fitScore: app.matchScore,
    submittedAt: formatRelativeTime(app.createdAt),
    signal: app.matchScore ? `${app.matchScore}% fit` : app.isNew ? 'New submission' : 'Queue',
  }));

  const scoutCards = (scoutData?.profiles || []).map(mapScoutProfile);
  const unreadThreads = threads.filter((thread) => thread.unread).slice(0, 3);
  const upcomingInterviews = interviews.slice(0, 3);
  const activityItems = activity.slice(0, 5);

  const containerVars = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };

  const itemVars = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 58, damping: 15 } },
  };

  const handleSubmissionAction = useCallback(async (applicationId, actionFn) => {
    try {
      await actionFn(applicationId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agency', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['agency', 'overview', 'recent-applicants'] }),
        queryClient.invalidateQueries({ queryKey: ['agency', 'applications'] }),
      ]);
    } catch {
      const { toast } = await import('sonner');
      toast.error('Action failed. Please try again.');
    }
  }, [queryClient]);

  const handleInvite = useCallback(async (profileId) => {
    setInvitingIds((current) => new Set(current).add(profileId));
    try {
      await inviteTalent(profileId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agency', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['agency', 'overview', 'scout-radar'] }),
        queryClient.invalidateQueries({ queryKey: ['discover'] }),
      ]);
      const { toast } = await import('sonner');
      toast.success('Invitation sent');
    } catch (error) {
      const { toast } = await import('sonner');
      if (error?.status === 409) {
        toast.info('Talent has already been invited');
      } else {
        toast.error('Failed to send invitation');
      }
    } finally {
      setInvitingIds((current) => {
        const next = new Set(current);
        next.delete(profileId);
        return next;
      });
    }
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="ov-page ov-page--state">
        <div className="ov-state">
          <Loader2 size={22} className="animate-spin" />
          <span>Loading agency overview…</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="ov-page ov-page--state">
        <div className="ov-state ov-state--error">
          <AlertCircle size={22} />
          <span>Failed to load the overview dashboard.</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div className="ov-page" initial="hidden" animate="show" variants={containerVars}>
      <motion.section className="ov-command" variants={itemVars}>
        <div className="ov-command__intro">
          <span className="ov-command__eyebrow">Agency Control Center</span>
          <h1 className="ov-command__title">
            {profile?.agency_name || 'Agency'} overview
          </h1>
          <p className="ov-command__subtitle">{controlSubtitle}</p>
        </div>

        <div className="ov-command__stats">
          <OverviewStat
            label="Pending Review"
            value={pendingReview.count}
            hint={pendingReview.oldestDaysAgo != null ? `Oldest ${pendingReview.oldestDaysAgo}d` : 'Queue clear'}
            urgent={pendingReview.count > 0}
          />
          <OverviewStat
            label="Closing Today"
            value={activeCastings.closingToday}
            hint={`${activeCastings.count} active castings`}
          />
          <OverviewStat
            label="Conversations"
            value={unreadMessages}
            hint="Unread talent threads"
          />
          <OverviewStat
            label="Team Online"
            value={team.length}
            hint="Agency logins"
          />
        </div>
      </motion.section>

      <div className="ov-dashboard">
        <div className="ov-dashboard__main">
          <motion.section className="ov-card ov-card--priority" variants={itemVars}>
            <SectionHeader
              icon={Inbox}
              title="Needs Attention"
              description="Review strong submissions fast and move the right talent into the next step."
              action={(
                <Link to="/dashboard/agency/inbox" className="ov-card-link">
                  Open submissions <ArrowUpRight size={14} />
                </Link>
              )}
            />

            <div className="ov-alert-strip">
              <div className="ov-alert-chip ov-alert-chip--urgent">
                <AlertCircle size={14} />
                {pendingReview.count} waiting review
              </div>
              <div className="ov-alert-chip">
                <Clock size={14} />
                {pendingReview.oldestDaysAgo != null ? `${pendingReview.oldestDaysAgo}d oldest wait` : 'No aged queue'}
              </div>
              <div className="ov-alert-chip">
                <Briefcase size={14} />
                {activeCastings.closingToday} closing today
              </div>
            </div>

            <div className="ov-priority-list">
              {submissionCards.length === 0 ? (
                <div className="ov-empty-state">
                  <p>No recent submissions yet.</p>
                  <span>New applicants will appear here as soon as the agency receives them.</span>
                </div>
              ) : submissionCards.map((card) => (
                <button
                  key={card.applicationId}
                  type="button"
                  className="ov-priority-card"
                  onClick={() => setSelectedPanel({
                    context: 'inbox',
                    applicationId: card.applicationId,
                    profileId: card.profileId,
                  })}
                >
                  <div className="ov-priority-card__avatar">
                    <img src={card.image} alt={card.name} />
                  </div>
                  <div className="ov-priority-card__body">
                    <div className="ov-priority-card__head">
                      <div>
                        <h3>{card.name}</h3>
                        <p>{card.location}</p>
                      </div>
                      <div className="ov-priority-card__fit">
                        <TalentMatchRing score={card.fitScore || 0} size="sm" />
                      </div>
                    </div>
                    <div className="ov-priority-card__meta">
                      <span>{card.signal}</span>
                      <span>{card.height}</span>
                      <span>{card.submittedAt}</span>
                    </div>
                  </div>
                  <div
                    className="ov-priority-card__actions"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="ov-inline-action ov-inline-action--ghost"
                      onClick={() => handleSubmissionAction(card.applicationId, shortlistApplication)}
                    >
                      Shortlist
                    </button>
                    <button
                      type="button"
                      className="ov-inline-action ov-inline-action--accept"
                      onClick={() => handleSubmissionAction(card.applicationId, acceptApplication)}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="ov-inline-action ov-inline-action--decline"
                      onClick={() => handleSubmissionAction(card.applicationId, declineApplication)}
                    >
                      Pass
                    </button>
                  </div>
                </button>
              ))}
            </div>
          </motion.section>

          <motion.section className="ov-card" variants={itemVars}>
            <SectionHeader
              icon={Briefcase}
              title="Pipeline Snapshot"
              description="See where talent is pooling up and how quickly the agency is moving people forward."
              action={(
                <Link to="/dashboard/agency/casting" className="ov-card-link">
                  Open castings <ArrowUpRight size={14} />
                </Link>
              )}
            />

            <div className="ov-pipeline-grid">
              {pipelineStages.map((stage) => (
                <div key={stage.label} className="ov-stage-card">
                  <div className="ov-stage-card__top">
                    <span className="ov-stage-card__dot" style={{ background: stage.color }} />
                    <span className="ov-stage-card__label">{stage.label}</span>
                  </div>
                  <strong className="ov-stage-card__value">{stage.count}</strong>
                  <span className="ov-stage-card__share">{stage.sharePct}% of pipeline</span>
                </div>
              ))}
            </div>

            <div className="ov-pipeline-insights">
              <div className="ov-insight">
                <span className="ov-insight__label">Active roles</span>
                <strong>{activeCastings.count}</strong>
                <span className="ov-insight__hint">{activeCastings.closingToday} closing today</span>
              </div>
              <div className="ov-insight">
                <span className="ov-insight__label">Discoverable now</span>
                <strong>{pulse.discoverableCount ?? 0}</strong>
                <span className="ov-insight__hint">{pulse.newTalentWeek ?? 0} new this week</span>
              </div>
              <div className="ov-insight">
                <span className="ov-insight__label">Roster utilization</span>
                <strong>{utilization.pct || 0}%</strong>
                <span className="ov-insight__hint">{utilization.active} of {utilization.total} active in 30d</span>
              </div>
            </div>
          </motion.section>

          <motion.section className="ov-card" variants={itemVars}>
            <SectionHeader
              icon={Activity}
              title="Team Activity"
              description="Keep a light read on movement across the agency without leaving the home tab."
              action={(
                <Link to="/dashboard/agency/activity" className="ov-card-link">
                  Full activity feed <ArrowUpRight size={14} />
                </Link>
              )}
            />

            <div className="ov-activity-list">
              {activityItems.length === 0 ? (
                <div className="ov-empty-state">
                  <p>No recent team activity yet.</p>
                  <span>Actions and handoffs across the agency will appear here.</span>
                </div>
              ) : activityItems.map((item) => (
                <Link
                  key={item.id}
                  to={item.application_id ? `/dashboard/agency/inbox?id=${item.application_id}` : '/dashboard/agency/activity'}
                  className="ov-activity-row"
                >
                  <div className="ov-activity-row__icon">
                    <ChevronRight size={14} />
                  </div>
                  <div className="ov-activity-row__body">
                    <strong>{item.talentName || 'Talent'}</strong>
                    <p>{item.description}</p>
                    <span>
                      {item.application_label || 'Agency feed'} · {formatRelativeTime(item.created_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </motion.section>
        </div>

        <div className="ov-dashboard__side">
          <motion.section className="ov-card" variants={itemVars}>
            <SectionHeader
              icon={Calendar}
              title="Today Board"
              description="Meetings, reminders, and response pressure across the team."
            />

            <div className="ov-mini-stats">
              <OverviewStat label="Reminders" value={dueRemindersCount} hint="Due now" urgent={dueRemindersCount > 0} />
              <OverviewStat label="Meetings" value={interviews.length} hint="Upcoming" />
              <OverviewStat label="Unread" value={unreadMessages} hint="Conversations" />
            </div>

            <div className="ov-side-block">
              <h3>Upcoming Meetings</h3>
              {upcomingInterviews.length === 0 ? (
                <p className="ov-side-block__empty">No interviews scheduled yet.</p>
              ) : upcomingInterviews.map((interview) => (
                <div key={interview.id} className="ov-schedule-row">
                  <div>
                    <strong>{interview.talent_name || 'Talent'}</strong>
                    <p>{interview.interview_type || 'Interview'}</p>
                  </div>
                  <span>{formatDateTime(interview.proposed_datetime)}</span>
                </div>
              ))}
            </div>

            <div className="ov-side-block">
              <h3>Response Queue</h3>
              {unreadThreads.length === 0 ? (
                <p className="ov-side-block__empty">No unread talent messages.</p>
              ) : unreadThreads.map((thread) => (
                <Link key={thread.id} to="/dashboard/agency/messages" className="ov-thread-row">
                  <div className="ov-thread-row__avatar">
                    {thread.senderAvatar ? (
                      <img src={thread.senderAvatar} alt={thread.senderName} />
                    ) : (
                      <span>{getInitials(thread.senderName)}</span>
                    )}
                  </div>
                  <div className="ov-thread-row__body">
                    <strong>{thread.senderName}</strong>
                    <p>{thread.preview}</p>
                  </div>
                  <span className="ov-thread-row__time">{formatRelativeTime(thread.timestamp)}</span>
                </Link>
              ))}
            </div>
          </motion.section>

          <motion.section className="ov-card ov-card--scout" variants={itemVars}>
            <SectionHeader
              icon={Sparkles}
              title="Discovery Radar"
              description="Fresh faces and roster gaps worth the scouting team’s attention."
              action={(
                <Link to="/dashboard/agency/discover" className="ov-card-link">
                  Open scout <ArrowUpRight size={14} />
                </Link>
              )}
            />

            <div className="ov-radar-summary">
              <div className="ov-radar-summary__metric">
                <span className="ov-radar-summary__label">Profiles ready</span>
                <strong>{pulse.discoverableCount ?? scoutCards.length}</strong>
              </div>
              <div className="ov-radar-summary__metric">
                <span className="ov-radar-summary__label">Thinnest mix</span>
                <strong>{weakestMix?.name || 'N/A'}</strong>
              </div>
            </div>

            <div className="ov-scout-grid">
              {scoutCards.length === 0 ? (
                <div className="ov-empty-state">
                  <p>No discoverable profiles right now.</p>
                  <span>New faces will surface here as they become available.</span>
                </div>
              ) : scoutCards.map((card) => (
                <div key={card.id} className="ov-scout-card">
                  <button
                    type="button"
                    className="ov-scout-card__media"
                    onClick={() => setSelectedPanel({
                      context: 'discover',
                      profileId: card.profileId,
                    })}
                  >
                    {card.image ? (
                      <img src={card.image} alt={card.name} />
                    ) : (
                      <div className="ov-scout-card__fallback">{getInitials(card.name)}</div>
                    )}
                  </button>
                  <div className="ov-scout-card__body">
                    <strong>{card.name}</strong>
                    <p>{card.archetype} · {card.city}</p>
                    <span>{card.height || 'Height not listed'} · {card.experience}</span>
                  </div>
                  <button
                    type="button"
                    className="ov-inline-action ov-inline-action--accept"
                    disabled={invitingIds.has(card.profileId)}
                    onClick={() => handleInvite(card.profileId)}
                  >
                    {invitingIds.has(card.profileId) ? 'Inviting…' : 'Invite'}
                  </button>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section className="ov-card" variants={itemVars}>
            <SectionHeader
              icon={Users2}
              title="Team Pulse"
              description="Make the agency feel like a shared operating system, not a single-user account."
            />

            <div className="ov-team-summary">
              <div className="ov-team-summary__item">
                <span>Active logins</span>
                <strong>{team.length}</strong>
              </div>
              <div className="ov-team-summary__item">
                <span>Unread threads</span>
                <strong>{unreadMessages}</strong>
              </div>
              <div className="ov-team-summary__item">
                <span>Live castings</span>
                <strong>{activeCastings.count}</strong>
              </div>
            </div>

            <div className="ov-team-list">
              {team.slice(0, 5).map((member) => (
                <div key={member.membershipId} className="ov-team-member">
                  <span className="ov-team-member__avatar">{getInitials(member.full_name || member.email)}</span>
                  <div className="ov-team-member__body">
                    <strong>{member.full_name || member.email}</strong>
                    <p>
                      {member.membership_role === 'OWNER'
                        ? 'Owner'
                        : member.membership_role === 'ADMIN'
                          ? 'Admin'
                          : 'Member'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section className="ov-card" variants={itemVars}>
            <SectionHeader
              icon={Star}
              title="Roster Watch"
              description="Keep an eye on utilization, mix, and where the roster needs support."
              action={(
                <Link to="/dashboard/agency/roster" className="ov-card-link">
                  Open roster <ArrowUpRight size={14} />
                </Link>
              )}
            />

            <div className="ov-roster-watch">
              <div className="ov-roster-watch__hero">
                <strong>{rosterSize.count}</strong>
                <span>signed talent</span>
              </div>
              <div className="ov-roster-watch__metrics">
                <div>
                  <span>Active in 30d</span>
                  <strong>{utilization.active} / {utilization.total}</strong>
                </div>
                <div>
                  <span>Idle talent</span>
                  <strong>{pulse.idleTalent ?? 0}</strong>
                </div>
                <div>
                  <span>Strongest mix</span>
                  <strong>{strongestMix?.name || 'N/A'}</strong>
                </div>
                <div>
                  <span>Needs scouting</span>
                  <strong>{weakestMix?.name || 'N/A'}</strong>
                </div>
              </div>
            </div>
          </motion.section>
        </div>
      </div>

      <AnimatePresence>
        {selectedPanel && (
          <TalentDetailPanel
            key={`${selectedPanel.context}-${selectedPanel.profileId || selectedPanel.applicationId}`}
            profileId={selectedPanel.profileId}
            applicationId={selectedPanel.applicationId}
            context={selectedPanel.context}
            mode="drawer"
            onClose={() => setSelectedPanel(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
