exports.onRequest = (req, resp, triggered, subpath, subloader, { session, setCookie }) => {
  if (!session.login) return process.util.denie(resp, 'not logged in', process.util.handleCookie(setCookie), 401);
  if (req.method === 'GET') {
    process.util.promisifiedQuery(process.sqlPool, `SELECT * FROM ${process.config.mysql_readwrite.tables.VERSIONS}`).then(rows => process.util.accept(resp, rows)).catch(e => {
      console.error('error versions sql select', e);
      process.util.denie(resp, 'sth went wrong selecting the data from sql table', process.util.handleCookie(setCookie), 500);
    });
  } else if (req.method === 'PUT') {
    process.util.getBody(req).then(body => {
      try {
        const data = JSON.parse(body.toString());

        const version = new (process.types.get('General').get('Version'))(data.version).simplify();
        const platform = data.platform.toLowerCase();
        if (!process.types.get('Data').get('Error').PLATFORMS.includes(platform)) throw new TypeError('unknown platform');
        const apiVersion = new (process.types.get('General').get('Version'))(data.apiVersion).simplify();
        const isRecommended = data.isRecommended === true;
        if (typeof data.isRecommended !== 'boolean') throw new TypeError('isRecommended not boolean');
        const isOutdated = data.isOutdated === true;
        if (typeof data.isOutdated !== 'boolean') throw new TypeError('isOutdated not boolean');
        const devVersion = data.devVersion === true;
        if (typeof data.devVersion !== 'boolean') throw new TypeError('devVersion not boolean');

  			process.util.promisifiedQuery(process.sqlPool, `INSERT INTO ${process.config.mysql_readwrite.tables.VERSIONS} SET ?`,
          [{ version, platform, apiVersion, isRecommended, isOutdated, devVersion }]
        ).then(() => {
          process.util.accept(resp, { msg: 'updated' }, process.util.handleCookie(setCookie));
        }).catch(e => {
          if (e.code && e.code === 'ER_DUP_ENTRY') return process.util.denie(resp, 'that platform-version combination is already in the db', process.util.handleCookie(setCookie));
          console.error('error versions', e);
          process.util.denie(resp, 'sth went wrong pushing the changes to mysql', process.util.handleCookie(setCookie), 500);
        });
      } catch (e) {
        console.error('error versions', e);
        process.util.denie(resp, 'sth went wrong with the data provided', process.util.handleCookie(setCookie));
      }
    }).catch(err => process.util.denie(resp, err.message));
  } else if (req.method === 'POST') {
    process.util.getBody(req).then(body => {
      try {
        const data = JSON.parse(body.toString());

        const version = new (process.types.get('General').get('Version'))(data.version).simplify();
        const platform = data.platform.toLowerCase();
        if (!process.types.get('Data').get('Error').PLATFORMS.includes(platform)) throw new TypeError('unknown platform');
        const apiVersion = new (process.types.get('General').get('Version'))(data.apiVersion).simplify();
        const isRecommended = data.isRecommended === true;
        if (typeof data.isRecommended !== 'boolean') throw new TypeError('isRecommended not boolean');
        const isOutdated = data.isOutdated === true;
        if (typeof data.isOutdated !== 'boolean') throw new TypeError('isOutdated not boolean');
        const devVersion = data.devVersion === true;
        if (typeof data.devVersion !== 'boolean') throw new TypeError('devVersion not boolean');

    		process.util.promisifiedQuery(process.sqlPool, `UPDATE ${process.config.mysql_readwrite.tables.VERSIONS} SET \`apiVersion\` = ?, \`isRecommended\` = ?, \`isOutdated\` = ?, \`devVersion\` = ? WHERE \`version\` = ? AND \`platform\` = ?`,
          [apiVersion, isRecommended, isOutdated, devVersion, version, platform]
        ).then(() => {
          process.util.accept(resp, { msg: 'added' }, process.util.handleCookie(setCookie));
        }).catch(e => {
          console.error('error versions', e);
          process.util.denie(resp, 'sth went wrong pushing the changes to mysql', process.util.handleCookie(setCookie), 500);
        });
      } catch (e) {
        console.error('error versions', e);
        process.util.denie(resp, 'sth went wrong with the data provided', process.util.handleCookie(setCookie));
      }
    }).catch(err => process.util.denie(resp, err.message));
  } else if (req.method === 'DELETE') {
    process.util.getBody(req).then(body => {
      try {
        const data = JSON.parse(body.toString());
        const version = new (process.types.get('General').get('Version'))(data.version).simplify();
        const platform = data.platform.toLowerCase();
        if (!process.types.get('Data').get('Error').PLATFORMS.includes(platform)) throw new TypeError('unknown platform');

        process.util.promisifiedQuery(process.sqlPool, `DELETE FROM ${process.config.mysql_readwrite.tables.VERSIONS} WHERE \`version\` = ? AND \`platform\` = ?`, [version, platform]).then(() => {
          process.util.accept(resp, { msg: 'removed' }, process.util.handleCookie(setCookie));
        }).catch(e => {
          console.error('error versions sql', e);
          process.util.denie(resp, 'sth went wrong pushing the changes to mysql', process.util.handleCookie(setCookie), 500);
        });
      } catch (e) {
        console.error('error versions', e);
        process.util.denie(resp, 'sth went wrong with the data provided', process.util.handleCookie(setCookie));
      }
    }).catch(err => process.util.denie(resp, err.message));
  } else {
    process.util.denie(resp, 'unknown method', process.util.handleCookie(setCookie));
  }
};

exports.triggers = [
  'versions',
];
