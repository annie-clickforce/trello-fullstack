/**
 * 建立 express-mysql-session 使用的 sessions 表（結構照套件文件），
 * 由 migration 管理，不讓套件自己建表。
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
  await knex.schema.createTable('sessions', (table) => {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_bin');

    table.string('session_id', 128).primary();
    table.integer('expires').unsigned().notNullable();
    table.specificType('data', 'mediumtext');
  });
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
  await knex.schema.dropTable('sessions');
}
