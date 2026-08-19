/**
 * Agency metadata system — every small value the dashboard prints about a
 * person, a board, or a record.
 *
 * Three tiers, chosen by what KIND of thing the value is:
 *
 *   MARK      a bounded entity you hold standing in → DivisionMark
 *             (../status — boards only; it is the one tier with a container)
 *   FIGURE    a measured value → Figure, FigureGroup
 *   NOTATION  quiet context → Place, Moment, Freshness, Notation, FieldKey
 *
 * MetaLine joins any of them into the canonical secondary line.
 *
 * Formatting lives in metaFormat.js and returns structure rather than
 * finished strings, so a caller cannot quietly re-join a value its own way —
 * which is how five different `timeAgo` implementations happened.
 */
export { Figure, FigureGroup } from './Figure';
export { Place } from './Place';
export { Moment, Freshness } from './Moment';
export { Notation, FieldKey } from './Notation';
export { MetaLine } from './MetaLine';

export {
  placeParts,
  cityOf,
  recency,
  calendarDate,
  clockTime,
  cmToImperial,
  heightFigure,
  measurementFigure,
  ageFigure,
  freshness,
  countLabel,
} from './metaFormat';
