const PATH = require('path');

const LOGGER = new (require('backend-logger'))().is.DATA();
const CONFIG = require('./cfgLoader.js')();
const UTIL = require('backend-util');
UTIL.snowflake.setCFG({
  epoche: CONFIG.snowflake.epoche,
  datacenter: CONFIG.snowflake.datacenter,
  worker: CONFIG.snowflake.worker,
  host: CONFIG.snowflake.host,
});

// Ref to timeout allowing bulk broadcastChange
let broadcastChangeTimeout;

const MODULES = UTIL.loader(PATH.resolve(__dirname, './modules'));
for (const [key, val] of MODULES) {
  if (!val.update || !val.updateInterval) continue;
  let failed = [];
  const updateDataItem = () => {
    const cfg = CONFIG.MODULES.hasOwnProperty(key) ? CONFIG.MODULES[key] : null;
    LOGGER.log(`${key} update start`, new Date(), cfg);
    val.update(cfg).then(didChange => {
      LOGGER.log(`${key} update finished`, new Date());
      if (didChange) {
        LOGGER.log(`didChange ${key}`);
        clearTimeout(broadcastChangeTimeout);
        broadcastChangeTimeout = setTimeout(broadcastChange, CONFIG.BROADCAST_DELAY_MIN * 60 * 1000);
      }
    }).catch(err => {
      LOGGER.error(`${key} failed: ${err ? err.stack : err}`);
      failed.push(Date.now());
      if (failed.length > 3) failed.shift();
      // We did fail 3 times and the oldest fail is not more then X min old
      if (failed.length === 3 && failed[0] > Date.now() - (CONFIG.MAX_TIME_FOR_3_CRASHES * 60 * 1000)) {
        clearInterval(thisInterval);
        LOGGER.error(`${key} disabled since it failed to often`);
      }
    });
  };
  // Create update interval
  const thisInterval = setInterval(updateDataItem, val.updateInterval);
  // Trigger first update
  setImmediate(updateDataItem);
}

const broadcastChange = () => {}; // TODO: write this
