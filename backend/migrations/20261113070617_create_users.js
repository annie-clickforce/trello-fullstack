/**
 * 建立 users 表，規格見 docs/database.md。
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');

    // UUID 由程式用 crypto.randomUUID() 產生；ascii 字元集比 utf8mb4 省空間
    table.specificType('id', 'char(36) CHARACTER SET ascii COLLATE ascii_bin').primary();
    table.string('name', 100).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    table.datetime('updated_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
  });
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
  await knex.schema.dropTable('users');
}
