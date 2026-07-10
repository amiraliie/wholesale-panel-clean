// Browser-side direct 3x-ui access is intentionally disabled.
// 3x-ui credentials and session cookies must stay on the backend.
export class ThreeXUIApiClient {
  constructor() {
    throw new Error('Direct 3x-ui calls from frontend are disabled. Use /api/servers, /api/inbounds and /api/orders.');
  }
}
export type ThreeXUIClient = unknown;
