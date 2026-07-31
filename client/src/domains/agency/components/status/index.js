/**
 * Status system — one vocabulary for every status the agency roster speaks.
 *
 *   Division → DivisionMark / DivisionSet  (which board, and the standing on it)
 *   Type     → TypeSpec                    (a market descriptor; lightest form)
 *   Stage    → StageTrack / StageMark      (an ordinal ladder; shows progress)
 *   State    → AvailabilityCell            (live availability; pure colour)
 *
 * See divisions.js / division-marks.css for the division system, and
 * statusConfig.js / status-system.css for the other three classes.
 */
export { DivisionMark } from './DivisionMark';
export { DivisionSet } from './DivisionSet';
export { TypeSpec } from './TypeSpec';
export { AvailabilityCell } from './AvailabilityCell';
export { StageTrack, StageMark, StageLadder } from './StageProgress';

/** @deprecated use DivisionMark */
export { BoardPlate } from './BoardPlate';

export * from './divisions';
export * from './statusConfig';
