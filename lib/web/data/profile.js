exports.onRequest = (req, resp, triggered, subpath, subloader, { session, setCookie }) => {
  if (!session.login) return process.util.denie(resp, 'not logged in', process.util.handleCookie(setCookie), 401);
  if (req.method !== 'GET') return process.util.denie(resp, 'unknown method', process.util.handleCookie(setCookie));

  process.util.accept(resp, {
    username: session.login.username,
    avatar: `/content/avatars/${session.login.avatar}`,
  }, process.util.handleCookie(setCookie));
};

exports.triggers = [
  'profile',
];
