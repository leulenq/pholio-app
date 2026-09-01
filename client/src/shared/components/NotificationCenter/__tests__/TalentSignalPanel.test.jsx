import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import TalentSignalPanel from '../TalentSignalPanel';

const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

const OFFER = {
  id: 'offer',
  type: 'application_status',
  title: 'Representation offer',
  body: 'Elite would like to move forward.',
  routeTarget: '/dashboard/talent/applications?application=1',
  metadata: { status: 'accepted', agencyName: 'Elite' },
  isRead: false,
  occurrenceCount: 1,
  lastOccurredAt: ago(120),
};

const NEWS = {
  id: 'news',
  type: 'application_status',
  title: 'You were shortlisted',
  body: 'Storm moved your application forward.',
  metadata: { status: 'shortlisted', agencyName: 'Storm' },
  isRead: true,
  occurrenceCount: 1,
  lastOccurredAt: ago(60 * 24 * 2),
};

const VIEW = {
  id: 'view',
  type: 'agency_profile_view',
  title: 'Next viewed your profile',
  body: 'An agency opened your portfolio in Scout.',
  metadata: { agencyName: 'Next' },
  isRead: true,
  occurrenceCount: 1,
  lastOccurredAt: ago(45),
};

const render_ = (props = {}) =>
  render(
    <TalentSignalPanel
      notifications={[OFFER, NEWS, VIEW]}
      unreadCount={1}
      onMarkAllRead={() => {}}
      onItemClick={() => {}}
      {...props}
    />,
  );

describe('TalentSignalPanel', () => {
  it('leads with what is owed rather than with what is newest', () => {
    render_();
    // The profile view is the most recent event; the offer still comes first.
    const rows = screen.getAllByRole('button').filter((b) => b.className.includes('sig__row'));
    expect(rows[0]).toHaveTextContent('Representation offer');
  });

  it('groups rows under the three bands', () => {
    render_();
    expect(screen.getByText('Waiting on you')).toBeInTheDocument();
    expect(screen.getByText('What changed')).toBeInTheDocument();
    expect(screen.getByText("Who's looking")).toBeInTheDocument();
  });

  it('prints the band and nothing that restates it', () => {
    render_();
    // No verdict line, no count beside the rail, no synthesised per-row verb.
    expect(screen.queryByText('1 waiting on you')).not.toBeInTheDocument();
    expect(screen.queryByText('Answer the offer')).not.toBeInTheDocument();
    expect(screen.queryByText('View')).not.toBeInTheDocument();
    expect(
      within(screen.getByText('Waiting on you')).queryByText('1'),
    ).not.toBeInTheDocument();
  });

  it('drops the action rail entirely when nothing is owed', () => {
    render_({ notifications: [NEWS, VIEW], unreadCount: 0 });
    expect(screen.queryByText('Waiting on you')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();
  });

  it('hands the whole row back on click', () => {
    const onItemClick = vi.fn();
    render_({ onItemClick });
    fireEvent.click(screen.getByText('Representation offer').closest('button'));
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'offer' }));
  });

  it('expands a truncated quiet band on request', () => {
    const views = Array.from({ length: 7 }, (_, i) => ({
      ...VIEW,
      id: `view-${i}`,
      title: `Agency ${i} viewed your profile`,
      metadata: { agencyName: `Agency ${i}` },
    }));
    render_({ notifications: views, unreadCount: 0 });
    // The agency name is the emphasised half of a split headline.
    expect(screen.queryByText('Agency 6')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    expect(screen.getByText('Agency 6')).toBeInTheDocument();
  });

  it('offers a retry that actually refetches when the load failed', () => {
    const onRetry = vi.fn();
    render_({ isError: true, notifications: [], onRetry });
    expect(screen.getByText('Signals didn’t load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('has a real empty state rather than an empty list', () => {
    render_({ notifications: [], unreadCount: 0 });
    expect(screen.getByText('No signals yet')).toBeInTheDocument();
    expect(screen.queryByText('What changed')).not.toBeInTheDocument();
  });

  it('shows neither a verdict nor a mark-all control while loading', () => {
    render_({ isLoading: true, notifications: [], unreadCount: 4 });
    expect(screen.getByRole('status', { name: 'Loading signals' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();
  });
});
