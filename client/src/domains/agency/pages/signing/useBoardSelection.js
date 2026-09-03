/**
 * The board's selection is the desk's selection: one hook, lifted to
 * `hooks/useTalentSelection` when Submissions adopted the same language
 * (talent-card-metadata spec §9, defect 2). Kept here as the name the signing
 * surface already imports.
 */
export { useTalentSelection as useBoardSelection, default } from '../../hooks/useTalentSelection';
