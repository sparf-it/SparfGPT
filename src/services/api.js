import axios from 'axios';
import OpenAI from 'openai';
import { classifyIntent } from '../utils/intentClassifier';

// Create a global API service function container that's safe to modify
// This will allow us to intercept API calls without modifying the read-only exports
if (!window._apiServices) {
  window._apiServices = {
    // Original functions will be stored here
    original: {},
    
    // Flag to indicate if we need to intercept API calls
    interceptActive: false,
    
    // Current intercept handler function
    interceptHandler: null,
    
    // Context for the intercept
    interceptContext: null,
    
    // Setup function to initialize the service
    setup() {
      console.log('Setting up global API services');
    },
    
    // Register a function to be safely interceptable
    register(name, fn) {
      this.original[name] = fn;
      console.log(`Registered API function: ${name}`);
    },
    
    // Call the original or intercepted function
    call(name, ...args) {
      if (this.interceptActive && this.interceptHandler && name === 'generateOpenAIResponse') {
        console.log(`Intercepting call to ${name}`);
        return this.interceptHandler(this.original[name], this.interceptContext, ...args);
      } else {
        return this.original[name](...args);
      }
    },
    
    // Set up an intercept for API calls
    intercept(handler, context) {
      this.interceptActive = true;
      this.interceptHandler = handler;
      this.interceptContext = context;
    },
    
    // Clear any active intercept
    clearIntercept() {
      this.interceptActive = false;
      this.interceptHandler = null;
      this.interceptContext = null;
    }
  };
  
  window._apiServices.setup();
}

// Use the global API service to handle function calls safely

// This would typically be stored in environment variables
// For development purposes, we'll define them here
const OPENAI_API_URL = 'https://api.openai.com/v1';

// Create axios instance for OpenAI API
const openaiApi = axios.create({
  baseURL: OPENAI_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000 // 30 seconds timeout
});

// Initialize OpenAI client for SDK operations
let openaiClient = null;

// Function to get the OpenAI client with the current API key
const getOpenAIClient = () => {
  const apiKey = localStorage.getItem('openai_api_key');
  if (!apiKey) {
    console.error('No API key found');
    throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
  }
  
  // Create a new client with the current API key
  return new OpenAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true
  });
};

// Add request interceptor to ensure API key is set for each request
openaiApi.interceptors.request.use(
  config => {
    // Check if API key exists in localStorage
    const apiKey = localStorage.getItem('openai_api_key');
    if (apiKey) {
      // Set Authorization header for each request
      config.headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      console.error('No API key found in localStorage');
      throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
    }
    return config;
  },
  error => {
    console.error('Error in request interceptor:', error);
    return Promise.reject(error);
  }
);

// Set the API key for requests
export const setApiKey = (apiKey) => {
  if (!apiKey) {
    console.error('Attempted to set empty API key');
    return false;
  }
  
  try {
    // Ensure the API key is properly formatted
    const formattedKey = apiKey.trim();
    if (!formattedKey.startsWith('sk-')) {
      console.error('Invalid API key format');
      return false;
    }
    
    // Store the API key in localStorage only
    // The interceptor will add it to each request
    localStorage.setItem('openai_api_key', formattedKey);
    
    // Make a test request to verify the API key works
    testApiKey(formattedKey);
    
    console.log('API key set successfully');
    return true;
  } catch (error) {
    console.error('Error setting API key:', error);
    return false;
  }
};

// Test the API key with a simple request
const testApiKey = async (apiKey) => {
  try {
    const response = await axios.get(`${OPENAI_API_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    console.log('API key test successful:', response.status);
    return true;
  } catch (error) {
    console.error('API key test failed:', error.response?.status || error.message);
    return false;
  }
};

// Load API key from localStorage if available
export const loadApiKeys = () => {
  try {
    const openaiKey = localStorage.getItem('openai_api_key');
    
    if (openaiKey) {
      const success = setApiKey(openaiKey);
      if (!success) {
        console.warn('Failed to load API key from localStorage');
        localStorage.removeItem('openai_api_key'); // Remove invalid key
      }
    }
    
    return { openaiKey, isSet: isApiKeySet() };
  } catch (error) {
    console.error('Error loading API keys:', error);
    return { openaiKey: null, isSet: false };
  }
};

// Check if API key is set
export const isApiKeySet = () => {
  const key = localStorage.getItem('openai_api_key');
  console.log('API key check:', key ? 'Key exists' : 'No key found');
  return key !== null && key !== undefined && key.trim() !== '';
};

// OpenAI API functions

// OpenAI API functions

/**
 * Uses AI to classify user intent as either image generation or text response
 * @param {string} input - The user's input text
 * @param {Object} context - Context about the conversation
 * @param {boolean} context.lastMessageWasImage - Whether the last message was an image
 * @param {Array} context.recentMessages - Recent messages for context
 * @returns {Promise<Object>} - Classification result with intent, confidence, and source
 */
export const classifyIntentWithAI = async (input, context = {}) => {
  const { lastMessageWasImage = false, recentMessages = [] } = context;
  
  // First try the faster pattern-based classification
  const patternResult = classifyIntent(input, { lastMessageWasImage });
  
  // If we're very confident from patterns, return that result
  if (patternResult.confidence > 0.8) {
    return {
      ...patternResult,
      source: 'pattern'
    };
  }
  
  // Otherwise, use the OpenAI API for more accurate classification
  try {
    // Get the API key from storage
    const apiKey = localStorage.getItem('openai_api_key');
    if (!apiKey) {
      throw new Error('OpenAI API key is not set');
    }
    
    // Create a prompt for the AI classifier
    const recentContext = recentMessages.map(msg => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.isImage ? '[IMAGE CONTENT]' : msg.content}`
    ).join('\n');
    
    const systemPrompt = `You are an intent classifier for a chat application. 
    Determine if the user is asking for an image to be generated or if they want a text response.
    Respond with either "image" or "text". If the user is asking for an image to be created, 
    drawn, generated, or visualized in any way, classify as "image". If they're asking a question,
    requesting information, or any other type of text response, classify as "text".
    Take into account if the previous message contained an image, as the user might be referring
    to that image or requesting modifications to it.`;
    
    const userPrompt = `${recentContext ? `Recent conversation context:\n${recentContext}\n\n` : ''}
    ${lastMessageWasImage ? 'Note: The last message from the assistant contained an image.\n' : ''}
    Current user message: "${input}"
    
    Based only on this input, should I generate an image or provide a text response?
    Answer with exactly one word: "image" or "text".`;
    
    // Make request to OpenAI API
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4-turbo-preview', // or 'gpt-3.5-turbo' for a cheaper but less accurate option
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 10 // We only need a short response
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );
    
    // Extract the classification from the response
    const aiResponse = response.data.choices[0].message.content.trim().toLowerCase();
    
    // Determine confidence based on how clear the response is
    let confidence = 0.85; // Base confidence for AI classification
    let intent = 'text'; // Default to text if the response is unclear
    
    if (aiResponse.includes('image')) {
      intent = 'image';
      confidence = 0.9; // Higher confidence for image classification
    }
    
    // If it's a follow-up to an image, increase confidence
    if (lastMessageWasImage && intent === 'image') {
      confidence = 0.95;
    }
    
    return {
      intent,
      confidence,
      source: 'ai'
    };
  } catch (error) {
    console.error('AI intent classification error:', error);
    // Fall back to pattern-based classification if AI fails
    return {
      ...patternResult,
      source: 'pattern-fallback'
    };
  }
};

/**
 * Helper function to clean text for TTS by removing markdown and formatting
 * @param {string} text - Raw text that may contain markdown
 * @returns {string} - Cleaned text suitable for TTS
 */
const cleanTextForTTS = (text) => {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
    .replace(/\[.*?\]\(.*?\)/g, '$1') // Replace links with just text
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
    .replace(/\*(.*?)\*/g, '$1') // Remove italic
    .replace(/`(.*?)`/g, '$1') // Remove inline code
    .replace(/\n\n/g, '. ') // Replace double newlines with periods for better pausing
    .replace(/\n/g, ' ') // Replace single newlines with spaces
    .replace(/```[\s\S]*?```/g, 'Code block omitted.') // Replace code blocks
    .trim();
};

/**
 * Generate speech from text using OpenAI's text-to-speech API
 * @param {string} text - The text to convert to speech
 * @param {string} voice - The voice model to use (alloy, echo, fable, onyx, nova, shimmer)
 * @param {boolean} isStreaming - Whether this is part of a streaming response
 * @returns {Promise<Blob>} - A Blob containing the audio data
 */
export const generateTextToSpeech = async (text, voice = 'nova', isStreaming = false) => {
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
  }
  
  // Limit text length to 4096 characters (OpenAI's limit)
  const trimmedText = text.substring(0, 4096);
  
  // Clean the text for better speech
  const cleanedText = cleanTextForTTS(trimmedText);
  
  // For streaming, we accept shorter chunks but still need some minimum text
  if (isStreaming && cleanedText.length < 10) {
    throw new Error('Text chunk too short for streaming TTS');
  }
  
  console.log(`Converting text to speech using voice: ${voice}, length: ${cleanedText.length} characters`, 
             isStreaming ? '(streaming)' : '');
  
  try {
    // Get the API key from storage
    const apiKey = localStorage.getItem('openai_api_key');
    
    if (!apiKey || !apiKey.startsWith('sk-')) {
      throw new Error('Invalid OpenAI API key. Please check your settings.');
    }
    
    console.log(`Making TTS API request with ${cleanedText.length} characters of text`);
    
    // Make request to OpenAI API
    const response = await axios({
      method: 'post',
      url: 'https://api.openai.com/v1/audio/speech',
      data: {
        model: 'tts-1',
        voice: voice,
        input: cleanedText,
        response_format: 'mp3', // Explicitly specify mp3 format
        speed: isStreaming ? 1.2 : 1.0, // Slightly faster for streaming for better pacing
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      responseType: 'blob'
    });
    
    // Check if we got a valid audio response
    if (response.status !== 200) {
      throw new Error(`OpenAI API returned status ${response.status}`);
    }
    
    // Verify we have valid audio data
    const audioBlob = response.data;
    console.log(`Received audio blob: size=${audioBlob.size} bytes, type=${audioBlob.type}`);
    
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Received empty audio response from OpenAI');
    }
    
    if (!audioBlob.type.startsWith('audio/')) {
      // If the blob isn't audio type, it might be an error response in JSON
      // Try to read it as text to get the error message
      const errorText = await audioBlob.text();
      console.error('Error response from OpenAI:', errorText);
      throw new Error(`API returned invalid audio format: ${audioBlob.type}. Response: ${errorText.substring(0, 100)}...`);
    }
    
    return audioBlob;
  } catch (error) {
    // Handle axios errors specifically
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('OpenAI API error response:', error.response.status, error.response.data);
      throw new Error(`OpenAI API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from OpenAI API:', error.request);
      throw new Error('No response from OpenAI API. Please check your internet connection.');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error generating speech:', error.message);
      throw error;
    }
  }
};

/**
 * Split text into TTS-friendly chunks for streaming
 * @param {string} text - The full text to split
 * @returns {Array<string>} - Array of text chunks
 */
export const splitTextForStreamingTTS = (text) => {
  if (!text) return [];
  
  // Clean the text first
  const cleanedText = cleanTextForTTS(text);
  
  // For streaming, use smaller chunks to start playback sooner
  const isVeryShort = cleanedText.length < 100;
  
  // For very short texts, just return as is for immediate playback
  if (isVeryShort) return [cleanedText];
  
  // Split by sentences for more natural breaks
  const sentenceBreaks = cleanedText.match(/[.!?]\s+/g) || [];
  
  // If no sentence breaks found, split by length
  if (sentenceBreaks.length === 0) {
    const chunks = [];
    let position = 0;
    // Use smaller chunks for streaming (reduced from 150 to 80 characters)
    const chunkSize = 80;
    
    while (position < cleanedText.length) {
      chunks.push(cleanedText.substring(position, position + chunkSize));
      position += chunkSize;
    }
    
    return chunks;
  }
  
  // Otherwise split by sentences into reasonable chunks
  let chunks = [];
  let currentChunk = '';
  let sentences = cleanedText.split(/([.!?]\s+)/);
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    
    // Use smaller chunks for streaming (reduced from 300 to 150 characters)
    if (currentChunk.length + sentence.length < 150) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = sentence;
    }
  }
  
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
};

// Function to generate a concise title for a conversation
export const generateConversationTitle = async (userMessage, assistantResponse) => {
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
  }
  
  try {
    // Create a prompt specifically for generating a title
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that generates short, concise titles (3-5 words) for conversations. Create a title that captures the essence of the conversation.'
      },
      {
        role: 'user',
        content: `User asked: ${userMessage}`
      },
      {
        role: 'assistant',
        content: `I responded with: ${assistantResponse.substring(0, 500)}` // Limit to first 500 chars
      },
      {
        role: 'user',
        content: 'Generate a short, concise title for this conversation (maximum 5 words).'
      }
    ];
    
    // Make a non-streaming request to GPT-3.5 Turbo
    const requestData = {
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.7,
      max_tokens: 20, // Keep it short
      top_p: 1
    };
    
    const response = await openaiApi.post('/chat/completions', requestData);
    
    // Extract the title from the response
    const title = response.data.choices[0].message.content.trim();
    
    // Remove any quotes that might be in the response
    return title.replace(/["']/g, '');
  } catch (error) {
    console.error('Error generating conversation title:', error);
    // Return a fallback title based on the first few words of the response
    const fallbackTitle = assistantResponse.split('.')[0].split('\n')[0];
    return fallbackTitle.length > 30 ? fallbackTitle.substring(0, 27) + '...' : fallbackTitle;
  }
};

export const getOpenAIModels = async () => {
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
  }
  
  try {
    const response = await openaiApi.get('/models');
    return response.data.data;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      throw new Error('Invalid API key. Please check your OpenAI API key in the settings.');
    }
    console.error('Error fetching OpenAI models:', error);
    throw error;
  }
};

/**
 * Generate a response from OpenAI's chat completions API
 * @param {Array} messages - Array of message objects with role and content
 * @param {string} model - The OpenAI model to use
 * @param {number} temperature - Temperature for generation
 * @param {number} topP - Top P for generation
 * @param {number} maxTokens - Maximum tokens to generate
 * @param {number} frequencyPenalty - Frequency penalty for generation
 * @param {number} presencePenalty - Presence penalty for generation
 * @param {Function} onStreamUpdate - Callback for streaming updates (optional)
 * @param {AbortSignal} abortSignal - Signal to abort the request (optional)
 * @param {Object} gpt5Options - GPT-5 specific options (reasoningEffort)
 * @returns {Promise<Object>} - The response object
 */
const generateOpenAIResponseImplementation = async (messages, model, temperature, topP, maxTokens, frequencyPenalty = 0, presencePenalty = 0, onStreamUpdate = null, abortSignal = null, gpt5Options = {}) => {
  console.log('Generating response with model:', model, 'streaming:', !!onStreamUpdate);
  
  // Validate API key
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
  }
  
  // Validate messages
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new Error('Invalid messages: empty array. Messages must contain at least one message.');
  }
  
  // Debug logging
  console.log(`Sending ${messages.length} messages to OpenAI API`);
  
  // DIRECT FIX: Check if any message contains document context and ensure it's included
  let hasDocumentContext = false;
  for (const msg of messages) {
    if (msg.documentContext || (msg.metadata && (msg.metadata.documentContext || msg.metadata.contextFiles))) {
      hasDocumentContext = true;
      console.log('Found document context in message:', msg.role);
      break;
    }
  }
  console.log('First message role:', messages[0].role);
  console.log('Last message role:', messages[messages.length - 1].role);
  
  try {
    // Since image generation is working, let's use a similar approach with axios
    console.log('Using axios direct approach for chat (like image generation)');
    
    // Check for document content in the last user message
    let lastUserMessageIndex = messages.length - 1;
    while (lastUserMessageIndex >= 0 && messages[lastUserMessageIndex].role !== 'user') {
      lastUserMessageIndex--;
    }
    
    // Get the last user message
    const lastUserMessage = lastUserMessageIndex >= 0 ? messages[lastUserMessageIndex] : null;
    
    // Enhanced messages array that will include document content
    let enhancedMessages = [...messages];
    
    // If the last user message exists and we have document context, ensure it's included
    if (lastUserMessage && hasDocumentContext) {
      // Try to get document content from localStorage
      try {
        const allKeys = Object.keys(localStorage);
        const vectorStoreKeys = allKeys.filter(key => key.includes('vector_store_'));
        
        if (vectorStoreKeys.length > 0) {
          console.log('Found potential vector store in localStorage:', vectorStoreKeys[0]);
          
          // Get the vector store data
          const vectorStoreData = JSON.parse(localStorage.getItem(vectorStoreKeys[0]));
          
          // If we have documents in the vector store
          if (vectorStoreData && vectorStoreData.documents && vectorStoreData.documents.length > 0) {
            console.log(`Found ${vectorStoreData.documents.length} documents in vector store`); 
            
            // Get up to 3 chunks of content
            const maxChunks = Math.min(3, vectorStoreData.documents.length);
            let documentContent = '';
            
            for (let i = 0; i < maxChunks; i++) {
              if (vectorStoreData.documents[i] && vectorStoreData.documents[i].pageContent) {
                documentContent += vectorStoreData.documents[i].pageContent + "\n\n";
              }
            }
            
            // If we have document content, ensure it's included with the user's question
            if (documentContent.trim()) {
              // Find the index of the last user message
              const userMessageIndex = enhancedMessages.findIndex(m => m.id === lastUserMessage.id);
              
              if (userMessageIndex >= 0) {
                // Enhance the user message with document content
                const enhancedUserMessage = {
                  ...lastUserMessage,
                  content: `Here is document content to reference:\n${documentContent}\n\nMy question about this document is: ${lastUserMessage.content}`
                };
                
                // Replace the original user message
                enhancedMessages[userMessageIndex] = enhancedUserMessage;
                console.log('Enhanced user message with document content');
              }
            }
          }
        }
      } catch (docError) {
        console.error('Error adding document content:', docError);
      }
    }
    
    // Prepare request data for the Responses API with our enhanced messages
    const requestData = {
      model: model,
      input: enhancedMessages
    };
    
    // Configure parameters based on model type for the Responses API
    if (typeof model === 'string' && model.startsWith('gpt-5')) {
      // GPT-5 models use reasoning configuration and max_output_tokens
      requestData.max_output_tokens = maxTokens || 2048;
      const reasoningConfig = {};
      if (gpt5Options && gpt5Options.reasoningEffort) {
        reasoningConfig.effort = gpt5Options.reasoningEffort;
      }
      reasoningConfig.summary = 'detailed';
      requestData.reasoning = reasoningConfig;
    } else {
      // Other models use standard sampling parameters
      requestData.temperature = temperature;
      requestData.top_p = topP;
      requestData.max_output_tokens = maxTokens || 2048;
    }
    
    // Determine if we should use streaming
    const useStreaming = typeof onStreamUpdate === 'function';
    
    if (useStreaming) {
      // For streaming, we'll use fetch API which allows streaming
      console.log('Using streaming API with fetch');
      
      // Initialize for streaming
      let content = '';
      let tokenCount = 0;
      
      let reasoningSummary = null;
      
      // Clone the request data and add streaming flag
      const streamRequestData = {
        ...requestData,
        stream: true
      };

      // Send initial empty update, including the request payload so the UI
      // can display the Request JSON immediately
      onStreamUpdate({
        content: '',
        done: false,
        tokenCount: 0,
        request: streamRequestData
      });
      
      // Log the full request for debugging
      console.log('Full stream request data:', JSON.stringify(streamRequestData));
      
      // Create fetch options for streaming
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('openai_api_key')}`
        },
        body: JSON.stringify(streamRequestData),
        signal: abortSignal
      };
      
      // Make streaming request using the Responses API
      const response = await fetch(`${OPENAI_API_URL}/responses`, fetchOptions);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP error ${response.status}`);
      }
      
      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      const extractTextChunks = (source) => {
        if (!source) return [];
        const chunks = [];

        const processContentArray = (contentArr) => {
          if (!Array.isArray(contentArr)) return;
          contentArr.forEach(part => {
            if (!part) return;
            if (typeof part === 'string') {
              chunks.push(part);
            } else if (part.type === 'output_text' && part.output_text && typeof part.output_text.text === 'string') {
              chunks.push(part.output_text.text);
            } else if (part.type === 'text' && typeof part.text === 'string') {
              chunks.push(part.text);
            } else if (part.type === 'input_text' && typeof part.input_text === 'string') {
              chunks.push(part.input_text);
            } else if (Array.isArray(part.content)) {
              processContentArray(part.content);
            }
          });
        };

        const processOutputItem = (item) => {
          if (!item) return;
          if (Array.isArray(item.content)) {
            processContentArray(item.content);
          } else if (item.output_text && Array.isArray(item.output_text)) {
            item.output_text.forEach(seg => {
              if (seg && typeof seg.text === 'string') {
                chunks.push(seg.text);
              }
            });
          } else if (typeof item.text === 'string') {
            chunks.push(item.text);
          }
        };

        if (Array.isArray(source)) {
          source.forEach(processOutputItem);
        } else if (source && typeof source === 'object') {
          if (Array.isArray(source.output)) {
            source.output.forEach(processOutputItem);
          }
          if (Array.isArray(source.content)) {
            processContentArray(source.content);
          }
          if (typeof source.text === 'string') {
            chunks.push(source.text);
          }
        }

        return chunks.filter(Boolean);
      };

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // Streaming complete, send final update
          onStreamUpdate({
            content,
            done: true,
            tokenCount
          });
          break;
        }
        
        // Decode chunk and process it
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              let contentDelta = '';

              if (!reasoningSummary) {
                const sanitizeSummaryText = (value) => {
                  if (typeof value !== 'string') return null;
                  const normalized = value.trim();
                  if (!normalized) return null;
                  const lowered = normalized.toLowerCase();
                  if (['auto', 'detailed', 'none', 'default'].includes(lowered)) {
                    return null;
                  }
                  return normalized;
                };

                const extractSummaryArray = (summaryArray) => {
                  if (!Array.isArray(summaryArray)) return null;
                  const texts = summaryArray
                    .map(item => {
                      if (item && typeof item.text === 'string') {
                        return item.text.trim();
                      }
                      if (item && Array.isArray(item.summary)) {
                        return item.summary
                          .filter(seg => seg && typeof seg.text === 'string')
                          .map(seg => seg.text.trim())
                          .filter(Boolean)
                          .join('\n');
                      }
                      return '';
                    })
                    .filter(Boolean);
                  return texts.length > 0 ? texts.join('\n\n') : null;
                };

                const fromResponseOutput = () => {
                  const output = parsed?.response?.output;
                  if (Array.isArray(output)) {
                    const reasoningItem = output.find(item => item && item.type === 'reasoning');
                    if (reasoningItem) {
                      const arraySummary = extractSummaryArray(reasoningItem.summary);
                      if (arraySummary) return arraySummary;
                    }
                  }
                  return null;
                };

                const fromDirectReasoning = () => {
                  const arraySummary = extractSummaryArray(parsed?.reasoning?.summary);
                  if (arraySummary) return arraySummary;
                  if (typeof parsed?.reasoning?.summary === 'string' && parsed.reasoning.summary.trim()) {
                    return parsed.reasoning.summary.trim();
                  }
                  return null;
                };

                const fromResponseReasoning = () => {
                  const arraySummary = extractSummaryArray(parsed?.response?.reasoning?.summary);
                  if (arraySummary) return arraySummary;
                  if (typeof parsed?.response?.reasoning?.summary === 'string' && parsed.response.reasoning.summary.trim()) {
                    return parsed.response.reasoning.summary.trim();
                  }
                  return null;
                };

                const summaryCandidate = fromResponseOutput()
                  || fromDirectReasoning()
                  || fromResponseReasoning();

                const sanitized = sanitizeSummaryText(summaryCandidate);
                if (sanitized) {
                  reasoningSummary = sanitized;
                }
              }

              // Primary path: Responses API streaming events
              if (parsed.type === 'response.output_text.delta') {
                if (typeof parsed.delta === 'string') {
                  contentDelta = parsed.delta;
                } else if (parsed.delta && typeof parsed.delta.text === 'string') {
                  contentDelta = parsed.delta.text;
                } else if (parsed.delta) {
                  const extra = extractTextChunks(parsed.delta);
                  if (extra.length > 0) {
                    contentDelta = extra.join('');
                  }
                }
              } else if (parsed.type === 'response.delta') {
                const extra = extractTextChunks(parsed.delta?.output);
                if (extra.length > 0) {
                  contentDelta = extra.join('');
                }
              } else if (parsed.type === 'response.message.delta') {
                const extra = extractTextChunks(parsed.delta?.content);
                if (extra.length > 0) {
                  contentDelta = extra.join('');
                }
              } else if (parsed.type === 'response.message.output_text.delta') {
                const extra = extractTextChunks(parsed.delta?.output_text);
                if (extra.length > 0) {
                  contentDelta = extra.join('');
                }
              }

              // Fallback: if a full response object is present in the event, extract text from it
              if (
                !contentDelta &&
                parsed.response &&
                Array.isArray(parsed.response.output) &&
                parsed.response.output.length > 0
              ) {
                const firstOutput = parsed.response.output[0];
                if (Array.isArray(firstOutput?.content)) {
                  const textBlocks = firstOutput.content.filter(
                    block =>
                      block.type === 'output_text' &&
                      block.output_text &&
                      typeof block.output_text.text === 'string'
                  );
                  if (textBlocks.length > 0) {
                    contentDelta = textBlocks.map(block => block.output_text.text).join('');
                  }
                }
              }

              // Fallback path: legacy chat.completions-style delta if ever present
              if (!contentDelta && parsed.choices && parsed.choices[0]?.delta?.content) {
                contentDelta = parsed.choices[0].delta.content;
              }
              
              if (contentDelta) {
                content += contentDelta;
                tokenCount++;
                
                onStreamUpdate({
                  content,
                  done: false,
                  tokenCount
                });
              }
            } catch (error) {
              console.error('Error parsing stream data:', error);
            }
          }
        }
      }
      
      // Return response structure similar to non-streaming case
      // Important: Include the streamRequestData (not requestData) for streaming requests
      // as this contains the complete payload with stream: true flag
      // Calculate approximate prompt tokens based on the Responses API `input` field
      // This is an approximation since we don't get exact token counts from streaming API
      const inputMessages = Array.isArray(streamRequestData.input) ? streamRequestData.input : [];
      const promptTokenEstimate = inputMessages.reduce((total, msg) => {
        // `msg.content` may be a string or an array (for multimodal). Handle both.
        if (!msg || msg.content == null) return total;

        if (typeof msg.content === 'string') {
          return total + Math.ceil(msg.content.length / 4);
        }

        if (Array.isArray(msg.content)) {
          const textLength = msg.content
            .filter(part => part && part.type === 'text' && typeof part.text === 'string')
            .reduce((len, part) => len + part.text.length, 0);
          return total + Math.ceil(textLength / 4);
        }

        return total;
      }, 0);
      
      // Add estimated system prompt tokens if present
      const systemMsg = inputMessages.find(m => m && m.role === 'system');
      const systemPromptTokens = systemMsg && typeof systemMsg.content === 'string'
        ? Math.ceil(systemMsg.content.length / 4)
        : 0;
      const totalPromptTokens = promptTokenEstimate + systemPromptTokens;
      
      const reasoning = reasoningSummary ? { summary: reasoningSummary } : null;
      
      return {
        response: {
          ...(reasoning ? { reasoning } : {}),
          choices: [{ message: { content } }],
          model: streamRequestData.model, // Include the model name
          usage: { 
            prompt_tokens: totalPromptTokens,
            completion_tokens: tokenCount, 
            total_tokens: totalPromptTokens + tokenCount 
          },
          request: streamRequestData
        },
        ...(reasoning ? { reasoning } : {}),
        model: streamRequestData.model, // Include the model name at top level
        message: { content },
        usage: { 
          prompt_tokens: totalPromptTokens,
          completion_tokens: tokenCount, 
          total_tokens: totalPromptTokens + tokenCount 
        },
        request: streamRequestData
      };
    } else {
      // Non-streaming implementation - use axios directly with the Responses API
      console.log('Using regular non-streaming Responses API with axios');
      
      // Make the API request with axios directly
      const response = await openaiApi.post('/responses', requestData);

      const responseData = response.data;

      // Extract assistant text and role from Responses API output
      let messageContent = '';
      let messageRole = 'assistant';

      if (responseData && Array.isArray(responseData.output) && responseData.output.length > 0) {
        const outputs = responseData.output;

        // Prefer the assistant message output (role === 'assistant'),
        // fall back to the first output with content, then to the first item.
        let targetOutput = outputs.find(item => item && item.role === 'assistant');
        if (!targetOutput) {
          targetOutput = outputs.find(item => item && Array.isArray(item.content));
        }
        if (!targetOutput) {
          targetOutput = outputs[0];
        }

        if (targetOutput && targetOutput.role) {
          messageRole = targetOutput.role;
        }

        if (Array.isArray(targetOutput?.content)) {
          const parts = [];

          for (const block of targetOutput.content) {
            if (!block) continue;

            // Raw string block
            if (typeof block === 'string') {
              parts.push(block);
              continue;
            }

            // Common text shapes
            if (typeof block.text === 'string') {
              parts.push(block.text);
              continue;
            }

            if (block.output_text) {
              if (typeof block.output_text.text === 'string') {
                parts.push(block.output_text.text);
                continue;
              }
              if (typeof block.output_text.value === 'string') {
                parts.push(block.output_text.value);
                continue;
              }
            }

            if (typeof block.value === 'string') {
              parts.push(block.value);
              continue;
            }
          }

          if (parts.length > 0) {
            messageContent = parts.join('');
          }
        }
      }

      // Fallback: some Responses implementations may expose a top-level output_text
      if (!messageContent && typeof responseData.output_text === 'string') {
        messageContent = responseData.output_text;
      }

      // Fallback for legacy chat.completions-style responses if ever encountered
      if (!messageContent && responseData && responseData.choices && responseData.choices[0]?.message?.content) {
        messageContent = responseData.choices[0].message.content;
        messageRole = responseData.choices[0].message.role || messageRole;
      }

      // Map usage fields from Responses API to the structure used elsewhere in the app
      let mappedUsage = undefined;
      if (responseData && responseData.usage) {
        const inputTokens = responseData.usage.input_tokens ?? responseData.usage.prompt_tokens ?? 0;
        const outputTokens = responseData.usage.output_tokens ?? responseData.usage.completion_tokens ?? 0;
        const totalTokens = responseData.usage.total_tokens ?? (inputTokens + outputTokens);

        mappedUsage = {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: totalTokens
        };
      }
      
      // Return the response data in the same shape expected by the rest of the app
      return {
        response: {
          ...responseData,
          request: requestData
        },
        message: { role: messageRole, content: messageContent },
        usage: mappedUsage,
        request: requestData
      };
    }
  } catch (error) {
    console.error('Error in generateOpenAIResponse:', error);
    
    // Provide user-friendly error messages based on error type
    if (error.message.includes('API key')) {
      throw new Error('Invalid API key. Please check your OpenAI API key in the settings.');
    } else if (error.message.includes('timeout') || error.message.includes('Too many requests')) {
      throw new Error('OpenAI API request timed out or rate limited. Please try again in a moment.');
    } else if (error.message.includes('content policy')) {
      throw new Error('Your request was flagged by OpenAI\'s content policy. Please modify your prompt and try again.');
    } else {
      throw new Error(`Error from OpenAI API: ${error.message}`);
    }
  }
};

// Enhance the image prompt using GPT-4, similar to ChatGPT's DALL-E prompt enhancement
export const enhanceImagePrompt = async (userPrompt, conversationHistory = []) => {
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
  }
  try {
    // Format the conversation history for a better context summary
    let formattedConversation = '';
    
    if (conversationHistory && conversationHistory.length > 0) {
      // Filter out system messages, image messages, and loading messages
      const relevantMessages = conversationHistory
        .filter(msg => 
          msg.role !== 'system' && 
          !msg.isImage && 
          !msg.isLoading && 
          msg.content && 
          typeof msg.content === 'string' && 
          !msg.content.includes('Generating image:')
        )
        .slice(-8); // Take only most recent 8 messages for context
      
      if (relevantMessages.length > 0) {
        console.log(`Including ${relevantMessages.length} messages for context in image generation`);
        
        // Format the conversation as a readable summary
        formattedConversation = relevantMessages
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''}`)
          .join('\n');
        
        console.log('Conversation context summary:', formattedConversation.slice(0, 100) + '...');
      }
    }
    
    // Create a more direct system prompt that explicitly instructs how to use the conversation
    const systemPrompt = `You are an AI image prompt creator that enhances user requests into detailed DALL-E prompts.

You have access to the following conversation history between a user and an AI assistant:

${formattedConversation ? formattedConversation : "[No previous conversation]"}

Based on this conversation context and the user's image request, create a detailed, vivid image prompt.
Make sure your prompt directly relates to both the conversation topic and the user's specific request.
Include visual details, style, mood, and composition.
Do not mention the conversation itself in the prompt.
Your output will be sent directly to DALL-E, so format it as a complete, standalone prompt.`;

    // Create messages array with minimal format
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Based on our conversation, create an image of: ${userPrompt}` }
    ];
    
    const requestData = {
      model: 'gpt-4.1',
      messages,
      temperature: 0.7, // Slightly lower temperature for more focused results
      max_tokens: 300,
      top_p: 1
    };
    
    console.log('Sending enhanced prompt request with conversation context');
    const response = await openaiApi.post('/chat/completions', requestData);
    const enhancedPrompt = response.data.choices[0].message.content.trim();
    
    console.log('Generated enhanced prompt with context:', enhancedPrompt.slice(0, 100) + '...');
    return enhancedPrompt;
  } catch (error) {
    console.error('Error enhancing prompt with context:', error);
    // Fallback: add basic photo/cinematic enhancements
    return `${userPrompt} (professional photograph, high detail, vivid colors, cinematic lighting)`;
  }
};

export const generateOpenAIImage = async (prompt, n = 1, size = '1024x1024', conversationHistory = []) => {
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
  }
  
  try {
    // Enhance the prompt behind the scenes using GPT-4 with conversation context
    const enhancedPrompt = await enhanceImagePrompt(prompt, conversationHistory);
    console.log('Original prompt:', prompt);
    console.log('Enhanced prompt (invisible to user):', enhancedPrompt);
    
    // Capture the request data with the enhanced prompt
    const requestData = {
      prompt: enhancedPrompt,
      n,
      size,
      model: "gpt-image-1-mini" // Explicitly specify gpt-image-1-mini
    };
    
    const response = await openaiApi.post('/images/generations', requestData, { timeout: 120000 }); // 120s for image generation
    
    // Convert b64_json items to data URLs so consumers can use them as image src
    const dataWithUrls = {
      ...response.data,
      data: (response.data.data || []).map(item => ({
        ...item,
        url: item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null)
      }))
    };
    
    // Return both the response data and the ORIGINAL prompt data (not the enhanced version)
    // This ensures the enhancement process is invisible to the user
    return {
      ...dataWithUrls,
      request: {
        ...requestData,
        prompt: prompt // Show original prompt in UI/logs
      }
    };
  } catch (error) {
    console.error('Error generating OpenAI image:', error);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      if (error.response.status === 401) {
        throw new Error('Invalid API key. Please check your OpenAI API key in the settings.');
      } else if (error.response.data && error.response.data.error) {
        throw new Error(`OpenAI API Error: ${error.response.data.error.message}`);
      }
      throw new Error(`OpenAI API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
    }
    
    throw error;
  }
};

// Function to upload files for context
export const uploadFileForContext = async (file) => {
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
  }
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', 'assistants');
  
  try {
    // Get API key directly from localStorage to ensure it's the latest
    const apiKey = localStorage.getItem('openai_api_key');
    
    // Use a fresh axios instance with the API key explicitly set for this request
    // This ensures the API key is definitely included in the request
    const response = await axios.post(`${OPENAI_API_URL}/files`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${apiKey}`
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading file to OpenAI:', error);
    
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error('Invalid API key. Please check your OpenAI API key in the settings.');
      } else if (error.response.data && error.response.data.error) {
        throw new Error(`OpenAI API Error: ${error.response.data.error.message}`);
      }
    }
    
    throw new Error('Failed to upload file. Please try again later.');
  }
};

/**
 * Answer a question based on PDF content using OpenAI
 * @param {string} question - The user's question
 * @param {Array} relevantChunks - Chunks of text from the PDF relevant to the question
 * @param {string} model - The OpenAI model to use
 * @param {number} temperature - The temperature to use for generation
 * @returns {Promise<string>} - The answer to the question
 */
export const answerFromPDF = async (question, relevantChunks, model = 'gpt-4o', temperature = 0.7) => {
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set');
  }
  
  const apiKey = localStorage.getItem('openai_api_key');
  const openai = new OpenAI({ 
    apiKey, 
    dangerouslyAllowBrowser: true // Allow OpenAI to run in browser environment
  });
  
  console.log('answerFromPDF called with question:', question);
  console.log('Relevant chunks received:', relevantChunks?.length || 0);
  
  // Debug the chunks received
  if (relevantChunks && relevantChunks.length > 0) {
    console.log('First chunk sample:', relevantChunks[0]);
    console.log('Content available in chunks:', relevantChunks.every(chunk => chunk && chunk.pageContent));
  }
  
  try {
    // Verify we have chunks with content
    if (!relevantChunks || relevantChunks.length === 0) {
      console.warn('No relevant chunks found for the question');
      return "I couldn't find any relevant information in the PDF to answer your question. Please try rephrasing or asking about a different topic covered in the document.";
    }
    
    // Combine relevant chunks into context, handling missing pageContent
    const context = relevantChunks
      .filter(chunk => chunk && chunk.pageContent)
      .map(chunk => chunk.pageContent)
      .join('\n\n');
    
    // If no valid context was extracted, return early
    if (!context.trim()) {
      console.error('No valid context extracted from chunks, raw chunks:', relevantChunks);
      return "There was an issue processing the PDF content. Please try uploading the document again or ask a different question.";
    }
    
    console.log('Extracted context to send to OpenAI:', context.substring(0, 200) + '... (truncated for log)');
    // Log total context length to ensure we're sending sufficient content
    console.log('Total context length:', context.length, 'characters');
    
    // Create system message with instructions
    const systemMessage = {
      role: 'system',
      content: `You are a helpful assistant answering questions based on the provided PDF document. 
      Answer the user's question based ONLY on the context provided. 
      If the answer is not contained within the context, say "I don't have enough information from the PDF to answer that question" 
      and suggest what they might look for in the document.
      Do not make up information that isn't explicitly stated in the context.
      If asked about the source, you can explain that you're referencing information from their uploaded PDF document.`
    };
    
    // Create user message with question and context
    const userMessage = {
      role: 'user',
      content: `Context from PDF document:\n\n${context}\n\nQuestion: ${question}`
    };
    
    // Call the OpenAI API (we'll handle timeouts separately)
    const apiPromise = openai.chat.completions.create({
      model,
      messages: [systemMessage, userMessage],
      temperature,
      max_tokens: 1000, // Limit response size
    });
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API request timed out after 30 seconds')), 30000);
    });
    
    // Race the API call against the timeout
    const response = await Promise.race([apiPromise, timeoutPromise]);
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error answering question from PDF:', error);
    
    // Provide a user-friendly error message based on the error type
    if (error.message.includes('timeout')) {
      return "The request to answer your question timed out. This might be due to high server load or connectivity issues. Please try again in a moment.";
    } else if (error.message.includes('API key')) {
      return "There was an issue with your OpenAI API key. Please check your API key in the settings and try again.";
    } else if (error.message.includes('browser')) {
      return "There was an issue running the AI in your browser. Please refresh the page and try again.";
    } else {
      // Generic error message for other cases
      return `I encountered an error while trying to answer your question: ${error.message}. Please try again or rephrase your question.`;
    }
  }
};

/**
 * Answer a question based on Word document content using OpenAI
 * @param {string} question - The user's question
 * @param {Array} relevantChunks - Chunks of text from the Word document relevant to the question
 * @param {string} model - The OpenAI model to use
 * @param {number} temperature - The temperature to use for generation
 * @returns {Promise<string>} - The answer to the question
 */
export const answerFromWord = async (question, relevantChunks, model = 'gpt-4o', temperature = 0.7) => {
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set');
  }
  
  const apiKey = localStorage.getItem('openai_api_key');
  const openai = new OpenAI({ 
    apiKey, 
    dangerouslyAllowBrowser: true // Allow OpenAI to run in browser environment
  });
  
  console.log('answerFromWord called with question:', question);
  console.log('Relevant chunks received:', relevantChunks?.length || 0);
  
  // Debug the chunks received
  if (relevantChunks && relevantChunks.length > 0) {
    console.log('First chunk sample:', relevantChunks[0]);
    console.log('Content available in chunks:', relevantChunks.every(chunk => chunk && chunk.pageContent));
  }
  
  try {
    // Verify we have chunks with content
    if (!relevantChunks || relevantChunks.length === 0) {
      console.warn('No relevant chunks found for the question');
      return "I couldn't find any relevant information in the Word document to answer your question. Please try rephrasing or asking about a different topic covered in the document.";
    }
    
    // Combine relevant chunks into context, handling missing pageContent
    const context = relevantChunks
      .filter(chunk => chunk && chunk.pageContent)
      .map(chunk => chunk.pageContent)
      .join('\n\n');
    
    // If no valid context was extracted, return early
    if (!context.trim()) {
      console.error('No valid context extracted from chunks, raw chunks:', relevantChunks);
      return "There was an issue processing the Word document content. Please try uploading the document again or ask a different question.";
    }
    
    console.log('Extracted context to send to OpenAI:', context.substring(0, 200) + '... (truncated for log)');
    // Log total context length to ensure we're sending sufficient content
    console.log('Total context length:', context.length, 'characters');
    
    // Create system message with instructions
    const systemMessage = {
      role: 'system',
      content: `You are a helpful assistant answering questions based on the provided Word document. 
      Answer the user's question based ONLY on the context provided. 
      If the answer is not contained within the context, say "I don't have enough information from the Word document to answer that question" 
      and suggest what they might look for in the document.
      Do not make up information that isn't explicitly stated in the context.
      If asked about the source, you can explain that you're referencing information from their uploaded Word document.`
    };
    
    // Create user message with question and context
    const userMessage = {
      role: 'user',
      content: `Context from Word document:\n\n${context}\n\nQuestion: ${question}`
    };
    
    // Call the OpenAI API (we'll handle timeouts separately)
    const apiPromise = openai.chat.completions.create({
      model,
      messages: [systemMessage, userMessage],
      temperature,
      max_tokens: 1000, // Limit response size
    });
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API request timed out after 30 seconds')), 30000);
    });
    
    // Race the API call against the timeout
    const response = await Promise.race([apiPromise, timeoutPromise]);
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error answering question from Word document:', error);
    
    // Provide a user-friendly error message based on the error type
    if (error.message.includes('timeout')) {
      return "The request to answer your question timed out. This might be due to high server load or connectivity issues. Please try again in a moment.";
    } else if (error.message.includes('API key')) {
      return "There was an issue with your OpenAI API key. Please check your API key in the settings and try again.";
    } else if (error.message.includes('browser')) {
      return "There was an issue running the AI in your browser. Please refresh the page and try again.";
    } else {
      // Generic error message for other cases
      return `I encountered an error while trying to answer your question: ${error.message}. Please try again or rephrase your question.`;
    }
  }
};

/**
 * Answer a question based on Excel sheet content using OpenAI
 * @param {string} question - The user's question
 * @param {Array} relevantChunks - Chunks of text from the Excel sheet relevant to the question
 * @param {string} model - The OpenAI model to use
 * @param {number} temperature - The temperature to use for generation
 * @returns {Promise<string>} - The answer to the question
 */
export const answerFromExcel = async (question, relevantChunks, model = 'gpt-4o', temperature = 0.7) => {
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set');
  }
  
  const apiKey = localStorage.getItem('openai_api_key');
  const openai = new OpenAI({ 
    apiKey, 
    dangerouslyAllowBrowser: true // Allow OpenAI to run in browser environment
  });
  
  console.log('answerFromExcel called with question:', question);
  console.log('Relevant chunks received:', relevantChunks?.length || 0);
  
  // Debug the chunks received
  if (relevantChunks && relevantChunks.length > 0) {
    console.log('First chunk sample:', relevantChunks[0]);
    console.log('Content available in chunks:', relevantChunks.every(chunk => chunk && chunk.pageContent));
  }
  
  try {
    // Verify we have chunks with content
    if (!relevantChunks || relevantChunks.length === 0) {
      console.warn('No relevant chunks found for the question');
      return "I couldn't find any relevant information in the Excel sheet to answer your question. Please try rephrasing or asking about a different topic covered in the document.";
    }
    
    // Combine relevant chunks into context, handling missing pageContent
    const context = relevantChunks
      .filter(chunk => chunk && chunk.pageContent)
      .map(chunk => chunk.pageContent)
      .join('\n\n');
    
    // If no valid context was extracted, return early
    if (!context.trim()) {
      console.error('No valid context extracted from chunks, raw chunks:', relevantChunks);
      return "There was an issue processing the Excel sheet content. Please try uploading the document again or ask a different question.";
    }
    
    console.log('Extracted context to send to OpenAI:', context.substring(0, 200) + '... (truncated for log)');
    // Log total context length to ensure we're sending sufficient content
    console.log('Total context length:', context.length, 'characters');
    
    // Create system message with instructions
    const systemMessage = {
      role: 'system',
      content: `You are a helpful assistant answering questions based on the provided Excel sheet. 
      Answer the user's question based ONLY on the context provided. 
      If the answer is not contained within the context, say "I don't have enough information from the Excel sheet to answer that question" 
      and suggest what they might look for in the document.
      Do not make up information that isn't explicitly stated in the context.
      If asked about the source, you can explain that you're referencing information from their uploaded Excel sheet.
      If the context contains tabular data, format your response clearly to preserve the structure when appropriate.`
    };
    
    // Create user message with question and context
    const userMessage = {
      role: 'user',
      content: `Context from Excel sheet:\n\n${context}\n\nQuestion: ${question}`
    };
    
    // Call the OpenAI API (we'll handle timeouts separately)
    const apiPromise = openai.chat.completions.create({
      model,
      messages: [systemMessage, userMessage],
      temperature,
      max_tokens: 1000, // Limit response size
    });
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API request timed out after 30 seconds')), 30000);
    });
    
    // Race the API call against the timeout
    const response = await Promise.race([apiPromise, timeoutPromise]);
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error answering question from Excel sheet:', error);
    
    // Provide a user-friendly error message based on the error type
    if (error.message.includes('timeout')) {
      return "The request to answer your question timed out. This might be due to high server load or connectivity issues. Please try again in a moment.";
    } else if (error.message.includes('API key')) {
      return "There was an issue with your OpenAI API key. Please check your API key in the settings and try again.";
    } else if (error.message.includes('browser')) {
      return "There was an issue running the AI in your browser. Please refresh the page and try again.";
    } else {
      // Generic error message for other cases
      return `I encountered an error while trying to answer your question: ${error.message}. Please try again or rephrase your question.`;
    }
  }
};

/**
 * Answer a question based on image analysis using OpenAI
 * Also detect when a user wants to generate a new image based on the uploaded one
 * @param {string} question - The user's question about the image
 * @param {Array} relevantChunks - Chunks of text from the image analysis relevant to the question
 * @param {string} model - The OpenAI model to use
 * @param {number} temperature - The temperature to use for generation
 * @returns {Promise<Object>} - The answer to the question or information about a generated image
 */
export const answerFromImage = async (question, relevantChunks, model = 'gpt-4o', temperature = 0.7) => {
  if (!isApiKeySet()) {
    throw new Error('OpenAI API key is not set');
  }
  
  const apiKey = localStorage.getItem('openai_api_key');
  const openai = new OpenAI({ 
    apiKey, 
    dangerouslyAllowBrowser: true // Allow OpenAI to run in browser environment
  });
  
  console.log('answerFromImage called with question:', question);
  console.log('Relevant chunks received:', relevantChunks?.length || 0);
  
  // Debug the chunks received
  if (relevantChunks && relevantChunks.length > 0) {
    console.log('First chunk sample:', relevantChunks[0]);
    console.log('Content available in chunks:', relevantChunks.every(chunk => chunk && chunk.pageContent));
  }
  
  try {
    // Verify we have chunks with content
    if (!relevantChunks || relevantChunks.length === 0) {
      console.warn('No relevant chunks found for the question');
      return {
        type: 'text',
        content: "I couldn't find any relevant information about the image to answer your question. Please try rephrasing or asking about a different aspect of the image."
      };
    }
    
    // Combine relevant chunks into context, handling missing pageContent
    const context = relevantChunks
      .filter(chunk => chunk && chunk.pageContent)
      .map(chunk => chunk.pageContent)
      .join('\n\n');
    
    // If no valid context was extracted, return early
    if (!context.trim()) {
      console.error('No valid context extracted from chunks, raw chunks:', relevantChunks);
      return {
        type: 'text',
        content: "There was an issue processing the image analysis. Please try uploading the image again or ask a different question."
      };
    }
    
    console.log('Extracted context to send to OpenAI:', context.substring(0, 200) + '... (truncated for log)');
    console.log('Total context length:', context.length, 'characters');
    
    // First, determine if this is a request to generate/modify an image
    const intentClassificationSystemMessage = {
      role: 'system',
      content: `You are an intent classifier. You need to determine if the user is asking:
      1. A question about the uploaded image (analysis)
      2. To generate a new image based on or similar to the uploaded image (generation)
      3. To modify the uploaded image in some way (modification)
      
      Respond with ONLY one of these keywords: "ANALYSIS", "GENERATION", or "MODIFICATION".`
    };
    
    const intentClassificationUserMessage = {
      role: 'user',
      content: `Here is the description of an uploaded image:\n\n${context.substring(0, 1000)}\n\nHere is what the user is asking: "${question}"`
    };
    
    const intentResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [intentClassificationSystemMessage, intentClassificationUserMessage],
      temperature: 0.1,
      max_tokens: 20
    });
    
    const intent = intentResponse.choices[0].message.content.trim().toUpperCase();
    console.log('Detected intent:', intent);
    
    // If the intent is to generate or modify an image
    if (intent === 'GENERATION' || intent === 'MODIFICATION') {
      console.log('Detected image generation/modification intent');
      
      // Extract image description for use in generation
      const descriptionExtractionMessage = {
        role: 'system',
        content: `You are a detailed image description extractor. Based on the image analysis provided, 
        create a concise but detailed description of the image that can be used as a basis for generating a similar image. 
        Focus on visual elements like objects, people, colors, composition, lighting, style, and mood.
        Your response should be 3-5 sentences maximum.`
      };
      
      const descriptionResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          descriptionExtractionMessage,
          { role: 'user', content: `Image analysis:\n\n${context}` }
        ],
        temperature: 0.7,
        max_tokens: 300
      });
      
      const imageDescription = descriptionResponse.choices[0].message.content;
      console.log('Extracted image description:', imageDescription);
      
      // Construct a prompt that combines the original image description with the user's request
      const combinedPrompt = `${imageDescription} ${question}`;
      
      // Use the existing image generation function with our combined prompt
      const imageResult = await generateOpenAIImage(combinedPrompt, 1, '1024x1024');
      
      // Return both the generated image and a text explanation
      return {
        type: 'image',
        imageUrl: imageResult.data[0].url,
        content: `I've created a new image based on the one you uploaded, with the modifications you requested: "${question}".`,
        originalDescription: imageDescription,
        prompt: combinedPrompt
      };
    }
    
    // For normal analysis questions, proceed as before
    const systemMessage = {
      role: 'system',
      content: `You are a helpful assistant answering questions based on the provided image analysis. 
      Answer the user's question based ONLY on the context provided about the image. 
      If the answer is not contained within the context, say "I don't have enough information from the image to answer that question" 
      and suggest what they might ask instead.
      Do not make up information that isn't explicitly stated in the context.
      If the user asks to generate a new image or modify the current image, explain that they can directly ask you to create a new image based on what they see.
      If asked about the source, you can explain that you're referencing information from their uploaded image.`
    };
    
    const userMessage = {
      role: 'user',
      content: `Context from image analysis:\n\n${context}\n\nQuestion about the image: ${question}`
    };
    
    // Call the OpenAI API (we'll handle timeouts separately)
    const apiPromise = openai.chat.completions.create({
      model,
      messages: [systemMessage, userMessage],
      temperature,
      max_tokens: 1000, // Limit response size
    });
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API request timed out after 30 seconds')), 30000);
    });
    
    // Race the API call against the timeout
    const response = await Promise.race([apiPromise, timeoutPromise]);
    
    return {
      type: 'text',
      content: response.choices[0].message.content
    };
  } catch (error) {
    console.error('Error answering question about image:', error);
    
    // Provide a user-friendly error message based on the error type
    let errorMessage;
    if (error.message.includes('timeout')) {
      errorMessage = "The request to answer your question timed out. This might be due to high server load or connectivity issues. Please try again in a moment.";
    } else if (error.message.includes('API key')) {
      errorMessage = "There was an issue with your OpenAI API key. Please check your API key in the settings and try again.";
    } else if (error.message.includes('browser')) {
      errorMessage = "There was an issue running the AI in your browser. Please refresh the page and try again.";
    } else {
      // Generic error message for other cases
      errorMessage = `I encountered an error while trying to answer your question: ${error.message}. Please try again or rephrase your question.`;
    }
    
    return {
      type: 'text',
      content: errorMessage
    };
  }
};

// Initialize API keys on load
loadApiKeys();

// Register the implementation with our global service
window._apiServices.register('generateOpenAIResponse', generateOpenAIResponseImplementation);

/**
 * Safe wrapper for the OpenAI response generation function
 * This function can be safely imported and will handle interception when needed
 */
export const generateOpenAIResponse = async (...args) => {
  return window._apiServices.call('generateOpenAIResponse', ...args);
};

// Add helper functions for other modules to use the intercept mechanism
export const interceptOpenAIResponse = (handler, context) => {
  window._apiServices.intercept(handler, context);
};

export const clearOpenAIResponseIntercept = () => {
  window._apiServices.clearIntercept();
};
