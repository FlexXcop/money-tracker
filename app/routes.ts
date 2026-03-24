import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/_index.tsx'),
  route('history', 'routes/history.tsx'),
  route('income', 'routes/income.tsx'),
  route('savings', 'routes/savings.tsx'),
  route('login', 'routes/login.tsx'),
  route('offline', 'routes/offline.tsx'),
  route('api/sync', 'routes/api.sync.tsx'),
] satisfies RouteConfig;
