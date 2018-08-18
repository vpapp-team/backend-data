exports.onRequest = (req, resp, triggered, subpath, subloader, { session, setCookie }) => {
  if (!session.login) return process.util.denie(resp, 'not logged in', process.util.handleCookie(setCookie), 401);
  if (req.method !== 'POST') return process.util.denie(resp, 'unknown method', process.util.handleCookie(setCookie));

  session.login = null;
  process.util.accept(resp, {
    msg: 'good bye',
  }, process.util.handleCookie(setCookie));
};

exports.triggers = [
  'logout',
];
