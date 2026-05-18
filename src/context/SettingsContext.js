import React, { createContext, useState, useEffect } from 'react';

export const SettingsContext = createContext();

// Define default settings as a constant to use for initial state and reset
const DEFAULT_SETTINGS = {
  showTokens: false,
  colorTokens: false,
  showApiDetails: false,
  showRequestJson: false,
  model: 'gpt-4o',
  temperature: 0.7,
  topP: 1,
  maxTokens: 2048,
  frequencyPenalty: 0,
  presencePenalty: 0,
  voice: 'nova',
  systemPrompt: 'You are SparfGPT, a helpful AI assistant.',
  // GPT-5 specific parameters
  reasoningEffort: 'medium'
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => {
    const savedSettings = localStorage.getItem('settings');
    return savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
    
    // Dispatch a custom event when settings change
    // This helps components that need to react to settings changes
    window.dispatchEvent(new CustomEvent('settingsChanged', { detail: settings }));
  }, [settings]);

  const updateSettings = (newSettings) => {
    setSettings({ ...settings, ...newSettings });
  };

  const toggleSetting = (key) => {
    if (key === 'showTokens') {
      // When toggling showTokens, always set colorTokens to match
      setSettings({
        ...settings,
        showTokens: !settings.showTokens,
        colorTokens: !settings.showTokens // Always match colorTokens with showTokens
      });
    } else {
      setSettings({
        ...settings,
        [key]: !settings[key]
      });
    }
  };
  
  // New function to reset all settings to default values
  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        toggleSetting,
        resetSettings
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
