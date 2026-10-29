export function bearerAuthorization(accessToken: string): { Authorization: string } {
  const token = accessToken.trim();
  if (!token) {
    throw new Error("Missing access token.");
  }
  return { Authorization: `Bearer ${token}` };
}

export function isExpiredSessionMessage(message: string): boolean {
  return /session has expired|sign in again/i.test(message);
}
