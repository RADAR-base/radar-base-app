import manifest from './app-manifest.json';
import home from './views/home.json';
import profile from './views/profile.json';
import comingSoon from './views/coming-soon.json';
import calendar from './views/calendar.json';
import inboxHistory from './views/secondary/inbox-history.json';
import questionnaire from './views/secondary/questionnaire.json';
import settings from './views/secondary/settings.json';
import notifications from './views/secondary/notifications.json';

export default {
  ...manifest,
  blueprints: {
    'views/home.json': home,
    'views/profile.json': profile,
    'views/coming-soon.json': comingSoon,
    'views/calendar.json': calendar,
    'views/secondary/inbox-history.json': inboxHistory,
    'views/secondary/questionnaire.json': questionnaire,
    'views/secondary/settings.json': settings,
    'views/secondary/notifications.json': notifications,
  },
};
