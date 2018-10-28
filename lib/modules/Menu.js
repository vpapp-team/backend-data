const PDFJS = require('pdfjs-dist');

const EVENING_REGEX = /Abends:\s*([^\n]*)\n+/i;
const DATE_REGEX = /[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4}/;

const ROW_TOLERANCE = 3;

const DAYS = 'sonntag,montag,dienstag,mittwoch,donnerstag,freitag,samstag'.split(',');
const REF = 'http://nig-bederkesa.de/fileadmin/public/Speiseplan/Speiseplan.pdf';

const LOGGER = new (require('backend-logger'))().is.DATA();
const CONFIG = require('../cfgLoader.js');
const TYPES = require('backend-types');
const UTIL = require('backend-util');

const parsePage = page => new Promise((resolve, reject) => {
  page.getTextContent({ disableCombineTextItems: true }).then(content => {
    // Sort content by y position
    const rows = [];
    for (const item of content.items) {
      // Ignore height since that's broken for whatever reason
      item.centerY = item.transform[5];
      if (!rows.some(i => item.centerY.betweenNum(i, i, ROW_TOLERANCE))) {
        rows.push(item.centerY);
      }
    }
    const sortedRows = rows.sort((a, b) => b - a);
    const filledRows = sortedRows.map(a =>
      content.items
        .filter(i => i.centerY.betweenNum(a, a, ROW_TOLERANCE))
        .map(r => r.str)
        .join('')
        .trim()
    );

    // Get date of first mentioned day
    const startDateRaw = filledRows.join('\n').match(DATE_REGEX)[0].split('.');
    let startDate = new (TYPES.get('General').get('Time'))({
      hasTime: false,
      day: Number(startDateRaw[0]),
      month: Number(startDateRaw[1]) - 1,
      year: Number(startDateRaw[2]),
    });

    // Split at beginning of day and parse by linebreaks
    const days = filledRows.join('\n').trim().split('\n*')
      .splice(1);
    const firstDay = DAYS.indexOf(days[0].split('*')[0].trim().toLowerCase());
    if (new Date(startDate.toUnix()).getDay() !== firstDay) {
      startDate = startDate.offset(-((new Date(startDate.toUnix()).getDay() + 7 - firstDay) % 7));
    }
    const done = [];
    days.forEach(item => {
      // Calculate the offset from the first day
      const thisDay = DAYS.indexOf(item.split('*')[0].trim().toLowerCase());
      let offsetDays = thisDay - firstDay;
      if (offsetDays < 0) offsetDays += 7;

      const parsed = parseItem(item);
      if (!parsed.default) return;
      done.push(new (TYPES.get('Data').get('Menu'))({
        uuid: TYPES.get('General').get('UUID').new(),
        day: startDate.offset(offsetDays),
        default: parsed.default,
        vegetarian: parsed.vegetarian,
        desert: parsed.dessert,
        evening: parsed.evening,
      }));
    });
    resolve(done);
  }).catch(reject);
});

const parseItem = rawString => {
  let evening = null;
  const strings = rawString.replace(EVENING_REGEX, match => {
    evening = match.match(EVENING_REGEX)[1].trim() || null;
    return '';
  }).trim().split('\n');
  return {
    day: strings[0].replace(/ \*/, ''),
    default: strings[1] || null,
    vegetarian: strings[2] || null,
    dessert: strings[3] || null,
    evening,
  };
};

const main = () => new Promise((resolve, reject) => {
  UTIL.getWebpage(main.REF)
    .then(pdfBuffer => PDFJS.getDocument(new Uint8Array(pdfBuffer)))
    .then(pdf => Promise.all(new Array(pdf.numPages).fill(0).map((i, index) => pdf.getPage(index + 1))))
    .then(pages => Promise.all(pages.map(parsePage)))
    .then(content => {
      resolve([].concat(...content));
    })
    .catch(reject);
});

module.exports = main;
main.REF = REF;
main.updateInterval = 12 * 60 * 60 * 1000;
main.update = () => new Promise((resolve, reject) => {
  main().then(menus => {
    LOGGER.log(`Menu pulled: ${menus.length}`);
    const query = CONFIG.sqlPool.query(`SELECT * FROM ${CONFIG.mysql_readwrite.tables.MENU} WHERE \`outdated\` IS NULL`); // eslint-disable-line max-len
    const removed = new Map();
    query.on('error', reject);
    query.on('result', row => {
      const parsedRow = new (TYPES.get('Data').get('Menu'))(row);
      let buffer = menus.find(m => m.equals(parsedRow, true));
      if (buffer) {
        menus.splice(menus.indexOf(buffer), 1);
      } else { removed.set(parsedRow.uuid.simplify(), true); }
    });
    return query.on('end', () => {
      LOGGER.log(`Menu new: ${menus.length} removed: ${removed.size}`);
      if (!menus.length && !removed.size) return resolve(false);
      return Promise.all([].concat(
        Array.from(removed.keys())
          .map(uuid => UTIL.promisifiedQuery(CONFIG.sqlPool, `UPDATE ${CONFIG.mysql_readwrite.tables.MENU} SET \`outdated\` = ? WHERE \`uuid\` = ?`, [TYPES.get('General').get('Time').simpleNow(), uuid])), // eslint-disable-line max-len
        menus.map(menu => UTIL.promisifiedQuery(CONFIG.sqlPool, `INSERT INTO ${CONFIG.mysql_readwrite.tables.MENU} SET ?`, [Object.assign(menu.toSQL(), { added: TYPES.get('General').get('Time').simpleNow() })])) // eslint-disable-line max-len
      )).then(() => {
        const now = TYPES.get('General').get('Time').simpleNow();
        return UTIL.promisifiedQuery(CONFIG.sqlPool, `INSERT INTO ${CONFIG.mysql_readwrite.tables.UPDATES} (\`lastUpdate\`, \`category\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`lastUpdate\` = ?`, [now, 'menu', now]); // eslint-disable-line max-len
      }).then(() => resolve(true))
        .catch(reject);
    });
  }).catch(reject);
});
