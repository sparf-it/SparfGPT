/**
 * Helper functions to enhance chat responses with vector store integration
 */

import { enhanceMessagesWithVectorStoreContent } from './vectorStoreHelper';

import { interceptOpenAIResponse, clearOpenAIResponseIntercept } from '../services/api';

// Handler function for API interception
const enhancedApiHandler = async (originalFn, context, messages, ...args) => {
  const { vectorStores, contextFiles, userInput, settings } = context;
  
  if (!vectorStores || !contextFiles) {
    console.log('Enhanced API handler: No vector stores or context files, using original function');
    return originalFn(messages, ...args);
  }
  
  try {
    console.log('Enhanced API handler: Enhancing messages with vector store content');
    console.log('Available vector stores:', Object.keys(vectorStores).filter(key => vectorStores[key]).join(', '));
    
    // Log context files
    console.log('Context files to use:', contextFiles.length);
    contextFiles.forEach((file, i) => {
      console.log(`Context file ${i+1}:`, file.name, 'type:', file.type);
    });
    
    // Enhance messages with vector store content
    const enhancedMessages = await enhanceMessagesWithVectorStoreContent(
      messages,
      userInput,
      contextFiles,
      {
        vectorStores,
        defaultSystemPrompt: settings?.systemPrompt,
        maxChunksPerFile: 6, // Increase chunks for more comprehensive context
        includeFileMetadata: true, // Add file metadata to help with context
        persistContext: true, // Ensure context persists across multiple queries
        debugMode: true
      }
    );
    
    console.log('Enhanced message count:', enhancedMessages.length);
    
    // Call the original function with enhanced messages
    return originalFn(enhancedMessages, ...args);
  } catch (error) {
    console.error('Error enhancing messages:', error);
    // Fall back to original function if enhancement fails
    return originalFn(messages, ...args);
  }
};

/**
 * Wrap the handleChatResponse function to include vector store integration
 * This is designed to be a drop-in replacement for the existing function
 * 
 * @param {Function} originalHandleChatResponse - The original handleChatResponse function
 * @param {Object} options - Options and context needed for vector store integration
 * @returns {Function} - Enhanced handleChatResponse function with vector store integration
 */
export const enhancedChatResponse = (originalHandleChatResponse, options) => {
  // Return a new function that wraps the original one
  return async (userInput, userMessage) => {
    const {
      getCurrentConversation,
      pdfVectorStore,
      wordVectorStore,
      excelVectorStore,
      imageVectorStore,
      settings
    } = options;
    
    try {
      // Get the current conversation to access its context files
      const currentConversation = getCurrentConversation();
      
      // If there are no context files, just call the original function
      if (!currentConversation?.contextFiles?.length) {
        console.log('No context files found, using original chat response handler');
        return originalHandleChatResponse(userInput, userMessage);
      }
      
      console.log('Context files found, enhancing chat response with vector store integration');
      
      // Create the context object for the API interceptor
      const interceptContext = {
        vectorStores: {
          pdf: pdfVectorStore,
          word: wordVectorStore,
          excel: excelVectorStore,
          image: imageVectorStore
        },
        contextFiles: currentConversation.contextFiles,
        userInput,
        settings
      };
      
      // Set up the API intercept
      interceptOpenAIResponse(enhancedApiHandler, interceptContext);
      
      try {
        // Call the original handler - the intercept mechanism will handle enhancement
        return await originalHandleChatResponse(userInput, userMessage);
      } finally {
        // Clear the intercept after we're done
        clearOpenAIResponseIntercept();
      }
    } catch (error) {
      console.error('Error in enhanced chat response:', error);
      // Fall back to original function if enhancement fails
      clearOpenAIResponseIntercept();
      return originalHandleChatResponse(userInput, userMessage);
    }
  };
};
