// Knex 的連線與 migration 設定。API（src/db.js）與 knex CLI（npm run migrate）共用這一份。
import config from './src/config.js';

export default {
  client: 'mysql2',
  connection: {
    ...config.db,
    charset: 'utf8mb4',
    // DATETIME 欄位一律當成 UTC 讀寫
    timezone: 'Z',
    // 連不到資料庫時 5 秒內就放棄，不要讓請求一直卡住
    connectTimeout: 5000,
  },
  // 從連線池拿連線最多等 5 秒（預設 60 秒）
  acquireConnectionTimeout: 5000,
  pool: {
    min: 0,
    max: 10,
    // 每條連線建立時把 session 時區設成 UTC，讓 CURRENT_TIMESTAMP 也是 UTC
    afterCreate(connection, done) {
      connection.query("SET time_zone = '+00:00'", (error) => done(error, connection));
    },
  },
  migrations: {
    directory: './migrations',
    loadExtensions: ['.js'],
  },
};
