const knex = require('/Users/lenquanhone/Projects/pholio-app/src/shared/db/knex');
const { buildSubmissionProfileSnapshot } = require('/Users/lenquanhone/Projects/pholio-app/src/shared/lib/submission-profile');
(async () => {
  if (!String(knex.client.config.connection.filename || '').includes('ui-stack')) throw new Error('not scratch');
  const rows = await knex('talent_submission_packages').whereNotNull('applicant_identity_id').whereNotNull('profile_id');
  let n = 0;
  for (const r of rows) {
    const p = JSON.parse(r.payload); const prof = await knex('profiles').where({ id: r.profile_id }).first();
    const ig = p.identity?.instagram?.replace('@', '');
    p.profile = buildSubmissionProfileSnapshot(prof, { minor: false, social: ig ? [{ platform: 'instagram', handle: ig, url: `https://instagram.com/${ig}` }] : [] });
    p.contact = { email: p.identity?.email, phone: prof.phone };
    await knex('talent_submission_packages').where({ id: r.id }).update({ payload: JSON.stringify(p) }); n++;
  }
  console.log('snap', n); await knex.destroy();
})();
