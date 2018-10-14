const ICONV = require('iconv-lite');

const DATE_REGEX = /([0-9]{1,2})\.([0-9]{1,2})\.[\s]*([^<]*)/;
const LINE_REGEX = /<tr[^>]*>/;
const DAY_REGEX = /<a name="[0-9]">/;

const REF = 'http://nig-bederkesa.de/fileadmin/public/Vertretungsplan/v/<week>/v00000.htm';
const WEEK_DAYS = 'sonntag,montag,dienstag,mittwoch,donnerstag,freitag,samstag'.split(',');
const KNOWN_HEADERS = 'vertreter,fach,stunde,klasse(n),raum,(lehrer),(fach),entfall,vertretungs-text'.split(',');
const KNOWN_MOTD = 'betroffene klassen,abwesende klassen,abwesende lehrer'.split(',');

const LOGGER = new (require('backend-logger'))().is.DATA();
const CONFIG = require('../cfgLoader.js')();
const TYPES = require('backend-types');
const UTIL = require('backend-util');

const main = () => new Promise((resolve, reject) => {
  const now = TYPES.get('General').get('Time').now();
  Promise.all([
    parsePage(now),
    parsePage(now.offset(7)),
  ]).then(data => {
    resolve([].concat(...data).filter(a => a));
  }).catch(reject);
});
main.REF = REF;

const parsePage = date => new Promise((resolve, reject) => {
  UTIL.getWebpage(main.REF.replace('<week>', UTIL.pad(date.getWeek(), 2))).then(page => {
    const htmlString = ICONV.decode(page, 'iso-8859-1');
    const groups = htmlString.split(DAY_REGEX).splice(1);
    return resolve([].concat(...groups.map(g => parseHtml(g, date))));
  }).catch(reject);
});

const parseHtml = (htmlString, date) => {
  const htmlSplits = htmlString.split(/<table[^>]*class="subst"[^>]*>/);
  const headerData = htmlSplits[0];
  const dayDate = parseDate(headerData, date);
  if (!dayDate) return null;
  const motd = parseMOTD(headerData, dayDate);
  if (!motd) return null;
  const standins = parseBody(htmlSplits[1], dayDate);
  if (!standins) return null;
  return [].concat(...motd, ...standins);
};

const parseDate = (rawHeader, requestDate) => {
  // Parse the data provided in the table
  const dateMatch = rawHeader.match(DATE_REGEX);
  const isDate = Number(dateMatch[1]);
  const isMonth = Number(dateMatch[2]) - 1;

  // Build the week day in the calendar week
  const isDay = dateMatch[3].toLowerCase();
  const isDayNr = WEEK_DAYS.indexOf(isDay);
  const should = requestDate.getDayInWeek(isDayNr);
  // 86400000 = 24 * 60 * 60 * 1000
  const shouldRaw = new Date(should.rawNumber * 86400000);
  const shouldDate = shouldRaw.getDate();
  const shouldMonth = shouldRaw.getMonth();

  // Compare against the date provided in the calendar
  if (shouldDate !== isDate || shouldMonth !== isMonth) return null;
  return should;
};

const parseMOTD = (rawHeader, targetDate) => {
  const motdRaw = rawHeader
    .split(LINE_REGEX)
    .splice(2);
  const messages = motdRaw.map(message => message.split(/<td[^>]*>/).splice(1).map(a => a.removeHTML()));
  if (!messages.length) return null;
  return messages.map(msg => {
    // Parse a single message
    // ignore 'betroffene klassen' since we can easily calculate that
    // if we have a new field it'll get handled as 'other' and joined by ' => '
    if (msg[0].toLowerCase() === KNOWN_MOTD[0]) return null;

    let subtype = 0;
    if (msg[0].toLowerCase() === KNOWN_MOTD[1]) subtype = 1;
    else if (msg[0].toLowerCase() === KNOWN_MOTD[2]) subtype = 2;

    return new (TYPES.get('Data').get('Stand-in'))({
      uuid: TYPES.get('General').get('UUID').new(),
      type: 1,
      subtype: subtype,
      day: targetDate,
      message: subtype === 0 ? msg.join(' => ') : msg.splice(1).join(' => '),
    });
  }).filter(a => a);
};

const parseBody = (rawBody, targetDate) => {
  let headers = rawBody
    .substr(0, rawBody.lastIndexOf('</th>'))
    .replace(/---/g, '')
    .split(/<th[^>]*>/)
    .splice(1)
    .map(a => a.removeHTML())
    .map(a => a.toLowerCase());
  for (const header of headers.filter(h => !KNOWN_HEADERS.includes(h))) {
    LOGGER.error(`unknown header "${header}" on ${targetDate.simplify()}`);
  }
  const rawLines = rawBody
    .substr(rawBody.lastIndexOf('</th>'))
    .replace(/---/g, '')
    .split(LINE_REGEX)
    .splice(1);
  return rawLines.map(line => {
    const fields = line
      .split(/<td[^>]*>/)
      .splice(1)
      .map(a => a.removeHTML());
    // Map the fields by there header value if they'd ever be switched
    // or a new one added in between
    return new (TYPES.get('Data').get('Stand-in'))({
      uuid: TYPES.get('General').get('UUID').new(),
      type: 0,
      day: targetDate,
      message: fields[headers.indexOf('vertretungs-text')] || null,
      teacher: fields[headers.indexOf('vertreter')] || null,
      subject: fields[headers.indexOf('fach')] || null,
      lesson: fields[headers.indexOf('stunde')] || null,
      class: fields[headers.indexOf('klasse(n)')] || null,
      room: fields[headers.indexOf('raum')] || null,
      originalTeacher: fields[headers.indexOf('(lehrer)')] || null,
      originalSubject: fields[headers.indexOf('(fach)')] || null,
      eliminated: !!fields[headers.indexOf('entfall')],
    });
  });
};

module.exports = main;
main.REF = REF;
main.updateInterval = 15 * 60 * 1000;
main.update = () => new Promise((resolve, reject) => {
  main().then(standins => {
    LOGGER.log(`HttpToStandIns pulled: ${standins.length}`);
    if (!standins.length) return resolve(false);
    const query = CONFIG.sqlPool.query(`SELECT * FROM ${CONFIG.mysql_readwrite.tables.STANDINS} WHERE \`outdated\` IS NULL AND \`day\` IN ('${UTIL.unDoub(standins.map(i => i.day.simplify())).join(`','`)}')`); // eslint-disable-line max-len
    const removed = new Map();
    query.on('error', reject);
    query.on('result', row => {
      const parsedRow = new (TYPES.get('Data').get('Stand-in'))(row);
      let buffer = standins.find(m => m.equals(parsedRow, true));
      if (buffer) {
        standins.splice(standins.indexOf(buffer), 1);
      } else { removed.set(parsedRow.uuid.simplify(), true); }
    });
    return query.on('end', () => {
      LOGGER.log(`HttpToStandIns new: ${standins.length} removed: ${removed.size}`);
      if (!standins.length && !removed.size) return resolve(false);
      return Promise.all([].concat(
        Array.from(removed.keys())
          .map(uuid => UTIL.promisifiedQuery(CONFIG.sqlPool, `UPDATE ${CONFIG.mysql_readwrite.tables.STANDINS} SET \`outdated\` = ? WHERE \`uuid\` = ?`, [TYPES.get('General').get('Time').simpleNow(), uuid])), // eslint-disable-line max-len
        standins.map(standin => UTIL.promisifiedQuery(CONFIG.sqlPool, `INSERT INTO ${CONFIG.mysql_readwrite.tables.STANDINS} SET ?`, [Object.assign(standin.toSQL(), { added: TYPES.get('General').get('Time').simpleNow() })])) // eslint-disable-line max-len
      )).then(() => {
        const now = TYPES.get('General').get('Time').simpleNow();
        return UTIL.promisifiedQuery(CONFIG.sqlPool, `INSERT INTO ${CONFIG.mysql_readwrite.tables.UPDATES} (\`lastUpdate\`, \`category\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`lastUpdate\` = ?`, [now, 'stand-in', now]); // eslint-disable-line max-len
      }).then(() => resolve(true))
        .catch(reject);
    });
  }).catch(reject);
});
