const ICAL = require('ical.js');
const RRULE = require('rrule');

const main = (calendarResolvable, _masterUUID, username, pw, uuidFormater) => new Promise((resolve, reject) => {
  if (!_masterUUID || typeof _masterUUID !== 'string') throw new TypeError('_masterUUID not a valid string');
  process.util.getWebpage(calendarResolvable, username || pw ? {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${pw}`, 'binary').toString('base64')}`,
    },
  } : undefined).then(data => resolve(parseCalendar(data, _masterUUID, uuidFormater))).catch(reject);
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
    const recurrence = parseRecurrence(vevent, event);
    return new (process.types.get('Data').get('CalendarEvent'))({
      _masterUUID,
      // 86400 = 60 * 60 * 24
      start: new (process.types.get('General').get('Time'))(`D${start._time.isDate ? '' : 'T'}${start._time.isDate ? start.toUnixTime() / 86400 : start.toUnixTime() * 1000}`),
      end: new (process.types.get('General').get('Time'))(`D${end._time.isDate ? '' : 'T'}${end._time.isDate ? end.toUnixTime() / 86400 : end.toUnixTime() * 1000}`),
      uuid: uuidFormater ? uuidFormater(event.uid) : event.uid,
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

const parseRecurrence = (vevent, event) => {
  if (!event.isRecurrenceException() && !event.isRecurring()) return { isRecurring: false };
  const rawRecurrence = vevent.toString().replace(/\r/g, '').match(/(^RRULE|^RDATE|^EXRULE|^EXDATE)[\s\S]+?(?=\n[^\s])/gm);
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
main.update = () => new Promise((resolve, reject) => {
  Promise.all(process.config.calendars.map(calendar => main(calendar.ref, calendar.uuid, calendar.username, calendar.password, calendar.uuidFormater))).then(calendars => Promise.all(calendars.map((events, index) => syncCalendar(events, process.config.calendars[index].uuid)))).then(resp => resolve(resp.some(a => a)))
    .catch(reject);
});

const syncCalendar = (events, _masterUUID) => new Promise((resolve, reject) => {
  console.log(`CalendarEvent _masterUUID: "${_masterUUID}" pulled: ${events.length}`);
  const removed = new Map();
  const query = process.sqlPool.query(`SELECT * FROM ${process.config.mysql_readwrite.tables.CALENDAR} WHERE \`_masterUUID\` = ? AND \`outdated\` IS NULL`, [events[0]._masterUUID]);
  query.on('error', reject);
  query.on('result', row => {
    const parsedRow = new (process.types.get('Data').get('CalendarEvent'))(row);
    let buffer;
    if (buffer = events.find(m => m.equals(parsedRow, true))) {
      events.splice(events.indexOf(buffer), 1);
    } else { removed.set(parsedRow.uuid.simplify(), true); }
  });
  query.on('end', () => {
    console.log(`CalendarEvent _masterUUID: "${_masterUUID}" new: ${events.length} removed: ${removed.size}`);
    if (!events.length && !removed.size) return resolve(false);
    Promise.all([].concat(
      Array.from(removed.keys()).map(uuid => process.util.promisifiedQuery(process.sqlPool, `UPDATE ${process.config.mysql_readwrite.tables.CALENDAR} SET \`outdated\` = ? WHERE \`uuid\` = ? AND \`_masterUUID\` = ?`, [process.types.get('General').get('Time').now()
        .simplify(), uuid, _masterUUID])),
      events.map(event => process.util.promisifiedQuery(process.sqlPool, `INSERT INTO ${process.config.mysql_readwrite.tables.CALENDAR} SET ?`, [Object.assign(event.toSQL(), { added: process.types.get('General').get('Time').now()
        .simplify() })]))
    )).then(() => {
      const now = process.types.get('General').get('Time').now()
        .simplify();
      return process.util.promisifiedQuery(process.sqlPool, `INSERT INTO ${process.config.mysql_readwrite.tables.UPDATES} (\`lastUpdate\`, \`category\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`lastUpdate\` = ?`, [now, 'calendar', now]);
    }).then(() => resolve(true))
      .catch(reject);
  });
});
