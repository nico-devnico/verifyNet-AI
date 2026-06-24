import { useEffect } from 'react';
import useStore from '../store';

export const useTheme = () => {
  const { theme, toggleTheme } = useStore();
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  return { theme, toggleTheme, isDark: theme === 'dark' };
};
