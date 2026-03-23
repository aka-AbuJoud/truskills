// Production-safe CJS knexfile — used by migrate:deploy on Railway.
// No TypeScript, no import syntax, no compilation required.
// All environments point to compiled JS migrations in dist/.
'use strict';

const path = require('path');

// Migrations directory: dist/src/database/migrations (compiled .js files)
// Resolved relative to this file's location (project root), not CWD.
const migrationsDir = path.resolve(__dirname, 'dist', 'src', 'database', 'migrations');

const config = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/truskills_dev',
    migrations: {
      directory: migrationsDir,
      extension: 'js',
      loadExtensions: ['.js'],
    },
    pool: { min: 1, max: 5 },
  },

  staging: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: migrationsDir,
      extension: 'js',
      loadExtensions: ['.js'],
    },
    pool: { min: 2, max: 10 },
  },

  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: migrationsDir,
      extension: 'js',
      loadExtensions: ['.js'],
    },
    pool: { min: 2, max: 20 },
    acquireConnectionTimeout: 10000,
  },
};

module.exports = config;
