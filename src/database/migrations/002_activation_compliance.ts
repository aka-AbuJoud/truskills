import { Knex } from 'knex';

// Phase B — Provider Activation + Compliance
// Activation state machine (8 states — LOCKED):
//   NOT_STARTED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW
//   → NEEDS_REVISION (returns to IN_PROGRESS for flagged groups only)
//   → APPROVED → ACTIVATED
//   → RESTRICTED_ON_HOLD (post-activation control state)

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('providers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().unique().references('id').inTable('users').onDelete('RESTRICT');
    t.string('provider_type', 20).notNullable(); // INSTRUCTOR | CENTER
    t.string('business_name', 500).nullable();   // required for CENTER
    t.string('display_name', 255).notNullable();
    t.text('bio').nullable();
    t.string('city', 100).nullable();
    t.string('district', 100).nullable();
    t.string('activation_status', 25).notNullable().defaultTo('NOT_STARTED');
    t.boolean('has_restriction_history').notNullable().defaultTo(false);
    t.jsonb('activation_progress').notNullable().defaultTo('{}'); // requirement group completion state
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE providers ADD CONSTRAINT providers_provider_type_check
    CHECK (provider_type IN ('INSTRUCTOR','CENTER'))
  `);
  await knex.raw(`
    ALTER TABLE providers ADD CONSTRAINT providers_activation_status_check
    CHECK (activation_status IN (
      'NOT_STARTED','IN_PROGRESS','SUBMITTED','UNDER_REVIEW',
      'NEEDS_REVISION','APPROVED','ACTIVATED','RESTRICTED_ON_HOLD'
    ))
  `);
  await knex.raw(`CREATE INDEX providers_user_id_idx ON providers(user_id)`);
  await knex.raw(`CREATE INDEX providers_activation_status_idx ON providers(activation_status)`);

  // Append-only audit trail for all activation state transitions
  await knex.schema.createTable('provider_activation_log', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('RESTRICT');
    t.string('from_status', 25).nullable(); // null on first transition
    t.string('to_status', 25).notNullable();
    t.uuid('actor_id').nullable(); // user_id of actor (null = system)
    t.text('reason').nullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX provider_activation_log_provider_id_idx ON provider_activation_log(provider_id, created_at DESC)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('provider_activation_log');
  await knex.schema.dropTableIfExists('providers');
}
