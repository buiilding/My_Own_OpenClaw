/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';

const AppStatusContext = createContext();

export function useAppStatusContext() {
  const context = useContext(AppStatusContext);
  if (!context) {
    throw new Error('useAppStatusContext must be used within an AppStatusProvider');
  }
  return context;
}

export { AppStatusContext };
