import React, { useState, useEffect } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import ChatContainer from './components/ChatContainer';
import { ConversationProvider } from './context/ConversationContext';
import { SettingsProvider } from './context/SettingsContext';

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [, setWindowWidth] = useState(window.innerWidth);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  // Load theme from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('settings');
    if (savedSettings) {
      const parsedSettings = JSON.parse(savedSettings);
      setTheme(parsedSettings.theme || 'light');
      document.body.className = parsedSettings.theme || 'light';
    }
    
    // Listen for theme changes via storage event (different tabs)
    const handleStorageChange = () => {
      const updatedSettings = localStorage.getItem('settings');
      if (updatedSettings) {
        const parsedSettings = JSON.parse(updatedSettings);
        setTheme(parsedSettings.theme || 'light');
        document.body.className = parsedSettings.theme || 'light';
      }
    };
    
    // Listen for custom settings change event (same window)
    const handleSettingsChange = (event) => {
      const newSettings = event.detail;
      if (newSettings && newSettings.theme) {
        setTheme(newSettings.theme);
        document.body.className = newSettings.theme;
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('settingsChanged', handleSettingsChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('settingsChanged', handleSettingsChange);
    };
  }, []);

  return (
    <SettingsProvider>
      <ConversationProvider>
        <div className={`app ${theme}`}>
          <div className="aurora-blob" aria-hidden="true" />
          <ChatContainer 
            isSidebarOpen={isSidebarOpen} 
            toggleSidebar={toggleSidebar} 
            showSettings={showSettings}
            toggleSettings={toggleSettings}
          />
          <Sidebar 
            isOpen={isSidebarOpen} 
            toggleSidebar={toggleSidebar} 
            toggleSettings={toggleSettings}
          />
        </div>
      </ConversationProvider>
    </SettingsProvider>
  );
}

export default App;
