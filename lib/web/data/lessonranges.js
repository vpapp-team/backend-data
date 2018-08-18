exports.onRequest = (req, resp, triggered, subpath, subloader, { session, setCookie }) => {
  if (!session.login) return process.util.denie(resp, 'not logged in', process.util.handleCookie(setCookie), 401);
  if (req.method === 'GET') {
    process.util.promisifiedQuery(process.sqlPool, `SELECT * FROM ${process.config.mysql_readwrite.tables.LESSONRANGES}`).then(rows => {
      process.util.accept(resp, rows, process.util.handleCookie(setCookie));
    }).catch(e => {
      console.error('failed lessonranges db communication', e);
      process.util.denie(resp, 'failed db communication', process.util.handleCookie(setCookie), 500);
    });
  } else if (req.method === 'PUT') {
    process.util.getBody(req).then(body => {
      let data;
      try { data = JSON.parse(body.toString()); } catch (e) { return process.util.denie(resp, 'failed to parse json data', process.util.handleCookie(setCookie)); }
      let added;
      try { added = new (process.types.get('General').get('Time'))(data.added).simplify(); } catch (e) { return process.util.denie(resp, `invalid LessonRange data ${e.message}`, process.util.handleCookie(setCookie)); }
      let outdated;
      try { outdated = data.outdated ? new (process.types.get('General').get('Time'))(data.outdated).simplify() : null; } catch (e) { return process.util.denie(resp, `invalid LessonRange data ${e.message}`, process.util.handleCookie(setCookie)); }
      let parsed;
      try { parsed = new (process.types.get('General').get('LessonRange'))(data).simplify(); } catch (e) { return process.util.denie(resp, `invalid LessonRange data ${e.message}`, process.util.handleCookie(setCookie)); }
      const uuid = process.types.get('General').get('UUID').new()
        .simplify();

      process.util.promisifiedQuery(process.sqlPool, `INSERT INTO ${process.config.mysql_readwrite.tables.LESSONRANGES} SET ?`,
        [Object.assign(parsed, { added, uuid }, outdated ? { outdated } : undefined)]
      ).then(() => {
        process.util.accept(resp, { msg: 'added' }, process.util.handleCookie(setCookie));
      }).catch(e => {
        console.error('failed lessonranges db communication', e);
        process.util.denie(resp, 'failed db communication', process.util.handleCookie(setCookie), 500);
      });
    }).catch(err => process.util.denie(resp, err.message));
  } else if (req.method === 'POST') {
    process.util.getBody(req).then(body => {
      let data;
      try { data = JSON.parse(body.toString()); } catch (e) { return process.util.denie(resp, 'failed to parse json data', process.util.handleCookie(setCookie)); }
      let uuid;
      try { uuid = new (process.types.get('General').get('UUID'))(data.uuid).simplify(); } catch (e) { return process.util.denie(resp, `invalid LessonRange data ${e.message}`, process.util.handleCookie(setCookie)); }
      let added;
      try { added = data.added ? new (process.types.get('General').get('Time'))(data.added).simplify() : null; } catch (e) { return process.util.denie(resp, `invalid LessonRange data ${e.message}`, process.util.handleCookie(setCookie)); }
      let time;
      try { time = data.time ? process.types.get('General').get('LessonRange').validateTime(data.time) : null; } catch (e) { return process.util.denie(resp, `invalid LessonRange data ${e.message}`, process.util.handleCookie(setCookie)); }
      let outdated;
      try { outdated = data.outdated ? new (process.types.get('General').get('Time'))(data.outdated).simplify() : null; } catch (e) { return process.util.denie(resp, `invalid LessonRange data ${e.message}`, process.util.handleCookie(setCookie)); }
      let discriminator;
      try { discriminator = data.discriminator ? process.types.get('General').get('LessonRange').verifyDiscriminator(data.discriminator) : null; } catch (e) { return process.util.denie(resp, `invalid LessonRange data ${e.message}`, process.util.handleCookie(setCookie)); }
      if (!added && !time && !outdated && !discriminator) return process.util.denie(resp, 'no changing data provided', process.util.handleCookie(setCookie));

      process.util.promisifiedQuery(process.sqlPool, `UPDATE ${process.config.mysql_readwrite.tables.LESSONRANGES} SET ${added !== null ? '\`added\` = ? ' : ''}${outdated !== null ? '\`outdated\` = ? ' : ''}${time !== null ? '\`time\` = ? ' : ''}${discriminator !== null ? '\`discriminator\` = ? ' : ''}WHERE uuid = ?`,
        [added, outdated, time, discriminator, uuid].filter(a => a !== null)
      ).then(() => {
        process.util.accept(resp, { msg: 'updated' }, process.util.handleCookie(setCookie));
      }).catch(e => {
        console.error('failed lessonranges db communication', e);
        process.util.denie(resp, 'failed db communication', process.util.handleCookie(setCookie), 500);
      });
    }).catch(err => process.util.denie(resp, err.message));
  } else if (req.method === 'DELETE') {
    process.util.getBody(req).then(body => {
      let deleteUUID;
      try { deleteUUID = JSON.parse(body.toString()); } catch (e) { return process.util.denie(resp, 'failed to parse json data', process.util.handleCookie(setCookie)); }
      let uuid;
      try { uuid = new (process.types.get('General').get('UUID'))(deleteUUID).simplify(); } catch (e) { return process.util.denie(resp, `invalid LessonRange data ${e.message}`, process.util.handleCookie(setCookie)); }

      process.util.promisifiedQuery(process.sqlPool, `DELETE FROM ${process.config.mysql_readwrite.tables.LESSONRANGES} WHERE \`uuid\` = ?`, [uuid]).then(() => {
        process.util.accept(resp, { msg: 'removed' }, process.util.handleCookie(setCookie));
      }).catch(e => {
        console.error('failed lessonranges db communication', e);
        process.util.denie(resp, 'failed db communication', process.util.handleCookie(setCookie), 500);
      });
    }).catch(err => process.util.denie(resp, err.message));
  } else {
    process.util.denie(resp, 'unknown method', process.util.handleCookie(setCookie));
  }
};

exports.triggers = [
  'lessonranges',
];
