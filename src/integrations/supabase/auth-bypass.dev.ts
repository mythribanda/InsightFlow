import { BypassResult } from './auth-bypass-types';

export function checkBypassToken(token: string): BypassResult | null {
  if (token === 'mock-access-token') {
    return {
      userId: 'cebe4295-cbcf-4bf2-9d13-c0e51bbfdb8c',
      claims: { sub: 'cebe4295-cbcf-4bf2-9d13-c0e51bbfdb8c', email: 'insightflow_e2e_test@gmail.com' }
    };
  }
  return null;
}
