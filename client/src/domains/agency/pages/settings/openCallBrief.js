/*
 * Brief shape helpers, kept out of the component file so fast refresh keeps
 * working (a module exporting both a component and constants loses it).
 */

export const EMPTY_BRIEF = Object.freeze({
  who: '',
  what: '',
  eligibility: '',
  nextSteps: '',
  deadline: '',
  ongoing: false,
});

/** The editable brief for an existing link, or an empty one if it has none. */
export function briefFromLink(link) {
  if (!link?.brief) return { ...EMPTY_BRIEF };
  return {
    who: link.brief.who || '',
    what: link.brief.what || '',
    eligibility: link.brief.eligibility || '',
    nextSteps: link.brief.nextSteps || '',
    deadline: link.brief.deadline || '',
    ongoing: Boolean(link.brief.ongoing),
  };
}
