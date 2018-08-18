exports.onRequest = (req, resp, triggered, subpath, subloader, { session, setCookie }) => {
  if (!session.login) return process.util.denie(resp, 'not logged in', process.util.handleCookie(setCookie), 401);
  if (req.method === 'GET') {
    process.util.promisifiedQuery(process.sqlPool, `SELECT * FROM ${process.config.mysql_readwrite.tables.TEACHERS}`).then(rows => process.util.accept(resp, rows)).catch(e => {
      console.error('error lessonRanges sql select', e);
      process.util.denie(resp, 'sth went wrong selecting the data from sql table', process.util.handleCookie(setCookie), 500);
    });
  } else if (req.method === 'PUT') {
    process.util.getBody(req).then(body => {
      try {
        const data = JSON.parse(body.toString());
        data.uuid = process.types.get('General').get('UUID').new()
          .simplify();
        const added = new (process.types.get('General').get('Time'))(data.added).simplify();
        const outdated = data.outdated ? new (process.types.get('General').get('Time'))(data.outdated).simplify() : null;
        const parsed = new (process.types.get('Data').get('Teacher'))(data).toSQL();

        process.util.promisifiedQuery(process.sqlPool, `INSERT INTO ${process.config.mysql_readwrite.tables.TEACHERS} SET ?`,
          [Object.assign(parsed, { added }, outdated ? { outdated } : undefined)]
        ).then(() => {
          process.util.accept(resp, { msg: 'added' }, process.util.handleCookie(setCookie));
        }).catch(e => {
          console.error('error teachers', e);
          process.util.denie(resp, 'sth went wrong pushing the changes to mysql', process.util.handleCookie(setCookie), 500);
        });
      } catch (e) {
        console.error('error teachers', e);
        process.util.denie(resp, 'sth went wrong with the data provided', process.util.handleCookie(setCookie));
      }
    }).catch(err => process.util.denie(resp, err.message));
  } else if (req.method === 'POST') {
    process.util.getBody(req).then(body => {
      try {
        const data = JSON.parse(body.toString());
        const uuid = new (process.types.get('General').get('UUID'))(data.uuid).simplify();
        const added = data.added ? new (process.types.get('General').get('Time'))(data.added).simplify() : null;
        const shorthand = data.shorthand ? process.types.get('Data').get('Teacher').validateShorthand(data.shorthand) : null;
        const name = data.name ? process.types.get('Data').get('Teacher').validateName(data.name) : null;
        const subjects = data.subjects ? process.types.get('Data').get('Teacher').validateSubjects(data.subjects) : null;
        const email = new (process.types.get('General').get('UUID'))(data.email).simplify();
        const comments = data.comments ? process.types.get('Data').get('Teacher').validateComments(data.comments) : null;
        const leftSchool = data.leftSchool ? process.types.get('Data').get('Teacher').leftSchool(data.leftSchool) : null;
        const outdated = data.outdated ? new (process.types.get('General').get('Time'))(data.outdated).simplify() : null;
        if (!added && !shorthand && !name && !subjects && !email && !comments && !leftSchool && !outdated) return process.util.denie(resp, 'no data to change provided', process.util.handleCookie(setCookie));

        process.util.promisifiedQuery(process.sqlPool, `UPDATE ${process.config.mysql_readwrite.tables.TEACHERS} SET ${added !== null ? '\`added\` = ? ' : ''}${shorthand !== null ? '\`shorthand\` = ? ' : ''}${name !== null ? '\`name\` = ? ' : ''}${subjects !== null ? '\`subjects\` = ? ' : ''}${email !== null ? '\`email\` = ? ' : ''}${comments !== null ? '\`comments\` = ? ' : ''}${leftSchool !== null ? '\`leftSchool\` = ? ' : ''}${outdated !== null ? '\`outdated\` = ? ' : ''}WHERE uuid = ?`,
          [added, shorthand, name, subjects, email, comments, leftSchool, outdated, uuid].filter(a => a !== null)
        ).then(() => {
          process.util.accept(resp, { msg: 'updated' }, process.util.handleCookie(setCookie));
        }).catch(e => {
          console.error('error teachers', e);
          process.util.denie(resp, 'sth went wrong pushing the changes to mysql', process.util.handleCookie(setCookie), 500);
        });
      } catch (e) {
        console.error('error teachers', e);
        process.util.denie(resp, 'sth went wrong with the data provided', process.util.handleCookie(setCookie));
      }
    }).catch(err => process.util.denie(resp, err.message));
  } else if (req.method === 'DELETE') {
    process.util.getBody(req).then(body => {
      try {
        const deleteUUID = JSON.parse(body.toString());
        new (process.types.get('General').get('UUID'))(deleteUUID);
        process.util.promisifiedQuery(process.sqlPool, `DELETE FROM ${process.config.mysql_readwrite.tables.TEACHERS} WHERE \`uuid\` = ?`, [deleteUUID]).then(() => {
          process.util.accept(resp, { msg: 'removed' }, process.util.handleCookie(setCookie));
        }).catch(e => {
          console.error('error teachers sql', e);
          process.util.denie(resp, 'sth went wrong pushing the changes to mysql', process.util.handleCookie(setCookie), 500);
        });
      } catch (e) {
        console.error('error teachers', e);
        process.util.denie(resp, 'sth went wrong with the data provided', process.util.handleCookie(setCookie));
      }
    }).catch(err => process.util.denie(resp, err.message));
  } else {
    process.util.denie(resp, 'unknown method', process.util.handleCookie(setCookie));
  }
};

exports.triggers = [
  'teachers',
];
