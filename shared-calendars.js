// shared-calendars.js
// ────────────────────────────────────────────────────────────
// Define your family calendar URLs ONCE here. Both the home
// dashboard and the work dashboard can import this file so you
// never have to paste the URLs in two places.
//
// Each person can have one or more .ics URLs (comma-separated in
// `raw`, or listed in the `urls` array — both are supported).
// ────────────────────────────────────────────────────────────

window.SHARED_CALENDARS = [
  {
    label: 'Family',
    color: '#2e9e5b',
    urls: [
      'https://p28-caldav.icloud.com/published/2/MTU4NDAxMjYzMTU4NDAxMmVeW3xPa8ZLAQAQSla4x-Y_oxrvj7OUL6doLu0XVM5LffLtbHb-juvfbtRPh3Uf4cGgMbJj2TKJC8QxUlJsCC0',
    ],
  },
  {
    label: 'Finn',
    color: '#3b82f6',
    urls: [
      'https://p118-caldav.icloud.com/published/2/MTU4NDAxMjYzMTU4NDAxMmVeW3xPa8ZLAQAQSla4x-YpLuyKf2fp0YCpAEexxO6hIaxyr9GvUf4GYyt-QDryidhoqM4ZgM3TYe3nQBn4EJU',
      'https://www.gomotionapp.com/rest/ics/system/5/Events.ics?key=m1%2FTYjpXm54ufZNPynZ94Q%3D%3D&enabled=false&tz=America%2FChicago',
    ],
  },
  {
    label: 'Millie',
    color: '#ec4899',
    urls: [
      'https://ical.sportsengine.com/v3/calendar/ical?team_ids=11f120c7-6715-b03e-9571-92d13fd9be2b&v=1775395850915',
      'https://p118-caldav.icloud.com/published/2/MTU4NDAxMjYzMTU4NDAxMmVeW3xPa8ZLAQAQSla4x-ZDIY3sF_WNgNC_fNUwSPBTg6eYMaE7OWrf77WWhn061RyX0RKXPnnUh_qRFoDfF5I',
    ],
  },
  {
    label: 'Nolan',
    color: '#eab308',
    urls: [
      'https://ical.sportsengine.com/v3/calendar/ical?team_ids=11f12aaf-7ff7-d162-9387-b24078612aeb&v=1774796141241',
      'https://p118-caldav.icloud.com/published/2/MTU4NDAxMjYzMTU4NDAxMmVeW3xPa8ZLAQAQSla4x-ZEIHTZTHF1m31gnMOQWBL9lLZ9XTQ8SM0ZiX97pr9dcfu_4DsjxwSoHjBTRSFRwDA',
    ],
  },
];
