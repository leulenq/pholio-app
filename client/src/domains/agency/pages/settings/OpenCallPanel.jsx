import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Copy, Pause, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AgencyButton } from '../../components/ui/AgencyButton';
import {
  getOpenCallLinks,
  createOpenCallLink,
  updateOpenCallLink,
} from '../../api/agency';

/*
 * Open call links — the agency's own applicant funnel routed through Pholio.
 * Talent arriving through a link submit straight to this house, and those
 * invited submissions never count against their monthly Pholio limit.
 */

function linkUrl(code) {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://app.pholio.studio';
  return `${origin}/opencall/${code}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function OpenCallPanel({ canManage = true }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [confirmRevokeId, setConfirmRevokeId] = useState(null);

  const linksQuery = useQuery({
    queryKey: ['agency-open-call-links'],
    queryFn: getOpenCallLinks,
    staleTime: 30_000,
    retry: (failureCount, error) => error?.status !== 503 && failureCount < 2,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['agency-open-call-links'] });

  const createMutation = useMutation({
    mutationFn: () => createOpenCallLink(label.trim()),
    onSuccess: () => {
      setLabel('');
      invalidate();
      toast.success('Open call link created');
    },
    onError: (e) => toast.error(e?.data?.message || e?.message || 'Could not create the link'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateOpenCallLink(id, payload),
    onSuccess: (_data, variables) => {
      invalidate();
      if (variables.payload.status === 'revoked') {
        setConfirmRevokeId(null);
        toast.success('Link revoked');
      }
    },
    onError: (e) => toast.error(e?.data?.message || e?.message || 'Could not update the link'),
  });

  const unavailable = linksQuery.error?.status === 503;
  const links = linksQuery.data || [];

  if (unavailable) {
    return (
      <div className="st-fieldset st-fieldset--last">
        <div className="st-empty-inline">
          <Link2 size={20} />
          <span>Open call links are not available yet.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="st-notice">
        <span className="st-notice-icon"><Link2 size={18} /></span>
        <div>
          <span className="st-notice-title">Your applicant funnel, routed through Pholio</span>
          <span className="st-notice-text">
            Put an open call link on your website or in scouting emails. Talent arriving
            through it submit straight to your house — and those invited submissions never
            count against their monthly Pholio limit.
          </span>
        </div>
      </div>

      {canManage && (
        <div className="st-fieldset">
          <div className="st-fieldset-head">
            <h3 className="st-fieldset-title">New link</h3>
            <p className="st-fieldset-sub">
              Name it for the channel it lives on — the label is only visible to your team.
            </p>
          </div>
          <form
            className="st-opencall-create"
            onSubmit={(event) => {
              event.preventDefault();
              if (!label.trim() || createMutation.isPending) return;
              createMutation.mutate();
            }}
          >
            <input
              className="st-input"
              type="text"
              maxLength={120}
              placeholder='e.g. "Website — Become a model", "Spring scouting email"'
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              aria-label="Link label"
            />
            <AgencyButton
              type="submit"
              variant="primary"
              size="sm"
              loading={createMutation.isPending}
              disabled={!label.trim()}
            >
              Create link
            </AgencyButton>
          </form>
        </div>
      )}

      <div className="st-fieldset st-fieldset--last">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Live links</h3>
          <p className="st-fieldset-sub">
            Each link tracks its own funnel: arrivals, invitations claimed, submissions received.
          </p>
        </div>

        {linksQuery.isLoading ? (
          <div className="st-panel-loading">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="st-skel" />)}
          </div>
        ) : links.length === 0 ? (
          <div className="st-empty-inline">
            <Link2 size={20} />
            <span>No open call links yet. Create one and publish it on your site.</span>
          </div>
        ) : (
          <ul className="st-opencall-list">
            {links.map((link) => {
              const url = linkUrl(link.code);
              const paused = link.status === 'paused';
              const confirming = confirmRevokeId === link.id;
              return (
                <li key={link.id} className="st-opencall-row">
                  <div className="st-opencall-main">
                    <span className="st-opencall-label">{link.label}</span>
                    <span className="st-opencall-url">{url}</span>
                    <span className="st-opencall-funnel">
                      {paused ? 'Paused · ' : ''}
                      {link.arrivals || 0} arrivals · {link.claims || 0} invitations claimed ·{' '}
                      {link.submissions || 0} submissions
                    </span>
                  </div>
                  <div className="st-opencall-actions">
                    <AgencyButton
                      variant="secondary"
                      size="sm"
                      icon={Copy}
                      onClick={async () => {
                        const ok = await copyToClipboard(url);
                        if (ok) toast.success('Link copied');
                        else toast.error('Could not copy — select the URL manually');
                      }}
                    >
                      Copy
                    </AgencyButton>
                    {canManage && (
                      <>
                        <AgencyButton
                          variant="secondary"
                          size="sm"
                          icon={paused ? Play : Pause}
                          disabled={updateMutation.isPending}
                          onClick={() =>
                            updateMutation.mutate({
                              id: link.id,
                              payload: { status: paused ? 'active' : 'paused' },
                            })
                          }
                        >
                          {paused ? 'Resume' : 'Pause'}
                        </AgencyButton>
                        {confirming ? (
                          <span className="st-opencall-confirm">
                            <span className="st-opencall-confirm-text">
                              Revoking breaks this link everywhere it&apos;s published and
                              cancels unclaimed invitations. This can&apos;t be undone.
                            </span>
                            <AgencyButton
                              variant="danger"
                              size="sm"
                              disabled={updateMutation.isPending}
                              onClick={() =>
                                updateMutation.mutate({
                                  id: link.id,
                                  payload: { status: 'revoked' },
                                })
                              }
                            >
                              Revoke permanently
                            </AgencyButton>
                            <AgencyButton
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmRevokeId(null)}
                            >
                              Keep it
                            </AgencyButton>
                          </span>
                        ) : (
                          <AgencyButton
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setConfirmRevokeId(link.id)}
                          >
                            Revoke
                          </AgencyButton>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
