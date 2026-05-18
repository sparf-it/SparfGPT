/**
 * IndexedDB helper utility for managing vector stores
 * Provides functions for initializing the database, storing and retrieving vector stores
 */

const DB_NAME = 'SparfGPT_VectorStore';
const DB_VERSION = 1;
const STORES = {
  PDF: 'pdf_vector_stores',
  WORD: 'word_vector_stores',
  EXCEL: 'excel_vector_stores',
  IMAGE: 'image_vector_stores',
  INDEX: 'store_index'
};

/**
 * Initialize the IndexedDB database
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
        console.error('Error opening IndexedDB:', event.target.error);
        // Fall back to localStorage if IndexedDB fails
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
          // Create object stores for each file type if they don't exist
          if (!db.objectStoreNames.contains(STORES.PDF)) {
            db.createObjectStore(STORES.PDF, { keyPath: 'id' });
          }
          
          if (!db.objectStoreNames.contains(STORES.WORD)) {
            db.createObjectStore(STORES.WORD, { keyPath: 'id' });
          }
          
          if (!db.objectStoreNames.contains(STORES.EXCEL)) {
            db.createObjectStore(STORES.EXCEL, { keyPath: 'id' });
          }
          
          if (!db.objectStoreNames.contains(STORES.IMAGE)) {
            db.createObjectStore(STORES.IMAGE, { keyPath: 'id' });
          }
          
          // Create an index store to keep track of all vector stores
          if (!db.objectStoreNames.contains(STORES.INDEX)) {
            const indexStore = db.createObjectStore(STORES.INDEX, { keyPath: 'id' });
            // Create an index on the file type for easier querying
            indexStore.createIndex('fileType', 'fileType', { unique: false });
            // Create an index on the timestamp for easier sorting
            indexStore.createIndex('timestamp', 'timestamp', { unique: false });
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
 * Save vector store data to IndexedDB
 * @param {string} storeType - The type of store (pdf, word, excel, image)
 * @param {string} id - The ID of the vector store
 * @param {Object} vectorStoreData - The vector store data to save
 * @param {string} fileName - The name of the file
 * @returns {Promise<string>} The ID of the saved vector store
 */
export const saveVectorStore = async (storeType, id, vectorStoreData, fileName) => {
  try {
    const db = await initDatabase();
    
    // Determine which object store to use
    let storeName;
    let fileType;
    
    switch (storeType.toLowerCase()) {
      case 'pdf':
        storeName = STORES.PDF;
        fileType = 'pdf';
        break;
      case 'word':
        storeName = STORES.WORD;
        fileType = 'word';
        break;
      case 'excel':
        storeName = STORES.EXCEL;
        fileType = 'excel';
        break;
      case 'image':
        storeName = STORES.IMAGE;
        fileType = 'image';
        break;
      default:
        throw new Error(`Invalid store type: ${storeType}`);
    }
    
    // Prepare the data object to save
    const dataToSave = {
      id,
      data: vectorStoreData,
      fileName,
      timestamp: Date.now()
    };
    
    // Check the size of the data to be saved
    try {
      // Serialize the data to check its size
      const serializedData = JSON.stringify(dataToSave);
      const dataSize = new Blob([serializedData]).size;
      const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(2);
      
      console.log(`Data size for ${fileName} (${fileType}): ${dataSizeMB} MB`);
      
      // If the data is very large, log a warning
      if (dataSize > 50 * 1024 * 1024) {
        console.warn(`WARNING: Large file detected (${dataSizeMB} MB). This may exceed IndexedDB quotas.`);
      }
    } catch (sizeCheckError) {
      console.warn(`Could not check size of data for ${fileName}:`, sizeCheckError);
      // Continue with the save operation anyway
    }
    
    // Try to clear any old stores of the same type first
    // This helps prevent quota exceeded errors by ensuring we don't store too many files
    await clearOldVectorStores(storeType);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName, STORES.INDEX], 'readwrite');
      
      transaction.onerror = (event) => {
        console.error(`Error saving to ${storeName}:`, event.target.error);
        
        // Check if this is a quota error
        if (event.target.error.name === 'QuotaExceededError') {
          console.error('IndexedDB quota exceeded. Attempting emergency cleanup...');
          
          // Try to clear ALL stores of this type
          clearAllVectorStoresByType(storeType)
            .then(() => {
              console.log(`Cleared all ${storeType} stores due to quota error. Advise user to try again.`);
              reject(new Error(
                `Storage quota exceeded while saving ${fileName}. All previous ${storeType} files have been removed. ` +
                `Please try uploading again with a smaller file or fewer files.`
              ));
            })
            .catch(clearError => {
              console.error('Failed emergency cleanup:', clearError);
              reject(event.target.error);
            });
        } else {
          reject(event.target.error);
        }
      };
      
      // Save the vector store data
      const objectStore = transaction.objectStore(storeName);
      const storeRequest = objectStore.put(dataToSave);
      
      storeRequest.onsuccess = () => {
        // Update the index
        const indexStore = transaction.objectStore(STORES.INDEX);
        const indexRequest = indexStore.put({
          id,
          fileName,
          fileType,
          timestamp: Date.now()
        });
        
        indexRequest.onsuccess = () => {
          resolve(id);
        };
        
        indexRequest.onerror = (event) => {
          console.error('Error updating index:', event.target.error);
          reject(event.target.error);
        };
      };
      
      storeRequest.onerror = (event) => {
        console.error(`Error saving vector store data to ${storeName}:`, event.target.error);
        
        // Check if this is a quota error at the request level
        if (event.target.error.name === 'QuotaExceededError') {
          console.error('IndexedDB quota exceeded at request level. Attempting emergency cleanup...');
          
          // Try to clear ALL stores of this type
          clearAllVectorStoresByType(storeType)
            .then(() => {
              console.log(`Cleared all ${storeType} stores due to quota error. Advise user to try again.`);
              reject(new Error(
                `Storage quota exceeded while saving ${fileName}. All previous ${storeType} files have been removed. ` +
                `Please try uploading again with a smaller file or fewer files.`
              ));
            })
            .catch(clearError => {
              console.error('Failed emergency cleanup:', clearError);
              reject(event.target.error);
            });
        } else {
          reject(event.target.error);
        }
      };
    });
  } catch (error) {
    console.error('Error in saveVectorStore:', error);
    throw error;
  }
};

/**
 * Clear old vector stores of a specific type to prevent quota errors
 * @param {string} storeType - The type of store (pdf, word, excel, image)
 * @returns {Promise<void>}
 */
export const clearOldVectorStores = async (storeType) => {
  try {
    const db = await initDatabase();
    
    // Determine which object store to use
    let storeName;
    let fileType;
    
    switch (storeType.toLowerCase()) {
      case 'pdf':
        storeName = STORES.PDF;
        fileType = 'pdf';
        break;
      case 'word':
        storeName = STORES.WORD;
        fileType = 'word';
        break;
      case 'excel':
        storeName = STORES.EXCEL;
        fileType = 'excel';
        break;
      case 'image':
        storeName = STORES.IMAGE;
        fileType = 'image';
        break;
      default:
        throw new Error(`Invalid store type: ${storeType}`);
    }
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.INDEX, storeName], 'readwrite');
      const indexStore = transaction.objectStore(STORES.INDEX);
      const dataStore = transaction.objectStore(storeName);
      
      // Get all entries of this file type from the index
      const index = indexStore.index('fileType');
      const request = index.getAll(fileType);
      
      request.onsuccess = () => {
        const entries = request.result;
        
        // If we have more than 2 files, delete all but the 2 most recent
        if (entries.length > 2) {
          // Sort by timestamp (newest first)
          entries.sort((a, b) => b.timestamp - a.timestamp);
          
          // Keep the 2 most recent entries, delete the rest
          const entriesToDelete = entries.slice(2);
          console.log(`Clearing ${entriesToDelete.length} old ${fileType} files to prevent quota issues`);
          
          let deleted = 0;
          entriesToDelete.forEach(entry => {
            // Delete from the data store
            const deleteDataRequest = dataStore.delete(entry.id);
            
            deleteDataRequest.onsuccess = () => {
              // Delete from the index
              const deleteIndexRequest = indexStore.delete(entry.id);
              
              deleteIndexRequest.onsuccess = () => {
                deleted++;
                if (deleted === entriesToDelete.length) {
                  console.log(`Successfully cleared ${deleted} old ${fileType} files`);
                  resolve();
                }
              };
              
              deleteIndexRequest.onerror = (event) => {
                console.error(`Error deleting index for ${entry.id}:`, event.target.error);
                deleted++;
                if (deleted === entriesToDelete.length) {
                  resolve();
                }
              };
            };
            
            deleteDataRequest.onerror = (event) => {
              console.error(`Error deleting data for ${entry.id}:`, event.target.error);
              deleted++;
              if (deleted === entriesToDelete.length) {
                resolve();
              }
            };
          });
        } else {
          console.log(`Only ${entries.length} ${fileType} files found, no cleanup needed`);
          resolve();
        }
      };
      
      request.onerror = (event) => {
        console.error(`Error getting ${fileType} entries:`, event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error(`Error clearing old ${storeType} stores:`, error);
    throw error;
  }
};

/**
 * Load vector store data from IndexedDB
 * @param {string} storeType - The type of store (pdf, word, excel, image)
 * @param {string} id - The ID of the vector store to load
 * @returns {Promise<Object>} The vector store data
 */
export const loadVectorStore = async (storeType, id) => {
  try {
    const db = await initDatabase();
    
    // Determine which object store to use
    let storeName;
    
    switch (storeType.toLowerCase()) {
      case 'pdf':
        storeName = STORES.PDF;
        break;
      case 'word':
        storeName = STORES.WORD;
        break;
      case 'excel':
        storeName = STORES.EXCEL;
        break;
      case 'image':
        storeName = STORES.IMAGE;
        break;
      default:
        throw new Error(`Invalid store type: ${storeType}`);
    }
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const objectStore = transaction.objectStore(storeName);
      
      // If no ID is provided, get the most recent entry
      if (!id) {
        // Get all entries and sort by timestamp (descending)
        const getAllRequest = objectStore.getAll();
        
        getAllRequest.onsuccess = (event) => {
          const entries = event.target.result;
          
          if (entries && entries.length > 0) {
            // Sort by timestamp (descending)
            entries.sort((a, b) => b.timestamp - a.timestamp);
            resolve(entries[0].data);
          } else {
            reject(new Error(`No ${storeType} vector stores found`));
          }
        };
        
        getAllRequest.onerror = (event) => {
          console.error(`Error getting all ${storeType} vector stores:`, event.target.error);
          reject(event.target.error);
        };
      } else {
        // Get the specific entry by ID
        const getRequest = objectStore.get(id);
        
        getRequest.onsuccess = (event) => {
          const entry = event.target.result;
          
          if (entry) {
            resolve(entry.data);
          } else {
            reject(new Error(`Vector store with ID ${id} not found`));
          }
        };
        
        getRequest.onerror = (event) => {
          console.error(`Error getting vector store with ID ${id}:`, event.target.error);
          reject(event.target.error);
        };
      }
    });
  } catch (error) {
    console.error('Error in loadVectorStore:', error);
    throw error;
  }
};

/**
 * Get all vector store entries from the index
 * @param {string} fileType - Optional file type filter (pdf, word, excel, image)
 * @returns {Promise<Array>} Array of vector store index entries
 */
export const getVectorStoreIndex = async (fileType = null) => {
  try {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.INDEX, 'readonly');
      const objectStore = transaction.objectStore(STORES.INDEX);
      
      if (fileType) {
        // Use the fileType index to get entries for a specific file type
        const index = objectStore.index('fileType');
        const request = index.getAll(fileType);
        
        request.onsuccess = (event) => {
          // Sort by timestamp (descending)
          const entries = event.target.result;
          entries.sort((a, b) => b.timestamp - a.timestamp);
          resolve(entries);
        };
        
        request.onerror = (event) => {
          console.error(`Error getting vector store index for ${fileType}:`, event.target.error);
          reject(event.target.error);
        };
      } else {
        // Get all entries
        const request = objectStore.getAll();
        
        request.onsuccess = (event) => {
          // Sort by timestamp (descending)
          const entries = event.target.result;
          entries.sort((a, b) => b.timestamp - a.timestamp);
          resolve(entries);
        };
        
        request.onerror = (event) => {
          console.error('Error getting all vector store index entries:', event.target.error);
          reject(event.target.error);
        };
      }
    });
  } catch (error) {
    console.error('Error in getVectorStoreIndex:', error);
    throw error;
  }
};

/**
 * Helper function to clear a specific object store
 * @param {IDBDatabase} db - The database instance
 * @param {string} storeName - The name of the store to clear
 * @returns {Promise<void>}
 */
const clearStore = (db, storeName) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    
    request.onsuccess = () => {
      console.log(`Cleared ${storeName} store`);
      resolve();
    };
    
    request.onerror = (event) => {
      console.error(`Error clearing ${storeName} store:`, event.target.error);
      reject(event.target.error);
    };
  });
};

/**
 * Clear all vector stores of a specific type for emergency cleanup
 * @param {string} storeType - The type of store (pdf, word, excel, image)
 * @returns {Promise<void>}
 */
export const clearAllVectorStoresByType = async (storeType) => {
  try {
    const db = await initDatabase();
    
    // Determine which object store to use
    let storeName;
    let fileType;
    
    switch (storeType.toLowerCase()) {
      case 'pdf':
        storeName = STORES.PDF;
        fileType = 'pdf';
        break;
      case 'word':
        storeName = STORES.WORD;
        fileType = 'word';
        break;
      case 'excel':
        storeName = STORES.EXCEL;
        fileType = 'excel';
        break;
      case 'image':
        storeName = STORES.IMAGE;
        fileType = 'image';
        break;
      default:
        throw new Error(`Invalid store type: ${storeType}`);
    }
    
    // Get all IDs of this file type from the index
    const storeIds = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.INDEX, 'readonly');
      const indexStore = transaction.objectStore(STORES.INDEX);
      const index = indexStore.index('fileType');
      const request = index.getAll(fileType);
      
      request.onsuccess = () => {
        resolve(request.result.map(entry => entry.id));
      };
      
      request.onerror = (event) => {
        console.error(`Error getting ${fileType} IDs:`, event.target.error);
        reject(event.target.error);
      };
    });
    
    console.log(`Found ${storeIds.length} ${fileType} stores to clear for emergency cleanup`);
    
    // Clear the stores in two steps to avoid transaction issues
    // Step 1: Clear the data store
    await clearStore(db, storeName);
    
    // Step 2: Clear all entries from the index that match this file type
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.INDEX, 'readwrite');
      const indexStore = transaction.objectStore(STORES.INDEX);
      const index = indexStore.index('fileType');
      const request = index.openCursor(fileType);
      
      let deletedCount = 0;
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        
        if (cursor) {
          // Delete the current entry
          indexStore.delete(cursor.primaryKey);
          deletedCount++;
          cursor.continue();
        } else {
          console.log(`Successfully removed ${deletedCount} entries from the index for ${fileType}`);
          resolve();
        }
      };
      
      request.onerror = (event) => {
        console.error(`Error clearing index entries for ${fileType}:`, event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error(`Error in clearAllVectorStoresByType for ${storeType}:`, error);
    throw error;
  }
};

/**
 * Clear all vector stores for a specific file type
 * @param {string} fileType - The file type to clear (pdf, word, excel, image, or 'all' for all types)
 * @returns {Promise<void>}
 */
export const clearVectorStores = async (fileType) => {
  try {
    const db = await initDatabase();
    
    return new Promise((resolve, reject) => {
      // Determine which stores to clear
      let storesToClear = [];
      
      if (fileType === 'all') {
        storesToClear = [STORES.PDF, STORES.WORD, STORES.EXCEL, STORES.IMAGE, STORES.INDEX];
      } else {
        switch (fileType.toLowerCase()) {
          case 'pdf':
            storesToClear = [STORES.PDF];
            break;
          case 'word':
            storesToClear = [STORES.WORD];
            break;
          case 'excel':
            storesToClear = [STORES.EXCEL];
            break;
          case 'image':
            storesToClear = [STORES.IMAGE];
            break;
          default:
            throw new Error(`Invalid file type: ${fileType}`);
        }
        
        // Also clear related entries from the index
        storesToClear.push(STORES.INDEX);
      }
      
      const transaction = db.transaction(storesToClear, 'readwrite');
      
      transaction.onerror = (event) => {
        console.error(`Error clearing vector stores:`, event.target.error);
        reject(event.target.error);
      };
      
      let completedStores = 0;
      
      // Clear each store
      storesToClear.forEach(storeName => {
        if (storeName === STORES.INDEX && fileType !== 'all') {
          // For the index store, only remove entries matching the file type
          const indexStore = transaction.objectStore(STORES.INDEX);
          const index = indexStore.index('fileType');
          const request = index.openCursor(fileType);
          
          request.onsuccess = (event) => {
            const cursor = event.target.result;
            
            if (cursor) {
              indexStore.delete(cursor.primaryKey);
              cursor.continue();
            } else {
              completedStores++;
              
              if (completedStores === storesToClear.length) {
                resolve();
              }
            }
          };
        } else {
          // Clear the entire store
          const objectStore = transaction.objectStore(storeName);
          const clearRequest = objectStore.clear();
          
          clearRequest.onsuccess = () => {
            completedStores++;
            
            if (completedStores === storesToClear.length) {
              resolve();
            }
          };
        }
      });
    });
  } catch (error) {
    console.error('Error in clearVectorStores:', error);
    throw error;
  }
};

/**
 * Clear all existing vector stores
 * @returns {Promise<void>}
 */
export const clearAllVectorStores = () => {
  return clearVectorStores('all');
};
