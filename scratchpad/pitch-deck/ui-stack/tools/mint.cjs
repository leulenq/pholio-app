const knex = require('/Users/lenquanhone/Projects/pholio-app/src/shared/db/knex');
const { mintClaimToken } = require('/Users/lenquanhone/Projects/pholio-app/src/domains/opencall/services/claim-tokens');
(async () => {
  if (!String(knex.client.config.connection.filename || '').includes('ui-stack')) throw new Error('not scratch');
  const ids = await knex('applicant_identities').select('id', 'email_normalized');
  const out = {};
  for (const i of ids) out[i.email_normalized] = (await mintClaimToken(knex, { identityId: i.id, purpose: process.argv[2] || 'claim' })).rawToken;
  console.log(JSON.stringify(out, null, 1));
  await knex.destroy();
})().catch(e => { console.error(e); process.exit(1); });
