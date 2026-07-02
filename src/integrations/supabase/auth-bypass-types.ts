export interface BypassResult {
  userId: string;
  claims: {
    sub: string;
    email: string;
    [key: string]: any;
  };
}
