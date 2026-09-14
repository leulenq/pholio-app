const knex = require('/Users/lenquanhone/Projects/pholio-app/src/shared/db/knex');
const sharp = require('/Users/lenquanhone/Projects/pholio-app/node_modules/sharp');
const fs = require('fs'); const S = '/Users/lenquanhone/Projects/pholio-app/scratchpad/pitch-deck/ui-stack';
const { buildSubmissionProfileSnapshot } = require('/Users/lenquanhone/Projects/pholio-app/src/shared/lib/submission-profile');
const people = JSON.parse(fs.readFileSync(S + '/people.json', 'utf8'));
const map = { headshot: 'headshot', full_length: 'full', profile: 'profile' };
(async () => {
  if (!String(knex.client.config.connection.filename || '').includes('ui-stack')) throw new Error('not scratch');
  for (const p of people) {
    const ident = await knex('applicant_identities').where({ email_normalized: `${p.first}.${p.last}@example.com`.toLowerCase() }).first();
    const app = await knex('applications').where({ applicant_identity_id: ident.id, agency_id: '1a81502a-9ab8-42d5-bd65-94dfe2e05de4' }).first();
    const pkg = await knex('talent_submission_packages').where({ application_id: app.id }).first();
    const payload = JSON.parse(pkg.payload);
    for (const img of payload.images) { if (!map[img.shot_type]) continue;
      const src = `${S}/photos/${p.slug}/${map[img.shot_type]}.jpg`;
      await sharp(src).resize(1200, 1500, { fit: 'inside' }).webp({ quality: 88 }).toFile(S + img.path.replace('/uploads', '/uploads/tmp.webp').replace(/\/uploads\/tmp\.webp.*/, '/uploads/tmp.webp'));
      fs.renameSync(S + '/uploads/tmp.webp', S + img.path);
    }
    if (app.profile_id) {
      const prof = await knex('profiles').where({ id: app.profile_id }).first();
      const live = await knex('images').where({ profile_id: app.profile_id }).orderBy('sort');
      const tq = live.find((i) => i.shot_type === 'three_quarter');
      if (tq && !payload.images.find((i) => i.shot_type === 'three_quarter')) payload.images.push({ id: tq.id, path: tq.path, public_url: tq.public_url, alt: '', image_type: 'digital', shot_type: 'three_quarter', sort: 4, is_primary: false });
      payload.profile = buildSubmissionProfileSnapshot({ ...prof, email: `${p.first}.${p.last}@example.com`.toLowerCase() }, { minor: false, social: [{ platform: 'instagram', handle: p.ig, url: `https://instagram.com/${p.ig}` }] });
      payload.contact = { email: `${p.first}.${p.last}@example.com`.toLowerCase(), phone: prof.phone || payload.identity?.phone || null };
      await knex('talent_submission_packages').where({ id: pkg.id }).update({ payload: JSON.stringify(payload) });
    }
    console.log(p.slug, payload.images.length, !!payload.profile);
  }
  await knex.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
