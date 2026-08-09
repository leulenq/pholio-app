import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail, Phone, Plus, X } from 'lucide-react';
import { addTag, removeTag } from '../../api/agency';
import { StageTrack } from '../status/StageProgress';
import { useAgencyPermissions } from '../../hooks/useAgencyPermissions';
import { Fact, Ledger, Sheet } from './DossierPrimitives';
import { fmtAgo, fmtDate, activityVerb } from './dossierModel';
import './dossier.css';

/**
 * The Standing Rail — everything about this submission's life inside THIS
 * agency: where it sits on the ladder, how long it has been sitting, which
 * board it was filed to, how it is tagged, and how to reach the person.
 *
 * The ladder is dated on purpose. "In review" is not information; "in review
 * for eleven days, last opened a week ago" is the thing that makes a booker
 * act.
 */

function TagStrip({ applicationId, tags }) {
  const qc = useQueryClient();
  const { canAny } = useAgencyPermissions();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['talent-dossier', applicationId] });

  const add = useMutation({
    mutationFn: (tag) => addTag(applicationId, tag),
    onSuccess: () => { invalidate(); setDraft(''); setAdding(false); },
    onError: (e) => toast.error(e?.message || 'Could not add that tag'),
  });
  const drop = useMutation({
    mutationFn: (tagId) => removeTag(applicationId, tagId),
    onSuccess: invalidate,
    onError: (e) => toast.error(e?.message || 'Could not remove that tag'),
  });

  const editable = canAny(['tags.add', 'tags.remove']);

  return (
    <div className="dx-tags">
      {tags.length === 0 && !adding && <span className="dx-quiet">No tags yet</span>}
      {tags.map((tag) => (
        <span className="dx-tag" key={tag.id}>
          {tag.tag || tag.name}
          {editable && (
            <button
              type="button"
              className="dx-tag__x"
              aria-label={`Remove tag ${tag.tag || tag.name}`}
              onClick={() => drop.mutate(tag.id)}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {editable && (adding ? (
        <input
          className="dx-tag__input"
          autoFocus
          value={draft}
          placeholder="Tag…"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (!draft.trim()) setAdding(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) add.mutate(draft.trim());
            if (e.key === 'Escape') { setDraft(''); setAdding(false); }
          }}
        />
      ) : (
        <button type="button" className="dx-tag dx-tag--add" onClick={() => setAdding(true)}>
          <Plus size={11} /> Tag
        </button>
      ))}
    </div>
  );
}

export function StandingRail({ dossier, applicationId }) {
  const { application, standing, compliance, contact } = dossier;

  const ladder = [
    { label: 'Submitted', at: standing?.submitted_at },
    { label: 'First opened', at: standing?.viewed_at },
    { label: 'Last action', at: standing?.last_action_at, note: standing?.last_action_type
      ? activityVerb(standing.last_action_type).toLowerCase() : null },
    application?.accepted_at ? { label: 'Signed', at: application.accepted_at } : null,
    application?.declined_at ? { label: 'Passed', at: application.declined_at } : null,
  ].filter(Boolean);

  return (
    <aside className="dx-rail">
      <Sheet id="dx-standing" title="Standing" tone="rail">
        <StageTrack status={application?.status} />
        <p className="dx-rail__age">
          {standing?.days_since_submitted != null
            ? standing.days_since_submitted === 0
              ? 'Arrived today'
              : `Day ${standing.days_since_submitted} with us`
            : 'Submission date unknown'}
          {standing?.days_since_last_action != null && standing.days_since_last_action > 6 && (
            <span className="dx-rail__stall">
              nothing has moved in {standing.days_since_last_action} days
            </span>
          )}
        </p>
        <Ledger>
          {ladder.map((step) => (
            <Fact
              key={step.label}
              label={step.label}
              value={step.at ? fmtDate(step.at) : 'Not yet'}
              note={step.at ? ` ${fmtAgo(step.at)}` : null}
            />
          ))}
          <Fact label="Filed to" value={standing?.board?.name} />
          <Fact label="Route" value={standing?.invited ? 'We invited them' : 'They came to us'} />
          <Fact
            label="Notes"
            value={standing?.notes?.length ? `${standing.notes.length} on file` : null}
          />
        </Ledger>
        <TagStrip applicationId={applicationId} tags={standing?.tags || []} />
      </Sheet>

      {compliance?.is_minor && (
        <Sheet title="Under 18" tone="rail">
          <p className="dx-minor">
            This talent is a minor. Measurements, body frames, and direct contact are
            restricted, and a guardian must authorise anything beyond review.
          </p>
          <Ledger>
            <Fact
              label="Guardian consent"
              value={compliance.guardian_consent_at ? fmtDate(compliance.guardian_consent_at) : 'Not on file'}
              tone={compliance.guardian_consent_at ? undefined : 'warn'}
            />
            <Fact label="Work permit" value="Required before any booking" />
          </Ledger>
        </Sheet>
      )}

      {contact && (contact.email || contact.phone) && (
        <Sheet title="Contact" tone="rail">
          <div className="dx-contact">
            {contact.email && (
              <a className="dx-link" href={`mailto:${contact.email}`}>
                <Mail size={13} aria-hidden /> {contact.email}
              </a>
            )}
            {contact.phone && (
              <a className="dx-link" href={`tel:${contact.phone}`}>
                <Phone size={13} aria-hidden /> {contact.phone}
              </a>
            )}
          </div>
          <p className="dx-contact__note">Contact was shared with this submission.</p>
        </Sheet>
      )}
    </aside>
  );
}

export default StandingRail;
