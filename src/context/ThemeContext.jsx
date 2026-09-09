import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

// 1. Create the context
const ThemeContext = createContext(undefined);

// 2. The Provider Component
export function ThemeProvider({ children }) {
  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('snorlax-theme');
      // Keep first-time visitors in the light theme. A visitor's OS theme
      // should not silently override the app's own default.
      return saved !== null ? JSON.parse(saved) : false;
    }
    return false;
  });

  // Spectral mode state
  const [isSpectralMode, setIsSpectralMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('snorlax-spectral');
      return saved !== null ? JSON.parse(saved) : false;
    }
    return false;
  });

  // Sync Dark mode
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    localStorage.setItem('snorlax-theme', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // Sync Spectral mode
  useEffect(() => {
    localStorage.setItem('snorlax-spectral', JSON.stringify(isSpectralMode));
  }, [isSpectralMode]);

  const toggleTheme = useCallback(() => {
    setIsDarkMode(prev => {
      const next = !prev;
      if (!next) {
        // Turning OFF dark mode: store current spectral state and turn it off
        localStorage.setItem('snorlax-spectral-last', JSON.stringify(isSpectralMode));
        setIsSpectralMode(false);
      } else {
        // Turning ON dark mode: restore last known spectral state
        const lastSpectral = localStorage.getItem('snorlax-spectral-last');
        setIsSpectralMode(lastSpectral !== null ? JSON.parse(lastSpectral) : true);
      }
      return next;
    });
  }, [isSpectralMode]);

  const toggleSpectralMode = useCallback(() => {
    if (!isDarkMode) return; // Prevent turning on spectral mode in light mode
    setIsSpectralMode(prev => !prev);
  }, [isDarkMode]);

  // Memoize the value
  const value = useMemo(() => ({
    isDarkMode,
    toggleTheme,
    isSpectralMode,
    toggleSpectralMode
  }), [isDarkMode, isSpectralMode, toggleTheme, toggleSpectralMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// 3. Custom Hook
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
