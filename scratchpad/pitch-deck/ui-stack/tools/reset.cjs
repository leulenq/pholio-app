const knex = require('/Users/lenquanhone/Projects/pholio-app/node_modules/knex')(require('/Users/lenquanhone/Projects/pholio-app/knexfile.js'));
(async () => {
  console.log('conn', knex.client.config.connection);
  if (!String(knex.client.config.connection.filename||'').includes('ui-stack')) throw new Error('not scratch');
  const owner = await knex('users').where({ email: 'agency@example.com' }).first();
  const aid = (await knex('agency_memberships').where({ user_id: owner.id }).first()).agency_id;
  const tables = (await knex.raw("select name from sqlite_master where type='table'")).map(r => r.name);
  const cols = {};
  for (const t of tables) cols[t] = (await knex.raw(`pragma table_info('${t}')`)).map(c => c.name);
  const del = async (col, ids) => { if (!ids.length) return; for (const t of tables) if (cols[t].includes(col) && !t.startsWith('profiles_fts')) { const n = await knex(t).whereIn(col, ids).del(); if (n) console.log('del', t, col, n); } };
  const apps = (await knex('applications').where({ agency_id: aid }).select('id')).map(r => r.id);
  await del('application_id', apps);
  await knex('applications').whereIn('id', apps).del();
  for (const t of ['interviews','reminders','application_activities','application_tags','notifications','filter_presets']) if (tables.includes(t)) await knex(t).where(cols[t].includes('agency_id') ? { agency_id: aid } : { user_id: owner.id }).del();
  const demoUsers = (await knex('users').where('email', 'like', '%@seed.pholio.studio').select('id')).map(r => r.id);
  const demoProfiles = (await knex('profiles').whereIn('user_id', demoUsers).select('id')).map(r => r.id);
  await del('profile_id', demoProfiles);
  await knex('profiles').whereIn('id', demoProfiles).del();
  await knex('users').whereIn('id', demoUsers).del();
  await knex('board_applications').whereIn('board_id', knex('boards').where({ agency_id: aid }).select('id')).del();
  const boards = await knex('boards').where({ agency_id: aid }).orderBy('sort_order');
  const names = [
    ['Women — Main Board', null, 'Main board women. Editorial and commercial.'],
    ['New Faces', null, 'Development board — first-season faces.'],
    ['Men', null, 'Main board men.'],
    ['FW26 Show Package', 'Meridian (internal)', 'Show-season package for New York Fashion Week castings.'],
  ];
  for (let i = 0; i < boards.length; i++) {
    if (i < names.length) await knex('boards').where({ id: boards[i].id }).update({ name: names[i][0], client_name: names[i][1], description: names[i][2], board_type: i === 3 ? 'package' : 'division', plate_style: null, brand_color: null, target_slots: i === 3 ? 12 : null, closes_at: i === 3 ? new Date(Date.now() + 9 * 864e5).toISOString() : null });
    else { await knex('board_requirements').where({ board_id: boards[i].id }).del(); await knex('board_scoring_weights').where({ board_id: boards[i].id }).del().catch(()=>{}); await knex('boards').where({ id: boards[i].id }).del(); }
  }
  const ag = { name: 'Meridian Model Management', slug: 'meridian-model-management', location: 'New York, NY', website: 'https://example.com/meridian', description: 'Boutique New York agency — women, men and new faces.', logo_path: null, open_boards: JSON.stringify(['Women', 'Men', 'New Faces']) };
  await knex('agencies').where({ id: aid }).update(ag);
  await knex('users').where({ id: owner.id }).update({ agency_name: ag.name, agency_slug: ag.slug, agency_location: ag.location, agency_logo_path: null, agency_description: ag.description, agency_website: ag.website });
  await knex('users').where('email', 'like', '%@team.pholio.studio').update({ agency_name: ag.name });
  await knex('agencies').where({ name: 'Meridian Talent Collective' }).update({ name: 'Northline Models', website: 'https://example.com/northline' });
  console.log('agency', aid, 'boards', (await knex('boards').where({ agency_id: aid })).map(b => b.name));
  await knex.destroy();
})().catch(e => { console.error(e); process.exit(1); });
