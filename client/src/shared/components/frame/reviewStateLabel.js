import { REVIEW_STRIP_LABELS } from '../../constants/frameTaxonomy';

export function reviewStateLabel(state, hasSignals) {
  if (state.status === 'pending') return REVIEW_STRIP_LABELS.pending;
  if (hasSignals) return REVIEW_STRIP_LABELS.proposed;
  return REVIEW_STRIP_LABELS.needs;
}
