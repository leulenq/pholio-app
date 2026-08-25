import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { AgencyButton } from '../../components/ui/AgencyButton';
import {
  getExportWebhook,
  saveExportWebhook,
  deleteExportWebhook,
} from '../../api/agency';

/**
 * Where submissions get pushed (plan §9.4, adjacency 1).
 *
 * The panel exists to make one thing obvious: this is the exit ramp, not
 * another place to log in. A submission arriving in the agency's own system is
 * the whole point, and the copy says so rather than describing a "webhook
 * integration".
 *
 * Three details carry weight.
 *
 * The signing secret is shown once, at the moment it is generated, and never
 * again. A settings screen that redisplays it puts it in every screenshot and
 * support ticket. Rotating is an explicit choice, because a silent reissue
 * breaks every receiver already configured with the old one.
 *
 * Delivery health is reported in the endpoint's own words — the status code and
 * the body it returned — because "delivery failed" is useless to whoever has to
 * fix it, and the person reading this panel is usually that person.
 *
 * An endpoint auto-disabled after repeated failure says so plainly, and saving
 * re-enables it. That is the honest reading: a save asserts the endpoint is
 * good now.
 */

function healthLine(webhook) {
  if (!webhook) return null;
  if (webhook.disabledAt) {
    return 'Delivery is paused after repeated failures. Save again to switch it back on.';
  }
  if (webhook.lastError) {
    const code = webhook.lastStatusCode ? ` (${webhook.lastStatusCode})` : '';
    return `Last delivery failed${code}: ${webhook.lastError}`;
  }
  if (webhook.lastDeliveredAt) {
    const when = new Date(webhook.lastDeliveredAt);
    return Number.isNaN(when.getTime())
      ? 'Last delivery succeeded.'
      : `Last delivered ${when.toLocaleString()}.`;
  }
  return 'No submission has been delivered yet.';
}

export default function ExportWebhookPanel({ canManage }) {
  const qc = useQueryClient();
  const ro = !canManage;

  const query = useQuery({
    queryKey: ['agency-export-webhook'],
    queryFn: getExportWebhook,
  });

  const webhook = query.data?.webhook || null;
  const available = query.data?.available !== false;

  const [url, setUrl] = useState('');
  const [rotate, setRotate] = useState(false);
  const [freshSecret, setFreshSecret] = useState(null);
  const [copied, setCopied] = useState(false);

  const effectiveUrl = url || webhook?.url || '';
  const dirty = effectiveUrl !== (webhook?.url || '') || rotate;

  const save = useMutation({
    mutationFn: () =>
      saveExportWebhook({ url: effectiveUrl, rotateSecret: rotate || !webhook }),
    onSuccess: (data) => {
      // The only moment the secret is ever in the response.
      if (data?.secret) setFreshSecret(data.secret);
      setRotate(false);
      setUrl('');
      qc.invalidateQueries({ queryKey: ['agency-export-webhook'] });
      toast.success('Export destination saved');
    },
    onError: (e) => toast.error(e?.message || 'That endpoint could not be saved'),
  });

  const remove = useMutation({
    mutationFn: deleteExportWebhook,
    onSuccess: () => {
      setFreshSecret(null);
      setUrl('');
      qc.invalidateQueries({ queryKey: ['agency-export-webhook'] });
      toast.success('Export destination removed');
    },
    onError: (e) => toast.error(e?.message || 'Could not remove the destination'),
  });

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(freshSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be denied; the value is on screen.
    }
  };

  if (!available) {
    return (
      <div className="st-readonly">
        Export delivery is briefly unavailable while Pholio finishes an update.
      </div>
    );
  }

  return (
    <>
      {ro && (
        <div className="st-readonly">
          <Lock size={13} /> Read-only — ask a principal or agent to change this.
        </div>
      )}

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Send submissions to your own system</h3>
          <p className="st-fieldset-sub">
            Every submission is POSTed to a URL you control the moment it arrives,
            so your desk keeps working where it already works. Pholio does not need
            to be the place you check.
          </p>
        </div>

        <label className="st-hook-field">
          <span className="st-hook-label">Endpoint URL</span>
          <input
            type="url"
            className="st-hook-input"
            placeholder="https://your-system.example.com/pholio"
            disabled={ro || save.isPending}
            value={effectiveUrl}
            onChange={(e) => setUrl(e.target.value)}
          />
          <span className="st-hook-hint">
            Must be https, and must resolve to a public address.
          </span>
        </label>

        {webhook && (
          <p className="st-hook-health">{healthLine(webhook)}</p>
        )}
      </div>

      {freshSecret && (
        <div className="st-fieldset">
          <div className="st-fieldset-head">
            <h3 className="st-fieldset-title">Signing secret</h3>
            <p className="st-fieldset-sub">
              Shown once, now. Every delivery carries an <code>X-Pholio-Signature</code>
              {' '}header — an HMAC-SHA256 of the timestamp and body — so your system can
              prove a request came from Pholio and not from anyone who learned the URL.
            </p>
          </div>
          <div className="st-hook-secret">
            <code className="st-hook-secret-value">{freshSecret}</code>
            <button type="button" className="st-hook-copy" onClick={copySecret}>
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {webhook && !ro && (
        <div className="st-fieldset">
          <label className="st-hook-rotate">
            <input
              type="checkbox"
              checked={rotate}
              onChange={() => setRotate((r) => !r)}
            />
            <span>
              Issue a new signing secret when I save
              <span className="st-hook-rotate-note">
                Anything still using the old secret will start failing until you update it.
              </span>
            </span>
          </label>
        </div>
      )}

      {!ro && (
        <div className="st-panel-foot">
          {webhook && (
            <AgencyButton
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Remove
            </AgencyButton>
          )}
          <AgencyButton
            variant="primary"
            disabled={!effectiveUrl || (!dirty && Boolean(webhook)) || save.isPending}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {webhook ? 'Save destination' : 'Start sending'}
          </AgencyButton>
        </div>
      )}
    </>
  );
}
