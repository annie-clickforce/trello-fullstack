import config from './config.js';
import app from './app.js';

app.listen(config.port, () => {
  console.log(`API listening on port ${config.port} (${config.nodeEnv})`);
});
