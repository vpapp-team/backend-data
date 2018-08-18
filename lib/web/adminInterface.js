const PATH = require('path');
const FS = require('fs');
const QS = require('querystring');
const mimeTypeMap = new Map();
const CRYPTO = require('crypto');
mimeTypeMap.set('.html', 'text/html');
mimeTypeMap.set('.js', 'text/javascript');
mimeTypeMap.set('.css', 'text/css');

const sessions = new Map();

exports.onRequest = (req, resp, triggered, subpath, subloader) => {
  console.log(`onRequest adminInterface`, triggered, subpath);
  const cookies = req.headers.cookie ? req.headers.cookie.split('; ').map(a => QS.decode(a)) : [];
  const setCookie = [];

  let sessionCookie = cookies.find(c => c.sessionid);
  if (!sessionCookie || !sessions.has(sessionCookie.sessionid)) {
    const id = CRYPTO.randomBytes(64).toString('hex');
    sessions.set(id, sessionCookie = { sessionid: id, login: null });
    setCookie.push(QS.encode(sessionCookie));
  }
  const session = sessions.get(sessionCookie.sessionid);

  if (triggered.toLowerCase() === 'content') {
    if (req.method !== 'GET') return process.util.denie(resp, 'dafuq are u trying?', process.util.handleCookie(setCookie));
    const path = PATH.resolve(__dirname, 'content', subpath.map(QS.unescape).join(PATH.sep));
    if (!FS.existsSync(path)) return process.util.denie(resp, 'file not found', process.util.handleCookie(setCookie));
    const extName = PATH.extname(path);
    process.util.acceptFile(resp, path, process.util.handleCookie(setCookie, {
      'cache-control': 'public, max-age=86400',
      'content-type': mimeTypeMap.has(extName) ? mimeTypeMap.get(extName) : 'application/octet-stream',
    }), req.headers.range);
  } else if (triggered.toLowerCase() === 'data') {
    const newSubloader = subloader.get('data');
    for (const [, module] of newSubloader) {
      if (module.triggers.includes(subpath[0].toLowerCase())) {
        return module.onRequest(req, resp, subpath.shift(), subpath, newSubloader, { session, setCookie });
      }
    }
    return process.util.denie(resp, 'dafuq are u trying?', process.util.handleCookie(setCookie));
  } else {
    if (req.method !== 'GET') return process.util.denie(resp, 'dafuq are u trying?', process.util.handleCookie(setCookie));
    process.util.acceptFile(resp, PATH.resolve(__dirname, 'content/pages', 'index.html'), process.util.handleCookie(setCookie, {
      'cache-control': 'public, max-age=86400',
      'content-type': 'text/html',
    }), req.headers.range);
  }
};

exports.triggers = [
  'content',
  'data',

  '',
  'login',
  'home',
];

exports.caseSensitiveTriggers = false;
