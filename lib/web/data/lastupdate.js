exports.onRequest = (req, resp, triggered, subpath, subloader, { session, setCookie }) => {
  if (!session.login) return process.util.denie(resp, 'not logged in', process.util.handleCookie(setCookie), 401);
  if (req.method === 'GET') {
    process.util.promisifiedQuery(process.sqlPool, `SELECT * FROM ${process.config.mysql_readwrite.tables.UPDATES}`).then(rows => {
      process.util.accept(resp, rows, process.util.handleCookie(setCookie));
    }).catch(e => {
      console.error('failed lastupdate db communication', e);
      process.util.denie(resp, 'failed db communication', process.util.handleCookie(setCookie), 500);
    });
  } else if (req.method === 'POST') {
    process.util.getBody(req).then(body => {
      let data;
      try { data = JSON.parse(body.toString()); } catch (e) { return process.util.denie(resp, 'failed to parse json data', process.util.handleCookie(setCookie)); }
      let parsed;
      try { parsed = new (process.types.get('Data').get('LastUpdate'))(data).toSQL(); } catch (e) { return process.util.denie(resp, `invalid LastUpdate data ${e.message}`, process.util.handleCookie(setCookie)); }

      process.util.promisifiedQuery(process.sqlPool, `INSERT INTO ${process.config.mysql_readwrite.tables.UPDATES} (\`lastUpdate\`, \`category\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`lastUpdate\` = ?`, [parsed.lastUpdate, parsed.category, parsed.lastUpdate]).then(() => {
        process.util.accept(resp, { msg: 'changed' }, process.util.handleCookie(setCookie));
      }).catch(e => {
        console.error('failed lastupdate db communication', e);
        process.util.denie(resp, 'failed db communication', process.util.handleCookie(setCookie), 500);
      });
    }).catch(err => process.util.denie(resp, err.message));
  } else if (req.method === 'DELETE') {
    process.util.getBody(req).then(body => {
      let deleteCategory;
      try { deleteCategory = JSON.parse(body.toString()); } catch (e) { return process.util.denie(resp, 'failed to parse json data', process.util.handleCookie(setCookie)); }
      if (!process.types.get('Data').get('LastUpdate').CATEGORIES.includes(deleteCategory)) {
        return process.util.denie(resp, 'unknown LastUpdate category', process.util.handleCookie(setCookie));
      }

      process.util.promisifiedQuery(process.sqlPool, `DELETE FROM ${process.config.mysql_readwrite.tables.UPDATES} WHERE \`category\` = ?`, [deleteCategory]).then(() => {
        process.util.accept(resp, { msg: 'removed' }, process.util.handleCookie(setCookie));
      }).catch(e => {
        console.error('failed lastupdate db communication', e);
        process.util.denie(resp, 'failed db communication', process.util.handleCookie(setCookie), 500);
      });
    }).catch(err => process.util.denie(resp, err.message));
  } else {
    process.util.denie(resp, 'unknown method', process.util.handleCookie(setCookie));
  }
};

exports.triggers = [
  'lastupdate',
];
