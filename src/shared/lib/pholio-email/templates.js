/**
 * Pholio Email — template barrel.
 *
 * Talent templates use the cream dashboard vocabulary (templates-talent,
 * templates-submissions, templates-guardian). Agency templates remain on the
 * older dark composition (templates-agency) because that surface was out of
 * scope for the talent redesign. The two do not share primitives on purpose.
 */
module.exports = {
  ...require("./templates-talent"),
  ...require("./templates-submissions"),
  ...require("./templates-guardian"),
  ...require("./templates-agency"),
};
