// LOADER IGNORE //
const LOADER = require('../Loader.js')();
process.config = LOADER.get('config');
process.types = LOADER.get('types');
process.snowflake = new (LOADER.get('Snowflake'))({
  epoche: process.config.epoche,
  datacenter: process.config.datacenter,
  worker: 0,
});
const URL = require('url');
const HTTPS = require('https');
const MYSQL = require('mysql');
process.util = LOADER.get('util');
process.sqlPool = MYSQL.createPool(process.config.mysql_readwrite);

let broadcastChangeTimeout;
process.registeredForPushs = [];

for (const [key, val] of LOADER.get('data')) {
  if (!val.update || !val.updateInterval) continue;
  let failed = [];
  const updateDataItem = () => {
    console.log(`${key} update start`, new Date());
    val.update().then(didChange => {
      console.log(`${key} update finished`, new Date());
      if (didChange) {
        console.log(`didChange ${key}`);
        clearTimeout(broadcastChangeTimeout);
        broadcastChangeTimeout = setTimeout(broadcastChange, process.config.CONST.BROADCAST_DELAY);
      }
    }).catch(err => {
      console.error(`${key} failed: ${err ? err.stack : err}`);
      failed.push(Date.now());
      if (failed.length > 3) failed.shift();
      if (failed.length === 3 && failed[0] > Date.now() - process.config.disableAfter3FailsInXMin * 60 * 1000) {
        clearInterval(thisInterval);
        console.error(`${key} disabled since it failed to often`);
      }
    });
  };
  const thisInterval = setInterval(updateDataItem, val.updateInterval);
  setImmediate(updateDataItem);
}

const broadcastChange = () => {
  console.log('broadcastChange');
  clearInterval(broadcastChangeTimeout);
  if (!process.registeredForPushs.length) return;
  const invalidUUIDs = [];
  const now = process.types.get('General').get('Time').now();
  Promise.all(process.registeredForPushs.map(uuid => broadcastToSingleClient(uuid, now))).then(data => {
    const worked = data.filter(a => a.worked).map(a => a.worked);
    const failed = data.filter(a => a.failed).map(a => a.failed);
    if (failed.length) {
      for (const uuid of failed) {
        process.registeredForPushs.splice(process.registeredForPushs.indexOf(uuid), 1);
      }
    }
    if (worked.length) {
      Promise.all(
        worked.map(uuid => process.util.promisifiedQuery(process.sqlPool, `UPDATE ${process.config.mysql_readwrite.tables.BACKENDS} SET \`lastAccess\` = ? WHERE \`uuid\` = ?`, [now.simplify(), uuid]))
      ).then(() => {
        console.log(`broadcastChange worked:${worked.length} failed:${failed.length}`);
      }).catch(err => {
        console.error(`broadcastChange failedUpdateDB`, err);
      });
    }
  });
};

const broadcastToSingleClient = (uuid, now) => new Promise(resolve => {
  console.log('broadcastToSingleClient', uuid);
  process.util.promisifiedQuery(process.sqlPool, `SELECT * FROM ${process.config.mysql_readwrite.tables.BACKENDS} WHERE \`uuid\` = ?`, [uuid]).then(rows => {
    const row = rows[0];
    if (!row) return resolve({ failed: uuid });
    const lastAccess = new (process.types.get('General').get('Time'))(row.lastAccess);
    if (lastAccess.rawNumber <= now.rawNumber - process.config.CONST.PUSH_NOTIFICATION_TIMEOUT) return resolve({ failed: uuid });
    HTTPS.get(Object.assign({}, URL.parse(`https://${row.host}:${row.internPort}/updates/`), { method: 'POST', rejectUnauthorized: !process.config.CONST.ACCEPT_SELF_SIGNED_CERTS }), resp => {
      if (resp.statusCode !== 418) return resolve({ failed: uuid });
      return resolve({ worked: uuid });
    }).on('error', e => {
      console.error('error updateUUID HTTPS', uuid, e);
      return resolve({ failed: uuid });
    });
  }).catch(err => {
    console.error('error updateUUID MYSQL', uuid, err);
    return resolve({ failed: uuid });
  });
});

const onRequest = (req, resp) => {
  console.log(`onRequest to ${req.url} as ${req.method} from "${req.connection.remoteAddress}"`);
  const paths = req.url.split('/').splice(1);
  console.log(`"${require('util').inspect(paths, { depth: Infinity })}"`);
  const subloader = LOADER.get('data').get('web');
  for (const [, module] of subloader) {
    if (module.dir) continue;
    if (
      exports.caseSensitiveTriggers ?
        module.triggers.includes(paths[0]) :
        module.triggers.map(a => a.toLowerCase()).includes(paths[0] ? paths[0].toLowerCase() : paths[0])
    ) {
      module.onRequest(req, resp, paths.shift(), paths, subloader);
      return;
    }
  }
  process.util.denie(resp, 'unknown path');
};
let registrationServer = HTTPS.createServer(process.config.SECURE_CONTEXT.getCredentials(), onRequest).listen(process.config.uplinkPort);
process.config.SECURE_CONTEXT.on('CHANGE', () => {
  console.log('SECURE_CONTEXT CHANGE');
  registrationServer.close(() => {
    registrationServer = HTTPS.createServer(process.config.SECURE_CONTEXT.getCredentials(), onRequest).listen(process.config.uplinkPort);
  });
});
