const ICONV = require('iconv-lite');

const DATE_REGEX = /([0-9]{1,2})\.([0-9]{1,2})\.[\s]*([^<]*)/;
const LINE_REGEX = /<tr[^>]*>/;
const DAY_REGEX = /<a name="[0-9]">/;

const REF = 'http://nig-bederkesa.de/fileadmin/public/Vertretungsplan/v/<week>/v00000.htm';
const WEEK_DAYS = 'sonntag,montag,dienstag,mittwoch,donnerstag,freitag,samstag'.split(',');
const KNOWN_HEADERS = 'vertreter,fach,stunde,klasse(n),raum,(lehrer),(fach),entfall,vertretungs-text'.split(',');
const KNOWN_MOTD = 'abwesende klassen,abwesende lehrer,betroffene klassen'.split(',');

const main = () => new Promise((resolve, reject) => {
  const now = process.types.get('General').get('Time').now();
  Promise.all([
    parsePage(now),
    parsePage(now.offset(7)),
  ]).then(data => {
    resolve([].concat(...data).filter(a => a));
  }).catch(reject);
});
main.REF = REF;

const parsePage = date => new Promise((resolve, reject) => {
  process.util.getWebpage(main.REF.replace('<week>', process.util.pad(date.getWeek(), 2))).then(page => {
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
  const messages = motdRaw.map(message => message.split(/<td[^>]*>/).splice(1).map(process.util.removeHTML));
  if (!messages.length) return null;
  return messages.map(msg => {
    // Parse a single message
    // ignore 'betroffene klassen' since we can easily calculate that
    // if we have a new field it'll get handled as 'other' and joined by ' => '
    if (msg[0].toLowerCase() === 'betroffene klassen') return null;

    let subtype = 0;
    if (msg[0].toLowerCase() === 'abwesende klassen') subtype = 1;
    else if (msg[0].toLowerCase() === 'abwesende lehrer') subtype = 2;

    return new (process.types.get('Data').get('Stand-in'))({
      uuid: process.types.get('General').get('UUID').new(),
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
    .map(process.util.removeHTML)
    .map(a => a.toLowerCase());
  for (const header of headers.filter(h => !KNOWN_HEADERS.includes(h))) {
    console.error(`unknown header "${header}" on ${targetDate.simplify()}`);
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
      .map(process.util.removeHTML);
    // Map the fields by there header value if they'd ever be switched
    // or a new one added in between
    return new (process.types.get('Data').get('Stand-in'))({
      uuid: process.types.get('General').get('UUID').new(),
      type: 0,
      day: targetDate,
      message: fields[headers.indexOf('vertretungs-text')] || null,
      teacher: fields[headers.indexOf('vertreter')] || null,
      subject: fields[headers.indexOf('fach')] || null,
      lesson: fields[headers.indexOf('stunde')] ? new (process.types.get('General').get('LessonDiscriminator'))(fields[headers.indexOf('stunde')]) : null,
      class: fields[headers.indexOf('klasse(n)')] ? new (process.types.get('General').get('ClassDiscriminator'))(fields[headers.indexOf('klasse(n)')]) : null,
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
    console.log(`HttpToStandIns pulled: ${standins.length}`);
    if (!standins.length) return resolve(false);	// TODO: remove this when the bug @12am is removed? or do we get problems with the IN (``)
    const query = process.sqlPool.query(`SELECT * FROM ${process.config.mysql_readwrite.tables.STANDINS} WHERE \`outdated\` IS NULL AND \`day\` IN (\'${process.util.unDoub(standins.map(i => i.day.simplify())).join('\',\'')}\')`);
	  const removed = new Map();
    query.on('error', reject);
    query.on('result', row => {
	    const parsedRow = new (process.types.get('Data').get('Stand-in'))(row);
	    let buffer;
	    if (buffer = standins.find(m => m.equals(parsedRow, true))) {
	      standins.splice(standins.indexOf(buffer), 1);
	    } else { removed.set(parsedRow.uuid.simplify(), true); }
    });
    query.on('end', () => {
	    console.log(`HttpToStandIns new: ${standins.length} removed: ${removed.size}`);
	    if (!standins.length && !removed.size) return resolve(false);
      Promise.all([].concat(
        Array.from(removed.keys()).map(uuid => process.util.promisifiedQuery(process.sqlPool, `UPDATE ${process.config.mysql_readwrite.tables.STANDINS} SET \`outdated\` = ? WHERE \`uuid\` = ?`, [process.types.get('General').get('Time').now()
          .simplify(), uuid])),
        standins.map(standin => process.util.promisifiedQuery(process.sqlPool, `INSERT INTO ${process.config.mysql_readwrite.tables.STANDINS} SET ?`, [Object.assign(standin.toSQL(), { added: process.types.get('General').get('Time').now()
          .simplify() })]))
      )).then(() => {
        const now = process.types.get('General').get('Time').now()
          .simplify();
        return process.util.promisifiedQuery(process.sqlPool, `INSERT INTO ${process.config.mysql_readwrite.tables.UPDATES} (\`lastUpdate\`, \`category\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`lastUpdate\` = ?`, [now, 'stand-in', now]);
      }).then(() => resolve(true))
        .catch(reject);
	  });
  }).catch(reject);
});
