import React, { createContext, useState, useEffect, useContext, useMemo, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Import the new IndexedDB helper for conversations
import { 
  loadConversations as loadConversationsFromDB, 
  saveConversations as saveConversationsToDB,
  loadSetting,
  saveSetting,
  migrateFromLocalStorage,
  deleteConversation as deleteConversationFromDB,
  deleteAllConversations as deleteAllConversationsFromDB
} from '../utils/conversationDBHelper';

export const ConversationContext = createContext();

export const ConversationProvider = ({ children }) => {
  // Use an empty array initially, will load from IndexedDB in useEffect
  const [conversations, setConversations] = useState([]);
  
  // Use null initially, will load from IndexedDB in useEffect
  const [currentConversationId, setCurrentConversationId] = useState(null);

  const [isProcessingApiCall, setIsProcessingApiCall] = useState(false);

  // We need to add a key to force updates when messages are added
  const [forceUpdateKey, setForceUpdateKey] = useState(0);
  
  // Create a ref to track initial renders
  const isInitialSaveRender = useRef(true);
  
  // Force an update of the memoized conversation when needed
  const forceConversationUpdate = useCallback(() => {
    setForceUpdateKey(prev => prev + 1);
  }, []);

  // Load conversations and settings from IndexedDB on initial load
  useEffect(() => {
    const initializeData = async () => {
      try {
        // First, migrate any existing data from localStorage to IndexedDB
        await migrateFromLocalStorage();
        
        // Load conversations from IndexedDB
        const loadedConversations = await loadConversationsFromDB();
        console.log(`Loaded ${loadedConversations.length} conversations from IndexedDB`);
        
        // Load current conversation ID from IndexedDB
        const loadedId = await loadSetting('currentConversationId', null);
        console.log('Loaded current conversation ID from IndexedDB:', loadedId);
        
        // Set state with loaded data
        setConversations(loadedConversations);
        setCurrentConversationId(loadedId);
        
        // Create an empty conversation if there are none
        if (loadedConversations.length === 0) {
          const newConversation = {
            id: uuidv4(),
            title: 'New Conversation',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            contextFiles: []
          };
          
          setConversations([newConversation]);
          setCurrentConversationId(newConversation.id);
          console.log('Created initial empty conversation:', newConversation.id);
          
          // Save the new conversation to IndexedDB
          await saveConversationsToDB([newConversation]);
          await saveSetting('currentConversationId', newConversation.id);
        }
      } catch (error) {
        console.error('Error initializing conversation data:', error);
        // Fallback to empty state if there's an error
        setConversations([]);
        setCurrentConversationId(null);
      }
    };
    
    initializeData();
  }, []); // Empty dependency array ensures this runs only once on initial load

  // Use a ref to track the last save time to implement a throttle
  const lastSaveTime = useRef(0);
  const pendingSave = useRef(false);
  const MIN_SAVE_INTERVAL = 3000; // Minimum 3 seconds between saves

  // Save conversations to IndexedDB with throttling to reduce database operations
  useEffect(() => {
    // Skip the first save operation to avoid duplicate saves during initialization
    if (isInitialSaveRender.current) {
      isInitialSaveRender.current = false;
      return;
    }
    
    if (conversations.length === 0) {
      return; // Nothing to save
    }

    // Function to perform the actual save
    const performSave = () => {
      const now = Date.now();
      lastSaveTime.current = now;
      pendingSave.current = false;
      
      // Clone the conversations array to avoid reference issues
      const conversationsToSave = [...conversations];
      
      // Save to IndexedDB
      saveConversationsToDB(conversationsToSave)
        .then(() => {
          // Save was successful, no need to log
        })
        .catch(error => {
          console.error('Error saving conversations to IndexedDB:', error);
        });
    };
    
    // Check if we should throttle the save
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTime.current;
    
    // Clear any existing timeouts
    if (pendingSave.current) {
      return; // Already have a pending save, let it handle the latest state
    }
    
    if (timeSinceLastSave < MIN_SAVE_INTERVAL) {
      // We saved too recently, schedule a save for later
      pendingSave.current = true;
      const delay = MIN_SAVE_INTERVAL - timeSinceLastSave;
      
      const saveTimeout = setTimeout(() => {
        performSave();
      }, delay);
      
      return () => {
        clearTimeout(saveTimeout);
        pendingSave.current = false;
      };
    } else {
      // It's been long enough since the last save, save immediately
      performSave();
    }
  }, [conversations]);
  
  // Add this clean-up effect to ensure any pending saves happen when unmounting
  useEffect(() => {
    return () => {
      if (pendingSave.current && conversations.length > 0) {
        saveConversationsToDB(conversations)
          .catch(error => console.error('Error in cleanup save:', error));
      }
    };
  }, [conversations]);

  // Save current conversation ID to IndexedDB whenever it changes
  useEffect(() => {
    if (currentConversationId) {
      saveSetting('currentConversationId', currentConversationId)
        .catch(error => console.error('Error saving current conversation ID to IndexedDB:', error));
    }
  }, [currentConversationId]);

  // Function to create a new conversation
  const createNewConversation = useCallback(async (title = 'New Conversation') => {
    const newConversation = {
      id: uuidv4(),
      title,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contextFiles: []
    };
    
    console.log('Creating new conversation:', newConversation.id, title);
    
    // Clear all vector stores when creating a new conversation
    try {
      // Import the IndexedDB helper
      const { clearAllVectorStores } = await import('../utils/indexedDBHelper');
      
      // Clear all vector stores in IndexedDB
      await clearAllVectorStores();
      console.log('Cleared all vector stores from IndexedDB for new conversation');
    } catch (error) {
      console.error('Error clearing vector stores from IndexedDB:', error);
    }
    
    // Update conversations
    setConversations(prevConversations => [newConversation, ...prevConversations]);
    
    // Update current conversation ID
    setCurrentConversationId(newConversation.id);
    
    // Force an update of the memoized conversation
    forceConversationUpdate();
    
    return newConversation.id;
  }, [forceConversationUpdate]);

  // Function to get the current conversation
  const getCurrentConversation = useCallback(() => {
    // Try to find the current conversation
    const conversation = conversations.find(c => c.id === currentConversationId);
    
    // If found, return it
    if (conversation) {
      return conversation;
    }
    
    // If not found but we have other conversations, return the first one
    if (conversations.length > 0) {
      const firstConversation = conversations[0];
      setCurrentConversationId(firstConversation.id);
      return firstConversation;
    }
    
    // If no conversations exist, return null
    return null;
  }, [conversations, currentConversationId, setCurrentConversationId]);

  // Helper function to clear all vector stores from IndexedDB
  const clearAllVectorStoresFromDB = useCallback(async () => {
    try {
      console.log('Clearing all vector stores from IndexedDB');
      
      // Import the necessary functions
      const { 
        clearAllVectorStores, 
        clearVectorStores 
      } = await import('../utils/indexedDBHelper');
      
      // First try to clear vector stores by individual types to ensure thorough cleanup
      const fileTypes = ['pdf', 'word', 'excel', 'image'];
      for (const fileType of fileTypes) {
        try {
          await clearVectorStores(fileType);
          console.log(`Cleared ${fileType} vector stores`);
        } catch (typeError) {
          console.error(`Error clearing ${fileType} vector stores:`, typeError);
        }
      }
      
      // Then do a full cleanup as a final measure
      await clearAllVectorStores();
      console.log('Successfully cleared all vector stores');
      
      // Clear localStorage items that might reference vector stores
      const keysToCheck = [
        'activePdfDocumentId', 'activeWordDocumentId', 'activeExcelDocumentId', 'activeImageId',
        'activePdfFileName', 'activeWordFileName', 'activeExcelFileName', 'activeImageName'
      ];
      
      keysToCheck.forEach(key => {
        if (localStorage.getItem(key)) {
          localStorage.removeItem(key);
          console.log(`Removed ${key} from localStorage`);
        }
      });
      
    } catch (error) {
      console.error('Error clearing all vector stores:', error);
      throw error;
    }
  }, []);

  // Function to delete a conversation
  const deleteConversation = useCallback(async (id) => {
    try {
      console.log('Deleting conversation:', id);
      
      // First check if we're deleting the current conversation
      const isDeletingCurrent = id === currentConversationId;
      
      // Find the conversation we're about to delete to check for vector stores
      const conversationToDelete = conversations.find(c => c.id === id);
      const remainingConversations = conversations.filter(c => c.id !== id);
      
      // Clear all vector stores associated with this conversation
      if (conversationToDelete) {
        try {
          await clearAllVectorStoresFromDB();
        } catch (clearError) {
          console.error('Error clearing vector stores:', clearError);
          // Continue with deletion even if clearing fails
        }
        
        // Delete the conversation directly from IndexedDB
        try {
          const deleted = await deleteConversationFromDB(id);
          console.log(`Conversation deletion from IndexedDB ${deleted ? 'successful' : 'failed - not found'}`);
        } catch (deleteError) {
          console.error('Error deleting conversation from IndexedDB:', deleteError);
          // Continue with UI update even if deletion from DB fails
        }
      }
      
      // Update the conversations list in state
      setConversations(remainingConversations);
      
      // If we're deleting the current conversation, handle that case
      if (isDeletingCurrent) {
        if (remainingConversations.length > 0) {
          // Switch to the first remaining conversation
          const newId = remainingConversations[0].id;
          setCurrentConversationId(newId);
          
          // Save the new current conversation ID
          try {
            await saveSetting('currentConversationId', newId);
          } catch (settingError) {
            console.error('Error saving current conversation ID:', settingError);
          }
        } else {
          // If there are no conversations left, create a new one
          await createNewConversation();
        }
      }
      
      // Force an update to refresh the UI
      forceConversationUpdate();
      console.log('Conversation deleted successfully');
    } catch (error) {
      console.error('Error during conversation deletion:', error);
    }
  }, [conversations, currentConversationId, createNewConversation, forceConversationUpdate, clearAllVectorStoresFromDB]);

  // Function to delete all conversations and start fresh
  const deleteAllConversations = useCallback(async () => {
    try {
      console.log('Deleting all conversations');

      // Clear all vector stores associated with any conversation
      try {
        await clearAllVectorStoresFromDB();
      } catch (clearError) {
        console.error('Error clearing vector stores while deleting all conversations:', clearError);
      }

      // Clear conversations from IndexedDB
      try {
        await deleteAllConversationsFromDB();
        await saveSetting('currentConversationId', null);
      } catch (dbError) {
        console.error('Error clearing conversations from IndexedDB:', dbError);
      }

      // Clear legacy localStorage conversation data so it can't be re-migrated
      try {
        if (localStorage.getItem('conversations')) {
          localStorage.removeItem('conversations');
        }
        if (localStorage.getItem('currentConversationId')) {
          localStorage.removeItem('currentConversationId');
        }
      } catch (storageError) {
        console.error('Error clearing conversation data from localStorage:', storageError);
      }

      // Reset state locally
      setConversations([]);
      setCurrentConversationId(null);

      // Create a new blank conversation so the UI has a starting point
      await createNewConversation();

      // Force an update to refresh the UI
      forceConversationUpdate();
      console.log('All conversations deleted successfully');
    } catch (error) {
      console.error('Error during deleteAllConversations:', error);
    }
  }, [clearAllVectorStoresFromDB, createNewConversation, forceConversationUpdate]);

  // Function to add a message to the current conversation
  const addMessageToConversation = useCallback((message) => {
    // Get the current conversation
    const currentConversation = getCurrentConversation();
    
    if (!currentConversation) {
      console.error('No active conversation to add message to');
      return null;
    }
    
    // Make sure the message has a unique ID if not already provided
    const messageToAdd = {
      ...message,
      id: message.id || uuidv4(),
      timestamp: message.timestamp || new Date().toISOString()
    };
    
    // Update the conversation with the new message
    setConversations(prevConversations => {
      return prevConversations.map(c => {
        if (c.id === currentConversation.id) {
          // Add the new message and update the conversation timestamp
          return {
            ...c,
            messages: [...c.messages, messageToAdd],
            updatedAt: new Date().toISOString()
          };
        }
        return c;
      });
    });
    
    // Force an update to refresh the UI
    forceConversationUpdate();
    
    return messageToAdd;
  }, [getCurrentConversation, forceConversationUpdate]);

  // Function to update a message in a conversation
  const updateMessageInConversation = useCallback((conversationId, messageId, updatedMessage) => {
    setConversations(prevConversations => {
      const updatedConversations = prevConversations.map(conv => {
        if (conv.id === conversationId) {
          // Find and update the specific message
          const updatedMessages = conv.messages.map(msg => {
            if (msg.id === messageId) {
              return { ...msg, ...updatedMessage };
            }
            return msg;
          });
          
          // Return the updated conversation
          return {
            ...conv,
            messages: updatedMessages,
            updatedAt: new Date().toISOString()
          };
        }
        return conv;
      });
      
      // Save updated conversations to IndexedDB
      saveConversationsToDB(updatedConversations)
        .catch(error => console.error('Error saving conversations after message update:', error));
      
      return updatedConversations;
    });
    
    // Force an update to refresh the UI
    forceConversationUpdate();
  }, [forceConversationUpdate]);

  // Function to update a conversation title
  const updateConversationTitle = useCallback((id, newTitle) => {
    setConversations(prevConversations => {
      const updatedConversations = prevConversations.map(c => {
        if (c.id === id) {
          return { ...c, title: newTitle, updatedAt: new Date().toISOString() };
        }
        return c;
      });
      
      // Save updated conversations to IndexedDB
      saveConversationsToDB(updatedConversations)
        .catch(error => console.error('Error saving conversations after title update:', error));
      
      return updatedConversations;
    });
    
    // Force an update to refresh the UI
    forceConversationUpdate();
  }, [forceConversationUpdate]);

  // Function to add a context file to the current conversation
  const addContextFileToConversation = useCallback((file) => {
    // Get the current conversation
    const currentConversation = getCurrentConversation();
    
    if (!currentConversation) {
      console.error('No active conversation to add context file to');
      return;
    }
    
    // Update the conversation with the new context file
    setConversations(prevConversations => {
      return prevConversations.map(c => {
        if (c.id === currentConversation.id) {
          // Check if the file already exists in the context files
          const fileExists = c.contextFiles.some(f => f.id === file.id);
          
          if (fileExists) {
            return c; // Don't modify if file already exists
          }
          
          // Add the new context file and update the conversation timestamp
          return {
            ...c,
            contextFiles: [...c.contextFiles, file],
            updatedAt: new Date().toISOString()
          };
        }
        return c;
      });
    });
    
    // Force an update to refresh the UI
    forceConversationUpdate();
  }, [getCurrentConversation, forceConversationUpdate]);

  // Function to remove a context file from the current conversation
  const removeContextFileFromConversation = useCallback((fileId) => {
    // Get the current conversation
    const currentConversation = getCurrentConversation();
    
    if (!currentConversation) {
      console.error('No active conversation to remove context file from');
      return;
    }
    
    // Update the conversation by removing the context file
    setConversations(prevConversations => {
      return prevConversations.map(c => {
        if (c.id === currentConversation.id) {
          // Remove the context file and update the conversation timestamp
          return {
            ...c,
            contextFiles: c.contextFiles.filter(f => f.id !== fileId),
            updatedAt: new Date().toISOString()
          };
        }
        return c;
      });
    });
    
    // Force an update to refresh the UI
    forceConversationUpdate();
  }, [getCurrentConversation, forceConversationUpdate]);

  // Create a memoized value of the current conversation for better performance
  const currentConversationValue = useMemo(() => {
    return getCurrentConversation();
  }, [getCurrentConversation]);

  // Start and end API call functions
  const startApiCall = useCallback(() => {
    setIsProcessingApiCall(true);
  }, []);
  
  const endApiCall = useCallback(() => {
    setIsProcessingApiCall(false);
  }, []);

  // Create the context value
  const contextValue = {
    conversations,
    setConversations,
    currentConversationId,
    currentConversation: currentConversationValue,
    isProcessingApiCall,
    createNewConversation,
    deleteConversation,
    deleteAllConversations,
    setCurrentConversationId,
    updateConversationTitle,
    addMessageToConversation,
    updateMessageInConversation,
    addContextFileToConversation,
    removeContextFileFromConversation,
    startApiCall,
    endApiCall,
    forceConversationUpdate,
    getCurrentConversation // Add this function to the context value
  };

  return (
    <ConversationContext.Provider value={contextValue}>
      {children}
    </ConversationContext.Provider>
  );
};

// Custom hook to use the conversation context
export const useConversation = () => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
};
