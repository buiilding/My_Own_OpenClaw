import { ApiClient } from '../../infrastructure/api/client';

export const DesktopBackendCommandRuntimeClient = {
  compactHistory(force: boolean = true, conversationRef: string | null = null): void {
    ApiClient.compactHistory(force, conversationRef);
  },
};
