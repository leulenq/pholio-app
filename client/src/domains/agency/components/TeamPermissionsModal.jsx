import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import {
  getTeamMemberPermissions,
  updateTeamMemberPermissions,
  revokeTeamMemberPermission,
} from '../api/agency';
import { PERMISSION_GROUPS, DANGEROUS_PERMISSION_KEYS } from '../lib/permission-groups';
import { formatRole } from './team-presence';
import { useAgencyPermissions } from '../hooks/useAgencyPermissions';

function permissionState(key, { presetPermissions = [], grants = [], effectivePermissions = [] }) {
  const preset = new Set(presetPermissions);
  const effective = new Set(effectivePermissions);
  const allowGrant = grants.find((g) => g.permission_key === key && g.effect === 'ALLOW');
  const denyGrant = grants.find((g) => g.permission_key === key && g.effect === 'DENY');
  const inPreset = preset.has(key);
  const isOn = effective.has(key);

  let chip = null;
  if (denyGrant) chip = 'Custom deny';
  else if (allowGrant && !inPreset) chip = 'Custom allow';
  else if (inPreset) chip = 'Inherited';

  return { isOn, inPreset, allowGrant, denyGrant, chip };
}

export default function TeamPermissionsModal({ open, member, onClose }) {
  const qc = useQueryClient();
  const { can } = useAgencyPermissions();
  const membershipId = member?.membershipId || member?.membership_id;
  const [pendingKey, setPendingKey] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agency', 'team', membershipId, 'permissions'],
    queryFn: () => getTeamMemberPermissions(membershipId),
    enabled: open && !!membershipId,
  });

  const presetRole = data?.presetRole || member?.membership_role;

  const visibleGroups = useMemo(() => {
    return PERMISSION_GROUPS.map((group) => ({
      ...group,
      permissions: group.permissions.filter((p) => can(p.key)),
    })).filter((g) => g.permissions.length > 0);
  }, [can]);

  const applyGrant = useMutation({
    mutationFn: ({ grants }) => updateTeamMemberPermissions(membershipId, grants),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agency', 'team', membershipId, 'permissions'] });
      refetch();
    },
    onError: (e) => toast.error(e?.message || 'Could not update permissions'),
    onSettled: () => setPendingKey(null),
  });

  const revokeGrant = useMutation({
    mutationFn: ({ permissionKey, effect }) =>
      revokeTeamMemberPermission(membershipId, permissionKey, effect),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agency', 'team', membershipId, 'permissions'] });
      refetch();
    },
    onError: (e) => toast.error(e?.message || 'Could not revoke permission'),
    onSettled: () => setPendingKey(null),
  });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const togglePermission = async (key, nextOn) => {
    if (!data) return;

    if (
      DANGEROUS_PERMISSION_KEYS.has(key) &&
      nextOn &&
      !window.confirm(`Grant "${key}"? This is a sensitive permission.`)
    ) {
      return;
    }

    setPendingKey(key);
    const state = permissionState(key, data);

    try {
      if (nextOn) {
        if (state.denyGrant) {
          await revokeGrant.mutateAsync({ permissionKey: key, effect: 'DENY' });
          if (!state.inPreset) {
            await applyGrant.mutateAsync({
              grants: [{ permission_key: key, effect: 'ALLOW' }],
            });
          }
        } else if (!state.inPreset) {
          await applyGrant.mutateAsync({
            grants: [{ permission_key: key, effect: 'ALLOW' }],
          });
        }
      } else if (state.allowGrant && !state.inPreset) {
        await revokeGrant.mutateAsync({ permissionKey: key, effect: 'ALLOW' });
      } else if (state.inPreset) {
        await applyGrant.mutateAsync({
          grants: [{ permission_key: key, effect: 'DENY' }],
        });
      }
    } catch {
      // toast handled in mutation
    }
  };

  const busy = applyGrant.isPending || revokeGrant.isPending;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="tm-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="tm-modal tm-perm-modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 230, damping: 24 }}
          >
            <div className="tm-modal-head">
              <div>
                <h2 className="tm-modal-title">{member?.full_name || 'Team member'}</h2>
                <p className="tm-perm-sub">
                  {formatRole(presetRole)} · Toggle overrides on top of the preset role
                </p>
              </div>
              <button type="button" className="tm-modal-close" onClick={onClose} aria-label="Close">
                <X size={17} />
              </button>
            </div>

            <div className="tm-perm-body">
              {isLoading && <p className="tm-perm-status">Loading permissions…</p>}
              {isError && <p className="tm-perm-status tm-perm-status--error">Could not load permissions.</p>}

              {!isLoading && !isError && visibleGroups.map((group) => (
                <section key={group.id} className="tm-perm-group">
                  <h3 className="tm-perm-group-title">{group.label}</h3>
                  <ul className="tm-perm-list">
                    {group.permissions.map((perm) => {
                      const state = permissionState(perm.key, data || {});
                      const roleLabel = formatRole(presetRole);
                      return (
                        <li key={perm.key} className="tm-perm-row">
                          <div className="tm-perm-meta">
                            <span className="tm-perm-label">{perm.label}</span>
                            {state.chip && (
                              <span
                                className={`tm-perm-chip tm-perm-chip--${
                                  state.chip === 'Custom deny'
                                    ? 'deny'
                                    : state.chip === 'Custom allow'
                                      ? 'allow'
                                      : 'inherit'
                                }`}
                              >
                                {state.chip === 'Inherited'
                                  ? `Inherited from ${roleLabel}`
                                  : state.chip}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={state.isOn}
                            className={`tm-perm-toggle${state.isOn ? ' tm-perm-toggle--on' : ''}`}
                            disabled={busy || pendingKey === perm.key}
                            onClick={() => togglePermission(perm.key, !state.isOn)}
                          >
                            <span className="tm-perm-toggle-knob" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <div className="tm-modal-actions">
              <button type="button" className="tm-modal-submit" onClick={onClose}>
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
