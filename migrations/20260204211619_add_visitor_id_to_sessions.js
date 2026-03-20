exports.up = function(knex) {
  return knex.schema.alterTable('visitor_sessions', function(table) {
    table.uuid('visitor_id').index();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('visitor_sessions', function(table) {
    table.dropColumn('visitor_id');
  });
};
