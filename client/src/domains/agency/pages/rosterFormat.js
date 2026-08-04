/**
 * Roster vocabulary helpers — stage labels and the stage/standing mapping
 * shared by the roster list and the roster detail drawer. Pure; no JSX.
 *
 * Measurement, height and freshness formatting used to live here too. They
 * now live in components/meta/metaFormat.js with everything else the
 * dashboard prints, because two of the helpers here had already been
 * re-implemented inline elsewhere (RosterPage rebuilt `heightLine` by hand,
 * DiscoverPage had its own cm→imperial with straight quotes and an off-by-one
 * at exact foot boundaries).
 */

export const STAGE_LABELS = Object.freeze({
  main: 'Main',
  development: 'Development',
  new_face: 'New Face',
});

export function normalizeStatusKey(value) {
  return String(value || 'unknown').trim().toLowerCase().replaceAll(' ', '_');
}

// Builds form-field values from a talent_records row's stored `measurements`
// JSON so the edit form can prefill without the caller knowing the shape.
export function measurementsToFormFields(measurements) {
  const m = measurements || {};
  return {
    bustCm: m.bust_cm ?? '',
    chestCm: m.chest_cm ?? '',
    waistCm: m.waist_cm ?? '',
    hipsCm: m.hips_cm ?? '',
    inseamCm: m.inseam_cm ?? '',
    shoeSize: m.shoe_size ?? '',
  };
}

/* ============================================================
   Roster stage <-> division vocabulary

   A membership's ladder stage (new_face / development / main) is itself a
   board in the division taxonomy, so it renders through the same mark as
   the talent's boards rather than as a separate label vocabulary. Shared
   between the roster table and the detail drawer so the two cannot drift.
   ============================================================ */

export const STAGE_DIVISION = {
  main: 'mainboard',
  development: 'development',
  new_face: 'newfaces',
};

/**
 * Mirrors deriveStanding() in the roster_board_standings migration, so the
 * UI and the backfill agree on what a stage plus status means.
 *
 * `status` is the MEMBERSHIP status ('active' | 'inactive' | 'left' | 'ended').
 * It is NOT `item.availability`, which is a humanised display string
 * ("Available", "On booking"): passing that made an inactive talent fall
 * through every branch and render as Represented.
 */
export function standingForStage(stage, membershipStatus) {
  if (membershipStatus === 'left' || membershipStatus === 'ended') return 'ended';
  if (membershipStatus === 'inactive') return 'inactive';
  if (stage === 'new_face' || stage === 'development') return 'developing';
  if (stage === 'main') return 'represented';
  return 'unknown';
}

/** Normalise a roster row's boards into the shape DivisionSet expects. */
export function rowBoardStandings(item) {
  if (Array.isArray(item?.boards) && item.boards.length > 0) {
    return item.boards
      .map((b) => ({
        division: typeof b === 'string' ? b : b?.board?.name || b?.name,
        standing: typeof b === 'string' ? undefined : b?.standing,
      }))
      .filter((b) => b.division);
  }
  if (item?.board?.name) {
    return [
      {
        division: item.board.name,
        standing: standingForStage(item.stage, item.membershipStatus),
      },
    ];
  }
  return [];
}
