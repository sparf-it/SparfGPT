import React, { useContext, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

import { visualizeTokens } from '../utils/openaiTokens';
import { SettingsContext } from '../context/SettingsContext';
import { generateTextToSpeech } from '../services/api';
import './ChatMessage.css';
import { FiFileText, FiCode, FiVolume2, FiLoader } from 'react-icons/fi';

// Format the timestamp for display
const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';
  
  try {
    // Handle numeric timestamps (milliseconds since epoch)
    if (typeof timestamp === 'number') {
      return new Date(timestamp).toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit'
      });
    }
    
    // Handle ISO string timestamps
    return new Date(timestamp).toLocaleTimeString(undefined, { 
      hour: '2-digit', 
      minute: '2-digit'
    });
  } catch (err) {
    console.error('Error formatting timestamp:', err, timestamp);
    return 'Unknown time';
  }
};

const extractReasoningSummary = (apiResponse) => {
  if (!apiResponse) return null;
  const resp = apiResponse.response || apiResponse;
  if (!resp) return null;
  if (resp.reasoning && typeof resp.reasoning.summary === 'string' && resp.reasoning.summary.trim()) {
    return resp.reasoning.summary.trim();
  }
  if (Array.isArray(resp.output) && resp.output.length > 0) {
    const reasoningItem = resp.output.find(
      item => item && item.type === 'reasoning' && Array.isArray(item.summary)
    );
    if (reasoningItem) {
      const summaryTexts = reasoningItem.summary
        .filter(seg => seg && typeof seg.text === 'string')
        .map(seg => seg.text.trim())
        .filter(Boolean);
      if (summaryTexts.length > 0) {
        return summaryTexts.join('\n\n');
      }
    }
  }
  return null;
};

const ChatMessage = ({ message, showTokens, colorTokens, requestData }) => {
  const { settings } = useContext(SettingsContext);
  const { id, role, content, timestamp, isError, isFileNotification, isStreaming, isImage, imageUrl } = message;
  const modelName = message.apiResponse ? (message.apiResponse.model || message.apiResponse.response?.model || null) : null;
  const isGpt5Model = typeof modelName === 'string' && modelName.startsWith('gpt-5');
  const reasoningSummary = isGpt5Model ? extractReasoningSummary(message.apiResponse) : null;
  
  // State to toggle request JSON visibility, API details visibility and handle TTS
  const [showRequestJson, setShowRequestJson] = useState(false);
  const [showApiDetails, setShowApiDetails] = useState(false);
  const [showReasoningSummaryInline, setShowReasoningSummaryInline] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioObj, setAudioObj] = useState(null);
  
  // Cleanup audio when component unmounts or message changes
  useEffect(() => {
    return () => {
      if (audioObj) {
        audioObj.pause();
        setAudioObj(null);
      }
      setIsSpeaking(false);
      setIsLoadingAudio(false);
    };
  }, [id, audioObj]);
  
  // Function to handle text-to-speech playback
  const handleTextToSpeech = async () => {
    // If already speaking, stop playback
    if (isSpeaking && audioObj) {
      audioObj.pause();
      audioObj.currentTime = 0;
      setIsSpeaking(false);
      return;
    }
    
    // If we have a cached audio object, play it
    if (audioObj) {
      audioObj.play();
      setIsSpeaking(true);
      return;
    }
    
    // Otherwise, generate new audio
    try {
      setIsLoadingAudio(true);
      
      // Generate audio from text
      const audioBlob = await generateTextToSpeech(content, settings.voice);
      
      // Create audio object
      const audio = new Audio(URL.createObjectURL(audioBlob));
      
      // Set up event handlers
      audio.addEventListener('ended', () => {
        setIsSpeaking(false);
      });
      
      audio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        setIsSpeaking(false);
        setIsLoadingAudio(false);
      });
      
      // Cache the audio object
      setAudioObj(audio);
      
      // Start playback
      audio.play();
      setIsSpeaking(true);
    } catch (error) {
      console.error('Error generating speech:', error);
      alert('Failed to generate speech. Please try again.');
    } finally {
      setIsLoadingAudio(false);
    }
  };
  
  // Add a blinking cursor effect for streaming messages
  
  const renderContent = () => {
    if (isFileNotification) {
      return (
        <div className="file-notification">
          <FiFileText />
          <span>{content}</span>
        </div>
      );
    }
    
    if (isError) {
      return (
        <div className="error-content">
          {/* Using inline SVG instead of the component to avoid potential import issues */}
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-alert-circle">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{content}</span>
        </div>
      );
    }
    
    // Display image if the message has an imageUrl
    if (imageUrl) {
      return (
        <div className="message-with-image">
          <div className="image-container">
            <img src={imageUrl} alt="" className="uploaded-image" />
          </div>
          <div className="image-description">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={tomorrow}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>
      );
    }
    
    if (showTokens) {
      return (
        <div className="token-content">
          {visualizeTokens(content)}
        </div>
      );
    }
    
    return (
      <div className={isStreaming ? 'streaming-content' : ''}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
                <SyntaxHighlighter
                  style={tomorrow}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            img({ node, ...props }) {
              return (
                <img
                  {...props}
                  style={{ maxWidth: '100%', borderRadius: '8px' }}
                  alt={props.alt || 'Generated Image'}
                />
              );
            }
          }}
        >
          {content}
        </ReactMarkdown>
        {isStreaming && (
          <span className="typing-indicator">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </span>
        )}
      </div>
    );
  };
  
  return (
    <div className={`chat-message ${role}`}>
      <div className="message-avatar">
        {role === 'user' ? (
          <img src="icons/user-icon.webp" alt="User" className="user-avatar" />
        ) : role === 'assistant' ? (
          <img src="icons/assistant-icon.webp" alt="Assistant" className="assistant-avatar" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-alert-circle">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        )}
      </div>
      <div className="message-content">
        <div className="message-header">
          <div className="message-header-left">
            {role === 'assistant' && isGpt5Model && reasoningSummary && (
              <button
                type="button"
                className="reasoning-summary-toggle"
                onClick={() => setShowReasoningSummaryInline(!showReasoningSummaryInline)}
              >
                {showReasoningSummaryInline ? 'Hide reasoning' : 'Show reasoning'}
              </button>
            )}
          </div>
          <div className="message-header-right">
            {/* Add speaker icon for text-to-speech for assistant messages */}
            {role === 'assistant' && !isImage && !isError && !isFileNotification && (
              <button 
                className={`tts-button ${isSpeaking ? 'speaking' : ''}`} 
                onClick={handleTextToSpeech} 
                disabled={isLoadingAudio || isStreaming}
                title="Play text as speech"
              >
                {isLoadingAudio ? <FiLoader className="loading-icon" /> : <FiVolume2 />}
              </button>
            )}
            <span className="message-timestamp">{formatTimestamp(timestamp)}</span>
          </div>
        </div>
        {role === 'assistant' && isGpt5Model && reasoningSummary && showReasoningSummaryInline && (
          <div className="reasoning-summary-inline">
            <div className="reasoning-summary-title">Reasoning summary</div>
            <div className="reasoning-summary-text">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {reasoningSummary}
              </ReactMarkdown>
            </div>
          </div>
        )}
        <div className="message-body">
          {renderContent()}
        </div>

        
        {/* Show request JSON under user messages when the setting is enabled */}
        {settings.showRequestJson && role === 'user' && (
          <div className="request-json">
            <div className="request-json-header" onClick={() => setShowRequestJson(!showRequestJson)}>
              <FiCode />
              <span>{showRequestJson ? 'Hide' : 'Show'} Request JSON</span>
            </div>
            {showRequestJson && (
              <div className="request-json-content">
                <pre>
                  {JSON.stringify(
                    // Try all possible sources of request data
                    message.requestData || 
                    requestData || 
                    // Fallback JSON for testing/debugging
                    {
                      model: "Model not available",
                      messages: [{role: "user", content: "Request data not available"}],
                      temperature: 0.7,
                      max_tokens: 2048
                    }, 
                    null, 
                    2
                  )}
                </pre>
              </div>
            )}
          </div>
        )}
        
        {/* Show API details under assistant messages when the setting is enabled */}
        {settings.showApiDetails && role === 'assistant' && (
          <div className="request-json">
            <div className="request-json-header" onClick={() => setShowApiDetails(!showApiDetails)}>
              <FiCode />
              <span>{showApiDetails ? 'Hide' : 'Show'} Response Details</span>
            </div>
            {showApiDetails && (
              <div className="request-json-content">
                <div className="api-details-section">
                  <h5>Model</h5>
                  <p>{message.apiResponse ? (message.apiResponse.model || message.apiResponse.response?.model || 'N/A') : 'N/A'}</p>
                  
                  <h5>Usage</h5>
                  {message.apiResponse && message.apiResponse.usage ? (
                    <div>
                      <p>Prompt Tokens: {message.apiResponse.usage.prompt_tokens || 'N/A'}</p>
                      <p>Completion Tokens: {message.apiResponse.usage.completion_tokens || 'N/A'}</p>
                      <p>Total Tokens: {message.apiResponse.usage.total_tokens || 'N/A'}</p>
                    </div>
                  ) : (
                    <p>Usage data not available</p>
                  )}
                  {isGpt5Model && (
                    <>
                      <h5>Reasoning Summary</h5>
                      <pre>
                        {reasoningSummary || 'No reasoning summary available'}
                      </pre>
                    </>
                  )}
                  
                  <h5>Response Data</h5>
                  <pre>
                    {message.apiResponse ? 
                      JSON.stringify(message.apiResponse.response || message.apiResponse, null, 2) : 
                      'No API response data available'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
