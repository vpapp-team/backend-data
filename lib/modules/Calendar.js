const RRULE = require('rrule');
const ICAL = require('ical.js');

const LOGGER = new (require('backend-logger'))().is.DATA();
const CONFIG = require('../cfgLoader.js')();
const TYPES = require('backend-types');
const UTIL = require('backend-util');

const main = (calendarResolvable, _masterUUID, username, pw, uuidFormater) => new Promise((resolve, reject) => {
  if (!_masterUUID || typeof _masterUUID !== 'string') throw new TypeError('_masterUUID not a valid string');
  UTIL.getWebpage(calendarResolvable, username || pw ? {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${pw}`, 'binary').toString('base64')}`,
    },
  } : undefined).then(data => {
    if (data.toString().toLowerCase() === 'invalid response from sessauthd!') {
      return reject(new Error(`invalid username/password for calendar "${calendarResolvable}"`));
    }
    return resolve(parseCalendar(data, _masterUUID, uuidFormater));
  }).catch(reject);
});

const parseCalendar = (data, _masterUUID, uuidFormater) => {
  const jCalData = ICAL.parse(data.toString().replace(/\r/g, ''));
  const comp = new ICAL.Component(jCalData);

  comp.getAllSubcomponents('vtimezone').forEach(vtimezone => {
    const timezone = new ICAL.Timezone(vtimezone);
    ICAL.TimezoneService.register(timezone.tzid, timezone);
  });

  const vevents = comp.getAllSubcomponents('vevent');
  return vevents.map(vevent => {
    const event = new ICAL.Event(vevent);
    let start = event.startDate.convertToZone(ICAL.Timezone.utcTimezone);
    let end = event.endDate.convertToZone(ICAL.Timezone.utcTimezone);
    const recurrence = parseRecurrence(vevent, event, start);
    return new (TYPES.get('Data').get('CalendarEvent'))({
      _masterUUID,
      // 86400 = 60 * 60 * 24
      start: `D${start._time.isDate ? start.toUnixTime() / 86400 : `T${start.toUnixTime() * 1000}`}`,
      end: `D${end._time.isDate ? end.toUnixTime() / 86400 : `T${end.toUnixTime() * 1000}`}`,
      uuid: formatUUID(event.uid, uuidFormater),
      summary: event.summary,
      description: event.description || null,
      location: event.location || null,
      isRecurring: recurrence.isRecurring,
      humanRecurring: recurrence.isRecurring ? recurrence.humanRecurring : null,
      _recurrenceRule: recurrence.isRecurring ? recurrence._recurrenceRule : null,
      _noMore: recurrence.isRecurring ? recurrence._noMore : null,
    });
  });
};

const formatUUID = (uid, uuidFormater) => {
  // Format if formatter is provided
  if (uuidFormater) uid = uid.replace(new RegExp(uuidFormater.regex, uuidFormater.flags), uuidFormater.replacement);
  // Remove all invalid TYPES/UUID characters
  return uid.replace(/[^a-z0-9.\-_+@]/ig, '');
};

const parseRecurrence = (vevent, event, start) => {
  if (!event.isRecurrenceException() && !event.isRecurring()) return { isRecurring: false };
  const rawRecurrence = vevent.toString().replace(/\r/g, '')
    .match(/(^RRULE|^RDATE|^EXRULE|^EXDATE)[\s\S]+?(?=\n[^\s])/gm);
  const recurrence = rawRecurrence.map(line => {
    if (!(line.startsWith('RRULE') || line.startsWith('EXRULE'))) return line;
    if (line.includes('DTSTART')) return line;
    return `${line};DTSTART=${start.toICALString()}`;
  });
  const RuleSet = RRULE.rrulestr(recurrence.join('\n'), { forceset: true });
  let human = [];
  if (RuleSet._rrule.length) human.push(`rrule: ${RuleSet._rrule.map(a => a.toText()).join(', ')}`);
  if (RuleSet._rdate.length) human.push(`rdate: ${RuleSet._rdate.map(a => a.toGMTString()).join(', ')}`);
  if (RuleSet._exrule.length) human.push(`exrule: ${RuleSet._exrule.map(a => a.toText()).join(', ')}`);
  if (RuleSet._exdate.length) human.push(`exdate: ${RuleSet._exdate.map(a => a.toGMTString()).join(', ')}`);
  return {
    isRecurring: true,
    humanRecurring: human.join('\n'),
    _recurrenceRule: RuleSet.valueOf().join('\n'),
    _noMore: !RuleSet.after(new Date()),
  };
};

module.exports = main;
main.updateInterval = 12 * 60 * 60 * 1000;
main.update = calendarRefs => new Promise((resolve, reject) => {
  Promise.all(calendarRefs
    .map(calendarRef => main(calendarRef.ref,
      calendarRef.uuid,
      calendarRef.username,
      calendarRef.password,
      calendarRef.uuidFormater)))
    .then(calendars => Promise.all(calendars.map((events, index) => syncCalendar(events, calendarRefs[index].uuid))))
    .then(resp => resolve(resp.some(a => a)))
    .catch(reject);
});

const syncCalendar = (events, _masterUUID) => new Promise((resolve, reject) => {
  LOGGER.log(`CalendarEvent _masterUUID: "${_masterUUID}" pulled: ${events.length}`);
  const removed = new Map();
  const query = CONFIG.sqlPool.query(`SELECT * FROM ${CONFIG.mysql_readwrite.tables.CALENDAR} WHERE \`_masterUUID\` = ? AND \`outdated\` IS NULL`, [events[0]._masterUUID]); // eslint-disable-line max-len
  query.on('error', reject);
  query.on('result', row => {
    const parsedRow = new (TYPES.get('Data').get('CalendarEvent'))(row);
    let buffer = events.find(m => m.equals(parsedRow, true));
    if (buffer) {
      events.splice(events.indexOf(buffer), 1);
    } else { removed.set(parsedRow.uuid.simplify(), true); }
  });
  query.on('end', () => {
    LOGGER.log(`CalendarEvent _masterUUID: "${_masterUUID}" new: ${events.length} removed: ${removed.size}`);
    if (!events.length && !removed.size) return resolve(false);
    return Promise.all([].concat(
      Array.from(removed.keys())
        .map(uuid => UTIL.promisifiedQuery(CONFIG.sqlPool, `UPDATE ${CONFIG.mysql_readwrite.tables.CALENDAR} SET \`outdated\` = ? WHERE \`uuid\` = ? AND \`_masterUUID\` = ?`, [TYPES.get('General').get('Time').simpleNow(), uuid, _masterUUID])), // eslint-disable-line max-len
      events.map(event => UTIL.promisifiedQuery(CONFIG.sqlPool, `INSERT INTO ${CONFIG.mysql_readwrite.tables.CALENDAR} SET ?`, [Object.assign(event.toSQL(), { added: TYPES.get('General').get('Time').simpleNow() })])) // eslint-disable-line max-len
    )).then(() => {
      const now = TYPES.get('General').get('Time').simpleNow();
      return UTIL.promisifiedQuery(CONFIG.sqlPool, `INSERT INTO ${CONFIG.mysql_readwrite.tables.UPDATES} (\`lastUpdate\`, \`category\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`lastUpdate\` = ?`, [now, 'calendar', now]); // eslint-disable-line max-len
    }).then(() => resolve(true))
      .catch(reject);
  });
});
