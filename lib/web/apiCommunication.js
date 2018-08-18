exports.onRequest = (req, resp, triggered, subpath, subloader) => {
  console.log(`onRequest apiCommunication`);
  if (req.method !== 'POST') return process.util.denie(resp, 'ur not GET-ing in here');
  const formatedUrl = req.url.split('/').filter(a => a).join('/');

  validateRequest(req.headers.auth, req.headers.host, req.headers.uuid).then(row => {
    process.util.promisifiedQuery(process.sqlPool, `UPDATE ${process.config.mysql_readwrite.tables.BACKENDS} SET \`lastAccess\` = ? WHERE \`uuid\` = ?`, [process.types.get('General').get('Time').now()
      .simplify(), row.uuid]);
    if (formatedUrl === 'register') {
      console.log('onRequest register', row.uuid);
      if (process.registeredForPushs.indexOf(row.uuid) === -1) {
        process.registeredForPushs.push(row.uuid);
      }
      process.util.accept(resp, null, null, 418);
    } else if (formatedUrl === 'feedback') {
      process.util.getBody(req).then(body => {
        let parsed;
        console.log('onRequest feedback', body.toString());
        try {
          let json = JSON.parse(body.toString());
          parsed = new (process.types.get('Data').get('Feedback'))(json);
        } catch (e) {
          return process.util.denie(resp, 'invalid feedback data');
        }
        console.log('onRequest feedback', parsed);
        if (parsed.uuid.issuer !== row.host) return process.util.denie(resp, 'feedback\'s uuid does not relate to you');
        process.util.accept(resp, null, null, 418);
        process.util.promisifiedQuery(process.sqlPool, `INSERT IGNORE INTO ${process.config.mysql_readwrite.tables.FEEDBACK} SET ?`, [parsed.toSQL()]);
      }).catch(err => process.util.denie(resp, err.message));
    } else if (formatedUrl === 'error') {
      process.util.getBody(req).then(body => {
        let parsed;
        console.log('onRequest error', body.toString());
        try {
          let json = JSON.parse(body.toString());
          parsed = new (process.types.get('Data').get('Error'))(json);
        } catch (e) {
          return process.util.denie(resp, 'invalid error data');
        }
        console.log('onRequest error', parsed);
        if (parsed.uuid.issuer !== row.host) return process.util.denie(resp, 'error\'s uuid does not relate to you');
        process.util.accept(resp, null, null, 418);
        process.util.promisifiedQuery(process.sqlPool, `INSERT IGNORE INTO ${process.config.mysql_readwrite.tables.ERRORS} SET ?`, [parsed.toSQL()]);
      }).catch(err => process.util.denie(resp, err.message));
    } else { process.util.denie(resp, 'unknown path'); }
  }).catch(() => process.util.denie(resp, 'invalid auth credentials'));
};

const validateRequest = (auth, host, uuid) => new Promise((resolve, reject) => {
  if (!auth || !host || !uuid) reject();
  process.util.promisifiedQuery(process.sqlPool, `SELECT * FROM ${process.config.mysql_readwrite.tables.BACKENDS} WHERE \`uuid\` = ? AND \`auth\` = ? AND \`host\` = ?`, [uuid, auth, host]).then(rows => {
    const row = rows[0];
    if (!row) return reject();
    return resolve(row);
  }).catch(reject);
});

exports.triggers = [
  'register',
  'feedback',
  'error',
];

exports.caseSensitiveTriggers = true;
