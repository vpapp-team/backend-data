# backend-data

[![Greenkeeper badge](https://badges.greenkeeper.io/vpapp-team/backend-data.svg)](https://greenkeeper.io/)

# Config
| property | type | default | optional | description |
| --- | --- | --- | --- | --- |
| mysql_readwrite | object | / | false | readonly connection to mysql db |
| mysql_readwrite.connectionLimit | number | 10 | true | max simultaneous connections |
| mysql_readwrite.charset | string | `UTF8MB4_GENERAL_CI` | true | charset of the connection |
| mysql_readwrite.tables | object | `{...}` | true | table name mappings |
| mysql_readwrite.tables.CALENDAR | string | `CalendarEvents` | true | CALENDAR mapping |
| mysql_readwrite.tables.ERRORS | string | `Errors` | true | ERRORS mapping |
| mysql_readwrite.tables.FEEDBACK | string | `Feedback` | true | FEEDBACK mapping |
| mysql_readwrite.tables.UPDATES | string | `LastUpdate` | true | UPDATES mapping |
| mysql_readwrite.tables.LESSONRANGES | string | `LessonRanges` | true | LESSONRANGES mapping |
| mysql_readwrite.tables.MENU | string | `Menu` | true | MENU mapping |
| mysql_readwrite.tables.STANDINS | string | `StandIn` | true | STANDINS mapping |
| mysql_readwrite.tables.TEACHERS | string | `Teacher` | true | TEACHERS mapping |
| mysql_readwrite.tables.TIMETABLE | string | `Timetable` | true | TIMETABLE mapping |
| mysql_readwrite.tables.VERSIONS | string | `Versions` | true | VERSIONS mapping |
| mysql_readwrite.tables.BACKENDS | string | `Backends` | true | BACKENDS mapping |
| mysql_readwrite.tables.WEBADMINS | string | `WebAdmins` | true | WEBADMINS mapping |
| mysql_readwrite.hostname | string | / | false | the mysql host domain/ip |
| mysql_readwrite.port | number | `3306` | true | the mysql host port |
| mysql_readwrite.user | string | / | false | mysql user name |
| mysql_readwrite.password | string | / | false | mysql password |
| mysql_readwrite.database | string | / | false | mysql db name |
| snowflake.epoche | number | `1515151515151` | true | time to offset snowflake timestamps |
| snowflake.datacenter | number | / | false | datacenter id, min 0, max 15 |
| snowflake.hostname | string | / | false | host name for this server, used when creating UUID'S |
| MODULES | object | {} | false | module specific config data - [click for more info](#moduleconfig) |
| MAX_TIME_FOR_3_CRASHES | number | 5 | true | how long 3 crashes are allowed to be apart, else the module gets disabled |
| BROADCAST_DELAY_MIN | number | 5 | true | time to delay broadcasts to wait for other modules to finish |

# ModuleConfig:
> ## Calendar
> a array of objects with the following properties
>
> | name | type | optional | description |
> | --- | --- | --- | --- | --- |
> | uuid | string | false | the calendar uuid to use for this calendar |
> | ref | string | false | a web link to the calendar |
> | uuidFormater | object | true | a regex to modify the ical uuids to match the [backend-types#uuid spec](https://github.com/vpapp-team/backend-types/blob/master/README.md#uuid) |
> | uuidFormater.regex | string | true | the regex to search for |
> | uuidFormater.flags | string | true | flags to use with the regex |
> | uuidFormater.replacement | string | true | string to replace matching items with |
> | username | string | true | a username if required for the ical |
> | password | string | true | a password if required for the ical |
> ## HttpToStandIns
> none
> ## Menu
> none
> ## Timetable
> none
