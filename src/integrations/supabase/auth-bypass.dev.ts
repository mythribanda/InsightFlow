export function checkBypassToken(token: string) {
  if (token === 'mock-access-token') {
    return {
      userId: 'e2e-test-user-id',
      claims: { sub: 'e2e-test-user-id', email: 'insightflow_e2e_test@gmail.com' }
    };
  }
  return null;
}
