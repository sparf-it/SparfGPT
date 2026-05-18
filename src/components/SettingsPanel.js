import React, { useContext, useState, useEffect, useRef } from 'react';
import { SettingsContext } from '../context/SettingsContext';
import { useConversation } from '../context/ConversationContext';
import { setApiKey, generateTextToSpeech } from '../services/api';
import { MODEL_MAP, MODEL_DESCRIPTIONS } from '../constants/models';
import './SettingsPanel.css';
import { FiX, FiVolume2, FiRefreshCw } from 'react-icons/fi';

const SettingsPanel = ({ onClose }) => {
  const { settings, updateSettings, toggleSetting, resetSettings } = useContext(SettingsContext);
  const { deleteAllConversations } = useConversation();
  const panelRef = useRef(null);
  
  
  // Close settings when clicking outside the panel
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const [hoveredModel, setHoveredModel] = useState(null);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [apiKeySaveStatus, setApiKeySaveStatus] = useState(null); // 'success', 'error', or null
  const [currentApiKey, setCurrentApiKey] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteChatsConfirm, setShowDeleteChatsConfirm] = useState(false);
  
  const handleToggle = (setting) => {
    toggleSetting(setting);
  };
  
  const handleToggleApiDetails = () => {
    const newValue = !settings.showRequestJson;
    updateSettings({ 
      showRequestJson: newValue,
      showApiDetails: newValue 
    });
  };
  
  const handleModelChange = (e) => {
    const newModel = e.target.value;
    if (newModel === 'gpt-5-nano') {
      updateSettings({ model: newModel, reasoningEffort: 'medium' });
    } else {
      updateSettings({ model: newModel });
    }
    setHoveredModel(null);
  };
  
  const handleTemperatureChange = (e) => {
    updateSettings({ temperature: parseFloat(e.target.value) });
  };
  
  const handleTopPChange = (e) => {
    updateSettings({ topP: parseFloat(e.target.value) });
  };
  
  const handleFrequencyPenaltyChange = (e) => {
    updateSettings({ frequencyPenalty: parseFloat(e.target.value) });
  };
  
  const handlePresencePenaltyChange = (e) => {
    updateSettings({ presencePenalty: parseFloat(e.target.value) });
  };
  
  const handleMaxTokensChange = (e) => {
    updateSettings({ maxTokens: parseInt(e.target.value) });
  };
  
  const handleSystemPromptChange = (e) => {
    updateSettings({ systemPrompt: e.target.value });
  };
  
  const handleVoiceChange = (e) => {
    updateSettings({ voice: e.target.value });
  };
  
  const handleReasoningEffortChange = (e) => {
    updateSettings({ reasoningEffort: e.target.value });
  };
  
  // Test the selected voice
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState(null);
  
  const handleTestVoice = async () => {
    setIsTesting(true);
    setTestError(null);
    
    try {
      console.log('Testing voice:', settings.voice);
      // Generate a short audio sample
      const testText = "This is a test of the text-to-speech feature with the selected voice.";
      const audioBlob = await generateTextToSpeech(testText, settings.voice);
      
      console.log('Audio blob received for test:', audioBlob);
      
      // Create and play the audio
      const audio = new Audio(URL.createObjectURL(audioBlob));
      
      // Set up event listeners for debugging
      audio.addEventListener('canplaythrough', () => {
        console.log('Test audio can play through');
      });
      
      audio.addEventListener('play', () => {
        console.log('Test audio started playing');
      });
      
      audio.addEventListener('ended', () => {
        console.log('Test audio playback ended');
      });
      
      audio.addEventListener('error', (e) => {
        console.error('Test audio error:', e, audio.error);
        setTestError('Audio playback error: ' + (audio.error ? audio.error.message : 'Unknown error'));
      });
      
      // Play the audio
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Test audio playing successfully');
          })
          .catch(e => {
            console.error('Test audio play error:', e);
            setTestError('Failed to play audio: ' + e.message);
          });
      }
    } catch (error) {
      console.error('Error testing voice:', error);
      setTestError(error.message);
    } finally {
      setIsTesting(false);
    }
  };
  
  const handleApiKeySubmit = (e) => {
    e.preventDefault();
    
    // Reset status
    setApiKeySaveStatus(null);
    
    if (!openaiApiKey) {
      return;
    }
    
    // Basic validation - API keys typically start with 'sk-' and are longer than 20 chars
    if (!openaiApiKey.startsWith('sk-') || openaiApiKey.length < 20) {
      setApiKeySaveStatus('error');
      return;
    }
    
    try {
      const success = setApiKey(openaiApiKey);
      
      if (success) {
        setOpenaiApiKey('');
        setApiKeySaveStatus('success');
        
        // Dispatch a custom event to notify other components
        window.dispatchEvent(new CustomEvent('apiKeyChanged'));
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setApiKeySaveStatus(null);
        }, 3000);
      } else {
        setApiKeySaveStatus('error');
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      setApiKeySaveStatus('error');
    }
  };
  
  // Check if API key is set
  useEffect(() => {
    const checkApiKey = () => {
      const apiKey = localStorage.getItem('openai_api_key');
      if (apiKey && apiKey.startsWith('sk-')) {
        // Show a masked version of the API key (first 4 chars and last 4 chars)
        const maskedKey = `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
        setCurrentApiKey(maskedKey);
      } else {
        setCurrentApiKey(null);
      }
    };
    
    checkApiKey();
    
    // Listen for API key changes
    const handleApiKeyChanged = () => checkApiKey();
    window.addEventListener('apiKeyChanged', handleApiKeyChanged);
    
    return () => {
      window.removeEventListener('apiKeyChanged', handleApiKeyChanged);
    };
  }, []);
  
  // Handle data deletion
  const handleDeleteAllData = async () => {
    if (showDeleteConfirm) {
      try {
        // Clear all localStorage items related to this app
        localStorage.removeItem('openai_api_key');
        localStorage.removeItem('conversations');
        localStorage.removeItem('currentConversationId');
        localStorage.removeItem('settings');
        
        // Clear all legacy vector store indices
        localStorage.removeItem('pdf_vector_store_index');
        localStorage.removeItem('word_vector_store_index');
        localStorage.removeItem('excel_vector_store_index');
        localStorage.removeItem('image_vector_store_index');
        
        // Clear all data from Vector Store IndexedDB
        try {
          // Import the IndexedDB helper and clear all vector stores
          const { clearAllVectorStores } = await import('../utils/indexedDBHelper');
          await clearAllVectorStores();
          console.log('Successfully cleared all vector stores from IndexedDB');
        } catch (dbError) {
          console.error('Error clearing vector store IndexedDB data:', dbError);
        }
        
        // Delete the Vector Store IndexedDB database
        try {
          const deleteVectorStoreRequest = indexedDB.deleteDatabase('SparfGPT_VectorStore');
          deleteVectorStoreRequest.onsuccess = () => {
            console.log('Successfully deleted Vector Store IndexedDB database');
          };
          deleteVectorStoreRequest.onerror = (event) => {
            console.error('Error deleting Vector Store IndexedDB database:', event);
          };
        } catch (deleteError) {
          console.error('Error during Vector Store database deletion attempt:', deleteError);
        }
        
        // Delete the Conversations IndexedDB database
        try {
          const deleteConversationsRequest = indexedDB.deleteDatabase('SparfGPT_Conversations');
          deleteConversationsRequest.onsuccess = () => {
            console.log('Successfully deleted Conversations IndexedDB database');
          };
          deleteConversationsRequest.onerror = (event) => {
            console.error('Error deleting Conversations IndexedDB database:', event);
          };
        } catch (deleteError) {
          console.error('Error during Conversations database deletion attempt:', deleteError);
        }
        
        // Reset states
        setCurrentApiKey(null);
        setShowDeleteConfirm(false);
        setApiKeySaveStatus(null);
        
        // Notify other components
        window.dispatchEvent(new CustomEvent('apiKeyChanged'));
        window.dispatchEvent(new CustomEvent('dataDeleted'));
        
        // Reload the page to reset all states
        window.location.reload();
      } catch (error) {
        console.error('Error during data deletion:', error);
      }
    } else {
      // First click, show confirmation
      setShowDeleteConfirm(true);
      // Hide reset confirmation if it was open
      setShowResetConfirm(false);
    }
  };
  
  // Handle settings reset
  const handleResetSettings = () => {
    if (showResetConfirm) {
      // User confirmed, reset all settings to defaults
      resetSettings();
      // Reset confirmation state
      setShowResetConfirm(false);
    } else {
      // First click, show confirmation
      setShowResetConfirm(true);
      // Hide delete confirmation if it was open
      setShowDeleteConfirm(false);
    }
  };

  const handleDeleteAllChats = async () => {
    if (showDeleteChatsConfirm) {
      try {
        await deleteAllConversations();
      } catch (error) {
        console.error('Error deleting all chats:', error);
      } finally {
        setShowDeleteChatsConfirm(false);
      }
    } else {
      setShowDeleteChatsConfirm(true);
      setShowResetConfirm(false);
      setShowDeleteConfirm(false);
    }
  };
  
  // Theme change handler removed
  
  return (
    <div className="settings-panel" ref={panelRef}>
      <div className="settings-header">
        <h3>Settings</h3>
        <button className="close-btn" onClick={onClose}>
          <FiX />
        </button>
      </div>
      
      <div className="settings-content">
        <section>
          <h4>API Settings</h4>
          
          {/* API provider selection has been removed as we're only using OpenAI now */}
          
          <div className="setting-group">
            <label>OpenAI API Key</label>
            
            {currentApiKey ? (
              <div className="current-api-key">
                <div className="api-key-badge">
                  <span className="api-key-icon">🔑</span>
                  <span>Current API Key: {currentApiKey}</span>
                </div>
                <button 
                  className="remove-api-key-btn"
                  onClick={() => {
                    localStorage.removeItem('openai_api_key');
                    setCurrentApiKey(null);
                    window.dispatchEvent(new CustomEvent('apiKeyChanged'));
                  }}
                >
                  Remove Key
                </button>
              </div>
            ) : (
              <form onSubmit={handleApiKeySubmit} className="api-key-form">
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="Enter your OpenAI API key (starts with sk-)"
                />
                <button type="submit" disabled={!openaiApiKey}>Save</button>
              </form>
            )}
            
            {apiKeySaveStatus === 'success' && (
              <div className="api-key-status success">
                API key saved successfully!
              </div>
            )}
            {apiKeySaveStatus === 'error' && (
              <div className="api-key-status error">
                Invalid API key format. OpenAI API keys typically start with 'sk-'.
              </div>
            )}
            <div className="api-key-help">
              <p>Your API key is stored locally in your browser and is never sent to our servers.</p>
            </div>
          </div>
        </section>
        
        <section>
          <h4>Model Settings</h4>
          
          <div className="setting-group">
            <label>Model</label>
            <select value={settings.model} onChange={handleModelChange}>
              {Object.entries(MODEL_MAP).map(([value, label]) => (
                <option
                  key={value}
                  value={value}
                  onMouseEnter={() => setHoveredModel(value)}
                  onMouseLeave={() => setHoveredModel(null)}
                  title={MODEL_DESCRIPTIONS[value]}
                >
                  {label}
                </option>
              ))}
            </select>
            <div className="setting-description">
              {MODEL_DESCRIPTIONS[hoveredModel || settings.model] || 'Select a model to see its description.'}
            </div>
          </div>
          
          {/* GPT-5 Specific Controls */}
          {settings.model && settings.model.startsWith('gpt-5') && (
            <>
              <div className="setting-group">
                <label>Reasoning Effort</label>
                <select value={settings.reasoningEffort || 'medium'} onChange={handleReasoningEffortChange}>
                  <option value="low">Low - Fast responses, minimal reasoning</option>
                  <option value="medium">Medium - Balanced reasoning (default)</option>
                  {settings.model !== 'gpt-5-nano' && (
                    <option value="high">High - Deep thinking, thorough analysis</option>
                  )}
                </select>
                <div className="setting-description">
                  Controls the model's reasoning depth. Minimal for quick tasks, high for complex problem-solving that requires deep thinking.
                </div>
              </div>            
            </>
          )}
          
          {/* Hide temperature, top_p, and frequency_penalty for GPT-5 */}
          {!(settings.model && settings.model.startsWith('gpt-5')) && (
            <>
              <div className="setting-group">
                <label>Temperature: {settings.temperature !== undefined ? settings.temperature.toFixed(1) : '0.7'}</label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.temperature}
                  onChange={handleTemperatureChange}
                />
                <div className="range-labels">
                  <span>Precise</span>
                  <span>Balanced</span>
                  <span>Creative</span>
                </div>
                <div className="setting-description">
                  <b>Controls response randomness:</b> Lower values make the output more deterministic and focused, while higher values increase creativity and variety.
                </div>
              </div>
              
              <div className="setting-group">
                <label>Top P: {settings.topP !== undefined ? settings.topP.toFixed(2) : '1.00'}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.topP}
                  onChange={handleTopPChange}
                />
                <div className="range-labels">
                  <span>0</span>
                  <span></span>
                  <span>1</span>
                </div>
                <div className="setting-description">
                  <b>Limits token selection by cumulative probability:</b> A value of 0.1 means the model only chooses from the top 10% most likely tokens, cutting off the less predictable options.
                </div>
              </div>
             
            </>
          )}
          
          <div className="setting-group">
            <label>Max Tokens: {settings.maxTokens}</label>
            <input
              type="range"
              min="256"
              max="2048"
              step="256"
              value={settings.maxTokens}
              onChange={handleMaxTokensChange}
            />
            <div className="range-labels">
              <span>0</span>
              <span></span>
              <span>2048</span>
            </div>
            <div className="setting-description">
              <b>Sets the maximum response length:</b> Defines the upper limit for generated tokens (1 token is roughly 4 characters or 0.75 words). Higher values permit longer completions.
            </div>
          </div>
        </section>
        
        <section className="system-prompt-section">
          <h4>System Prompt</h4>
          <div className="setting-group">
            <textarea
              value={settings.systemPrompt}
              onChange={handleSystemPromptChange}
              placeholder="Enter a system prompt to set the AI's behavior"
              rows={4}
            ></textarea>
            <div className="setting-description">
              The system prompt helps define how the AI responds. Leave empty for default behavior.
            </div>
          </div>
        </section>
           <section>
          <h4>Display Settings</h4>
          
          {/* Theme selection removed */}
          
          <div className="setting-group">
            <label className="toggle-label">
              <span>Show Tokens  </span>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.showTokens}
                  onChange={() => handleToggle('showTokens')}
                />
                <span className="toggle-slider"></span>
              </div>
            </label>
            <div className="setting-help-text">
               Display the API tokens used for the AI prompt
            </div>
          </div>
          
          <div className="setting-group">
            <label className="toggle-label">
              <span>Show API Details </span>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.showRequestJson && settings.showApiDetails}
                  onChange={handleToggleApiDetails}
                />
                <span className="toggle-slider"></span>
              </div>
            </label>
            <div className="setting-help-text">
              When enabled, shows the request JSON sent to the API and the response details received from the API.
            </div>
          </div>
          

        </section>
        <section>
          <h4>Voice Settings</h4>
          
          <div className="setting-group">
            <label>Text-to-Speech Voice</label>
            <select value={settings.voice} onChange={handleVoiceChange}>
              <option value="nova">Nova (Female, clear and professional)</option>
              <option value="alloy">Alloy (Neutral, balanced)</option>
              <option value="echo">Echo (Male, deep and calm)</option>
              <option value="fable">Fable (Male, versatile storyteller)</option>
              <option value="onyx">Onyx (Male, authoritative)</option>
              <option value="shimmer">Shimmer (Female, warm and calm)</option>
            </select>
            <div className="setting-description">
              Choose the voice for text-to-speech playback. Click the speaker icon on any AI message to hear it read aloud.
            </div>
            <div className="voice-test-container">
              <button 
                className="voice-test-button" 
                onClick={handleTestVoice} 
                disabled={isTesting}
              >
                <FiVolume2 className="volume-icon" />
                {isTesting ? 'Testing...' : 'Test Voice'}
              </button>
              {testError && (
                <div className="voice-test-error">
                  Error: {testError}
                </div>
              )}
            </div>
          </div>
        </section>
        
     
        
        <section className="settings-reset">
          <h4>Settings Management</h4>
          <div className="setting-group">
            <label>Reset to Default Settings</label>
            <div className="setting-description">
              <p>This will restore all settings to their default values.</p>
              <p>Your conversations and API keys will NOT be affected.</p>
            </div>
            <button 
              className={`reset-btn ${showResetConfirm ? 'confirm' : ''}`}
              onClick={handleResetSettings}
            >
              <FiRefreshCw className="reset-icon" /> 
              {showResetConfirm ? 'Click to confirm reset' : 'Reset all settings'}
            </button>
            {showResetConfirm && (
              <button 
                className="cancel-btn"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
            )}
          </div>
          <div className="setting-group">
            <label>Delete All Chats</label>
            <div className="setting-description">
              <p>This will delete all your conversations from this browser.</p>
              <p>Your API keys and settings will NOT be affected.</p>
            </div>
            <button 
              className={`reset-btn ${showDeleteChatsConfirm ? 'confirm' : ''}`}
              onClick={handleDeleteAllChats}
            >
              {showDeleteChatsConfirm ? 'Click to confirm chat deletion' : 'Delete all chats'}
            </button>
            {showDeleteChatsConfirm && (
              <button 
                className="cancel-btn"
                onClick={() => setShowDeleteChatsConfirm(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </section>
        
        <section className="danger-zone">
          <h4>Data Management</h4>
          <div className="setting-group">
            <label className="danger-label">Delete All Application Data</label>
            <div className="danger-description">
              <p>This will delete all your conversations, settings, and API keys from this browser.</p>
              <p>This action cannot be undone.</p>
            </div>
            <button 
              className={`danger-btn ${showDeleteConfirm ? 'confirm' : ''}`}
              onClick={handleDeleteAllData}
            >
              {showDeleteConfirm ? 'Click again to confirm deletion' : 'Delete all data'}
            </button>
            {showDeleteConfirm && (
              <button 
                className="cancel-btn"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsPanel;
