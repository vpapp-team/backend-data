const PDFJS = require('pdfjs-dist');

const REPLACE_MATCH = /([0-9]+)\)/;
const KLASSEN_REGEXP = /([0-9]{1,2})([a-d])?/;
const DATE_REGEXP = /([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{4})/;

const ROW_COLUMN_TOLERANCE = 6;
const MAX_VERTICAL_OFFSET = 10;

const REGULARITIES = 'both,uneven,even'.split(',');
const STUNDENPLAN_REFS = [
  'http://nig-bederkesa.de/fileadmin/user_upload/PDFs/Stundenplan/Stundenplaene_Klasse_5.pdf',
  'http://nig-bederkesa.de/fileadmin/user_upload/PDFs/Stundenplan/Stundenplaene_Klasse_6.pdf',
  'http://nig-bederkesa.de/fileadmin/user_upload/PDFs/Stundenplan/Stundenplaene_Klasse_7.pdf',
  'http://nig-bederkesa.de/fileadmin/user_upload/PDFs/Stundenplan/Stundenplaene_Klasse_8.pdf',
  'http://nig-bederkesa.de/fileadmin/user_upload/PDFs/Stundenplan/Stundenplaene_Klasse_9.pdf',
  'http://nig-bederkesa.de/fileadmin/user_upload/PDFs/Stundenplan/Stundenplaene_Klasse_10.pdf',
  'http://nig-bederkesa.de/fileadmin/user_upload/PDFs/Stundenplan/Stundenplaene_Jahrgang_11.pdf',
  'http://nig-bederkesa.de/fileadmin/user_upload/PDFs/Stundenplan/Stundenplaene_Jahrgang_12.pdf',
];

/*
 * The main parser function
 */
const parsePage = pageContent => {
  extendItems(pageContent.items);
  const meta = parseMeta(pageContent.items.splice(0, 8));
  const headers = parseHeaders(pageContent.items.splice(0, 5));
  const indexes = parseIndexes(pageContent.items.splice(0, 10));
  const outside = parseOutside(pageContent.items, headers, indexes, meta);
  const fields = parseFields(pageContent.items, headers, indexes);
  const lessons = [].concat(...fields.map(field => parseLesson(field, outside, meta)));
  return new (process.types.get('Data').get('Timetable'))({
    uuid: meta.uuid,
    type: 0,
    master: meta.class,
    activation: meta.activation,
    lessons,
  });
};

/*
 * Adds later used propertys and removes trailing dots from item strings
 */
const extendItems = items => {
  // Extend items with a centerd anchors
  let ind = 0;
  for (const item of items) {
    item.index = ind++;
    item.centerX = item.transform[4] + 0.5 * item.width;
    item.centerY = item.transform[5] + 0.5 * item.height;
    item.str = item.str.replace(/\.$/, '');
  }
};

/*
 * Parse the meta data including activation date and the class
 */
const parseMeta = items => {
  const dateMatch = items[3].str.match(DATE_REGEXP);
  const classMatch = items[6].str.match(KLASSEN_REGEXP);
  return {
    uuid: process.types.get('General').get('UUID').new(),
    class: new (process.types.get('General').get('ClassDiscriminator'))(`${Number(classMatch[1])}${classMatch[2] || ''}`),
    activation: new (process.types.get('General').get('Time'))({
      day: Number(dateMatch[1]),
      month: Number(dateMatch[2]) - 1,
      year: Number(dateMatch[3]),
    }),
  };
};

/*
 * Parse the column ranges from the top row
 */
const parseHeaders = items =>
  // If there's only one border use the same distance as on the other side
  items.map((i, index) => ({
    start: items[index - 1] ?
      (items[index - 1].centerX + items[index].centerX) / 2 :
      items[index].centerX - (items[index + 1].centerX - items[index].centerX) / 2,
    end: items[index + 1] ?
      (items[index + 1].centerX + items[index].centerX) / 2 :
      items[index].centerX + (items[index].centerX - items[index - 1].centerX) / 2,
  }));


/*
 * Parse the row ranges from the left column
 */
const parseIndexes = items =>
  // If there's only one border use the same distance as on the other side
  items.map((i, index) => ({
    start: items[index - 1] ?
      (items[index - 1].centerY + items[index].centerY) / 2 :
      items[index].centerY + (items[index].centerY - items[index + 1].centerY) / 2,
    end: items[index + 1] ?
      (items[index + 1].centerY + items[index].centerY) / 2 :
      items[index].centerY - (items[index - 1].centerY - items[index].centerY) / 2,
  }));


/*
 * Parse the pointers outside the table on the newer timetables
 * for that reson split them and pass them to "parseOutsideTable"
 */
const parseOutside = (items, headers, indexes, meta) => {
  // Get all items ouside
  const rawOutside = items.filter(i => !process.util.betweenNum(i.centerX, headers[0].start, headers[headers.length - 1].end) ||
      !process.util.betweenNum(i.centerY, indexes[0].start, indexes[indexes.length - 1].end));
  // Split the items into the individual tables
  const topRow = rawOutside.map(x => x.centerY).reduce((a, b) => a > b ? a : b, null);
  const numbers = rawOutside.filter(a => a.str.toLowerCase() === 'nr' && process.util.betweenNum(topRow, a.centerY, a.centerY, ROW_COLUMN_TOLERANCE)).sort((a, b) => a.centerX - b.centerX);
  const tables = numbers.map((number, index) => rawOutside.filter(i => process.util.betweenNum(i.centerX, number.transform[4], numbers[index + 1] ? numbers[index + 1].transform[4] : Infinity)));

  // Parse those individual tables
  // give them an object to store the parsed items in
  // handle overlapping numbers with numOverflow
  let numOverflow = 1;
  const parsed = new Map();
  for (let a = 0; a < tables.length; a++) {
    numOverflow = parseOutsideTable(tables[a], numOverflow, topRow, parsed, meta);
  }
  return parsed;
};
const parseOutsideTable = (items, lastNum, topRow, parsed, meta) => {
  // Split header and regular items
  const headers = items.filter(i => process.util.betweenNum(topRow, i.centerY, i.centerY, ROW_COLUMN_TOLERANCE));
  items = items.filter(i => !process.util.betweenNum(topRow, i.centerY, i.centerY, ROW_COLUMN_TOLERANCE));

  // Build the rows the items are in
  const rows = [];
  for (const item of items.map(i => i.centerY)) {
    if (!rows.some(r => process.util.betweenNum(r, item, item, ROW_COLUMN_TOLERANCE))) rows.push(item);
  }
  const rowItems = rows.map(r => items.filter(i => process.util.betweenNum(r, i.centerY, i.centerY, ROW_COLUMN_TOLERANCE)).sort((a, b) => a.centerX - b.centerX));

  for (const row of rowItems) {
    let parsedItem = {
      num: lastNum,
    };
    // For each item in each row, check which time it is and add to parsedItem accordingly
    for (item of row) {
      let itemHead = headers.find(h => process.util.betweenNum(item.centerX, h.transform[4], h.transform[4] + h.width, ROW_COLUMN_TOLERANCE));
      if (!itemHead) { continue; } else if (itemHead.str.toLowerCase() === 'nr') {
        lastNum = parseInt(item.str);
        if (!parsed.has(lastNum)) parsed.set(lastNum, []);
        parsedItem.num = lastNum;
      } else if (itemHead.str.toLowerCase() === 'kla') {
        parsedItem.class = item.str;
      } else if (itemHead.str.toLowerCase() === 'le.,fa.,rm') {
        let parts = item.str.split(',');
        parsedItem.teacher = parts[0] ? parts[0].trim() : null;
        parsedItem.subject = parts[1] ? parts[1].trim() : null;
        parsedItem.room = parts[2] ? parts[2].trim() : null;
      }
      // If theres only a subject copy from the above
      if (!parsedItem.subject && parsedItem.teacher) {
        let numField = parsed.get(lastNum);
        let prev = numField[numField.length - 1];
        if (prev) {
          parsedItem.subject = prev.subject;
          parsedItem.room = prev.room;
        }
      }
    }
    // If certain propertys were set it belongs to the class store it
    if (parsedItem.class &&
      parsedItem.class.includes(meta.class.simplify()) &&
      parsedItem.teacher && parsedItem.subject) {
      parsed.get(lastNum).push(parsedItem);
    }
  }
  return lastNum;
};

/*
 * Parse the single fields
 * multiple for loops are needed to handle vertical split lessons
 * and lessons with multiple heights
 */
const parseFields = (items, headers, indexes) => {
  // Sort the lessons into fields
  // right side = even
  // left side = uneven
  const fields = [];
  for (let day = 0; day < headers.length; day++) {
    for (let lesson = 0; lesson < indexes.length; lesson++) {
      const bounds = {
        lb: headers[day].start,
        rb: headers[day].end,
        tb: indexes[lesson].start,
        bb: indexes[lesson].end,
      };
      const fieldItems = items.filter(item => process.util.betweenNum(item.centerX, bounds.lb, bounds.rb) && process.util.betweenNum(item.centerY, bounds.tb, bounds.bb));
      fields.push({
        day,
        lesson,
        bounds,
        items: fieldItems,
        orientation: null,
        height: 1,
        averageY: buildAverage(fieldItems, 'centerY'),
      });
    }
  }
  // Merge double lessons
  for (const field of fields) {
    if (!field.averageY) continue;
    const offset = field.averageY - (field.bounds.tb + field.bounds.bb) / 2;
    if (offset > MAX_VERTICAL_OFFSET) {
      // Merge with above
      const prevField = fields.find(f => f.day === field.day && f.lesson === field.lesson - 1);
      if (!prevField) throw new Error(`unknown prevField day: ${field.day + 1} lesson: ${field.lesson}`); // Both increased by 1 to make it human readable
      field.averageY = null;

      prevField.height = 2;
      prevField.bounds.bb = field.bounds.bb;
      prevField.items.push(...field.items);
      prevField.averageY = buildAverage(prevField.items, 'centerY');
    } else if (offset < -MAX_VERTICAL_OFFSET) {
      // Merge with below
      const nextField = fields.find(f => f.day === field.day && f.lesson === field.lesson + 1);
      if (!nextField) throw new Error(`unknown nextField day: ${field.day + 1} lesson: ${field.lesson + 2}`); // Both increased by 1 to make it human readable
      nextField.averageY = null;

      field.height = 2;
      field.bounds.bb = nextField.bounds.bb;
      field.items.push(...nextField.items);
      field.averageY = buildAverage(field.items, 'centerY');
    }
  }
  // Find vertically split lessons
  for (const field of fields) {
    if (field.orientation || !field.averageY) continue;
    // Modify this one and add the other to fields
    const middle = (field.bounds.lb + field.bounds.rb) / 2;
    field.items = field.items.sort((a, b) => a.index - b.index);

    if (process.util.betweenNum(field.items[0].centerX, middle, field.bounds.rb)) {
      // Split lesson with at least one right
      if (field.items.some(item => process.util.betweenNum(item.centerX, middle, field.bounds.lb))) {
        // Also has some right
        let leftItems = field.items.filter(item => process.util.betweenNum(item.centerX, field.bounds.lb, middle) && process.util.betweenNum(item.centerY, field.bounds.tb, field.bounds.bb));
        fields.push(Object.assign({}, field, {
          bounds: Object.assign({}, field.bounds, { rb: middle }),
          orientation: 'uneven',
          averageY: buildAverage(leftItems, 'centerY'),
          items: leftItems,
        }));
      }
      field.items = field.items.filter(item => process.util.betweenNum(item.centerX, middle, field.bounds.rb) && process.util.betweenNum(item.centerY, field.bounds.tb, field.bounds.bb));
      field.averageY = buildAverage(field.items, 'centerY');
      field.bounds.lb = middle;
      field.orientation = 'even';
    } else if (!field.items.some(item => process.util.betweenNum(item.centerX, middle, field.bounds.rb))) {
      // Split lesson but only left
      field.bounds.rb = middle;
      field.orientation = 'uneven';
    } else {
      field.orientation = 'both';
    }
  }
  return fields.filter(f => f.averageY && f.orientation && f.items.length);
};

/*
 * Parse a lesson by ether firing "parseNewLessonItem" or "parseOldLessonItem"
 * to map the items into a single or multiple lessons
 */
const parseLesson = (field, outside, meta) => {
  if (outside.size) {
    return parseNewLessonItem(field, outside, meta);
  } else {
    return parseOldLessonItem(field, meta);
  }
};
const parseNewLessonItem = (field, outside, meta) => {
  const replace = field.items.map(i => i.str.match(REPLACE_MATCH)).find(i => i);
  if (replace) {
    const replacer = Number(replace[1]);
    if (!outside.has(replacer)) throw new Error(`unknown replace: "${replace.input}" for class: ${meta.class.simplify()} on day: "${field.day + 1}" hour: "${field.lesson + 1}"`); // Both increased by 1 to make it human readable
    return outside.get(replacer).map(item => new (process.types.get('Data').get('Lesson'))({
      masterUUID: meta.uuid,
      class: meta.class,
      weekday: field.day,
      lesson: `${field.lesson + 1}${field.height !== 1 ? `-${field.lesson + field.height}` : ''}`,
      room: item.room,
      teacher: item.teacher,
      subject: item.subject,
      length: field.height,
      regularity: REGULARITIES.indexOf(field.orientation),
    }));
  } else {
    return [new (process.types.get('Data').get('Lesson'))({
      masterUUID: meta.uuid,
      class: meta.class,
      weekday: field.day,
      lesson: `${field.lesson + 1}${field.height !== 1 ? `-${field.lesson + field.height}` : ''}`,
      room: field.items[2].str || null,
      teacher: field.items[1].str,
      subject: field.items[0].str,
      length: field.height,
      regularity: REGULARITIES.indexOf(field.orientation),
    })];
  }
};
const parseOldLessonItem = (field, meta) => {
  const middle = (field.bounds.lb + field.bounds.rb) / 2;

  // If there's no item at the x-center
  // move all items at are on the right
  // under the items on the left
  let overallDist = Infinity;
  for (const item of field.items) {
    let dist = Math.abs(item.centerX - middle);
    if (dist < overallDist) overallDist = dist;
  }
  if (overallDist > ROW_COLUMN_TOLERANCE) {
    for (const item of field.items.filter(a => a.centerX > middle)) {
      item.centerX -= middle - field.bounds.lb;
      item.centerY += field.bounds.tb - field.bounds.bb;
    }
    field.bounds.rb = middle;
  }

  // Build columns from the x positions
  const columns = [];
  for (const item of field.items) {
    if (!columns.some(i => process.util.betweenNum(item.centerX, i, i, ROW_COLUMN_TOLERANCE))) {
      columns.push(item.centerX);
    }
  }
  const sortedColumns = columns.sort((a, b) => a - b);
  // Build rows from the y position
  const rows = [];
  for (const item of field.items) {
    if (!rows.some(i => process.util.betweenNum(item.centerY, i, i, ROW_COLUMN_TOLERANCE))) {
      rows.push(item.centerY);
    }
  }
  const sortedRows = rows.sort((a, b) => b - a);

  // Parse the content row by row
  const parsed = [];
  for (const row of sortedRows) {
    const items = field.items.filter(item => process.util.betweenNum(item.centerY, row, row, ROW_COLUMN_TOLERANCE));
    if (items.some(i => i.str === 'X')) continue;
    const infos = {
      teacher: null,
      subject: null,
      room: null,
    };
    let buffer;
    if (buffer = items.find(i => process.util.betweenNum(i.centerX, columns[0], columns[0], ROW_COLUMN_TOLERANCE))) infos.subject = buffer.str;
    if (buffer = items.find(i => process.util.betweenNum(i.centerX, columns[1], columns[1], ROW_COLUMN_TOLERANCE))) infos.teacher = buffer.str;
    if (buffer = items.find(i => process.util.betweenNum(i.centerX, columns[2], columns[2], ROW_COLUMN_TOLERANCE))) infos.room = buffer.str;
    if (!infos.subject || !infos.teacher) continue;
    parsed.push(new (process.types.get('Data').get('Lesson'))({
      masterUUID: meta.uuid,
      class: meta.class,
      weekday: field.day,
      lesson: `${field.lesson + 1}${field.height !== 1 ? `-${field.lesson + field.height}` : ''}`,
      room: infos.room,
      teacher: infos.teacher,
      subject: infos.subject,
      length: field.height,
      regularity: REGULARITIES.indexOf(field.orientation),
    }));
  }
  return parsed;
};

/*
 * Builds the average of the property of the items
 */
const buildAverage = (items, property) => {
  const propertys = new Map();
  for (const item of items) {
    if (propertys.has(item[property])) propertys.set(item[property], propertys.get(item[property]) + 1);
    else propertys.set(item[property], 1);
  }
  let average = Array.from(propertys.keys()).map(key => key * propertys.get(key)).reduce((a, b) => a + b, null);
  if (average) average /= items.length;
  return average;
};

/*
 * Resolves a single plan from a url and calls the parser
 */
const resolveStundenplan = ref => new Promise((resolve, reject) => {
  process.util.getWebpage(ref).then(pdfBuffer => PDFJS.getDocument(new Uint8Array(pdfBuffer))).then(pdf => Promise.all(new Array(pdf.numPages).fill(0).map((i, index) => pdf.getPage(index + 1))))
    .then(pages => Promise.all(pages.map(p => p.getTextContent({ disableCombineTextItems: true }))))
    .then(pageContents => {
      resolve(pageContents.map(parsePage));
    })
    .catch(reject);
});

/*
 * Map the class timetables into teacher and room timetables
 */
const buildTeacherTimetables = classTimetables => {
  const teachers = [];
  for (const timetable of classTimetables) {
    for (const lesson of timetable.lessons) {
      if (!teachers.includes(lesson.teacher)) teachers.push(lesson.teacher);
    }
  }
  const timetables = [];
  for (const teacher of teachers) {
    let lessons = [];
    let activation;
    for (const timetable of classTimetables) {
      const toAdd = timetable.lessons.filter(a => a.teacher === teacher);
      if (!toAdd.length) continue;
      if (!activation) {
        activation = timetable.activation;
      } else if (timetable.activation.rawNumber > activation.rawNumber) {
        activation = timetable.activation;
      }
      lessons.push(...toAdd);
    }
    timetables.push(new (process.types.get('Data').get('Timetable'))({
      uuid: process.types.get('General').get('UUID').new(),
      type: 1,
      master: teacher,
      activation: activation,
      lessons,
    }));
  }
  return timetables;
};
const buildRoomTimetables = classTimetables => {
  const rooms = [];
  for (const timetable of classTimetables) {
    for (const lesson of timetable.lessons) {
      if (lesson.room && !rooms.includes(lesson.room)) rooms.push(lesson.room);
    }
  }
  const timetables = [];
  for (const room of rooms) {
    let lessons = [];
    let activation;
    for (const timetable of classTimetables) {
      const toAdd = timetable.lessons.filter(a => a.room === room);
      if (!toAdd.length) continue;
      if (!activation) {
        activation = timetable.activation;
      } else if (timetable.activation.rawNumber > activation.rawNumber) {
        activation = timetable.activation;
      }
      lessons.push(...toAdd);
    }
    timetables.push(new (process.types.get('Data').get('Timetable'))({
      uuid: process.types.get('General').get('UUID').new(),
      type: 2,
      master: room,
      activation: activation,
      lessons,
    }));
  }
  return timetables;
};

/*
 * Parse all main.STUNDENPLAN_REFS and return the parsed Timetable objects
 */
const main = () => new Promise((resolve, reject) => {
  Promise.all(main.STUNDENPLAN_REFS.map(stundenplan => resolveStundenplan(stundenplan))).then(plans => {
    // Build the teacher and room timetables
    let classTimetable = [].concat(...plans);
    let teacherTimetable = buildTeacherTimetables(classTimetable);
    let roomTimetable = buildRoomTimetables(classTimetable);
    // Unnest the single pages and resolve
    return resolve([].concat(classTimetable, teacherTimetable, roomTimetable));
  }).catch(reject);
});

module.exports = main;
main.parseSingleStundenplan = resolveStundenplan;
main.STUNDENPLAN_REFS = STUNDENPLAN_REFS;
main.updateInterval = 12 * 60 * 60 * 1000;
main.update = () => new Promise((resolve, reject) => {
  main().then(parsedTimetables => {
    console.log(`Timetable pulled: ${parsedTimetables.length}`);
    const query = process.sqlPool.query(`SELECT * FROM ${process.config.mysql_readwrite.tables.TIMETABLE} WHERE \`outdated\` IS NULL`, (err, rows) => {
      if (err) return reject(err);
      const databaseTimetables = rows.map(row => new (process.types.get('Data').get('Timetable'))(row));
      const removeDB = [];
      const addDB = [];
      for (const dbTimetable of databaseTimetables) {
        if (!parsedTimetables.some(pTimetable => (pTimetable.type === 0 ? pTimetable.master.simplify() : pTimetable.master) === (dbTimetable.type === 0 ? dbTimetable.master.simplify() : dbTimetable.master))) {
          removeDB.push(dbTimetable.uuid.simplify());
        }
      }
      for (const pTimetable of parsedTimetables) {
        const sameTimetable = databaseTimetables.filter(a => (a.type === 0 ? a.master.simplify() : a.master) === (pTimetable.type === 0 ? pTimetable.master.simplify() : pTimetable.master));
        const isInThere = sameTimetable.find(dbTimetable => dbTimetable.equals(pTimetable, true));

        // Current timetable is the active one
        if (pTimetable.activation.rawNumber <= Math.floor(Date.now() / 24 / 60 / 60 / 1000)) {
          // All other timetables become invalid and this gets pushed to db if not already in there
          sameTimetable
            .filter(a => a !== isInThere)
            .forEach(table => removeDB.push(table.uuid.simplify()));
          if (!isInThere) addDB.push(pTimetable);
        }
        // Current timetable is the one getting active next
        else {
          // Remove all that are active but not our pTimetable
          sameTimetable
            .filter(dbTimetable => dbTimetable.activation.rawNumber > Math.floor(Date.now() / (24 * 60 * 60 * 1000)) && dbTimetable !== isInThere)
            .forEach(table => removeDB.push(table.uuid.simplify()));

          // Get the current active timetable if we have one
          const newest = sameTimetable.find(dbTimetable =>
            !sameTimetable.some(dbTimetable2 =>
              dbTimetable2.activation.rawNumber <= Math.floor(Date.now() / 24 / 60 / 60 / 1000) &&
              dbTimetable2.activation.rawNumber > dbTimetable.activation.rawNumber)
          );
          // If we have a newest timetable remove all that are older
          if (newest) {
            sameTimetable
              .filter(dbTimetable => dbTimetable.activation.rawNumber <= newest.activation.rawNumber && dbTimetable !== newest)
              .forEach(table => removeDB.push(table.uuid.simplify()));
          }
          // Finally, if its not already in the db push it there
          if (!isInThere) addDB.push(pTimetable);
        }
      }
      console.log(`Timetable new: ${addDB.length} removed: ${removeDB.length}`);
	    if (!addDB.length && !removeDB.length) return resolve(false);
      Promise.all([].concat(
        removeDB.map(uuid => process.util.promisifiedQuery(process.sqlPool, `UPDATE ${process.config.mysql_readwrite.tables.TIMETABLE} SET \`outdated\` = ? WHERE \`uuid\` = ?`, [process.types.get('General').get('Time').now()
          .simplify(), uuid])),
        addDB.map(timetable => process.util.promisifiedQuery(process.sqlPool, `INSERT INTO ${process.config.mysql_readwrite.tables.TIMETABLE} SET ?`, [Object.assign(timetable.toSQL(), { added: process.types.get('General').get('Time').now()
          .simplify() })]))
      )).then(() => {
        const now = process.types.get('General').get('Time').now()
          .simplify();
        return process.util.promisifiedQuery(process.sqlPool, `INSERT INTO ${process.config.mysql_readwrite.tables.UPDATES} (\`lastUpdate\`, \`category\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`lastUpdate\` = ?`, [now, 'timetables', now]);
      }).then(() => resolve(true))
        .catch(reject);
    });
  }).catch(reject);
});
