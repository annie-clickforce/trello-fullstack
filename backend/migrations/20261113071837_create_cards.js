/**
 * 建立 cards 表，規格見 docs/database.md。
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
  await knex.schema.createTable('cards', (table) => {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');

    table.specificType('id', 'char(36) CHARACTER SET ascii COLLATE ascii_bin').primary();
    // 型別要跟 users.id 完全相同，外鍵才建得起來
    table.specificType('user_id', 'char(36) CHARACTER SET ascii COLLATE ascii_bin').notNullable();
    table.string('title', 255).notNullable();
    // TEXT 不能設預設值，新增時由程式寫入空字串
    table.text('description').notNullable();
    table.enu('status', ['todo', 'doing', 'done']).notNullable();
    table.integer('position').unsigned().notNullable();
    table.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    table.datetime('updated_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));

    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    // 同一個使用者的同一欄裡，不會有兩張卡片在同一個位置；也支援依欄位與順序查詢
    table.unique(['user_id', 'status', 'position'], { indexName: 'uniq_card_position' });
  });
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
  await knex.schema.dropTable('cards');
}
