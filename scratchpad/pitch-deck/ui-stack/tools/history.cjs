const knex = require('/Users/lenquanhone/Projects/pholio-app/src/shared/db/knex');
const sharp = require('/Users/lenquanhone/Projects/pholio-app/node_modules/sharp');
const { randomUUID } = require('crypto'); const fs = require('fs');
const { buildSubmissionProfileSnapshot } = require('/Users/lenquanhone/Projects/pholio-app/src/shared/lib/submission-profile');
const S = '/Users/lenquanhone/Projects/pholio-app/scratchpad/pitch-deck/ui-stack';
const AID = '1a81502a-9ab8-42d5-bd65-94dfe2e05de4';
const iso = (d) => new Date(Date.now() - d * 864e5).toISOString();
const rep = [
  ['Noa', 'Lindqvist', '1464863979621-258859e62245', 'Female', '2003-02-14', 'New York, NY', 178, [81, 60, 88], 120],
  ['Celeste', 'Barrow', '1503185912284-5271ff81b9a8', 'Female', '2002-07-01', 'Brooklyn, NY', 176, [80, 61, 89], 95],
  ['June', 'Adeyemi', '1506863530036-1efeddceb993', 'Female', '2001-10-22', 'New York, NY', 179, [82, 61, 89], 210],
  ['Theo', 'Marchetti', '1513379733131-47fc74b45fc7', 'Male', '2000-05-09', 'New York, NY', 188, [97, 76, 94], 160],
  ['Lucia', 'Ferrand', '1541101767792-f9b2b1c4f127', 'Female', '2004-01-30', 'Hoboken, NJ', 175, [81, 60, 87], 60],
  ['Maya', 'Chen-Ruiz', '1548142813-c348350df52b', 'Female', '2003-12-12', 'Queens, NY', 174, [80, 60, 88], 40],
];
const passFirst = ['Olivia','Ava','Grace','Chloe','Lily','Zoe','Nora','Ella','Aria','Ruby','Eva','Isla','Owen','Ethan','Lucas','Mason','Leo','Caleb','Max','Eli','Sofia','Emma','Ivy','Luna','Mila','Sadie','Wren','Tessa'];
const passLast = ['Parker','Hughes','Bennett','Foster','Hayes','Price','Reed','Cole','Ward','Brooks','Gray','James','Kim','Patel','Nguyen','Morgan','Ellis','Grant','Shaw','Lane','Silva','Stone','Wells','Fox','Hart','Rhodes','Vale','Quinn'];
async function mkTalent(first, last, gender, dob, city, h, m, photo, daysAgo, status) {
  const uid = randomUUID(), pid = randomUUID(), aid = randomUUID();
  const email = `${first}.${last}@example.com`.toLowerCase().replace(/[^a-z.@-]/g, '');
  await knex('users').insert({ id: uid, email, role: 'TALENT', first_name: first, last_name: last, email_verified: true, created_at: iso(daysAgo + 2) });
  const prof = { id: pid, user_id: uid, slug: `${first}-${last}-${pid.slice(0, 4)}`.toLowerCase(), first_name: first, last_name: last, city, height_cm: h, gender, date_of_birth: dob, bio_raw: '', bio_curated: '', bust_cm: gender === 'Female' ? m[0] : null, chest_cm: gender === 'Male' ? m[0] : null, waist_cm: m[1], hips_cm: m[2], measurements_updated_at: iso(10), measurements_source: 'agency_measured', measured_in_person_at: iso(10), measured_by_agency_id: AID, profile_status: 'active', created_at: iso(daysAgo + 2) };
  await knex('profiles').insert(prof);
  const imgs = [];
  if (photo) {
    const src = `${S}/photos/cand/${photo}.jpg`; const md = await sharp(src).metadata();
    const shots = [['headshot', { left: Math.round(md.width * .1), top: 0, width: Math.round(md.width * .8), height: Math.min(md.height, Math.round(md.width))} ], ['three_quarter', null], ['full_length', null]];
    let sort = 1;
    for (const [shot, box] of shots) {
      const file = `deck/${prof.slug}-${shot}.jpg`;
      let s = sharp(src); if (box) s = s.extract(box);
      await s.resize(900, 1125, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toFile(`${S}/uploads/${file}`);
      const row = { id: randomUUID(), profile_id: pid, path: '/uploads/' + file, public_url: '/uploads/' + file, image_type: 'digital', shot_type: shot, style_type: 'digitals', status: 'active', sort: sort++, is_primary: shot === 'headshot', captured_at: iso(12), created_at: iso(12) };
      await knex('images').insert(row); imgs.push(row);
    }
  }
  const extra = status === 'represented' ? { accepted_at: iso(daysAgo - 10) } : status === 'declined' ? { declined_at: iso(daysAgo - 4), decline_reason: ['not_a_fit', 'board_full', 'market', 'experience'][Math.floor(Math.random() * 4)] } : {};
  await knex('applications').insert({ id: aid, profile_id: pid, agency_id: AID, status, created_at: iso(daysAgo), updated_at: iso(daysAgo - 4), status_changed_at: iso(daysAgo - 4), ...extra });
  await knex('talent_submission_packages').insert({ id: randomUUID(), application_id: aid, user_id: uid, profile_id: pid, label: `Application to ${AID}`, created_at: iso(daysAgo), retention_expires_at: iso(-700), payload: JSON.stringify({ packageSchemaVersion: 2, applicationId: aid, agencyId: AID, agencyName: 'Meridian Model Management', callPurpose: 'representation', boards: [], images: imgs.map((i) => ({ id: i.id, path: i.path, public_url: i.public_url, alt: '', image_type: 'digital', shot_type: i.shot_type, sort: i.sort, is_primary: i.is_primary })), profile: buildSubmissionProfileSnapshot(prof, { minor: false, social: [] }), contact: { email, phone: null }, submittedAt: iso(daysAgo) }) });
  return { aid, pid };
}
(async () => {
  if (!String(knex.client.config.connection.filename || '').includes('ui-stack')) throw new Error('not scratch');
  const out = { represented: [], passed: [] };
  for (const r of rep) out.represented.push(await mkTalent(r[0], r[1], r[3], r[4], r[5], r[6], r[7], r[2], r[8], 'represented'));
  for (let i = 0; i < 26; i++) {
    const g = i >= 12 && i < 20 ? 'Male' : 'Female';
    out.passed.push(await mkTalent(passFirst[i], passLast[i], g, `${1998 + (i % 9)}-0${1 + (i % 9)}-1${i % 9}`, ['New York, NY', 'Newark, NJ', 'Philadelphia, PA', 'Boston, MA'][i % 4], g === 'Male' ? 176 + (i % 8) : 165 + (i % 10), [84, 66, 92], null, 20 + i * 5, 'declined'));
  }
  fs.writeFileSync(S + '/history.json', JSON.stringify(out, null, 1));
  console.log('done');
  await knex.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
