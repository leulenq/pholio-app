const express = require("express");
const knex = require("../../../shared/db/knex");
const { z } = require("zod");
const { v4: uuidv4 } = require("uuid");
const { requireRole } = require("../../auth/middleware/require-auth");
const {
  getSessionActorUserId,
  getSessionAgencyId,
} = require("../services/context");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const { recordAuditEvent } = require("../services/audit");
const {
  loadMembershipGrants,
  resolveEffectivePermissionsForMembership,
  assertCanGrant,
  assertCanAssignRole,
} = require("../services/permissions");
const {
  PRESET_ROLES,
  ALL_PERMISSIONS,
  normalizePresetRole,
  permissionsToArray,
  getPresetPermissions,
  computeEffectivePermissions,
} = require("../lib/permissions");

const router = express.Router();
mountAgencyApiGuard(router);

const grantSchema = z.object({
  permission_key: z.string().min(1).max(80),
  effect: z.enum(["ALLOW", "DENY"]),
  reason: z.string().max(500).optional(),
  expires_at: z.string().datetime().optional().nullable(),
});

const bulkGrantsSchema = z.object({
  grants: z.array(grantSchema).min(1).max(50),
});

function getActorContext(req) {
  return {
    agencyId: getSessionAgencyId(req),
    actorUserId: getSessionActorUserId(req),
    actorMembershipId: req.session.agencyMembershipId || null,
    actorRole: normalizePresetRole(req.session.agencyMembershipRole),
  };
}

async function loadTargetMembership(agencyId, membershipId) {
  return knex("agency_memberships")
    .where({ id: membershipId, agency_id: agencyId })
    .first();
}

// GET /api/agency/team/:membershipId/permissions
router.get(
  "/api/agency/team/:membershipId/permissions",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const { agencyId } = getActorContext(req);
      const { membershipId } = req.params;

      const membership = await loadTargetMembership(agencyId, membershipId);
      if (!membership) {
        return res.status(404).json({ error: "Team member not found" });
      }

      const presetRole = normalizePresetRole(membership.membership_role);
      const grants = await loadMembershipGrants(membershipId);
      const effective = computeEffectivePermissions(presetRole, grants);
      const preset = getPresetPermissions(presetRole);

      return res.json({
        success: true,
        data: {
          membershipId,
          presetRole,
          presetPermissions: permissionsToArray(preset),
          grants: grants.map((g) => ({
            permission_key: g.permission_key,
            effect: g.effect,
            reason: g.reason,
            expires_at: g.expires_at,
          })),
          effectivePermissions: permissionsToArray(effective),
        },
      });
    } catch (error) {
      console.error("[Team RBAC] Error loading permissions:", error);
      return res.status(500).json({ error: "Failed to load permissions" });
    }
  },
);

// PUT /api/agency/team/:membershipId/permissions
router.put(
  "/api/agency/team/:membershipId/permissions",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const { agencyId, actorUserId, actorMembershipId, actorRole } =
        getActorContext(req);
      const { membershipId } = req.params;
      const parsed = bulkGrantsSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid permission payload",
          details: parsed.error.flatten(),
        });
      }

      if (membershipId === actorMembershipId) {
        return res.status(403).json({
          error: "You cannot modify your own permissions",
        });
      }

      const membership = await loadTargetMembership(agencyId, membershipId);
      if (!membership) {
        return res.status(404).json({ error: "Team member not found" });
      }

      if (normalizePresetRole(membership.membership_role) === "OWNER") {
        return res.status(403).json({
          error: "Owner permissions cannot be customized",
        });
      }

      const beforeGrants = await loadMembershipGrants(membershipId);

      for (const grant of parsed.data.grants) {
        if (!ALL_PERMISSIONS.includes(grant.permission_key)) {
          return res.status(400).json({
            error: `Unknown permission: ${grant.permission_key}`,
          });
        }

        const allowed = await assertCanGrant(
          actorMembershipId,
          actorRole,
          grant.permission_key,
        );
        if (!allowed) {
          return res.status(403).json({
            error: "You cannot grant a permission you do not hold",
            permission_key: grant.permission_key,
          });
        }

        const teamAdminKeys = [
          "team.assign_role",
          "team.grant_permission",
          "team.revoke_permission",
          "org.transfer_ownership",
        ];
        if (
          actorRole === "ADMIN" &&
          teamAdminKeys.includes(grant.permission_key) &&
          grant.effect === "ALLOW"
        ) {
          return res.status(403).json({
            error: "Only the Principal can grant administrative permissions",
            permission_key: grant.permission_key,
          });
        }

        const existing = await knex("agency_membership_permissions")
          .where({
            membership_id: membershipId,
            permission_key: grant.permission_key,
            effect: grant.effect,
          })
          .first();

        if (existing) {
          await knex("agency_membership_permissions")
            .where({ id: existing.id })
            .update({
              reason: grant.reason || null,
              granted_by_membership_id: actorMembershipId,
              expires_at: grant.expires_at || null,
            });
        } else {
          await knex("agency_membership_permissions").insert({
            id: uuidv4(),
            agency_id: agencyId,
            membership_id: membershipId,
            permission_key: grant.permission_key,
            effect: grant.effect,
            reason: grant.reason || null,
            granted_by_membership_id: actorMembershipId,
            expires_at: grant.expires_at || null,
            created_at: knex.fn.now(),
          });
        }
      }

      const afterGrants = await loadMembershipGrants(membershipId);

      await recordAuditEvent({
        agencyId,
        actorMembershipId,
        actorUserId,
        eventType: "team.permission_granted",
        targetType: "membership",
        targetId: membershipId,
        summary: `Custom permissions updated for team member`,
        beforeState: { grants: beforeGrants },
        afterState: { grants: afterGrants },
        req,
      });

      const presetRole = normalizePresetRole(membership.membership_role);
      const effective = computeEffectivePermissions(presetRole, afterGrants);

      return res.json({
        success: true,
        data: {
          membershipId,
          presetRole,
          grants: afterGrants,
          effectivePermissions: permissionsToArray(effective),
        },
      });
    } catch (error) {
      console.error("[Team RBAC] Error updating permissions:", error);
      return res.status(500).json({ error: "Failed to update permissions" });
    }
  },
);

// DELETE /api/agency/team/:membershipId/permissions/:permissionKey
router.delete(
  "/api/agency/team/:membershipId/permissions/:permissionKey",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const { agencyId, actorUserId, actorMembershipId } = getActorContext(req);
      const { membershipId, permissionKey } = req.params;
      const effect = (req.query.effect || "ALLOW").toUpperCase();

      if (!["ALLOW", "DENY"].includes(effect)) {
        return res.status(400).json({ error: "Invalid effect query param" });
      }

      const membership = await loadTargetMembership(agencyId, membershipId);
      if (!membership) {
        return res.status(404).json({ error: "Team member not found" });
      }

      const beforeGrants = await loadMembershipGrants(membershipId);

      const deleted = await knex("agency_membership_permissions")
        .where({
          membership_id: membershipId,
          permission_key: permissionKey,
          effect,
        })
        .del();

      if (!deleted) {
        return res.status(404).json({ error: "Permission grant not found" });
      }

      const afterGrants = await loadMembershipGrants(membershipId);

      await recordAuditEvent({
        agencyId,
        actorMembershipId,
        actorUserId,
        eventType: "team.permission_revoked",
        targetType: "membership",
        targetId: membershipId,
        summary: `Removed ${effect} grant for ${permissionKey}`,
        beforeState: { grants: beforeGrants },
        afterState: { grants: afterGrants },
        req,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("[Team RBAC] Error revoking permission:", error);
      return res.status(500).json({ error: "Failed to revoke permission" });
    }
  },
);

// GET /api/agency/audit
router.get("/api/agency/audit", requireRole("AGENCY"), async (req, res) => {
  try {
    const agencyId = getSessionAgencyId(req);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const eventType = req.query.event_type || null;

    let query = knex("agency_audit_events")
      .where({ agency_id: agencyId })
      .orderBy("created_at", "desc")
      .limit(limit);

    if (eventType) {
      query = query.where({ event_type: eventType });
    }

    const rows = await query.select(
      "id",
      "event_type",
      "target_type",
      "target_id",
      "summary",
      "before_state",
      "after_state",
      "actor_user_id",
      "actor_membership_id",
      "created_at",
    );

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("[Agency Audit API] Error:", error);
    return res.status(500).json({ error: "Failed to load audit log" });
  }
});

module.exports = router;
