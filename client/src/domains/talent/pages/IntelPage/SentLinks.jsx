import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../../api/talent';
import { formatDay } from './placementModel';

/**
 * Tracked links for agencies the talent applies to outside Pholio. One link
 * per recipient the talent names, so an open says who. Pholio never infers
 * who opened anything; an unopened link is stated plainly and nothing more.
 */

function openedLine(token) {
  const n = Number(token.open_count) || 0;
  if (!n) return null;
  const when = formatDay(token.last_opened_at || token.first_opened_at);
  if (n === 1) return when ? `Opened ${when}` : 'Opened once';
  return when ? `${n} opens, last ${when}` : `${n} opens`;
}

function Row({ token, onRevoke, revoking }) {
  const [copied, setCopied] = useState(false);
  const absolute = typeof window !== 'undefined' ? `${window.location.origin}${token.url}` : token.url;
  const opened = openedLine(token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be denied; the link is on screen either way.
    }
  };
  return (
    <li className="dk-sent-row">
      <span className="dk-sent-who">{token.label || 'Untitled link'}</span>
      <span className={`dk-sent-opened${opened ? ' is-opened' : ''}`}>{opened || 'Not opened yet'}</span>
      <span className="dk-sent-actions">
        <button type="button" className="dk-textbtn" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          className="dk-textbtn"
          onClick={() => onRevoke(token.id)}
          disabled={revoking}
          aria-label={`Revoke the link for ${token.label || 'this recipient'}`}
        >
          Revoke
        </button>
      </span>
    </li>
  );
}

export default function SentLinks() {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const tokensQuery = useQuery({
    queryKey: ['intel-share-tokens'],
    queryFn: () => talentApi.getShareTokens(),
  });
  const tokens = tokensQuery.data?.tokens || [];
  const mint = useMutation({
    mutationFn: () => talentApi.createShareToken({ label: label.trim() }),
    onSuccess: () => {
      setLabel('');
      qc.invalidateQueries({ queryKey: ['intel-share-tokens'] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id) => talentApi.revokeShareToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intel-share-tokens'] }),
  });

  return (
    <section className="dk-sent" aria-labelledby="dk-sent-h">
      <h2 id="dk-sent-h" className="dk-h">Links you send</h2>
      <p className="dk-soft">
        Applying on an agency&rsquo;s own site? Paste a link made for them, and an open here names who it was.
      </p>
      <form
        className="dk-mint"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) mint.mutate();
        }}
      >
        <label className="dk-mint-field">
          <span className="dk-hidden">Recipient</span>
          <input
            type="text"
            value={label}
            maxLength={120}
            placeholder="Who is this link for?"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <button type="submit" className="dk-button" disabled={!label.trim() || mint.isPending}>
          {mint.isPending ? 'Creating link' : 'Create link'}
        </button>
      </form>
      {mint.isError && <p className="dk-error" role="alert">The link was not created. Try again.</p>}
      {tokens.length > 0 && (
        <ul className="dk-sent-list">
          {tokens.map((token) => (
            <Row key={token.id} token={token} onRevoke={(id) => revoke.mutate(id)} revoking={revoke.isPending} />
          ))}
        </ul>
      )}
    </section>
  );
}
