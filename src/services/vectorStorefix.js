/**
 * Utility functions to fix vector store loading issues
 */

/**
 * Fix vector store loading by ensuring consistent naming patterns
 * This should be called once to fix the localStorage entries
 */
export const fixVectorStoreKeys = () => {
  console.log('Running vector store key fix utility...');
  const fixResults = {
    fixed: 0,
    errors: 0,
    details: []
  };
  
  try {
    // 1. Check all localStorage keys for vector stores
    const totalKeys = localStorage.length;
    console.log(`Checking ${totalKeys} localStorage keys for vector stores...`);
    
    // Find all vector store keys with various prefixes
    const vectorStoreKeys = [];
    for (let i = 0; i < totalKeys; i++) {
      const key = localStorage.key(i);
      if (key && (
          key.includes('vector_store') || 
          key.includes('pdf_vector') || 
          key.startsWith('pdf_') ||
          key.startsWith('word_') ||
          key.startsWith('excel_') ||
          key.startsWith('image_')
        )) {
        vectorStoreKeys.push(key);
      }
    }
    
    console.log(`Found ${vectorStoreKeys.length} potential vector store keys`);
    fixResults.details.push(`Found ${vectorStoreKeys.length} potential vector store keys`);
    
    // 2. Process each vector store key to ensure correct format
    for (const key of vectorStoreKeys) {
      try {
        const data = localStorage.getItem(key);
        if (!data) continue;
        
        // Parse the data to verify it's a vector store
        const parsed = JSON.parse(data);
        if (!parsed || !parsed.documents) continue;
        
        // Determine document type from key
        let docType = 'pdf'; // Default
        if (key.includes('word')) docType = 'word';
        if (key.includes('excel')) docType = 'excel';
        if (key.includes('image')) docType = 'image';
        
        // Create standardized key format
        const fileName = key.split('_').pop() || 'document';
        const timestamp = Date.now();
        const newKey = `${docType}_vector_store_${fileName}_${timestamp}`;
        
        // Store with new key if not already using standard format
        if (!key.startsWith(`${docType}_vector_store_`)) {
          localStorage.setItem(newKey, data);
          
          // Update the vector store index
          updateVectorStoreIndex(docType, newKey, fileName);
          
          console.log(`Fixed vector store key: ${key} → ${newKey}`);
          fixResults.details.push(`Fixed: ${key} → ${newKey}`);
          fixResults.fixed++;
        }
      } catch (err) {
        console.error(`Error processing key ${key}:`, err);
        fixResults.details.push(`Error with key ${key}: ${err.message}`);
        fixResults.errors++;
      }
    }
    
    // 3. Create missing indexes if needed
    ensureVectorStoreIndexes();
    
    console.log(`Vector store fix complete. Fixed: ${fixResults.fixed}, Errors: ${fixResults.errors}`);
    return fixResults;
  } catch (error) {
    console.error('Error in fixVectorStoreKeys:', error);
    fixResults.details.push(`Critical error: ${error.message}`);
    fixResults.errors++;
    return fixResults;
  }
};

/**
 * Ensure all vector store indexes exist
 */
const ensureVectorStoreIndexes = () => {
  const docTypes = ['pdf', 'word', 'excel', 'image'];
  
  for (const type of docTypes) {
    const indexKey = `${type}_vector_store_index`;
    const indexStr = localStorage.getItem(indexKey);
    
    if (!indexStr) {
      // Create empty index
      localStorage.setItem(indexKey, '[]');
      console.log(`Created missing index for ${type}`);
    }
  }
};

/**
 * Update the vector store index for a specific document type
 */
const updateVectorStoreIndex = (docType, key, fileName) => {
  const indexKey = `${docType}_vector_store_index`;
  let index = [];
  
  // Get existing index
  const indexStr = localStorage.getItem(indexKey);
  if (indexStr) {
    try {
      index = JSON.parse(indexStr);
    } catch (error) {
      console.error(`Error parsing ${docType} vector store index:`, error);
      // If the index is corrupted, start fresh
      index = [];
    }
  }
  
  // Add the new entry
  index.push({
    id: key,
    fileName,
    timestamp: Date.now()
  });
  
  // Save the updated index
  localStorage.setItem(indexKey, JSON.stringify(index));
  console.log(`Updated ${docType} vector store index with key: ${key}`);
};

/**
 * Clear all vector stores and reset
 * Use with caution! This will delete all vector stores
 */
export const resetAllVectorStores = () => {
  const docTypes = ['pdf', 'word', 'excel', 'image'];
  let deletedCount = 0;
  
  // First clear the indexes
  for (const type of docTypes) {
    localStorage.removeItem(`${type}_vector_store_index`);
  }
  
  // Then find and remove all vector store entries
  const totalKeys = localStorage.length;
  const keysToRemove = [];
  
  for (let i = 0; i < totalKeys; i++) {
    const key = localStorage.key(i);
    if (key && (
        key.includes('vector_store') || 
        key.includes('pdf_vector') || 
        key.startsWith('pdf_') ||
        key.startsWith('word_') ||
        key.startsWith('excel_') ||
        key.startsWith('image_')
      )) {
      keysToRemove.push(key);
    }
  }
  
  // Remove the keys
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
    deletedCount++;
  }
  
  // Re-create empty indexes
  ensureVectorStoreIndexes();
  
  console.log(`Reset complete. Deleted ${deletedCount} vector store entries.`);
  return { deletedCount };
};
