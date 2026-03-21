import { Knex } from 'knex';

// Phase D — Products

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('products', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('RESTRICT');
    t.string('title', 500).notNullable();
    t.text('description').nullable();
    t.bigint('price_halalas').notNullable();
    t.string('currency', 3).notNullable().defaultTo('SAR');

    t.integer('stock_quantity').nullable(); // null = unlimited / digital
    t.boolean('is_digital').notNullable().defaultTo(false);

    t.string('status', 15).notNullable().defaultTo('DRAFT');

    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE products ADD CONSTRAINT products_status_check
    CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED'))
  `);
  await knex.raw(`
    ALTER TABLE products ADD CONSTRAINT products_price_non_negative
    CHECK (price_halalas >= 0)
  `);

  await knex.raw(`CREATE INDEX products_provider_id_idx ON products(provider_id)`);
  await knex.raw(`CREATE INDEX products_provider_status_idx ON products(provider_id, status)`);

  await knex.schema.createTable('product_tags', (t) => {
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.uuid('tag_id').notNullable().references('id').inTable('taxonomy_tags').onDelete('CASCADE');
    t.primary(['product_id', 'tag_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('product_tags');
  await knex.schema.dropTableIfExists('products');
}
