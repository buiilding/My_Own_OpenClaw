import { useAppConfigContext } from './AppConfigContext';
import { useAppStatusContext } from './AppStatusContext';

export { useAppConfigContext, useAppStatusContext };

export const useAppContext = () => {
  const config = useAppConfigContext();
  const status = useAppStatusContext();

  return {
    ...config,
    saveStatus: status.saveStatus
  };
};
