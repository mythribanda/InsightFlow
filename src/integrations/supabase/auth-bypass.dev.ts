import { BypassResult } from './auth-bypass-types';

export function checkBypassToken(token: string): BypassResult | null {
  if (token === 'mock-access-token') {
    return {
      userId: 'e2e-test-user-id',
      claims: { sub: 'e2e-test-user-id', email: 'insightflow_e2e_test@gmail.com' }
    };
  }
  return null;
}
