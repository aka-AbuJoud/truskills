import { Knex } from 'knex';

// Phase A — Taxonomy (categories + tags)
// Referenced by: courses, trips, products, blog posts for classification and discovery

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('taxonomy_categories', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 255).notNullable();
    t.string('slug', 255).notNullable().unique();
    t.uuid('parent_id').nullable().references('id').inTable('taxonomy_categories').onDelete('SET NULL');
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX taxonomy_categories_slug_idx ON taxonomy_categories(slug)`);
  await knex.raw(`CREATE INDEX taxonomy_categories_parent_id_idx ON taxonomy_categories(parent_id)`);

  await knex.schema.createTable('taxonomy_tags', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 255).notNullable();
    t.string('slug', 255).notNullable().unique();
    t.uuid('category_id').nullable().references('id').inTable('taxonomy_categories').onDelete('SET NULL');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX taxonomy_tags_slug_idx ON taxonomy_tags(slug)`);
  await knex.raw(`CREATE INDEX taxonomy_tags_category_id_idx ON taxonomy_tags(category_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('taxonomy_tags');
  await knex.schema.dropTableIfExists('taxonomy_categories');
}
