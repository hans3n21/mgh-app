// Gemeinsam fuer Widget (Client) und Handler (Server): der Server nimmt nur
// Feedback mit genau dieser Projekt-ID an.
export const POINTOUT_PROJECT_ID = 'mgh-app';
export const POINTOUT_PROJECT_NAME = 'MGH App';

export function feedbackPageName(route: string | null | undefined): string {
  const path = route || '/';
  if (path === '/' || path === '/app') return 'Dashboard';
  if (path.includes('/posteingang')) return 'Posteingang';
  if (path.includes('/orders')) return 'Aufträge';
  if (path.includes('/customers')) return 'Kunden';
  if (path.includes('/prices')) return 'Preise';
  if (path.includes('/procurement')) return 'Beschaffung';
  if (path.includes('/settings')) return 'Einstellungen';
  return path.replace(/^\/(app\/)?/, '').replace(/-/g, ' ');
}
