/**
 * Values the shell owns at runtime and passes into a hosted remote.
 * This is a props boundary. Do not replace it with a shared React context.
 */
export type DisplayCurrency = 'EUR';

export interface ActiveUser {
  id: string;
  name: string;
}

export interface RemoteAppProps {
  displayCurrency: DisplayCurrency;
  activeUser: ActiveUser;
}
