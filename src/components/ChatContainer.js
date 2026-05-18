/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef, useContext } from 'react';
import { MODEL_MAP } from '../constants/models';
import { ConversationContext } from '../context/ConversationContext';
import { SettingsContext } from '../context/SettingsContext';
import { generateOpenAIResponse, generateOpenAIImage, generateConversationTitle } from '../services/api';
import { queryVectorStore as queryPdfVectorStore, loadVectorStore as loadPdfVectorStore } from '../services/pdfService';
import { queryVectorStore as queryWordVectorStore, loadVectorStore as loadWordVectorStore } from '../services/wordService';
import { queryVectorStore as queryExcelVectorStore, loadVectorStore as loadExcelVectorStore } from '../services/excelService';
import { queryVectorStore as queryImageVectorStore, loadVectorStore as loadImageVectorStore } from '../services/imageService';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { parseFile, formatFileSize } from '../utils/fileUtils';
import { enhancedChatResponse } from '../utils/chatResponseHelper';


import { classifyIntent, classifyIntentWithAPI } from '../utils/intentClassifier';
import ChatMessage from './ChatMessage';
import SettingsPanel from './SettingsPanel';
import FileUploader from './FileUploader';
import SparfLogo from '../assets/Sparf-Logo.webp';
// Document handling is now integrated into the FileUploader component
import './ChatContainer.css';
import { FiSend, FiPaperclip, FiX, FiSquare, FiUpload, FiFile, FiMenu, FiSettings } from 'react-icons/fi';

const ChatContainer = ({ isSidebarOpen, toggleSidebar, showSettings, toggleSettings }) => {
  // Keep track of the last processed image URL to prevent duplicates
  const lastProcessedImage = useRef(null);
  const { 
    conversations, 
    currentConversationId, 
    setCurrentConversationId,
    addMessageToConversation,
    updateMessageInConversation,
    updateConversationTitle,
    startApiCall,
    endApiCall,
    getCurrentConversation,
    addContextFileToConversation,
    removeContextFileFromConversation,
    forceConversationUpdate,
    currentConversation,
    setConversations
  } = useContext(ConversationContext);
  
  const { settings } = useContext(SettingsContext);
  
  const getModelDisplayName = (model) => {
    const baseName = MODEL_MAP[model] || model || 'Unknown model';
    if (typeof model === 'string' && model.startsWith('gpt-5')) {
      const level = (settings && typeof settings.reasoningEffort === 'string') ? settings.reasoningEffort : 'medium';
      const prettyLevel = level.charAt(0).toUpperCase() + level.slice(1);
      return `${baseName} (Reasoning: ${prettyLevel})`;
    }
    return baseName;
  };
  
  const [input, setInput] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [lastMessageWasImage, setLastMessageWasImage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [requestData, setRequestData] = useState(null);
  const [apiResponse, setApiResponse] = useState(null);
  const [showApiResponse, setShowApiResponse] = useState(false);
  const [error, setError] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [droppedFiles, setDroppedFiles] = useState([]);
  const [streamController, setStreamController] = useState(null);
  // TTS functionality is controlled at the individual message level
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  
  // PDF document handling state
  const [activePdfDocumentId, setActivePdfDocumentId] = useState(null);
  const [activePdfFileName, setActivePdfFileName] = useState(null);
  const [pdfVectorStore, setPdfVectorStore] = useState(null);
  const [isPdfMode, setIsPdfMode] = useState(false);
  // Document handling state is now unified in the FileUploader component
  
  // Word document handling state
  const [activeWordDocumentId, setActiveWordDocumentId] = useState(null);
  const [activeWordFileName, setActiveWordFileName] = useState(null);
  const [wordVectorStore, setWordVectorStore] = useState(null);
  const [isWordMode, setIsWordMode] = useState(false);
  
  // Excel sheet handling state
  const [activeExcelDocumentId, setActiveExcelDocumentId] = useState(null);
  const [activeExcelFileName, setActiveExcelFileName] = useState(null);
  const [excelVectorStore, setExcelVectorStore] = useState(null);
  const [isExcelMode, setIsExcelMode] = useState(false);
  
  // Image handling state
  const [activeImageId, setActiveImageId] = useState(null);
  const [activeImageName, setActiveImageName] = useState(null);
  const [imageVectorStore, setImageVectorStore] = useState(null);
  const [isImageAnalysisMode, setIsImageAnalysisMode] = useState(false);
  
  // Common file handling state
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showFileUploader, setShowFileUploader] = useState(false);
  const [activeDocumentType, setActiveDocumentType] = useState(null); // 'pdf', 'word', 'excel', 'image'
  const [imagePrompt, setImagePrompt] = useState('');
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  
  const messagesEndRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const inputRef = useRef(null);
  const textAreaRef = useRef(null);
  const chatInputContainerRef = useRef(null);
  const messageInputWrapperRef = useRef(null);
  
  // Use a ref to store the current conversation to avoid state updates during render
  const conversationRef = useRef(null);
  // Get the current conversation without triggering renders
  if (!conversationRef.current) {
    conversationRef.current = conversations.find(conv => conv.id === currentConversationId);
  }
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    scrollToBottom();
  }, [currentConversation?.messages]);
  
  // Update the conversation ref when the conversation ID or conversations change
  // Use a single effect to handle all conversation reference updates
  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    // Skip unnecessary updates if nothing has changed
    if (conversationRef.current?.id === currentConversationId && 
        conversationRef.current?.messages?.length === conversations.find(c => c.id === currentConversationId)?.messages?.length) {
      return;
    }
    
    // Find the current conversation by ID
    const conversation = conversations.find(conv => conv.id === currentConversationId);
    
    // Only reset document state when the currentConversationId actually changes
    // This is important to distinguish from re-renders with the same conversation ID
    if (conversationRef.current && conversationRef.current.id !== currentConversationId) {
      console.log('Conversation changed, resetting document state');
      
      setActivePdfDocumentId(null);
      setActivePdfFileName(null);
      setPdfVectorStore(null);
      setIsPdfMode(false);
      
      setActiveWordDocumentId(null);
      setActiveWordFileName(null);
      setWordVectorStore(null);
      setIsWordMode(false);
      
      setActiveExcelDocumentId(null);
      setActiveExcelFileName(null);
      setExcelVectorStore(null);
      setIsExcelMode(false);
      
      setActiveImageId(null);
      setActiveImageName(null);
      setImageVectorStore(null);
      setIsImageAnalysisMode(false);
      
      setActiveDocumentType(null);
    } else {
      console.log('Preserving document context within the same conversation');
    }
    
    if (conversation) {
      // Update the ref with the latest conversation from the array
      conversationRef.current = conversation;
      
      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log('Updated conversation ref:', conversation.id, 'Messages:', conversation.messages?.length || 0);
      }
    } else if (conversations.length > 0 && !currentConversationId) {
      // If no current ID but we have conversations, use the first one
      conversationRef.current = conversations[0];
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Using first conversation:', conversations[0].id);
      }
    } else if (conversations.length === 0) {
      // If no conversations, create a new one via the context
      const newConversation = getCurrentConversation({ createIfMissing: true });
      conversationRef.current = newConversation;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Created new conversation:', newConversation?.id);
      }
    }
  }, [conversations, currentConversationId, getCurrentConversation]);
  
  // Monitor conversation changes and ensure UI updates
  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    if (currentConversation?.messages?.length > 0) {
      // Force a scroll to bottom whenever messages change
      scrollToBottom();
    }
  }, [currentConversation]);
  
  // Track the conversation ID to detect changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    if (currentConversationId) {
      // When conversation ID changes, clear the input field
      setInput('');
      setImagePrompt('');
      
      // Make sure file uploader is closed when switching conversations
      // but preserve document context across conversations
      if (showFileUploader) toggleFileUploader();
      
      // We're intentionally NOT resetting these values to allow document context to persist
      // between multiple messages within the same conversation
      // This allows the user to ask multiple questions about the same document
      console.log('Preserving document context when sending messages');
      
      // Force conversation update to ensure title and other UI elements refresh
      forceConversationUpdate();
      
      // Log the current conversation to help with debugging
      const updatedConv = getCurrentConversation();
      console.log('Switched to conversation:', currentConversationId, 
                  'Title:', updatedConv?.title || 'New Conversation');
    }
  }, [currentConversationId, forceConversationUpdate, getCurrentConversation]);
  
  // Check if API key is set
  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    const checkApiKey = () => {
      const apiKey = localStorage.getItem('openai_api_key');
      const isValid = !!apiKey && apiKey.startsWith('sk-');
      setIsApiKeySet(isValid);
      console.log('API key validation check:', isValid ? 'Key is valid' : 'Key is missing or invalid');
    };
    
    // Check initially
    checkApiKey();
    
    // Set up event listener for localStorage changes
    const handleStorageChange = (e) => {
      if (e.key === 'openai_api_key') {
        checkApiKey();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Custom event for API key changes within the same window
    const handleCustomEvent = () => checkApiKey();
    window.addEventListener('apiKeyChanged', handleCustomEvent);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('apiKeyChanged', handleCustomEvent);
    };
  }, []);
  
  const scrollToBottom = () => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  };
  
  // Function to focus the textarea after responses
  const focusTextArea = () => {
    console.log('Focusing text area...');
    if (textAreaRef && textAreaRef.current) {
      setTimeout(() => {
        textAreaRef.current.focus();
        console.log('Text area focused');
      }, 100);
    } else {
      console.warn('Text area reference not available');
    }
  };
  
  const handleInputChange = (e) => {
    setInput(e.target.value);
    setUserMessage(e.target.value);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
      console.log('Enter key pressed with non-empty input');
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handleSendMessage = async () => {
    const trimmedMessage = input.trim();
    
    // Don't send empty messages
    if (!trimmedMessage) {
      return;
    }
    
    // Clear input field and reset height
    setInput('');
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
    }
    
    // Set loading state
    setIsLoading(true);
    
    console.log('Message to send:', trimmedMessage);
    
    // Check API key validity
    const apiKey = localStorage.getItem('openai_api_key');
    console.log('API key status:', apiKey ? 'Key exists' : 'No key found', isApiKeySet ? 'isApiKeySet: true' : 'isApiKeySet: false');
    
    // Clear input field immediately for better UX
    setUserMessage('');
    
    try {
      // Use AI-based intent classification with conversation context
      console.log('Using AI-based intent classification with context...');
      console.log('Image analysis mode:', isImageAnalysisMode ? 'ON' : 'OFF');
      console.log('Last message was image:', lastMessageWasImage ? 'YES' : 'NO');
      
      // Pass conversation context to help classifier make better decisions
      const conversationContext = {
        isImageAnalysisMode,
        lastMessageWasImage,
        // Add any other relevant context here
      };
      
      const { intent, confidence, source } = await classifyIntentWithAPI(trimmedMessage, conversationContext);
      console.log(`AI Intent classification: ${intent} (confidence: ${confidence}, source: ${source || 'not specified'})`);
      
      // If the intent is for image generation with sufficient confidence, use the image generator
      if (intent === 'image' && confidence >= 0.7) {
        // Set the image prompt and call the image generation handler
        setImagePrompt(trimmedMessage);
        handleGenerateImage(trimmedMessage);
        return;
      }
    } catch (error) {
      console.error('Error during intent classification:', error);
      // Continue with text processing if intent classification fails
    }

    
    try {
      // Create a new user message with a truly unique ID
      const messageTimestamp = Date.now();
      const randomSuffix = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      const uniqueId = `user-${messageTimestamp}-${randomSuffix}`;
      
      // Log the unique ID to help with debugging
      console.log(`Generated unique message ID: ${uniqueId}`);
      
      const newUserMessage = {
        id: uniqueId,
        role: 'user',
        content: trimmedMessage,
        timestamp: messageTimestamp
      };
      
      // Add message to the current conversation
      addMessageToConversation(newUserMessage);
      
      // Force UI update after adding user message
      forceConversationUpdate();
      scrollToBottom();
      
      // Check which document mode is active
      if (isPdfMode && pdfVectorStore) {
        console.log('Using PDF mode with question:', trimmedMessage);
        await handlePdfQuestion(trimmedMessage, newUserMessage.id);
      } else if (isWordMode && wordVectorStore) {
        console.log('Using Word mode with question:', trimmedMessage);
        await handleWordQuestion(trimmedMessage, newUserMessage.id);
      } else if (isExcelMode && excelVectorStore) {
        console.log('Using Excel mode with question:', trimmedMessage);
        await handleExcelQuestion(trimmedMessage, newUserMessage.id);
      } else if (isImageAnalysisMode && imageVectorStore) {
        console.log('Using Image Analysis mode with question:', trimmedMessage);
        await handleImageQuestion(trimmedMessage, newUserMessage.id);
      } else {
        // Regular chat mode - call the enhanced chat response handler
        console.log('Using enhanced regular chat mode with message:', trimmedMessage);
        
        // Create an enhanced version of handleChatResponse that includes vector store integration
        const enhancedHandler = enhancedChatResponse(handleChatResponse, {
          getCurrentConversation,
          pdfVectorStore,
          wordVectorStore,
          excelVectorStore,
          imageVectorStore,
          settings
        });
        
        // Call the enhanced handler
        await enhancedHandler(trimmedMessage, newUserMessage);
      }
      
      // Auto-generate title if this is the first message in a new conversation
      if (currentConversation?.messages?.length === 2 && currentConversation?.title === 'New Conversation') {
        handleGenerateTitle();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError(error.message || 'An error occurred while sending your message');
      
      // Create and add error message to conversation
      const timestamp = Date.now();
      const errorMessage = {
        id: `error-${timestamp}`,
        role: 'system',
        content: `Error: ${error.message || 'An error occurred while sending your message'}`,
        timestamp: timestamp,
        isError: true
      };
      
      console.log('Adding error message to conversation:', errorMessage);
      // Fix: Remove conversationId parameter since the function only expects the message
      addMessageToConversation(errorMessage);
      forceConversationUpdate();
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle the chat response by generating a response from OpenAI
  const handleChatResponse = async (userInput, userMessage) => {
    console.log('handleChatResponse called with input:', userInput);
    console.log('User message object:', userMessage);
    
    // DIRECT FIX: Check if this is a document-related question and add content directly
    // This ensures document content is available regardless of vector store issues
    let hasAddedDocumentContent = false;
    if (userMessage && userMessage.documentContext) {
      console.log('Document context detected:', userMessage.documentContext.type, userMessage.documentContext.fileName);
      
      // Based on the document type, get the right vector store
      let docVectorStore = null;
      if (userMessage.documentContext.type === 'pdf' && pdfVectorStore) {
        docVectorStore = pdfVectorStore;
        console.log('Using PDF vector store with', pdfVectorStore.documents?.length || 0, 'documents');
      } else if (userMessage.documentContext.type === 'word' && wordVectorStore) {
        docVectorStore = wordVectorStore;
        console.log('Using Word vector store with', wordVectorStore.documents?.length || 0, 'documents');
      } else if (userMessage.documentContext.type === 'excel' && excelVectorStore) {
        docVectorStore = excelVectorStore;
        console.log('Using Excel vector store with', excelVectorStore.documents?.length || 0, 'documents');
      }
      
      // If we found a document vector store with content, add it directly to the user's input
      if (docVectorStore && docVectorStore.documents && docVectorStore.documents.length > 0) {
        console.log('DIRECT FIX: Adding document content directly to message');
        
        // Original user input
        const originalInput = userInput;
        
        // Extract document content (up to 3 chunks to avoid token limits)
        let documentContent = "";
        const maxChunks = Math.min(3, docVectorStore.documents.length);
        
        for (let i = 0; i < maxChunks; i++) {
          if (docVectorStore.documents[i] && docVectorStore.documents[i].pageContent) {
            documentContent += docVectorStore.documents[i].pageContent + "\n\n";
          }
        }
        
        // Create a new input that includes document content
        if (documentContent.trim()) {
          userInput = `I'm asking about this ${userMessage.documentContext.type.toUpperCase()} document: ${userMessage.documentContext.fileName}\n\nHere are some excerpts from the document:\n\n${documentContent}\n\nMy question is: ${originalInput}`;
          hasAddedDocumentContent = true;
          console.log('Successfully added document content directly to user input');
          console.log('New input first 100 chars:', userInput.substring(0, 100));
        }
      }
    }
    
    // Check if API key is set before making the call
    const apiKey = localStorage.getItem('openai_api_key');
    if (!apiKey || !apiKey.startsWith('sk-')) {
      console.error('Invalid API key in handleChatResponse');
      throw new Error('Please set a valid OpenAI API key in the settings panel');
    }
    
    try {
      // Get the current conversation
      const currentConversation = getCurrentConversation();
      if (!currentConversation) {
        console.error('No active conversation found');
        throw new Error('No active conversation');
      }
      console.log('Current conversation:', currentConversation.id, currentConversation.title);
      
      // Set streaming state
      setIsStreaming(true);
      
      // Start API call to prevent creating new conversations
      startApiCall();
      
      // Create a deep copy of the messages to avoid reference issues
      let messages = currentConversation.messages
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));
      
      // Debug the message array
      console.log('Messages to send to API:', messages);
      
      // Bug fix: If we have an empty messages array or missing the user message, add it manually
      // This can happen with the first message in a new conversation due to state update timing
      if (messages.length === 0 || !messages.some(m => m.role === 'user' && m.content === userInput)) {
        console.log('User input missing from messages array, adding manually:', userInput);
        
        // Check if this is an image-related question with image data
        if (userMessage && userMessage.imageData && userMessage.imageData.url) {
          console.log('Adding image data to user message for Vision API');
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: userInput },
              { type: 'image_url', image_url: { url: userMessage.imageData.url } }
            ]
          });
        } else {
          messages.push({
            role: 'user',
            content: userInput
          });
        }
      } else if (userMessage && userMessage.imageData && userMessage.imageData.url) {
        // If the message exists but doesn't have image data, find and update it
        const userMessageIndex = messages.findIndex(m => m.role === 'user' && m.content === userInput);
        if (userMessageIndex !== -1) {
          console.log('Updating existing user message with image data for Vision API');
          messages[userMessageIndex] = {
            role: 'user',
            content: [
              { type: 'text', text: userInput },
              { type: 'image_url', image_url: { url: userMessage.imageData.url } }
            ]
          };
        }
      }
      
      // Add system message with context if needed
      if (currentConversation.contextFiles?.length > 0) {
        let contextPrompt = 'Using the following files as context:\n\n';
        currentConversation.contextFiles.forEach(file => {
          contextPrompt += `File: ${file.name}\nContent: ${file.content}\n\n`;
        });
        contextPrompt += 'Now, responding to the user query:\n\n';
        messages.unshift({
          role: 'system',
          content: contextPrompt
        });
      } else if (settings.systemPrompt) {
        // Add the custom system prompt if there are no context files
        messages.unshift({
          role: 'system',
          content: settings.systemPrompt
        });
      }
      
      // Create a placeholder assistant message with a unique ID
      // Make sure the timestamp is slightly later than the user message to maintain correct ordering
      const currentTimestamp = Date.now() + 100; // Add 100ms to ensure it comes after the user message
      const assistantMessageId = `assistant-${currentTimestamp}`;
      const placeholderMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: currentTimestamp,
        isStreaming: true
      };
      
      console.log('Creating assistant message with timestamp:', currentTimestamp);
      
      // Add the placeholder message to the conversation
      // Fix: Remove conversationId parameter since the function only expects the message
      addMessageToConversation(placeholderMessage);
      forceConversationUpdate();
      scrollToBottom();
      
      // Define a streaming message that will be updated during streaming
      const streamingMessage = { ...placeholderMessage };
      
      // Define the streaming callback function
      const handleStreamUpdate = (streamData) => {
        // Update the streaming message with the new content
        streamingMessage.content = streamData.content;
        streamingMessage.isStreaming = !streamData.done;
        
        // Update the message in the conversation
        updateMessageInConversation(currentConversationId, assistantMessageId, streamingMessage);
        
        // Force UI update and scroll
        forceConversationUpdate();
        scrollToBottom();
        
        // If stream is complete, update UI state
        if (streamData.done) {
          setIsStreaming(false);
          setIsLoading(false);
          endApiCall();
          // Focus the textarea after completion
          if (typeof focusTextArea === 'function') {
            focusTextArea();
          }
        }
      };
      
      // Create a new AbortController for this request
      const controller = new AbortController();
      setAbortController(controller);

      // Track whether we've already attached the request data for this call
      let requestAttached = false;
      
      // Store the current conversation ID before making the API call
      const activeConversationId = currentConversationId;
      console.log('Storing active conversation ID for this request:', activeConversationId);
      
      // Generate response using OpenAI API with streaming
      const response = await generateOpenAIResponse(
        messages,
        settings.model,
        settings.temperature,
        settings.topP,
        settings.maxTokens,
        settings.frequencyPenalty,
        settings.presencePenalty,
        // Use the captured conversation ID in the stream handler
        (streamData) => {
          // Attach request data to the originating user message on the first update
          if (!requestAttached && streamData.request) {
            requestAttached = true;
            try {
              const safeRequestData = JSON.parse(JSON.stringify(streamData.request));
              // Use updateMessageInConversation to avoid race conditions with stale state
              updateMessageInConversation(activeConversationId, userMessage.id, { requestData: safeRequestData });
              // Also keep local state in sync for any legacy consumers
              setRequestData(safeRequestData);
              console.log('Attached requestData to user message:', userMessage.id);
            } catch (attachError) {
              console.error('Error attaching request data to user message:', attachError);
            }
          }
          
          // Update the streaming message with the new content
          streamingMessage.content = streamData.content;
          streamingMessage.isStreaming = !streamData.done;
          
          // Update the message in the conversation - using the stored ID to prevent switching
          updateMessageInConversation(activeConversationId, assistantMessageId, streamingMessage);
          
          // Force UI update and scroll
          forceConversationUpdate();
          scrollToBottom();
          
          // If stream is complete, update UI state
          if (streamData.done) {
            setIsStreaming(false);
            setIsLoading(false);
            endApiCall();
            // Focus the textarea after completion
            if (typeof focusTextArea === 'function') {
              focusTextArea();
            }
          }
        },
        controller.signal,
        // GPT-5 specific options
        settings.model && settings.model.startsWith('gpt-5') ? {
          reasoningEffort: settings.reasoningEffort
        } : {}
      );
      
      // Set the API response for debugging
      setApiResponse(response);
      
      // Attach the API response directly to the assistant message in the conversation
      try {
        updateMessageInConversation(activeConversationId, assistantMessageId, { apiResponse: response });
        console.log('Attached apiResponse to assistant message:', assistantMessageId);
      } catch (attachError) {
        console.error('Error attaching API response to assistant message:', attachError);
      }
      
      // Auto-generate title after the very first assistant response
      setTimeout(() => {
        const latestConv = getCurrentConversation();
        if (latestConv) {
          const userMsgs = latestConv.messages.filter(m => m.role === 'user');
          const assistantMsgs = latestConv.messages.filter(m => m.role === 'assistant' && m.content && m.content.length > 0);
          if (userMsgs.length === 1 && assistantMsgs.length >= 1) {
            handleGenerateTitle();
          }
        }
      }, 1200);
      
    } catch (error) {
      console.error('Error in handleChatResponse:', error);

      const message = error && typeof error.message === 'string' ? error.message : String(error || '');
      const isAbortError =
        (error && error.name === 'AbortError') ||
        message === 'REQUEST_ABORTED' ||
        (typeof message === 'string' && message.toLowerCase().includes('aborted'));

      // Only show an error if this was not an intentional abort (Stop button)
      if (!isAbortError) {
        setError(message || 'Failed to generate response');
      }

      setIsStreaming(false);
      setIsLoading(false);
      endApiCall();
    }
  };
  
  const handleInterruptResponse = () => {
    console.log('Interrupting stream');
    
    // Immediately update UI state to stop showing streaming indicators
    setIsStreaming(false);
    setIsLoading(false);
    
    // Abort the fetch request if there's an active controller
    if (abortController) {
      console.log('Aborting fetch request');
      abortController.abort();
      setAbortController(null);
    }
    
    // Directly remove typing indicators from the DOM
    try {
      // Use setTimeout to ensure this runs after the current execution context
      setTimeout(() => {
        const typingIndicators = document.querySelectorAll('.typing-indicator');
        console.log('Found typing indicators to remove:', typingIndicators.length);
        typingIndicators.forEach(indicator => {
          indicator.style.display = 'none';
        });
      }, 0);  
    } catch (error) {
      console.error('Error removing typing indicators:', error);
    }
    
    // Update the last message to indicate it was interrupted
    const currentConv = getCurrentConversation();
    if (currentConv && currentConv.messages) {
      // Find all streaming assistant messages and update them
      const streamingMessages = currentConv.messages.filter(m => m.role === 'assistant' && m.isStreaming);
      
      if (streamingMessages.length > 0) {
        console.log('Found streaming messages to interrupt:', streamingMessages.length);
        
        // Update all streaming messages in-place
        streamingMessages.forEach(message => {
          const updatedMessage = {
            ...message,
            content: message.content + '\n\n*Response interrupted*',
            isStreaming: false
          };
          
          updateMessageInConversation(currentConversationId, message.id, updatedMessage);
        });
      } else {
        // Fallback to the original approach if no streaming messages are found
        const sortedMessages = [...currentConv.messages].sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );
        
        // Find the last assistant message (it should be the streaming one)
        const lastAssistantMessage = sortedMessages
          .filter(m => m.role === 'assistant')
          .pop();
        
        if (lastAssistantMessage) {
          console.log('Found assistant message to interrupt:', lastAssistantMessage.id);
          
          const updatedMessage = {
            ...lastAssistantMessage,
            content: lastAssistantMessage.content + '\n\n*Response interrupted*',
            isStreaming: false
          };
          
          updateMessageInConversation(currentConversationId, lastAssistantMessage.id, updatedMessage);
        } else {
          console.log('No assistant message found to interrupt');
        }
      }
    }
    
    // Force update to ensure UI reflects changes immediately
    forceConversationUpdate();
    
    // End API call to re-enable conversation creation
    endApiCall();
    
    // Scroll to bottom to show the interrupted message
    setTimeout(() => {
      scrollToBottom();
    }, 100);
  };
  
  const handleGenerateImage = async (directPrompt = null, isFollowUp = false) => {
    // Get the current conversation to check for context
    const currentConversation = getCurrentConversation();
    
    // Check if this is a follow-up to a previous image
    let lastImagePrompt = null;
    let combinedPrompt = null;
    
    if (currentConversation && currentConversation.messages) {
      // Find the last assistant message with an image
      const sortedMessages = [...currentConversation.messages].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      
      // Find the last image message and extract its original prompt
      const lastImageMessage = sortedMessages.find(msg => msg.role === 'assistant' && msg.isImage === true);
      if (lastImageMessage && lastImageMessage.originalPrompt) {
        lastImagePrompt = lastImageMessage.originalPrompt;
        console.log('Found previous image prompt:', lastImagePrompt);
      }
    }
    
    // Use either the direct prompt (from unified field) or the imagePrompt state
    const promptToUse = directPrompt || imagePrompt.trim();
    
    if (!promptToUse) return;
    
    // If this is a follow-up and we have the last image prompt, combine them
    if (isFollowUp && lastImagePrompt) {
      combinedPrompt = `${lastImagePrompt}. ${promptToUse}`;
      console.log('Created combined prompt for follow-up:', combinedPrompt);
    } else {
      combinedPrompt = promptToUse;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Start API call to prevent creating new conversations
      startApiCall();
      
      if (!currentConversation) {
        throw new Error('No active conversation');
      }
      
      // Generate a unique ID for this message exchange
      const messageId = Date.now().toString();
      
      // Create the user message first with a unique ID
      const userMessage = {
        id: `user-${messageId}`,
        role: 'user',
        content: `${promptToUse}`, // Show exactly what the user typed
        timestamp: new Date().toISOString(),
        // Store the reference to the previous image prompt if this is a follow-up
        metadata: isFollowUp && lastImagePrompt ? { referencesImage: true, originalPrompt: lastImagePrompt } : {}
      };
      
      // Add the user message to the conversation immediately
      addMessageToConversation(userMessage);
      console.log('Added image generation request to conversation');
      
      // Clear the image prompt
      setImagePrompt('');
      // Clear the main input if we're using the unified field
      if (directPrompt) {
        setInput('');
      }
      
      // Force scroll to bottom to show the new message
      scrollToBottom();
      
      // Get the updated conversation after adding the user message
      const updatedConversation = getCurrentConversation();
      console.log('Current conversation for image generation:', updatedConversation);
      
      // Add a small delay to ensure the user message is displayed before starting image generation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Add a loading message to indicate image generation is in progress
      const loadingMessageId = `loading-${messageId}`;
      const loadingMessage = {
        id: loadingMessageId,
        role: 'assistant',
        content: 'Generating your image...',
        timestamp: new Date().toISOString(),
        isLoading: true,
        isImageGenerating: true // Special flag to identify image generation messages
      };
      
      addMessageToConversation(loadingMessage);
      forceConversationUpdate();
      scrollToBottom();
      
      // Wait a moment to ensure the loading message is displayed
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log('Generating image with combined prompt:', isFollowUp ? combinedPrompt : promptToUse);
      
      // Get conversation history for context-aware image generation
      const conversationMessages = currentConversation?.messages || [];
      console.log('Including conversation context for image generation', conversationMessages.length, 'messages');
      
      // Generate the image with a size that's supported by DALL-E 3
      // Use the combined prompt for the actual generation if this is a follow-up
      // Also pass conversation history to make images more contextually relevant
      const response = await generateOpenAIImage(
        isFollowUp ? combinedPrompt : promptToUse, 
        1, 
        '1024x1024',
        conversationMessages
      );
      
      // Get the current conversation and check if the loading message is still there
      const currConvo = getCurrentConversation();
      const loadingMessageIndex = currConvo.messages.findIndex(msg => msg.id === loadingMessageId);
      
      // Create the assistant message with the generated image
      const assistantMessage = {
        id: loadingMessageId, // Use the same ID as the loading message
        role: 'assistant',
        content: `![Generated Image](${response.data[0].url})\n\n*Image generated based on prompt: "${promptToUse}"*`,
        timestamp: new Date().toISOString(),
        isImage: true,
        originalPrompt: promptToUse,
        isLoading: false, // Explicitly set isLoading to false
        isImageGenerating: false // Clear the image generation flag
      };
      
      // Replace the loading message with the image message using updateMessageInConversation
      updateMessageInConversation(currentConversationId, loadingMessageId, assistantMessage);
      forceConversationUpdate();
      scrollToBottom();
    } catch (err) {
      console.error('Error generating image:', err);
      setError(err.message || 'Failed to generate image');
      
      // Add error message to conversation
      const errorMessage = {
        role: 'system',
        content: `Error: ${err.message || 'Failed to generate image'}`,
        timestamp: new Date().toISOString(),
        isError: true
      };
      
      addMessageToConversation(errorMessage);
    } finally {
      setIsLoading(false);
      // End API call to re-enable conversation creation
      endApiCall();
    }
  };
  
  const handleGenerateResponse = async () => {
    if (!input.trim()) return;
    
    // Clear any previous errors
    setError(null);
    
    // Classify the user's intent to determine if they want to generate an image or text
    const userInput = input.trim();
    const { intent, confidence } = classifyIntent(userInput);
    
    console.log(`Intent classification: ${intent} (confidence: ${confidence})`);  
    
    // If the intent is for image generation with high confidence, use the image generator
    if (intent === 'image' && confidence >= 0.75) {
      // Set the image prompt and call the image generation handler
      setImagePrompt(userInput);
      handleGenerateImage(userInput);
      return;
    }
    
    try {
      // Get the current conversation first
      const currentConversation = getCurrentConversation();
      if (!currentConversation) {
        throw new Error('No active conversation');
      }
      
      // Store a reference to the current conversation ID
      const currentConversationId = currentConversation.id;
      
      // Generate a unique ID for this message exchange
      const messageId = Date.now().toString();
      
      // Store the input value before clearing it
      const userInput = input.trim();
      
      // Create the user message with a truly unique ID that includes a random component
      // Include empty requestData object that will be populated after the API call
      const userMessage = {
        id: `user-${messageId}`,
        role: 'user',
        content: userInput,
        timestamp: new Date().toISOString(),
        requestData: {}
      };
      
      // Store the user message for later reference (in case we need it)
      const storedUserMessage = { ...userMessage };
      
      // Clear the input field immediately
      setInput('');
      
      // Add the user message to the conversation and get the updated conversation
      const updatedConversation = addMessageToConversation(userMessage);
      
      // Force conversation update to ensure UI reflects the new message
      forceConversationUpdate();
      
      // Force scroll to bottom to show the new message
      scrollToBottom();
      
      // Wait for the UI to update with the user message
      // This ensures the message is visible before we start loading
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Now set loading state AFTER the user message is displayed
      setIsLoading(true);
      setIsStreaming(true); // Set streaming state to true to show the interrupt button
      
      // Start API call to prevent creating new conversations
      startApiCall();
      
      if (!updatedConversation || !updatedConversation.messages) {
        throw new Error('Conversation data is not available');
      }
      
      // Create a deep copy of the messages to avoid reference issues
      // Make sure we're only sending the necessary data to the API
      // First sort the messages by timestamp to ensure correct chronological order
      const sortedConversationMessages = [...updatedConversation.messages || []]
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Then map to the format expected by the API
      const messages = sortedConversationMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Ensure we have at least one message in the array
      if (messages.length === 0) {
        console.warn('No messages found in conversation, adding current user input');
        // Add the current user message if the array is empty
        messages.push({
          role: 'user',
          content: userInput // Use the stored input value
        });
      }
      
      // Add system message with context if needed
      if (currentConversation.contextFiles?.length > 0) {
        let contextPrompt = 'Using the following files as context:\n\n';
        currentConversation.contextFiles.forEach(file => {
          contextPrompt += `File: ${file.name}\nContent: ${file.content}\n\n`;
        });
        contextPrompt += 'Now, responding to the user query:\n\n';
        messages.unshift({
          role: 'system',
          content: contextPrompt
        });
      } else if (settings.systemPrompt) {
        // Add the custom system prompt if there are no context files
        messages.unshift({
          role: 'system',
          content: settings.systemPrompt
        });
      }
      
      // Create a placeholder assistant message with a truly unique ID
      const assistantMessageId = `assistant-${messageId}`;
      const placeholderMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(new Date().getTime() + 100).toISOString(), // Ensure timestamp is after user message
        isStreaming: true // Flag to indicate this is a streaming message
      };
      
      console.log('Adding placeholder message with ID:', assistantMessageId);
      
      // Create a synchronous function to add the message and wait for confirmation
      const addPlaceholderAndWait = async () => {
        // Add the placeholder message to the conversation
        const updatedWithPlaceholder = addMessageToConversation(placeholderMessage);
        
        // Force update and wait to ensure the UI updates with the placeholder
        forceConversationUpdate();
        
        // Wait for the update to take effect
        await new Promise(resolve => setTimeout(resolve, 800)); // Increased wait time
        
        // Make sure we're working with the most up-to-date conversation
        const updatedConv = getCurrentConversation();
        
        // Verify the placeholder message was added successfully
        if (updatedConv && Array.isArray(updatedConv.messages)) {
          const msgExists = updatedConv.messages.some(m => m.id === assistantMessageId);
          console.log('Placeholder message exists in conversation:', msgExists,
                     'Total messages:', updatedConv.messages.length,
                     'Message IDs:', updatedConv.messages.map(m => m.id));
          
          // If message wasn't added, try again once more
          if (!msgExists) {
            console.log('Placeholder not found, adding again...');
            addMessageToConversation(placeholderMessage);
            forceConversationUpdate();
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          return updatedConv;
        } else {
          console.error('No valid conversation found after adding placeholder');
          return null;
        }
      };
      
      // Execute the function and wait for it to complete
      const currentConvBeforeAssistant = await addPlaceholderAndWait();
      
      // Always verify the conversation has the latest messages
      if (!currentConvBeforeAssistant || !Array.isArray(currentConvBeforeAssistant.messages)) {
        console.error('Invalid conversation state before adding assistant message');
        // Force a refresh of the conversation
        forceConversationUpdate();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Get all conversations to verify if the user message exists in any of them
      const allConversations = [...conversations];
      const conversationWithUserMsg = allConversations.find(conv => 
        conv.messages?.some(m => m.id === storedUserMessage.id)
      );
      
      // If the user message doesn't exist in any conversation, add it to the current one
      if (!conversationWithUserMsg) {
        console.log('User message not found in any conversation, adding it before assistant response');
        
        // Re-add the user message that we stored earlier
        addMessageToConversation(storedUserMessage);
        
        // Force update and wait to ensure the UI updates
        forceConversationUpdate();
        await new Promise(resolve => setTimeout(resolve, 300));
      } else if (conversationWithUserMsg.id !== currentConversationId) {
        // If the message exists but in a different conversation, switch to that conversation
        console.log('User message found in different conversation, switching to it');
        setCurrentConversationId(conversationWithUserMsg.id);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Store the streaming message in a variable accessible to the streaming handler
      let streamingMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(new Date().getTime() + 100).toISOString(),
        isStreaming: true
      };
      
      // Function to handle streaming updates
      const handleStreamUpdate = (streamData) => {
        console.log('Stream update received:', streamData.done ? 'FINAL' : 'partial', 
                   'Content length:', streamData.content.length,
                   'First 20 chars:', streamData.content.substring(0, 20));
        
        // Update our local copy of the streaming message
        streamingMessage.content = streamData.content;
        streamingMessage.isStreaming = !streamData.done;
        
        // Update the isStreaming state based on the streaming status
        if (streamData.done) {
          console.log('Stream is complete, updating UI state');
          setIsStreaming(false);
          setIsLoading(false);
          setAbortController(null);
          
          // Add usage information to the message
          streamingMessage.usage = {
            completion_tokens: streamData.tokenCount,
            total_tokens: streamData.tokenCount + (messages.reduce((acc, msg) => acc + msg.content.length / 4, 0))
          };
          
          // End API call to re-enable conversation creation
          endApiCall();
          
          // Auto-generate title after the very first assistant response
          setTimeout(() => {
            const latestConv = getCurrentConversation();
            if (latestConv) {
              const userMsgs = latestConv.messages.filter(m => m.role === 'user');
              const assistantMsgs = latestConv.messages.filter(m => m.role === 'assistant' && m.content && m.content.length > 0);
              if (userMsgs.length === 1 && assistantMsgs.length >= 1) {
                handleGenerateTitle();
              }
            }
          }, 1200);
        }
        
        // Find the current conversation
        const currentConv = getCurrentConversation();
        if (!currentConv) {
          console.error('No current conversation found in handleStreamUpdate');
          return;
        }
        
        // Find the assistant message by ID
        let messageIndex = currentConv.messages?.findIndex(m => m.id === assistantMessageId);
        
        // If message not found, use the addMessageToConversation function
        if (messageIndex === -1) {
          console.log('Message not found in conversation, adding it with addMessageToConversation');
          
          // Create a new message object with the current content
          const messageToAdd = {
            ...streamingMessage,
            content: streamData.content,
            isStreaming: !streamData.done
          };
          
          // Add the message using the existing function
          addMessageToConversation(messageToAdd);
          
          // Force an update and scroll
          forceConversationUpdate();
          scrollToBottom();
          
          // Wait a bit for the update to take effect before continuing
          setTimeout(() => {
            // Check if the message was added
            const updatedConv = getCurrentConversation();
            if (updatedConv) {
              console.log('Message added. Conversation now has', 
                         updatedConv.messages?.length, 'messages');
            }
          }, 100);
          
          return;
        }
        
        console.log('Updating message at index:', messageIndex, 'Current content length:', 
                   currentConv.messages[messageIndex].content.length);
        
        // Create an updated message with the new content
        const updatedMessage = {
          ...currentConv.messages[messageIndex],
          content: streamData.content,
          isStreaming: !streamData.done
        };
        
        // If the streaming is done, add the usage information
        if (streamData.done) {
          updatedMessage.usage = {
            completion_tokens: streamData.tokenCount,
            total_tokens: streamData.tokenCount + (messages.reduce((acc, msg) => acc + msg.content.length / 4, 0))
          };
          console.log('Streaming complete, final message length:', streamData.content.length);
        }
        
        // Create a new messages array with the updated message
        const updatedMessages = [...currentConv.messages];
        updatedMessages[messageIndex] = updatedMessage;
        
        // Update the conversation with the new messages array
        setConversations(prevConversations => {
          return prevConversations.map(conv => {
            if (conv.id === currentConv.id) {
              return {
                ...conv,
                messages: updatedMessages,
                updatedAt: new Date().toISOString()
              };
            }
            return conv;
          });
        });
        
        // Force an update to ensure the UI reflects the changes
        forceConversationUpdate();
        
        // Scroll to bottom to show the updated message
        scrollToBottom();
      };
      
      // Create a new AbortController for this request
      const controller = new AbortController();
      setAbortController(controller);
      
      // Generate response using OpenAI API with streaming
      const response = await generateOpenAIResponse(
        messages,
        settings.model,
        settings.temperature,
        settings.topP,
        settings.maxTokens,
        settings.frequencyPenalty,
        settings.presencePenalty,
        handleStreamUpdate, // Pass the streaming callback
        controller.signal, // Pass the abort signal
        // GPT-5 specific options
        settings.model && settings.model.startsWith('gpt-5') ? {
          reasoningEffort: settings.reasoningEffort
        } : {}
      );
      
      // Save API response and request data for inspection
      setApiResponse(response);
      
      // Store the request data directly with the message
      // Find the user message in the current conversation and update it with the request data
      const convWithRequestData = { ...currentConversation };
      
      // Attach the API response to the most recent assistant message
      const assistantMessageIndex = convWithRequestData.messages.findIndex(m => m.id === assistantMessageId);
      if (assistantMessageIndex !== -1) {
        convWithRequestData.messages[assistantMessageIndex].apiResponse = response;
      }
      const userMessageIndex = convWithRequestData.messages.findIndex(m => m.id === storedUserMessage.id);
      
      if (userMessageIndex !== -1) {
        // Use the actual request data from the API response if available
        // This contains the exact payload that was sent to the API
        let actualRequestData = null;
        if (response && response.request) {
          console.log('Using actual request data from API response');
          actualRequestData = response.request;
        } else {
          // Fallback to constructing our own request object if not available
          console.log('Constructing fallback request data');
          actualRequestData = {
            model: settings.model,
            messages: messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            temperature: settings.temperature,
            top_p: settings.topP,
            max_tokens: settings.maxTokens,
            stream: isStreaming,
            n: 1
          };
        }
        
        // Ensure we have a clean deep copy to avoid reference issues
        const safeRequestData = JSON.parse(JSON.stringify(actualRequestData));
        console.log('Request data to store:', safeRequestData);
        
        // Add the request data directly to the user message
        convWithRequestData.messages[userMessageIndex].requestData = safeRequestData;
        
        // Update the conversation in the conversations array
        const updatedConversations = conversations.map(conv => 
          conv.id === currentConversationId ? convWithRequestData : conv
        );
        setConversations(updatedConversations);
        
        // Also update the local requestData state for backward compatibility
        setRequestData(safeRequestData);
        
        // Force a conversation update to reflect changes
        forceConversationUpdate();
      }
      
      // Keep this for backward compatibility
      setRequestData(response.request);
      
      // Auto-generate a conversation title after the first exchange in a new chat
      const latestConversation = typeof getCurrentConversation === 'function' ? getCurrentConversation() : null;
      if (
        latestConversation &&
        latestConversation.title === 'New Conversation'
      ) {
        const userMessagesCount = latestConversation.messages?.filter(msg => msg.role === 'user').length || 0;
        const assistantMessagesCount = latestConversation.messages?.filter(msg => msg.role === 'assistant').length || 0;

        if (
          userMessagesCount === 1 &&
          assistantMessagesCount === 1 &&
          !isGeneratingTitle
        ) {
          handleGenerateTitle();
        }
      }

      // We'll generate the title after streaming is complete to ensure we have the full response
      
      // Wait a moment to ensure the UI updates with the assistant message
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Force scroll to bottom again to show the response
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    } catch (err) {
      console.error('Error generating response:', err);
      setError(err.message || 'Failed to generate response');
      
      // Add error message to conversation
      const errorMessage = {
        role: 'system',
        content: `Error: ${err.message || 'Failed to generate response'}`,
        timestamp: new Date().toISOString(),
        isError: true
      };
      
      addMessageToConversation(errorMessage);
    } finally {
      setIsLoading(false);
      // End API call to re-enable conversation creation
      endApiCall();
    }
  };
  
  const handleFileUpload = async (files) => {
    for (const file of files) {
      try {
        const fileInfo = await parseFile(file);
        addContextFileToConversation(fileInfo);
        
        // Add system message about file upload
        const fileMessage = {
          role: 'assistant',
          content: `File uploaded: ${file.name} (${formatFileSize(file.size)})`,
          timestamp: Date.now(),
          isFileNotification: true
        };
        
        // Fix: Remove conversationId parameter
        addMessageToConversation(fileMessage);
      } catch (err) {
        console.error('Error uploading file:', err);
        setError(err.message || 'Failed to upload file');
        
        // Add error message to conversation
        const errorMessage = {
          role: 'assistant',
          content: `Error uploading file ${file.name}: ${err.message || 'Unknown error'}`,
          timestamp: Date.now(),
          isError: true
        };
        
        // Fix: Remove conversationId parameter
        addMessageToConversation(errorMessage);
      }
    }
    
    setShowFileUploader(false);
  };
  
  const handleRemoveFile = (fileId) => {
    removeContextFileFromConversation(fileId);
  };
  
  const handleToggleSettings = () => {
    toggleSettings();
    setShowFileUploader(false);
    // Force update messages to refresh API details visibility
    setTimeout(() => forceConversationUpdate(), 100);
  };
  
  /**
   * Handle questions about document content (PDF, Word, Excel, Image)
   * @param {string} question - The user's question about the document
   * @param {string} userMessageId - The ID of the user's message
   */
  const handleDocumentQuestion = async (question, userMessageId) => {
    console.log(`handleDocumentQuestion called for ${activeDocumentType} with question:`, question);
    console.log('Using user message ID:', userMessageId);
    
    // Save the active conversation ID at the start of the function
    // This ensures we use the same conversation even if it changes during async operations
    const activeConversationId = currentConversationId;
    
    // Initialize documentType outside try block so it's accessible in catch block
    let documentType = activeDocumentType;
    
    try {
      // Determine which document type is active and validate it
      // Figure out the document type based on active state if not explicitly set
      if (!documentType) {
        if (isPdfMode) documentType = 'pdf';
        else if (isWordMode) documentType = 'word';
        else if (isExcelMode) documentType = 'excel';
        else if (isImageAnalysisMode) documentType = 'image';
        else documentType = 'pdf'; // Default to PDF for backward compatibility
      }
      
      // Determine which document and vector store to use
      let vectorStore;
      let activeFileName;
      
      switch (documentType) {
        case 'pdf':
          vectorStore = pdfVectorStore;
          activeFileName = activePdfFileName;
          break;
        case 'word':
          vectorStore = wordVectorStore;
          activeFileName = activeWordFileName;
          break;
        case 'excel':
          vectorStore = excelVectorStore;
          activeFileName = activeExcelFileName;
          break;
        case 'image':
          vectorStore = imageVectorStore;
          activeFileName = activeImageName;
          break;
        default:
          throw new Error(`Unknown document type: ${documentType}`);
      }
      
      if (!vectorStore) {
        throw new Error(`No ${documentType} document loaded. Please upload a document first.`);
      }
      
      console.log(`Using ${documentType} vector store with ID:`, 
                 documentType === 'pdf' ? activePdfDocumentId :
                 documentType === 'word' ? activeWordDocumentId :
                 documentType === 'excel' ? activeExcelDocumentId :
                 activeImageId);
      
      // Get chunks relevant to the question using similarity search
      let queryFunction;
      
      switch (documentType) {
        case 'pdf':
          queryFunction = queryPdfVectorStore;
          break;
        case 'word':
          queryFunction = queryWordVectorStore;
          break;
        case 'excel':
          queryFunction = queryExcelVectorStore;
          break;
        case 'image':
          queryFunction = queryImageVectorStore;
          break;
        default:
          throw new Error(`Unknown document type: ${documentType}`);
      }
      
      console.log(`Querying ${documentType} vector store for question:`, question);
      const relevantChunks = await queryFunction(vectorStore, question);
      
      console.log(`Retrieved ${relevantChunks?.length || 0} relevant chunks from ${documentType} store`);
      console.log('Vector store document count:', vectorStore.documents?.length);
      
      // Integrate with the conversation's context files to ensure persistence between queries
      const currentConv = getCurrentConversation();
      if (currentConv) {
        // Check if the current document is already in the context files
        const docExists = currentConv.contextFiles?.some(file => 
          file.name === activeFileName && file.type === documentType
        );
        
        // If not, add it to ensure it's included in vector store enhancement
        if (!docExists) {
          console.log(`Adding ${documentType} document to conversation context files`);
          addContextFileToConversation({
            id: `${documentType}-${Date.now()}`,
            name: activeFileName,
            type: documentType,
            vectorStoreId: documentType === 'pdf' ? activePdfDocumentId :
                          documentType === 'word' ? activeWordDocumentId :
                          documentType === 'excel' ? activeExcelDocumentId :
                          activeImageId
          });
        }
      }
      
      // Get the user's message object from the conversation
      let userMessageObj = currentConv?.messages?.find(msg => msg.id === userMessageId);
      
      // If we don't have a user message, create one instead of throwing an error
      // But don't add it to the conversation to avoid duplicates - userMessageId should
      // always refer to a message that was already added in handleSendMessage
      if (!userMessageObj) {
        console.log('No user message found, using a temporary message object');
        userMessageObj = {
          id: userMessageId || `default-${Date.now()}`,
          role: 'user',
          content: question,
          timestamp: Date.now()
        };
        // Do NOT add it to the conversation - we only use this object for context
        // The original message was already added in handleSendMessage
      }
      
      // Set the appropriate document context in the user message
      // This helps the vector store helper identify which document to query
      if (userMessageObj) {
        let vectorStoreId = '';
        
        // Get the correct vector store ID based on document type
        switch (documentType) {
          case 'pdf':
            vectorStoreId = activePdfDocumentId;
            console.log(`Setting PDF document context with ID: ${vectorStoreId} for file: ${activeFileName}`);
            break;
          case 'word':
            vectorStoreId = activeWordDocumentId;
            console.log(`Setting Word document context with ID: ${vectorStoreId} for file: ${activeFileName}`);
            break;
          case 'excel':
            vectorStoreId = activeExcelDocumentId;
            console.log(`Setting Excel document context with ID: ${vectorStoreId} for file: ${activeFileName}`);
            break;
          case 'image':
            vectorStoreId = activeImageId;
            console.log(`Setting Image document context with ID: ${vectorStoreId} for file: ${activeFileName}`);
            break;
          default:
            console.log(`Unknown document type: ${documentType}`);
            break;
        }
        
        userMessageObj.documentContext = {
          type: documentType,
          fileName: activeFileName,
          vectorStoreId: vectorStoreId
        };
        
        // For PDF documents, ensure we have the right vector store in memory
        if (documentType === 'pdf' && pdfVectorStore && pdfVectorStore.documents) {
          console.log(`Verified PDF vector store has ${pdfVectorStore.documents.length} documents`);
        } else if (documentType === 'pdf') {
          console.warn('PDF vector store is missing or has no documents!');
        }
      }
      
      // Update the user message with document context
      updateMessageInConversation(activeConversationId, userMessageId, userMessageObj);
      
      try {
        // Special handling for image documents to support image generation capabilities
        if (documentType === 'image' && vectorStore) {
          // Make sure we have a valid URL and analysis content
          const imageUrl = vectorStore.imageDataUrl || '';
          const analysis = (vectorStore.documents && vectorStore.documents[0]) 
            ? vectorStore.documents[0].pageContent || 'No analysis available'
            : 'No analysis available';
            
          userMessageObj.imageData = {
            url: imageUrl,
            analysis: analysis
          };
          console.log('Including image data URL in the message metadata for image analysis');
          
          // For images, we need to handle the special response format from answerFromImage
          // which can return either text or a new generated image
          
          // First create and add a temporary loading message
          const loadingMessageId = `loading-${Date.now()}`;
          const loadingMessage = {
            id: loadingMessageId,
            role: 'assistant',
            content: 'Analyzing your question about the image...',
            timestamp: Date.now(),
            isLoading: true
          };
          
          addMessageToConversation(loadingMessage);
          forceConversationUpdate();
          scrollToBottom();
          
          // Import the image analysis function directly to get its structured response
          const { answerFromImage } = await import('../services/api');
          
          // Call the answer function with the question and relevant chunks
          const response = await answerFromImage(question, relevantChunks);
          console.log('Received response from answerFromImage:', response);
          
          // Create a response message based on the type of response
          let responseMessage;
          
          if (response.type === 'image') {
            // This is an image generation/modification response
            responseMessage = {
              id: loadingMessageId, // Replace the loading message
              role: 'assistant',
              content: response.content,
              timestamp: Date.now(),
              imageUrl: response.imageUrl, // Add the generated image URL
              isImage: true,
              isLoading: false
            };
            console.log('Created image response message with URL:', response.imageUrl);
          } else {
            // This is a regular text response
            responseMessage = {
              id: loadingMessageId, // Replace the loading message
              role: 'assistant',
              content: response.content,
              timestamp: Date.now(),
              isLoading: false
            };
          }
          
          // Update the message in the conversation
          updateMessageInConversation(activeConversationId, loadingMessageId, responseMessage);
          forceConversationUpdate();
          scrollToBottom();
          
          return; // We've handled the response, no need to call handleChatResponse
        }
        
        // For PDF documents, we want to ensure content is included even if vector search fails
        if (documentType === 'pdf') {
          console.log('Using special handling for PDF document question');
          
          // Create a system message that includes some PDF content directly
          const currentConv = getCurrentConversation();
          if (currentConv && pdfVectorStore && pdfVectorStore.documents && pdfVectorStore.documents.length > 0) {
            // Create a modified version of the user message for this specific response
            const enhancedUserMsg = {...userMessageObj};
            
            // Prepare a direct context message with the first few chunks of PDF content
            let pdfContext = `I'm asking about this PDF document: ${activeFileName}.\n\nHere are some excerpts from the document:\n`;
            
            // Include the first 3 chunks or fewer if there aren't that many
            const chunks = Math.min(3, pdfVectorStore.documents.length);
            for (let i = 0; i < chunks; i++) {
              if (pdfVectorStore.documents[i] && pdfVectorStore.documents[i].pageContent) {
                pdfContext += `\nExcerpt ${i+1}:\n${pdfVectorStore.documents[i].pageContent.substring(0, 1000)}\n`;
              }
            }
            
            // Add a prefix to make it clear this is a question about a document
            const enhancedQuestion = `${pdfContext}\n\nMy question about this document is: ${question}`;
            
            // Check if the document has content
            if (!pdfVectorStore.documents || pdfVectorStore.documents.length === 0 ||
                !pdfVectorStore.documents[0].pageContent || pdfVectorStore.documents[0].pageContent.trim() === '') {
              console.error('PDF vector store exists but has no valid document content!');
              // Load the document content directly if we have a vectorStoreId
              if (userMessageObj.documentContext && userMessageObj.documentContext.vectorStoreId) {
                try {
                  console.log('Attempting to reload PDF content from IndexedDB');
                  const { loadVectorStore } = await import('../services/pdfService');
                  const apiKey = localStorage.getItem('openai_api_key');
                  const reloadedVectorStore = await loadVectorStore(userMessageObj.documentContext.vectorStoreId, apiKey);
                  
                  if (reloadedVectorStore && reloadedVectorStore.documents && reloadedVectorStore.documents.length > 0) {
                    console.log('Successfully reloaded PDF content from IndexedDB');
                    setPdfVectorStore(reloadedVectorStore); // Update the state using the setter only
                  }
                } catch (loadError) {
                  console.error('Failed to reload PDF content:', loadError);
                }
              }
            }
            
            // Double-check for content again
            if (!pdfVectorStore.documents || pdfVectorStore.documents.length === 0 ||
                !pdfVectorStore.documents[0].pageContent || pdfVectorStore.documents[0].pageContent.trim() === '') {
              // Still no content, return an error message
              const errorMessageId = `pdf-error-${Date.now()}`;
              const errorMessage = {
                id: errorMessageId,
                role: 'assistant',
                content: `I couldn't access the content of the PDF document "${activeFileName}". The document might not have been properly processed or might be empty. Please try uploading it again.`,
                timestamp: Date.now(),
                isError: true
              };
              
              addMessageToConversation(errorMessage);
              forceConversationUpdate();
              scrollToBottom();
              return;
            }
            
            // Create a standard message array with our enhanced content
            const messages = [
              {
                role: 'system',
                content: 'You are a helpful assistant answering questions about PDF documents. Answer based on the content provided.'
              },
              {
                role: 'user',
                content: enhancedQuestion
              }
            ];
            
            // Create a placeholder assistant message
            const assistantMessageId = `assistant-${Date.now()}`;
            const placeholderMessage = {
              id: assistantMessageId,
              role: 'assistant',
              content: 'Analyzing the PDF document...',
              timestamp: Date.now(),
              isLoading: true
            };
            
            // Add the placeholder message
            addMessageToConversation(placeholderMessage);
            forceConversationUpdate();
            scrollToBottom();
            
            try {
              // Import the API function
              const { generateOpenAIResponse } = await import('../services/api');
              
              // Call OpenAI directly with our enhanced content (non-streaming)
              const response = await generateOpenAIResponse(
                messages,
                settings.model,
                settings.temperature,
                settings.topP,
                settings.maxTokens,
                settings.frequencyPenalty,
                settings.presencePenalty,
                null, // onStreamUpdate (non-streaming)
                null, // abortSignal
                // GPT-5 specific options
                settings.model && settings.model.startsWith('gpt-5') ? {
                  verbosity: settings.verbosity,
                  reasoningEffort: settings.reasoningEffort
                } : {}
              );

              // Extract assistant content from the Responses API wrapper
              const responseContent =
                (response && response.message && response.message.content) ||
                (response && response.response &&
                  Array.isArray(response.response.choices) &&
                  response.response.choices[0] &&
                  response.response.choices[0].message &&
                  response.response.choices[0].message.content) ||
                '';

              // Update the placeholder with the response content
              const updatedMessage = {
                ...placeholderMessage,
                content: responseContent,
                isLoading: false,
                apiResponse: response
              };
              
              // Update in the conversation
              updateMessageInConversation(activeConversationId, assistantMessageId, updatedMessage);
              forceConversationUpdate();
              scrollToBottom();
              
              return; // Skip standard handler since we've handled it specially
            } catch (error) {
              console.error('Error with special PDF handling:', error);
              // Fall through to standard handler below
            }
          }
        }
        
        // For other document types or if PDF special handling failed, use the standard chat response handler
        await handleChatResponse(question, userMessageObj);
      } catch (chatError) {
        console.error('Error in document chat response:', chatError);
        throw chatError;
      }
    } catch (error) {
      console.error(`Error handling ${documentType} question:`, error);
      
      // Add an error message
      const errorMessageId = `${documentType}-error-${Date.now()}`;
      const documentTypeDisplay = documentType.charAt(0).toUpperCase() + documentType.slice(1);
      const errorMessage = {
        id: errorMessageId,
        role: 'assistant',
        content: `Error answering question about the ${documentTypeDisplay} document: ${error.message}. Please try again or check your API key settings.`,
        timestamp: Date.now(),
        isError: true
      };
      
      addMessageToConversation(errorMessage);
    }
  };
  
  // For backward compatibility, keep handlePdfQuestion as an alias to handleDocumentQuestion
  const handlePdfQuestion = (question, userMessageId) => {
    setActiveDocumentType('pdf');
    return handleDocumentQuestion(question, userMessageId);
  };
  
  // Handle Word document questions
  const handleWordQuestion = (question, userMessageId) => {
    setActiveDocumentType('word');
    return handleDocumentQuestion(question, userMessageId);
  };
  
  // Handle Excel sheet questions
  const handleExcelQuestion = (question, userMessageId) => {
    setActiveDocumentType('excel');
    return handleDocumentQuestion(question, userMessageId);
  };
  
  // Handle Image analysis questions
  const handleImageQuestion = (question, userMessageId) => {
    setActiveDocumentType('image');
    return handleDocumentQuestion(question, userMessageId);
  };
  
  const handleDocumentSelection = async (documentId, fileName, documentType, imageDataUrlOverride = null) => {
    // If documentId is null, reset the active document
    if (!documentId) {
      // eslint-disable-next-line default-case
      switch (documentType) {
        case 'pdf':
          setActivePdfDocumentId(null);
          setActivePdfFileName(null);
          setPdfVectorStore(null);
          setIsPdfMode(false);
          break;
        case 'word':
          setActiveWordDocumentId(null);
          setActiveWordFileName(null);
          setWordVectorStore(null);
          setIsWordMode(false);
          break;
        case 'excel':
          setActiveExcelDocumentId(null);
          setActiveExcelFileName(null);
          setExcelVectorStore(null);
          setIsExcelMode(false);
          break;
        case 'image':
          setActiveImageId(null);
          setActiveImageName(null);
          setImageVectorStore(null);
          setIsImageAnalysisMode(false);
          break;
      }
      
      setActiveDocumentType(null);
      return;
    }
    
    try {
      // Get API key from localStorage directly to ensure we have it
      const apiKey = localStorage.getItem('openai_api_key');
      if (!apiKey) {
        throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
      }
      
      // Initialize to track load attempts
      let loadedVectorStore = null;
      let loadError = null;
      
      // Try to load using primary method first
      try {
        console.log(`Attempting to load ${documentType} vector store with ID: ${documentId}`);
        
        // Select the appropriate load function based on document type
        let loadFunction;
        switch (documentType) {
          case 'pdf':
            loadFunction = loadPdfVectorStore;
            break;
          case 'word':
            loadFunction = loadWordVectorStore;
            break;
          case 'excel':
            loadFunction = loadExcelVectorStore;
            break;
          case 'image':
            loadFunction = loadImageVectorStore;
            break;
          default:
            loadFunction = loadPdfVectorStore;
        }
        
        // Add a timeout to prevent hanging operations
        const loadPromise = loadFunction(documentId, apiKey);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Loading ${documentType} vector store timed out after 15 seconds`)), 15000)
        );
        
        // Race the load operation against the timeout
        loadedVectorStore = await Promise.race([loadPromise, timeoutPromise]);
      } catch (primaryError) {
        console.warn(`Primary load method failed for ${documentType}:`, primaryError);
        loadError = primaryError;
        
        // Try fallback methods if primary fails
        try {
          console.log(`Trying fallback method for ${documentType} vector store...`);
          
          // Check if the document ID might be in a different format
          let possibleKeys = [];
          
          // Search for all possible keys in localStorage
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes(documentType) && key.includes('vector_store')) {
              possibleKeys.push(key);
            }
          }
          
          console.log(`Found ${possibleKeys.length} possible ${documentType} vector store keys`);
          
          // Try each possible key
          for (const key of possibleKeys) {
            try {
              console.log(`Trying key: ${key}`);
              let loadFunction;
              
              switch (documentType) {
                case 'pdf':
                  loadFunction = loadPdfVectorStore;
                  break;
                case 'word':
                  loadFunction = loadWordVectorStore;
                  break;
                case 'excel':
                  loadFunction = loadExcelVectorStore;
                  break;
                case 'image':
                  loadFunction = loadImageVectorStore;
                  break;
                default:
                  loadFunction = loadPdfVectorStore;
              }
              
              const store = await loadFunction(key, apiKey);
              
              if (store && store.documents && store.documents.length > 0) {
                console.log(`Successfully loaded ${documentType} vector store with key: ${key}`);
                loadedVectorStore = store;
                break;
              }
            } catch (keyError) {
              console.warn(`Failed to load with key ${key}:`, keyError);
              // Continue to next key
            }
          }
          
          // If still no luck, try one more approach with direct localStorage access
          if (!loadedVectorStore) {
            console.log(`Trying direct localStorage access for ${documentType}...`);
            
            // Look for any key that might contain the document name
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.includes(documentType) && 
                 (fileName && fileName.length > 3 && key.includes(fileName.substring(0, 3).toLowerCase()))) {
                try {
                  const data = JSON.parse(localStorage.getItem(key));
                  if (data && (data.documents || data.embeddings_map)) {
                    console.log(`Found potential match by filename in key: ${key}`);
                    
                    // Create embeddings instance
                    const embeddings = new OpenAIEmbeddings({
                      openAIApiKey: apiKey,
                      modelName: 'text-embedding-3-small'
                    });
                    
                    // Create vector store
                    const vectorStore = new MemoryVectorStore(embeddings);
                    vectorStore.documents = data.documents || [];
                    vectorStore.embeddings_map = data.embeddings_map || {};
                    
                    if (vectorStore.documents.length > 0) {
                      loadedVectorStore = vectorStore;
                      break;
                    }
                  }
                } catch (err) {
                  console.warn(`Error checking key ${key}:`, err);
                  // Continue to next key
                }
              }
            }
          }
        } catch (fallbackError) {
          console.error(`Fallback method also failed:`, fallbackError);
          // We'll handle this in the verification check below
        }
      }
      
      // Verify that the vector store loaded correctly
      if (!loadedVectorStore || !loadedVectorStore.documents || loadedVectorStore.documents.length === 0) {
        console.warn(`${documentType} vector store could not be loaded or contains no documents`);
        throw new Error(loadError || `No valid ${documentType} vector store found`);
      }
      
      console.log(`Successfully loaded ${documentType} vector store with ${loadedVectorStore.documents.length} documents`);
      
      // Update state based on document type
      // eslint-disable-next-line default-case
      switch (documentType) {
        case 'pdf':
          setActivePdfDocumentId(documentId);
          setActivePdfFileName(fileName);
          setPdfVectorStore(loadedVectorStore);
          setIsPdfMode(true);
          setIsWordMode(false);
          setIsExcelMode(false);
          setIsImageAnalysisMode(false);
          break;
        case 'word':
          setActiveWordDocumentId(documentId);
          setActiveWordFileName(fileName);
          setWordVectorStore(loadedVectorStore);
          setIsWordMode(true);
          setIsPdfMode(false);
          setIsExcelMode(false);
          setIsImageAnalysisMode(false);
          break;
        case 'excel':
          setActiveExcelDocumentId(documentId);
          setActiveExcelFileName(fileName);
          setExcelVectorStore(loadedVectorStore);
          setIsExcelMode(true);
          setIsPdfMode(false);
          setIsWordMode(false);
          setIsImageAnalysisMode(false);
          break;
        case 'image':
          setActiveImageId(documentId);
          setActiveImageName(fileName);
          setImageVectorStore(loadedVectorStore);
          setIsImageAnalysisMode(true);
          setIsPdfMode(false);
          setIsWordMode(false);
          setIsExcelMode(false);
          break;
      }
      
      // Set active document type
      setActiveDocumentType(documentType);

      // For images, add a visual representation in the chat
      if (documentType === 'image') {
        // Use either the provided imageUrl override or the one from the vector store
        const imageUrl = imageDataUrlOverride || (loadedVectorStore && loadedVectorStore.imageDataUrl);
        
        if (imageUrl) {
          // Check if we already have this image in the conversation
          const currentConversation = getCurrentConversation();
          let imageAlreadyInConversation = false;
          
          if (currentConversation && currentConversation.messages) {
            // Check each message to see if it contains this image URL
            imageAlreadyInConversation = currentConversation.messages.some(msg => {
              // Check in all possible locations where the image URL might be stored
              const hasMatchingImageUrl = msg.imageUrl === imageUrl;
              const hasMatchingImageData = msg.imageData && msg.imageData.url === imageUrl;
              return hasMatchingImageUrl || hasMatchingImageData;
            });
          }
          
          console.log('Image already in conversation:', imageAlreadyInConversation);
          
          // Only add the image if it's not already in the conversation
          if (!imageAlreadyInConversation) {
            // Create a message showing the uploaded image with a truly unique ID
            const timestamp = Date.now();
            const randomSuffix = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
            
            const imageMessage = {
              id: `img-${timestamp}-${randomSuffix}`,
              role: 'assistant',
              content: '', // Ensure there's always a content property even if empty
              timestamp: timestamp,
              imageUrl: imageUrl // This will trigger the image display in ChatMessage
            };
            
            // Add the image message to the conversation
            addMessageToConversation(imageMessage);
            
            // Scroll to show the newly added image
            setTimeout(scrollToBottom, 100);
          }
        }
      }

    } catch (error) {
      console.error(`Error loading ${documentType} vector store:`, error);
      setErrorMessage(`Error loading ${documentType} document: ${error.message}`);
      
      // Reset any document state since the load failed
      // eslint-disable-next-line default-case
      switch (documentType) {
        case 'pdf':
          setActivePdfDocumentId(null);
          setActivePdfFileName(null);
          setPdfVectorStore(null);
          setIsPdfMode(false);
          break;
        case 'word':
          setActiveWordDocumentId(null);
          setActiveWordFileName(null);
          setWordVectorStore(null);
          setIsWordMode(false);
          break;
        case 'excel':
          setActiveExcelDocumentId(null);
          setActiveExcelFileName(null);
          setExcelVectorStore(null);
          setIsExcelMode(false);
          break;
        case 'image':
          setActiveImageId(null);
          setActiveImageName(null);
          setImageVectorStore(null);
          setIsImageAnalysisMode(false);
          break;
      }
      
      setActiveDocumentType(null);
      
      // Create error notification message
      const errorNotification = {
        id: `${documentType}-error-${Date.now()}`,
        role: 'assistant',
        content: `Error loading ${documentType.charAt(0).toUpperCase() + documentType.slice(1)} document: ${error.message}`,
        timestamp: Date.now(),
        isError: true
      };
      
      // Add error to current conversation
      addMessageToConversation(errorNotification);
    }
  };
  
  // Specific document selection handlers for each document type
  const handlePDFSelect = (documentId, fileName) => {
    return handleDocumentSelection(documentId, fileName, 'pdf');
  };
  
  const handleWordSelect = (documentId, fileName) => {
    return handleDocumentSelection(documentId, fileName, 'word');
  };
  
  const handleExcelSelect = (documentId, fileName) => {
    return handleDocumentSelection(documentId, fileName, 'excel');
  };
  
  const handleImageSelect = (documentId, fileName, imageUrl) => {
    // Check if this is the same image we just processed (prevent duplicates)
    if (lastProcessedImage.current === imageUrl) {
      console.log('Preventing duplicate image processing');
      return;
    }
    
    // Remember this image URL to prevent duplicates
    lastProcessedImage.current = imageUrl;
    console.log('Processing image with URL:', imageUrl.substring(0, 50) + '...');
    
    // Handle document selection and pass the imageUrl to display the image once
    return handleDocumentSelection(documentId, fileName, 'image', imageUrl);
  };
  
  const toggleFileUploader = () => {
    setShowFileUploader(!showFileUploader);
    if (showSettings) toggleSettings();
  };
  
  const toggleApiResponse = () => {
    setShowApiResponse(!showApiResponse);
  };
  
  // Function to generate a title for the current conversation using AI
  const handleGenerateTitle = async () => {
    const currentConv = getCurrentConversation();
    if (!currentConv || currentConv.messages.length < 2) {
      console.log('Not enough messages to generate a title');
      return;
    }
    
    setIsGeneratingTitle(true);
    
    try {
      // Get the first few messages to use as context for title generation
      const messagesToUse = currentConv.messages.slice(0, Math.min(4, currentConv.messages.length));
      const userMessages = messagesToUse.filter(msg => msg.role === 'user');
      const assistantMessages = messagesToUse.filter(msg => msg.role === 'assistant');
      
      if (userMessages.length === 0 || assistantMessages.length === 0) {
        console.log('Could not find user and assistant messages');
        setIsGeneratingTitle(false);
        return;
      }
      
      console.log('Making API call to generate title...');
      
      // Use the generateConversationTitle function from the API service
      const generatedTitle = await generateConversationTitle(
        userMessages[0].content,
        assistantMessages[0].content
      );
      
      console.log('AI generated title:', generatedTitle);
      
      // Update the conversation title
      updateConversationTitle(currentConversationId, generatedTitle);
      console.log('Title updated successfully:', generatedTitle);
      
      // Force UI refreshes to ensure the title is updated everywhere
      forceConversationUpdate();
      
      // Schedule another refresh after a short delay to ensure UI is fully updated
      setTimeout(() => {
        forceConversationUpdate();
        
        // Verify the title was updated correctly
        const verifyConv = getCurrentConversation();
        console.log('Title verification after update:', verifyConv?.title);
      }, 100);
    } catch (error) {
      console.error('Error generating title:', error);
      
      // Fallback to simple title extraction if AI generation fails
      try {
        const assistantMessage = currentConv.messages.find(msg => msg.role === 'assistant');
        if (assistantMessage) {
          let title = assistantMessage.content.split('.')[0]; // Get first sentence
          title = title.split('\n')[0]; // Remove any newlines
          
          // Limit title length
          if (title.length > 40) {
            title = title.substring(0, 37) + '...';
          }
          
          console.log('Fallback title generated:', title);
          updateConversationTitle(currentConversationId, title);
          
          // Also apply the same UI update pattern here
          forceConversationUpdate();
          
          setTimeout(() => {
            forceConversationUpdate();
            console.log('Title verification after fallback:', getCurrentConversation()?.title);
          }, 100);
        }
      } catch (fallbackError) {
        console.error('Even fallback title generation failed:', fallbackError);
      }
    } finally {
      setIsGeneratingTitle(false);
    }
  };
  
  // Check if API details should be shown based on settings
  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    // Always show API response details when the setting is enabled and we have data
    if (settings.showApiDetails && apiResponse) {
      setShowApiResponse(true);
    } else if (!settings.showApiDetails) {
      setShowApiResponse(false);
    }
  }, [settings.showApiDetails, apiResponse]);
  
  // Also ensure we update the API response visibility when settings change
  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    if (settings.showApiDetails) {
      setShowApiResponse(true);
    }
  }, [settings.showApiDetails]);
  
  // Monitor settings changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    // No logging needed here
  }, [settings]);
  
  // Add an effect to update the UI when the conversation title changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    // This will trigger when the conversations array changes
    // which happens when a title is updated
    console.log('Conversations changed, checking if title was updated');
    
    // Force a UI refresh to ensure the title is displayed correctly
    forceConversationUpdate();
  }, [conversations, forceConversationUpdate]);
  
  // Memoize the messages rendering to prevent unnecessary re-renders
  const memoizedMessages = React.useMemo(() => {
    // Get the current conversation directly from the array
    const latestConversation = conversations.find(conv => conv.id === currentConversationId) || currentConversation;
    
    // If we have a conversation with messages, display them
    if (latestConversation && latestConversation.messages && latestConversation.messages.length > 0) {
      // Sort messages by timestamp to ensure correct order
      // Make sure to handle identical timestamps by preserving the order in the array
      // which maintains the logical user -> assistant response flow
      const sortedMessages = [...latestConversation.messages]
        .sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          
          // If timestamps are exactly the same (very unlikely with our +100ms fix)
          // Use role as secondary sort criterion - user messages should come before assistant
          if (timeA === timeB) {
            // User messages should appear before assistant messages when timestamps match
            return a.role === 'user' ? -1 : 1;
          }
          
          // Otherwise use timestamp
          return timeA - timeB;
        });
        
      console.log('Sorted messages for display:', 
        sortedMessages.map(m => ({ role: m.role, timestamp: m.timestamp, id: m.id })));
      
      // Find the most recent assistant and user messages
      const assistantMessages = sortedMessages.filter(m => m.role === 'assistant');
      const latestAssistantMessage = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1] : null;

      const userMessages = sortedMessages.filter(m => m.role === 'user');
      const latestUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
      
      return sortedMessages.map((message) => {
        // Create a message with per-message API metadata
        let enhancedMessage = { ...message };
        
        // For user messages, prefer the requestData stored on the message itself,
        // but fall back to the global requestData for the latest user message
        if (message.role === 'user') {
          if (message.requestData) {
            enhancedMessage.requestData = message.requestData;
          } else if (latestUserMessage && message.id === latestUserMessage.id && requestData) {
            enhancedMessage.requestData = requestData;
          } else {
            enhancedMessage.requestData = null;
          }
        }
        
        // For assistant messages, prefer the apiResponse stored on the message itself,
        // but fall back to the global apiResponse for the latest assistant message
        if (message.role === 'assistant') {
          if (message.apiResponse) {
            enhancedMessage.apiResponse = message.apiResponse;
          } else if (latestAssistantMessage && message.id === latestAssistantMessage.id && apiResponse) {
            enhancedMessage.apiResponse = apiResponse;
          } else {
            enhancedMessage.apiResponse = null;
          }
        }
        
        return (
          <ChatMessage 
            key={message.id || `msg-${message.role}-${message.timestamp}`}
            message={enhancedMessage} 
            showTokens={settings.showTokens}
            colorTokens={settings.colorTokens}
            requestData={message.role === 'user' ? (enhancedMessage.requestData || null) : null}
            // TTS functionality is controlled at the message level
          />
        );
      });
    }
    
    // If no messages, return null
    return null;
  }, [conversations, currentConversationId, currentConversation, settings.showTokens, settings.colorTokens, requestData, apiResponse]);

  return (
    <div className="chat-container">
      <div className="chat-header">
        <img src={SparfLogo} alt="Sparf IT" className="header-logo" />
        <div className="chat-title-container">
          <h2>{currentConversation?.title || 'New Conversation'}</h2>
          {currentConversation?.messages?.length >= 2 && (
            <button 
              className="generate-title-btn"
              onClick={handleGenerateTitle}
              disabled={isGeneratingTitle}
              title="Generate a title based on conversation content"
            >
              {isGeneratingTitle ? 'Generating...' : 'Generate Title'}
            </button>
          )}
          <button
            className="hamburger-btn"
            onClick={toggleSidebar}
            title="Toggle sidebar"
          >
            <FiMenu />
          </button>
          <button
            className="gear-settings-btn"
            onClick={handleToggleSettings}
            title={`Open settings (Current model: ${getModelDisplayName(settings.model)})`}
            aria-label="Open settings"
          >
            <FiSettings />
          </button>
        </div>
        <div className="chat-header-actions">
          <button
            className="model-indicator"
            type="button"
            onClick={handleToggleSettings}
            title={`Current model: ${settings.model}`}
          >
            Model: {getModelDisplayName(settings.model)}
          </button>
        </div>
        {/* API details now appear under assistant messages */}
      </div>
      
      <div className="chat-messages" ref={chatMessagesRef}>
        <div className="chat-messages-content">
          {currentConversation?.messages?.length === 0 ? (
            <div className="empty-chat">
              <img src={SparfLogo} alt="Sparf IT" className="empty-chat-logo" />
              <h3>SparfGPT Chat Interface</h3>
              <p>How can I help you?</p>
              
              <div className={`api-key-notice ${isApiKeySet ? 'success' : 'warning'}`}>
                {isApiKeySet ? (
                  <>
                    <p className="api-key-status-text">✓ API key is set and ready to use</p>
                    <p>You can now start chatting with the AI.</p>
                  </>
                ) : (
                  <>
                    <p>To use this application, you need to add your OpenAI API key in the settings.</p>
                    <button className="primary-btn" onClick={handleToggleSettings}>Open Settings</button>
                  </>
                )}
              </div>
              <p className="security-warning"><strong>NOTE:</strong> Do <strong>NOT</strong> share any personal information (like your full name, address or phone number) or any confidential information (like passwords or company secrets) in this chat.</p>
            </div>
          ) : (
            <div className="messages-container">
              {memoizedMessages}
            </div>
          )}
          
          {isLoading && (
            <div className="loading-message">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          {/* API response details are now shown under assistant messages */}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Disclaimer about AI accuracy - always at the bottom */}
        <div className="ai-accuracy-disclaimer">
          <p>Reminder: Not everything an AI says is 100% accurate!</p>
        </div>
      </div>
      
      {showSettings && <SettingsPanel onClose={handleToggleSettings} />}
      
      {showFileUploader && (
        <FileUploader 
          onUpload={handleFileUpload} 
          onClose={() => {
            toggleFileUploader();
            // Reset dropped files after closing
            setDroppedFiles([]);
          }}
          currentFiles={currentConversation?.contextFiles || []}
          onRemoveFile={handleRemoveFile}
          onPDFSelect={handlePDFSelect}
          onWordSelect={handleWordSelect}
          onExcelSelect={handleExcelSelect}
          onImageSelect={handleImageSelect}
          initialFiles={droppedFiles} // Pass the dropped files to be automatically processed
        />
      )}
      
      <div className="chat-input-outer">
      <div 
        className="chat-input-container"
        ref={chatInputContainerRef}
      >
        
        {/* Document mode indicators */}
        {isPdfMode && (
          <div className="document-mode-indicator pdf-mode">
            <div className="document-mode-info">
              <span className="document-icon"><FiFile /></span>
              <span className="document-name">{activePdfFileName}</span>
            </div>
            <button 
              className="exit-document-mode-btn" 
              onClick={() => {
                setIsPdfMode(false);
                setActivePdfDocumentId(null);
                setActivePdfFileName(null);
                setPdfVectorStore(null);
                setActiveDocumentType(null);
              }}
              title="Exit PDF mode"
            >
              <FiX />
            </button>
          </div>
        )}
        
        {isWordMode && (
          <div className="document-mode-indicator word-mode">
            <div className="document-mode-info">
              <span className="document-icon"><FiFile /></span>
              <span className="document-name">{activeWordFileName}</span>
            </div>
            <button 
              className="exit-document-mode-btn" 
              onClick={() => {
                setIsWordMode(false);
                setActiveWordDocumentId(null);
                setActiveWordFileName(null);
                setWordVectorStore(null);
                setActiveDocumentType(null);
              }}
              title="Exit Word mode"
            >
              <FiX />
            </button>
          </div>
        )}
        
        {isExcelMode && (
          <div className="document-mode-indicator excel-mode">
            <div className="document-mode-info">
              <span className="document-icon"><FiFile /></span>
              <span className="document-name">{activeExcelFileName}</span>
            </div>
            <button 
              className="exit-document-mode-btn" 
              onClick={() => {
                setIsExcelMode(false);
                setActiveExcelDocumentId(null);
                setActiveExcelFileName(null);
                setExcelVectorStore(null);
                setActiveDocumentType(null);
              }}
              title="Exit Excel mode"
            >
              <FiX />
            </button>
          </div>
        )}
        
        {isImageAnalysisMode && (
          <div className="document-mode-indicator image-mode">
            <div className="document-mode-info">
              <span className="document-icon"><FiFile /></span>
              <span className="document-name">{activeImageName}</span>
            </div>
            <button 
              className="exit-document-mode-btn" 
              onClick={() => {
                setIsImageAnalysisMode(false);
                setActiveImageId(null);
                setActiveImageName(null);
                setImageVectorStore(null);
                setActiveDocumentType(null);
              }}
              title="Exit Image Analysis mode"
            >
              <FiX />
            </button>
          </div>
        )}
        
  
          {isDraggingFile && (
            <div className="file-drop-overlay">
              <FiUpload size={24} />
              <p>Drop files here</p>
              <p className="dropzone-hint">PDF, Word, Excel, and images will be processed as queryable documents.</p>
            </div>
          )}
          <textarea
            className="message-input"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isPdfMode ? `Ask a question about ${activePdfFileName}` :
              isWordMode ? `Ask a question about ${activeWordFileName}` :
              isExcelMode ? `Ask a question about ${activeExcelFileName}` :
              isImageAnalysisMode ? `Ask a question about the image` :
              "Send a message"
            }
            disabled={isLoading || !isApiKeySet}
            ref={textAreaRef}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingFile(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingFile(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Only clear dragging state if we're truly leaving the element
              if (e.currentTarget === e.target) {
                setIsDraggingFile(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              
              // Clear the isDraggingFile state to hide the overlay
              setIsDraggingFile(false);
              
              // If there are files being dropped, open the file uploader and process the files
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                // Toggle the file uploader if it's not already open
                if (!showFileUploader) {
                  toggleFileUploader();
                }
                
                // Convert FileList to Array
                const droppedFiles = Array.from(e.dataTransfer.files);
                
                // Store the dropped files in state for the FileUploader component
                setDroppedFiles(droppedFiles);
              }
            }}
          />
          <button 
            className="send-button" 
            onClick={(e) => {
              console.log('Send button clicked');
              if (input.trim()) {
                console.log('Sending message from button click:', input.trim());
                handleSendMessage(e);
              } else {
                console.log('Empty input, not sending');
              }
            }}
            disabled={!input.trim() || isLoading || !isApiKeySet}
          >
            <FiSend />
          </button>
        
        
        <div className="chat-input-actions">
          <button 
            onClick={toggleFileUploader} 
            className={showFileUploader ? 'active' : ''}
            title="Upload Files & Documents"
            disabled={isLoading}
          >
            <FiPaperclip />
          </button>
          {isStreaming && (
            <button 
              className="interrupt-button" 
              onClick={handleInterruptResponse}
              title="Interrupt response"
            >
              <FiSquare />
            </button>
          )}
        </div>
      </div>
      </div>
      
      {/* Document handling is now integrated into the FileUploader component */}
      
      <div className="copyright-footer">
        <p>Copyright {new Date().getFullYear()} Sparf IT</p> 
      </div>
    </div>
  );
};

export default ChatContainer;
