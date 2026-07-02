import { BypassResult } from './auth-bypass-types';

export function checkBypassToken(token: string): BypassResult | null {
  // Bypasses are disabled in production builds.
  return null;
}
