/**
 * Conversation IndexedDB helper utility for managing conversations
 * Provides functions for storing and retrieving conversations from IndexedDB
 */

const DB_NAME = 'SparfGPT_Conversations';
const DB_VERSION = 1;
const CONVERSATIONS_STORE = 'conversations';
const SETTINGS_STORE = 'settings';

// Counter to track save operations and reduce excessive logging
let saveOperationCounter = 0;

/**
 * Initialize the IndexedDB database for conversations
 * @returns {Promise<IDBDatabase>} The database instance
 */
export const initDatabase = () => {
  return new Promise((resolve, reject) => {
    // Check if IndexedDB is available
    if (!window.indexedDB) {
      console.error('Your browser doesn\'t support IndexedDB');
      reject(new Error('IndexedDB not supported'));
      return;
    }
    
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        console.error('Error opening Conversations IndexedDB:', event.target.error);
        reject(event.target.error);
      };
      
      request.onblocked = (event) => {
        console.warn('IndexedDB request was blocked. Please close other tabs with this app');
        // Still try to proceed
        resolve(event.target.result);
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        
        // Add error handler for database operations
        db.onerror = (event) => {
          console.error('Database error:', event.target.error);
        };
        
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        try {
          // Create object store for conversations if it doesn't exist
          if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
            const conversationsStore = db.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'id' });
            // Create an index on the updatedAt field for easier sorting
            conversationsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
          
          // Create object store for settings if it doesn't exist
          if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
            db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
          }
        } catch (upgradeError) {
          console.error('Error during database upgrade:', upgradeError);
        }
      };
    } catch (initError) {
      console.error('Error initializing IndexedDB:', initError);
      reject(initError);
    }
  });
};

/**
 * Save all conversations to IndexedDB
 * @param {Array} conversations - Array of conversation objects
 * @returns {Promise<void>}
 */
export const saveConversations = async (conversations) => {
  try {
    if (!Array.isArray(conversations)) {
      throw new Error('Invalid conversations array');
    }
    
    if (conversations.length === 0) {
      // Nothing to save
      return;
    }
    
    const operationId = ++saveOperationCounter;
    const isBatchSave = conversations.length > 1;
    
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(CONVERSATIONS_STORE, 'readwrite');
        const store = transaction.objectStore(CONVERSATIONS_STORE);
        
        // Keep track of completed operations
        let completed = 0;
        let errors = 0;
        
        // Track conversation IDs for debugging if needed
        const conversationIds = conversations.map(c => c.id);
        
        // Process each conversation by directly updating it
        conversations.forEach(conversation => {
          try {
            // Use put operation which will add or update as needed
            const request = store.put(conversation);
            
            request.onsuccess = () => {
              completed++;
              if (completed + errors === conversations.length) {
                // Only log for first operation or if there were errors
                if (operationId <= 2 || errors > 0) {
                  console.log(`[DB:${operationId}] Saved ${completed} conversations successfully`);
                }
                resolve();
              }
            };
            
            request.onerror = (event) => {
              console.error('Error saving conversation:', event.target.error);
              errors++;
              if (completed + errors === conversations.length) {
                if (completed > 0) {
                  console.warn(`Partial save: ${completed} saved, ${errors} errors`);
                  resolve();
                } else {
                  reject(new Error('Failed to save any conversations'));
                }
              }
            };
          } catch (itemError) {
            console.error('Error processing conversation item:', itemError);
            errors++;
            if (completed + errors === conversations.length) {
              if (completed > 0) {
                resolve();
              } else {
                reject(itemError);
              }
            }
          }
        });
        
        // Handle transaction errors
        transaction.onerror = (event) => {
          console.error('Transaction error during save:', event.target.error);
          reject(event.target.error);
        };
      } catch (transactionError) {
        console.error('Error creating transaction:', transactionError);
        reject(transactionError);
      }
    });
  } catch (error) {
    console.error('Error in saveConversations:', error);
    throw error;
  }
};

/**
 * Load all conversations from IndexedDB
 * @returns {Promise<Array>} Array of conversation objects
 */
export const loadConversations = async () => {
  try {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONVERSATIONS_STORE, 'readonly');
      const store = transaction.objectStore(CONVERSATIONS_STORE);
      
      // Get all conversations
      const request = store.getAll();
      
      request.onsuccess = (event) => {
        const conversations = event.target.result;
        // Sort conversations by updated timestamp (newest first)
        conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        console.log(`Loaded ${conversations.length} conversations from IndexedDB`);
        resolve(conversations);
      };
      
      request.onerror = (event) => {
        console.error('Error loading conversations:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Error loading conversations from IndexedDB:', error);
    throw error;
  }
};

/**
 * Delete a specific conversation from IndexedDB by ID
 * @param {string} id - The conversation ID to delete
 * @returns {Promise<boolean>} True if successful, false if not found
 */
export const deleteConversation = async (id) => {
  try {
    console.log(`Attempting to delete conversation with ID: ${id} from IndexedDB`);
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONVERSATIONS_STORE, 'readwrite');
      const store = transaction.objectStore(CONVERSATIONS_STORE);
      
      // Check if the conversation exists first
      const getRequest = store.get(id);
      
      getRequest.onsuccess = (event) => {
        const conversation = event.target.result;
        
        if (!conversation) {
          console.log(`Conversation with ID ${id} not found in database`);
          resolve(false); // Conversation not found
          return;
        }
        
        // Delete the conversation
        const deleteRequest = store.delete(id);
        
        deleteRequest.onsuccess = () => {
          console.log(`Successfully deleted conversation with ID: ${id} from IndexedDB`);
          resolve(true);
        };
        
        deleteRequest.onerror = (event) => {
          console.error(`Error deleting conversation with ID ${id}:`, event.target.error);
          reject(event.target.error);
        };
      };
      
      getRequest.onerror = (event) => {
        console.error(`Error checking for conversation with ID ${id}:`, event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error(`Error in deleteConversation for ID ${id}:`, error);
    throw error;
  }
};

/**
 * Delete all conversations from IndexedDB
 * @returns {Promise<number>} The number of deleted conversations
 */
export const deleteAllConversations = async () => {
  try {
    console.log('Attempting to delete all conversations from IndexedDB');
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONVERSATIONS_STORE, 'readwrite');
      const store = transaction.objectStore(CONVERSATIONS_STORE);
      
      // Get count first for return value
      const countRequest = store.count();
      let count = 0;
      
      countRequest.onsuccess = () => {
        count = countRequest.result;
        
        // Clear all conversations
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
          console.log(`Successfully deleted all ${count} conversations from IndexedDB`);
          resolve(count);
        };
        
        clearRequest.onerror = (event) => {
          console.error('Error deleting all conversations:', event.target.error);
          reject(event.target.error);
        };
      };
      
      countRequest.onerror = (event) => {
        console.error('Error counting conversations:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Error in deleteAllConversations:', error);
    throw error;
  }
};

/**
 * Save a setting to IndexedDB
 * @param {string} key - The setting key
 * @param {any} value - The setting value
 * @returns {Promise<void>}
 */
export const saveSetting = async (key, value) => {
  try {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SETTINGS_STORE, 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      
      // Create a setting object
      const setting = {
        key,
        value
      };
      
      // Save the setting
      const request = store.put(setting);
      
      request.onsuccess = () => {
        // Reduced logging
        resolve();
      };
      
      request.onerror = (event) => {
        console.error(`Error saving setting ${key}:`, event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Error saving setting to IndexedDB:', error);
    throw error;
  }
};

/**
 * Load a setting from IndexedDB
 * @param {string} key - The setting key
 * @param {any} defaultValue - Default value to return if setting not found
 * @returns {Promise<any>} The setting value
 */
export const loadSetting = async (key, defaultValue = null) => {
  try {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SETTINGS_STORE, 'readonly');
      const store = transaction.objectStore(SETTINGS_STORE);
      
      // Get the setting
      const request = store.get(key);
      
      request.onsuccess = (event) => {
        const setting = event.target.result;
        if (setting) {
          // Reduced logging
          resolve(setting.value);
        } else {
          resolve(defaultValue);
        }
      };
      
      request.onerror = (event) => {
        console.error(`Error loading setting ${key}:`, event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Error loading setting from IndexedDB:', error);
    throw error;
  }
};

/**
 * Migrate data from localStorage to IndexedDB
 * @returns {Promise<void>}
 */
export const migrateFromLocalStorage = async () => {
  try {
    // Check if there's data in localStorage
    const localStorageConversations = localStorage.getItem('conversations');
    if (localStorageConversations) {
      try {
        const conversations = JSON.parse(localStorageConversations);
        if (Array.isArray(conversations) && conversations.length > 0) {
          console.log(`Migrating ${conversations.length} conversations from localStorage to IndexedDB`);
          await saveConversations(conversations);
          
          // Also migrate current conversation ID if available
          const currentConversationId = localStorage.getItem('currentConversationId');
          if (currentConversationId) {
            await saveSetting('currentConversationId', currentConversationId);
          }
        }
      } catch (parseError) {
        console.error('Error parsing conversations from localStorage:', parseError);
      }
    }
    
    console.log('Migration from localStorage to IndexedDB complete');
  } catch (error) {
    console.error('Error migrating from localStorage to IndexedDB:', error);
  }
};
