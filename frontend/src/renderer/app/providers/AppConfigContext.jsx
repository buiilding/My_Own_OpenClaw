/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';

const AppConfigContext = createContext();

export function useAppConfigContext() {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error('useAppConfigContext must be used within an AppConfigProvider');
  }
  return context;
}

export { AppConfigContext };
