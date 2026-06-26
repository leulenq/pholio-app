import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

const REASONS = [
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'explicit_content', label: 'Explicit or adult content' },
  { value: 'fake_agency_scam', label: 'Fake agency or scam' },
  { value: 'copyright', label: 'Copyright infringement' },
  { value: 'other', label: 'Other' },
];

async function submitReport({ targetType, targetId, reason, details }) {
  const res = await fetch('/api/reports', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_type: targetType, target_id: targetId, reason, details }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to submit report');
  return data;
}

const TARGET_TYPES = [
  { value: 'profile', label: 'Profile' },
  { value: 'image', label: 'Image' },
  { value: 'message', label: 'Message' },
  { value: 'agency', label: 'Agency' },
  { value: 'user', label: 'User' },
];

/**
 * ReportDialog — modal for submitting a platform report.
 *
 * Props:
 *   open        {boolean}  — controls visibility
 *   onClose     {function} — called when the dialog should close
 *   targetType  {string}   — one of: profile|image|message|agency|user
 *                            If omitted, user selects it in the form.
 *   targetId    {string}   — the ID of the entity being reported.
 *                            If omitted, user enters it in the form.
 *   targetLabel {string}   — optional human-readable name shown in the heading
 */
export default function ReportDialog({ open, onClose, targetType: targetTypeProp, targetId: targetIdProp, targetLabel }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [targetType, setTargetType] = useState(targetTypeProp || '');
  const [targetId, setTargetId] = useState(targetIdProp || '');
  const [pending, setPending] = useState(false);
  const backdropRef = useRef(null);
  const selectRef = useRef(null);

  // Reset form state when dialog opens
  useEffect(() => {
    if (open) {
      setReason('');
      setDetails('');
      setTargetType(targetTypeProp || '');
      setTargetId(targetIdProp || '');
      // Focus the reason select on open for accessibility
      const id = requestAnimationFrame(() => selectRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open, targetTypeProp, targetIdProp]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason || !targetType || !targetId.trim()) return;
    setPending(true);
    try {
      await submitReport({ targetType, targetId: targetId.trim(), reason, details: details.trim() });
      toast.success('Report submitted. Thank you for helping keep Pholio safe.');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not submit report. Please try again.');
    } finally {
      setPending(false);
    }
  }

  function handleBackdropClick(e) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(26, 24, 21, 0.48)',
      }}
    >
      <div
        style={{
          background: 'var(--ag-surface-1, #fff)',
          borderRadius: '16px',
          boxShadow: '0 8px 40px rgba(26,24,21,0.18)',
          width: '100%',
          maxWidth: '440px',
          padding: '32px',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close report dialog"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ag-text-2, #6b6560)',
            padding: '4px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ag-text-0, #1a1815)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ag-text-2, #6b6560)')}
        >
          <X size={18} />
        </button>

        <h2
          id="report-dialog-title"
          style={{
            fontFamily: "'Noto Serif Display', Georgia, serif",
            fontWeight: 300,
            fontSize: '1.375rem',
            letterSpacing: '-0.02em',
            color: 'var(--ag-text-0, #1a1815)',
            marginBottom: '6px',
          }}
        >
          Submit a report
        </h2>

        {targetLabel && (
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--ag-text-2, #6b6560)',
              marginBottom: '24px',
            }}
          >
            Reporting: <span style={{ fontWeight: 500 }}>{targetLabel}</span>
          </p>
        )}

        {!targetLabel && <div style={{ marginBottom: '24px' }} />}

        <form onSubmit={handleSubmit} noValidate>
          {/* Target type — only shown when not pre-filled */}
          {!targetTypeProp && (
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="report-target-type"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--ag-text-1, #2d2a26)',
                  marginBottom: '6px',
                }}
              >
                What are you reporting?
              </label>
              <select
                id="report-target-type"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--ag-border, rgba(26,24,21,0.12))',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  color: targetType ? 'var(--ag-text-0, #1a1815)' : 'var(--ag-text-2, #6b6560)',
                  background: 'var(--ag-surface-0, #faf8f5)',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6560' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--ag-gold, #c9a55a)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--ag-border, rgba(26,24,21,0.12))')}
              >
                <option value="" disabled>Select type…</option>
                {TARGET_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Target ID — only shown when not pre-filled */}
          {!targetIdProp && (
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="report-target-id"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--ag-text-1, #2d2a26)',
                  marginBottom: '6px',
                }}
              >
                ID or URL of the item being reported
              </label>
              <input
                id="report-target-id"
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="e.g. profile slug, agency name, or URL…"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--ag-border, rgba(26,24,21,0.12))',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  color: 'var(--ag-text-0, #1a1815)',
                  background: 'var(--ag-surface-0, #faf8f5)',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s ease',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--ag-gold, #c9a55a)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--ag-border, rgba(26,24,21,0.12))')}
              />
            </div>
          )}

          {/* Reason select */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="report-reason"
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: 'var(--ag-text-1, #2d2a26)',
                marginBottom: '6px',
              }}
            >
              Reason
            </label>
            <select
              id="report-reason"
              ref={selectRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--ag-border, rgba(26,24,21,0.12))',
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: reason ? 'var(--ag-text-0, #1a1815)' : 'var(--ag-text-2, #6b6560)',
                background: 'var(--ag-surface-0, #faf8f5)',
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6560' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                cursor: 'pointer',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--ag-gold, #c9a55a)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--ag-border, rgba(26,24,21,0.12))')}
            >
              <option value="" disabled>
                Select a reason…
              </option>
              {REASONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Details textarea */}
          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="report-details"
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: 'var(--ag-text-1, #2d2a26)',
                marginBottom: '6px',
              }}
            >
              Additional details{' '}
              <span style={{ color: 'var(--ag-text-2, #6b6560)', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe the issue…"
              maxLength={1000}
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--ag-border, rgba(26,24,21,0.12))',
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: 'var(--ag-text-0, #1a1815)',
                background: 'var(--ag-surface-0, #faf8f5)',
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                transition: 'border-color 0.15s ease',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--ag-gold, #c9a55a)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--ag-border, rgba(26,24,21,0.12))')}
            />
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--ag-text-2, #6b6560)',
                textAlign: 'right',
                marginTop: '4px',
              }}
            >
              {details.length}/1000
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid var(--ag-border, rgba(26,24,21,0.12))',
                background: 'transparent',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--ag-text-1, #2d2a26)',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ag-surface-0, #faf8f5)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!reason || !targetType || !targetId.trim() || pending}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                background: (reason && targetType && targetId.trim() && !pending) ? 'var(--ag-gold, #c9a55a)' : 'var(--ag-border, rgba(26,24,21,0.12))',
                color: (reason && targetType && targetId.trim() && !pending) ? '#fff' : 'var(--ag-text-2, #6b6560)',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: (reason && targetType && targetId.trim() && !pending) ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {pending ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
