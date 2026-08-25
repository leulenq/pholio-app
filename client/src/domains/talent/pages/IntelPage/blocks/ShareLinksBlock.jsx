import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Link2, X } from 'lucide-react';
import { Block, Panel, Finding, Emph, NotYet, Stat, StatRow } from '../Chrome';
import { talentApi } from '../../../api/talent';

/**
 * Per-recipient share links, and whether they were opened.
 *
 * The strategic analysis §9.2 calls this "did Marilyn open my book — the single
 * most emotionally valuable analytics event Pholio can show", and notes it was
 * "already built, buried". The server has had the whole surface for a while:
 * mint a token, list them with open counts and first/last opened timestamps,
 * revoke. Nothing on the client ever asked.
 *
 * Two decisions shape this block.
 *
 * A link that has never been opened says exactly that. No "0 opens" dressed up
 * as a metric, no encouragement, no speculation about why. Silence from an
 * agency is the ordinary case and the talent knows it; the page's job is to
 * report, not to console.
 *
 * The label is the whole feature. One link per recipient is what turns an open
 * into information — "Marilyn opened it" rather than "someone opened
 * something". So the form asks for a name first and mints second.
 */

function openedLine(token) {
  if (!token.open_count) return null;
  const when = token.last_opened_at || token.first_opened_at;
  if (!when) return `${token.open_count} ${token.open_count === 1 ? 'open' : 'opens'}`;
  const date = new Date(when);
  if (Number.isNaN(date.getTime())) return null;
  const stamp = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  return token.open_count === 1
    ? `Opened ${stamp}`
    : `${token.open_count} opens, last ${stamp}`;
}

function ShareRow({ token, onRevoke, revoking }) {
  const [copied, setCopied] = useState(false);
  const absolute =
    typeof window !== 'undefined' ? `${window.location.origin}${token.url}` : token.url;
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
    <div className="iv-share-row">
      <div className="iv-share-id">
        <span className="iv-share-label">{token.label || 'Untitled link'}</span>
        <span className="iv-share-kind">{token.kind === 'card' ? 'Comp card' : 'Portfolio'}</span>
      </div>

      <span className={`iv-share-opened${opened ? '' : ' is-quiet'}`}>
        {/* Never opened is a fact, stated plainly. */}
        {opened || 'Not opened yet'}
      </span>

      <div className="iv-share-actions">
        <button type="button" className="iv-share-btn" onClick={copy}>
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="iv-share-btn iv-share-btn--quiet"
          onClick={() => onRevoke(token.id)}
          disabled={revoking}
          aria-label={`Revoke the link for ${token.label || 'this recipient'}`}
        >
          <X size={13} aria-hidden />
          Revoke
        </button>
      </div>
    </div>
  );
}

export default function ShareLinksBlock() {
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

  const opened = tokens.filter((t) => t.open_count > 0);
  const totalOpens = tokens.reduce((sum, t) => sum + (Number(t.open_count) || 0), 0);

  const finding = tokens.length === 0
    ? (
      <Finding verdict="No links yet" tag="per recipient">
        a separate link per agency is what turns an open into an answer
      </Finding>
    )
    : opened.length === 0
      ? (
        <Finding verdict="None opened" tag={`${tokens.length} live`}>
          nobody has opened a link yet — that is <Emph>ordinary</Emph>, and it is not a verdict on the work
        </Finding>
      )
      : (
        <Finding
          figure={String(opened.length)}
          verdict={opened.length === 1 ? 'link opened' : 'links opened'}
          tag={`of ${tokens.length}`}
        >
          across <Emph>{totalOpens}</Emph> {totalOpens === 1 ? 'open' : 'opens'}
        </Finding>
      );

  return (
    <Block
      id="share-links"
      question="Who opened my book?"
      finding={finding}
    >
      <Panel
        label="Per-recipient links"
        note="One link per agency, so an open names who"
      >
        <form
          className="iv-share-mint"
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) mint.mutate();
          }}
        >
          <label className="iv-share-mint-field">
            <span className="iv-share-mint-hint">Who is this for?</span>
            <input
              type="text"
              className="iv-share-input"
              value={label}
              maxLength={120}
              placeholder="Marilyn Agency"
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="iv-share-btn iv-share-btn--go"
            disabled={!label.trim() || mint.isPending}
          >
            <Link2 size={13} aria-hidden />
            {mint.isPending ? 'Creating…' : 'Create link'}
          </button>
        </form>

        {tokensQuery.isLoading ? (
          <NotYet threshold="—">reading your links</NotYet>
        ) : tokens.length === 0 ? (
          <NotYet threshold="0">
            name a recipient above and Pholio mints a link only they have
          </NotYet>
        ) : (
          <div className="iv-share-list">
            {tokens.map((token) => (
              <ShareRow
                key={token.id}
                token={token}
                onRevoke={(id) => revoke.mutate(id)}
                revoking={revoke.isPending}
              />
            ))}
          </div>
        )}
      </Panel>

      {tokens.length > 0 && (
        <StatRow>
          <Stat value={tokens.length} label="live links" />
          <Stat value={opened.length} label="opened" />
          <Stat value={totalOpens} label="total opens" />
        </StatRow>
      )}
    </Block>
  );
}
