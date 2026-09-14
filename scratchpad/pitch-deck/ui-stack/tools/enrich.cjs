const knex = require('/Users/lenquanhone/Projects/pholio-app/src/shared/db/knex');
const sharp = require('/Users/lenquanhone/Projects/pholio-app/node_modules/sharp');
const { randomUUID } = require('crypto'); const fs = require('fs');
const S = '/Users/lenquanhone/Projects/pholio-app/scratchpad/pitch-deck/ui-stack';
const people = JSON.parse(fs.readFileSync(S + '/people.json', 'utf8'));
const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const inch = (s) => s.split('-').map((x) => Math.round(Number(x) * 2.54));
// hours ago each applicant submitted (spread over a week)
const ago = { 'sasha-novak': 5, 'amara-okafor': 20, 'leila-haddad': 30, 'mei-zhao': 3, 'clara-whitfield': 50, 'hazel-moreau': 70, 'rosa-delgado': 96, 'ivy-brennan': 120, 'hana-sato': 9, 'jonah-reyes': 26, 'finn-callahan': 44, 'mateo-ruiz': 140, 'kwame-asante': 14, 'daniel-weiss': 2 };
(async () => {
  if (!String(knex.client.config.connection.filename || '').includes('ui-stack')) throw new Error('not scratch');
  fs.mkdirSync(S + '/uploads/deck', { recursive: true });
  for (const p of people) {
    const email = `${p.first}.${p.last}@example.com`.toLowerCase();
    const ident = await knex('applicant_identities').where({ email_normalized: email }).first();
    const app = await knex('applications').where({ applicant_identity_id: ident.id }).first();
    const h = ago[p.slug];
    await knex('applications').where({ id: app.id }).update({ created_at: iso(h), updated_at: iso(h), status_changed_at: iso(h) });
    const pkg = await knex('talent_submission_packages').where({ application_id: app.id }).first();
    const payload = JSON.parse(pkg.payload); payload.submittedAt = iso(h);
    await knex('talent_submission_packages').where({ id: pkg.id }).update({ created_at: iso(h), payload: JSON.stringify(payload) });
    await knex('open_call_submissions').where({ applicant_identity_id: ident.id }).whereNotNull('submitted_at').update({ submitted_at: iso(h) }).catch(() => {});
    if (!app.profile_id) { console.log(p.slug, 'unclaimed'); continue; }
    const [b, w, hp] = inch(p.meas);
    const male = p.gender === 'Male';
    await knex('profiles').where({ id: app.profile_id }).update({ bust_cm: male ? null : b, chest_cm: male ? b : null, waist_cm: w, hips_cm: hp, measurements_updated_at: iso(h + 24), measurements_source: 'self_reported', shoe_size: male ? '11 US' : '8.5 US', hair_color: null, eye_color: null });
    await knex('images').where({ profile_id: app.profile_id }).update({ captured_at: iso(h + 30) });
    const has3q = await knex('images').where({ profile_id: app.profile_id, shot_type: 'three_quarter' }).first();
    if (!has3q) {
      const file = `deck/${p.slug}-three-quarter.jpg`;
      const src = `${S}/photos/${p.slug}/full.jpg`; const m = await sharp(src).metadata();
      await sharp(src).extract({ left: 0, top: 0, width: m.width, height: Math.round(m.height * 0.8) }).resize(900, 1125, { fit: 'cover', position: 'north' }).jpeg({ quality: 88 }).toFile(`${S}/uploads/${file}`);
      await knex('images').insert({ id: randomUUID(), profile_id: app.profile_id, path: '/uploads/' + file, public_url: '/uploads/' + file, image_type: 'digital', shot_type: 'three_quarter', style_type: 'digitals', status: 'active', sort: 4, captured_at: iso(h + 30), created_at: iso(h) });
    }
    console.log(p.slug, 'ok', app.id);
  }
  await knex.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
