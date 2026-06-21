import { createContext, useContext } from 'react';

export const AppStatusContext = createContext();

export function useAppStatusContext() {
  const context = useContext(AppStatusContext);
  if (!context) {
    throw new Error('useAppStatusContext must be used within an AppStatusProvider');
  }
  return context;
}
