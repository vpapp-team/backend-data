const PATH = require('path');
const MYSQL = require('mysql');

module.exports = () => {
  const CFG = require(PATH.resolve(__dirname, '../config.json'));

  if (!CFG.mysql_readwrite.hasOwnProperty('connectionLimit')) CFG.mysql_readwrite.connectionLimit = 10;
  if (!CFG.mysql_readwrite.hasOwnProperty('charset')) CFG.mysql_readwrite.charset = 'UTF8MB4_GENERAL_CI';
  if (!CFG.mysql_readwrite.hasOwnProperty('tables')) {
    CFG.mysql_readwrite.tables = {
      CALENDAR: 'CalendarEvents',
      ERRORS: 'Errors',
      FEEDBACK: 'Feedback',
      UPDATES: 'LastUpdate',
      LESSONRANGES: 'LessonRanges',
      MENU: 'Menu',
      STANDINS: 'StandIn',
      TEACHERS: 'Teacher',
      TIMETABLE: 'Timetable',
      ENDPOINTS: 'Endpoints',
      BACKENDS: 'Backends',
      WEBADMINS: 'WebAdmins',
    };
  }
  CFG.sqlPool = MYSQL.createPool(CFG.mysql_readwrite);
  if (!CFG.snowflake.hasOwnProperty('epoche')) CFG.snowflake.epoche = 1515151515151;
  if (!CFG.hasOwnProperty('MAX_TIME_FOR_3_CRASHES')) CFG.MAX_TIME_FOR_3_CRASHES = 5;
  if (!CFG.hasOwnProperty('BROADCAST_DELAY_MIN')) CFG.BROADCAST_DELAY_MIN = 5;

  return CFG;
};
