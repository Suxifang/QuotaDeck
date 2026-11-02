export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public expose = true,
  ) {
    super(message);
  }
}
export const unauthorized = () =>
  new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
export const forbidden = () =>
  new AppError(403, 'GROUP_NOT_AUTHORIZED', 'Group is not available');
