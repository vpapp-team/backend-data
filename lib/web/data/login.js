exports.onRequest = (req, resp, triggered, subpath, subloader, { session, setCookie }) => {
  if (session.login) {
    return process.util.accept(resp, {
      username: session.login.username,
      avatar: `/content/avatars/${session.login.avatar}`,
    }, process.util.handleCookie(setCookie));
  }
  if (req.method !== 'POST') return process.util.denie(resp, 'unknown method', process.util.handleCookie(setCookie));
  process.util.getBody(req).then(body => {
    let parsed;
    try { parsed = JSON.parse(body.toString()); } catch (e) { return process.util.denie(resp, 'failed to parse json data', process.util.handleCookie(setCookie)); }

    if (!parsed || typeof parsed !== 'object') return process.util.denie(resp, 'object data not an object', process.util.handleCookie(setCookie));
    parsed.id = parsed.id && parsed.id.trim ? parsed.id.trim() : parsed.id;
    if (!parsed.id || typeof parsed.id !== 'string') return process.util.denie(resp, 'id not a valid string', process.util.handleCookie(setCookie));
    parsed.pw = parsed.pw && parsed.pw.trim ? parsed.pw.trim() : parsed.pw;
    if (!parsed.pw || typeof parsed.pw !== 'string') return process.util.denie(resp, 'pw not a valid string', process.util.handleCookie(setCookie));

    process.util.promisifiedQuery(process.sqlPool, `SELECT * FROM ${process.config.mysql_readwrite.tables.WEBADMINS} WHERE UPPER(\`username\`) = UPPER(?)`, [parsed.id]).then(rows => {
      if (rows.length !== 1) {
        return setTimeout(() => {
          process.util.denie(resp, 'invalid credentials provided', process.util.handleCookie(setCookie));
        }, Math.floor(500 * Math.random()));
      }

      const entry = rows[0];
      const hash = process.util.buildHash(entry.hashAlgorithm, parsed.pw, entry.salt);
      if (hash !== entry.pwHash) {
        return setTimeout(() => {
          process.util.denie(resp, 'invalid credentials provided', process.util.handleCookie(setCookie));
        }, Math.floor(500 * Math.random()));
      }

      session.login = entry;
      process.util.accept(resp, {
        username: entry.username,
        avatar: `/content/avatars/${entry.avatar}`,
      }, process.util.handleCookie(setCookie));
    }).catch(err => {
      console.error('failed login db communication', err);
      process.util.denie(resp, 'failed db communication', process.util.handleCookie(setCookie), 500);
    });
  }).catch(err => process.util.denie(resp, err.message));
};

exports.triggers = [
  'login',
];
