import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { v4 as uuidv4 } from 'uuid';
import mammoth from 'mammoth';

// Reuse the Document class and MemoryVectorStore from pdfService
class Document {
  constructor(fields) {
    this.pageContent = fields.pageContent || '';
    this.metadata = fields.metadata || {};
  }
}

// Simple in-memory vector store implementation
class MemoryVectorStore {
  constructor(embeddings) {
    this.embeddings = embeddings;
    this.documents = [];
    this.embeddings_map = {};
  }

  async addDocuments(documents) {
    const texts = documents.map(doc => doc.pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);
    
    for (let i = 0; i < documents.length; i++) {
      const id = uuidv4();
      this.documents.push({ ...documents[i], id });
      this.embeddings_map[id] = embeddings[i];
    }
    
    return this;
  }
  
  async similaritySearch(query, k = 4) {
    try {
      // Add a timeout to the embedding query to prevent hanging
      const embedQueryPromise = this.embeddings.embedQuery(query);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Embedding query timed out after 10 seconds')), 10000)
      );
      
      // Race the embedding query against the timeout
      const queryEmbedding = await Promise.race([embedQueryPromise, timeoutPromise]);
      
      // Make sure we have documents to search
      if (!this.documents || this.documents.length === 0) {
        console.warn('No documents to search in vector store');
        return [];
      }
      
      // Calculate cosine similarity between query and all documents
      const similarities = this.documents.map((doc) => {
        // Make sure the document has an ID and embedding
        if (!doc.id || !this.embeddings_map[doc.id]) {
          console.warn('Document missing ID or embedding:', doc);
          return { document: doc, score: 0 };
        }
        
        const docEmbedding = this.embeddings_map[doc.id];
        return {
          document: doc,
          score: this.cosineSimilarity(queryEmbedding, docEmbedding)
        };
      });
      
      // Filter out any documents with no score (missing embeddings)
      const validSimilarities = similarities.filter(item => item.score > 0);
      
      // Sort by similarity score (descending)
      validSimilarities.sort((a, b) => b.score - a.score);
      
      // Return top k documents
      return validSimilarities.slice(0, k).map(item => item.document);
    } catch (error) {
      console.error('Error in similaritySearch:', error);
      // Return an empty array instead of throwing to prevent UI disruption
      return [];
    }
  }
  
  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  static async fromDocuments(docs, embeddings) {
    const store = new MemoryVectorStore(embeddings);
    await store.addDocuments(docs);
    return store;
  }
  
  async save(directory) {
    // For memory store, we just return the documents and embeddings
    return {
      documents: this.documents,
      embeddings_map: this.embeddings_map
    };
  }
  
  static async load(directory, embeddings) {
    // We just create a new store with the embeddings
    return new MemoryVectorStore(embeddings);
  }
}

/**
 * Extract text from a Word document
 * @param {File} file - The Word document file to extract text from
 * @returns {Promise<string>} - The extracted text
 */
export const extractTextFromWord = async (file) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('Starting Word document text extraction for', file.name);
      
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          // Prepare object to store both text and metadata
          const documentInfo = {
            text: '',
            metadata: {
              filename: file.name,
              fileSize: formatFileSize(file.size),
              dateModified: file.lastModified ? new Date(file.lastModified).toLocaleString() : 'Unknown',
              fileType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
          };
          
          // Start with document name in the text
          let extractedText = `Document: ${file.name}\n\n`;
          
          try {
            // Use mammoth.js to extract text from the Word document
            const arrayBuffer = reader.result;
            const result = await mammoth.extractRawText({ arrayBuffer });
            const text = result.value;
            
            if (text && text.length > 0) {
              // Calculate approximate word count
              const wordCount = countWords(text);
              
              // Calculate approximate page count (250 words per page as an estimate)
              const pageCount = Math.ceil(wordCount / 250);
              
              // Add metadata to both the text and the metadata object
              documentInfo.metadata.wordCount = wordCount;
              documentInfo.metadata.pageCount = pageCount;
              documentInfo.metadata.characterCount = text.length;
              
              // Add metadata header to the extracted text
              extractedText += `Document Metadata:\n`;
              extractedText += `- Pages: Approximately ${pageCount} pages\n`;
              extractedText += `- Word Count: ${wordCount} words\n`;
              extractedText += `- Characters: ${text.length} characters\n`;
              extractedText += `- File Size: ${documentInfo.metadata.fileSize}\n`;
              extractedText += `- Last Modified: ${documentInfo.metadata.dateModified}\n\n`;
              
              extractedText += `Content extracted from file:\n${text}\n`;
              console.log('Extracted text and metadata from Word document successfully');
            } else {
              // Try to get some additional context from the file name
              const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
              extractedText += `This document appears to be about: ${fileNameWithoutExt.replace(/[_-]/g, " ")}\n\n`;
              console.log('Failed to extract meaningful text, using filename as context');
            }
          } catch (textError) {
            console.error('Error extracting text from Word document:', textError);
            // Try to get some additional context from the file name
            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            extractedText += `This document appears to be about: ${fileNameWithoutExt.replace(/[_-]/g, " ")}\n\n`;
            console.log('Using filename as context due to extraction error');
          }
          
          documentInfo.text = extractedText;
          console.log('Word document extraction completed, extracted length:', extractedText.length);
          resolve(documentInfo);
        } catch (docError) {
          console.error('Error during Word document processing:', docError);
          // Fall back to a simple text extraction for reliability
          const fallbackText = `Document: ${file.name}\n\nUnable to extract text content. Using filename as context.\n\nThe document appears to be named: ${file.name}`;
          console.log('Using fallback text extraction');
          resolve({
            text: fallbackText,
            metadata: {
              filename: file.name,
              fileSize: formatFileSize(file.size),
              dateModified: file.lastModified ? new Date(file.lastModified).toLocaleString() : 'Unknown'
            }
          });
        }
      };
      
      reader.onerror = (error) => {
        console.error('Error reading file:', error);
        reject(new Error('Failed to read Word document file'));
      };
      
      // Start reading the file as an ArrayBuffer
      reader.readAsArrayBuffer(file);
      
    } catch (error) {
      console.error('Error in Word document text extraction:', error);
      reject(new Error('Failed to extract text from Word document'));
    }
  });
};

/**
 * Helper function to count words in a string
 * @param {string} text - The text to count words in
 * @returns {number} - The word count
 */
const countWords = (text) => {
  return text.split(/\s+/)
    .filter(word => word.length > 0)
    .length;
};

/**
 * Helper function to format file size in a human-readable format
 * @param {number} bytes - The file size in bytes
 * @returns {string} - Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  else return (bytes / 1073741824).toFixed(1) + ' GB';
};

/**
 * Create a vector store from extracted text
 * @param {Object|string} docInfo - The text and metadata extracted from the Word document
 * @param {string} openAIApiKey - The OpenAI API key
 * @returns {Promise<MemoryVectorStore>} - The vector store
 */
export const createVectorStore = async (docInfo, openAIApiKey) => {
  // Create an AbortController for timeout management
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
  
  try {
    // Handle both string input (for backward compatibility) and object input
    const text = typeof docInfo === 'string' ? docInfo : docInfo.text;
    const metadata = typeof docInfo === 'object' ? docInfo.metadata || {} : {};
    
    // Check if we have valid text
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      throw new Error('Invalid or empty text extracted from Word document');
    }
    
    // Create embeddings instance with appropriate options
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey,
      modelName: 'text-embedding-3-small',
      batchSize: 512, // Process documents in smaller batches
      signal: controller.signal
    });
    
    // Create a text splitter for chunking the document
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    // Split the text into chunks
    const textChunks = await textSplitter.splitText(text);
    
    // If we don't have any chunks, throw an error
    if (!textChunks || textChunks.length === 0) {
      throw new Error('No text chunks created from document');
    }
    
    // Create documents from the text chunks with metadata
    const docs = textChunks.map(chunk => new Document({
      pageContent: chunk,
      metadata: {
        ...metadata,
        source: 'word-document',
      }
    }));
    
    // Create a vector store from the documents
    const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
    
    // Clear the timeout since we're done
    clearTimeout(timeoutId);
    
    console.log(`Vector store created with ${docs.length} documents`);
    return vectorStore;
  } catch (error) {
    // Clear the timeout to prevent a hanging promise
    clearTimeout(timeoutId);
    
    console.error('Error creating vector store:', error);
    throw new Error(`Failed to create vector store: ${error.message}`);
  }
};

/**
 * Query the vector store with a question
 * @param {MemoryVectorStore} vectorStore - The vector store to query
 * @param {string} question - The question to ask
 * @param {number} k - The number of results to return
 * @returns {Promise<Array>} - The relevant document chunks
 */
export const queryVectorStore = async (vectorStore, question, k = 3) => {
  // Set maximum number of chunks to retrieve (cap)
  const MAX_CHUNKS = 8;
  
  // Use the provided k, but cap it at MAX_CHUNKS
  k = Math.min(Math.max(k, 3), MAX_CHUNKS);
  
  // Create an AbortController for timeout management
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout for search

  try {
    console.log(`Querying Word vector store with question: "${question}"`);
    
    // Make sure we have a valid vector store
    if (!vectorStore || !vectorStore.similaritySearch) {
      console.error('Invalid Word vector store provided');
      clearTimeout(timeoutId);
      return [];
    }
    
    try {
      // Get more chunks than we need so we can filter by relevance
      const searchPromise = vectorStore.similaritySearch(question, MAX_CHUNKS * 2);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Search timed out after 15 seconds')), 15000);
      });
      
      // Race the search against the timeout
      let results = await Promise.race([searchPromise, timeoutPromise]);
      
      // Filter results by relevance if the vectorStore returns similarity scores
      if (results && results.length > 0 && results[0].score !== undefined) {
        // Sort by score (highest first)
        results.sort((a, b) => b.score - a.score);
        
        // Define minimum threshold for relevance
        const threshold = 0.6;
        
        // Only include chunks with scores above the threshold
        const relevantResults = results.filter(doc => doc.score > threshold);
        
        // Cap at MAX_CHUNKS, but only use relevant results
        results = relevantResults.slice(0, MAX_CHUNKS);
        console.log(`Using ${results.length} relevant Word chunks out of ${relevantResults.length} above threshold`);
      } else {
        // If no scores available, just take the top k results
        results = results.slice(0, k);
      }
      
      // Validate results
      if (!results || results.length === 0) {
        // Fallback: If no results, try to get a strategic sample of the document
        if (vectorStore.documents && vectorStore.documents.length > 0) {
          let fallbackResults;
          
          if (vectorStore.documents.length > MAX_CHUNKS) {
            // Get some from start, middle, and end to cover more ground
            const startDocs = vectorStore.documents.slice(0, Math.floor(MAX_CHUNKS/3));
            const middleIndex = Math.floor(vectorStore.documents.length / 2);
            const middleDocs = vectorStore.documents.slice(middleIndex - Math.floor(MAX_CHUNKS/3), middleIndex + Math.floor(MAX_CHUNKS/3));
            const endDocs = vectorStore.documents.slice(Math.max(0, vectorStore.documents.length - Math.floor(MAX_CHUNKS/3)), vectorStore.documents.length);
            
            fallbackResults = [...startDocs, ...middleDocs, ...endDocs];
            // Remove duplicates if any
            fallbackResults = fallbackResults.filter((doc, index, self) => 
              index === self.findIndex(d => d.id === doc.id)
            ).slice(0, MAX_CHUNKS);
          } else {
            fallbackResults = vectorStore.documents.slice(0, Math.min(MAX_CHUNKS, vectorStore.documents.length));
          }
          
          console.log(`Using ${fallbackResults.length} Word documents as fallback`);
          return fallbackResults;
        }
        
        return [];
      }
      
      clearTimeout(timeoutId);
      console.log(`Word query returned ${results.length} results`);
      return results;
    } catch (searchError) {
      console.error('Error during Word similarity search:', searchError);
      
      // Fallback using direct document access
      if (vectorStore.documents && vectorStore.documents.length > 0) {
        const fallbackResults = vectorStore.documents.slice(0, Math.min(MAX_CHUNKS, vectorStore.documents.length));
        console.log(`Using ${fallbackResults.length} Word documents as error fallback`);
        return fallbackResults;
      }
      
      return [];
    }
  } catch (error) {
    console.error('Error querying vector store:', error);
    return [];
  }
};

/**
 * Update the index of vector stores
 * This function is now handled by the IndexedDB helper
 * @param {string} key - The key of the vector store
 * @param {string} fileName - The name of the file
 * @deprecated Use IndexedDB helper functions instead
 */
const updateVectorStoreIndex = (key, fileName) => {
  console.warn('updateVectorStoreIndex is deprecated, IndexedDB helper maintains the index automatically');
};

/**
 * Helper function to manage storage space
 * This function is now handled by the browser's IndexedDB implementation
 * @private
 * @deprecated IndexedDB doesn't have the same space limitations as localStorage
 */
const manageLocalStorageSpace = async () => {
  // This function is no longer needed with IndexedDB
  // IndexedDB has much higher storage limits and is managed by the browser
  console.log('Storage space management now handled by IndexedDB');
};

/**
 * Save the vector store to IndexedDB
 * @param {MemoryVectorStore} vectorStore - The vector store to save
 * @param {string} fileName - The name of the file
 * @returns {Promise<string>} - The document ID under which the vector store was saved
 */
export const saveVectorStore = async (vectorStore, fileName) => {
  try {
    // Check if the vector store is valid
    if (!vectorStore || !vectorStore.documents || vectorStore.documents.length === 0) {
      throw new Error('Invalid vector store');
    }

    // Generate a key for the vector store
    const timestamp = Date.now();
    const safeFileName = fileName.replace(/\s+/g, '_').toLowerCase();
    const documentId = `word_vector_store_${safeFileName}_${timestamp}`;
    
    console.log(`Preparing to save Word vector store for ${fileName}...`);
    
    try {
      // Save the vector store data
      const vectorStoreData = await vectorStore.save();
      
      // Check the size of the data before saving to IndexedDB
      const serializedData = JSON.stringify(vectorStoreData);
      const dataSize = new Blob([serializedData]).size;
      const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(2);
      
      console.log(`Word vector store size: ${dataSizeMB} MB`);
      
      // If the data is very large, optimize it
      let optimizedData = vectorStoreData;
      if (dataSize > 20 * 1024 * 1024) { // More than 20MB
        console.warn(`Word vector store is large (${dataSizeMB} MB). Optimizing...`);
        
        // Optimize document structure
        if (vectorStoreData.documents) {
          optimizedData.documents = vectorStoreData.documents.map(doc => ({
            id: doc.id,
            pageContent: doc.pageContent,
            metadata: {
              source: doc.metadata?.source || 'word',
              page: doc.metadata?.page
            }
          }));
        }
        
        // Recalculate size after optimization
        const optimizedSize = new Blob([JSON.stringify(optimizedData)]).size;
        console.log(`Optimized Word vector store size: ${(optimizedSize / (1024 * 1024)).toFixed(2)} MB`);
      }

      // Import the IndexedDB helper
      const { saveVectorStore: saveToIndexedDB, clearVectorStores } = await import('../utils/indexedDBHelper');
      
      // Clear old Word vector stores to make room for the new one
      await clearVectorStores('word');
      
      // Save to IndexedDB
      await saveToIndexedDB('word', documentId, optimizedData, fileName);
      
      console.log(`Successfully saved Word vector store with ID: ${documentId}`);
      return documentId;
    } catch (savingError) {
      console.error('Error serializing or saving Word vector store:', savingError);
      
      // Try emergency fallback with minimal data
      console.warn('Attempting emergency optimization of Word vector store...');
      
      // Create a minimal version with just essential data
      const minimalData = {
        documents: vectorStore.documents.map(doc => ({
          id: doc.id,
          pageContent: typeof doc.pageContent === 'string' && doc.pageContent.length > 1000 ?
            doc.pageContent.substring(0, 1000) + '...' : doc.pageContent,
          metadata: { source: 'word' }
        })).slice(0, 20), // Limit to first 20 documents
        embeddings_map: {}
      };
      
      // Add just the embeddings for the included documents
      const docIds = minimalData.documents.map(d => d.id);
      docIds.forEach(id => {
        if (vectorStore.embeddings_map[id]) {
          minimalData.embeddings_map[id] = vectorStore.embeddings_map[id];
        }
      });
      
      // Import the IndexedDB helper
      const { saveVectorStore: saveToIndexedDB, clearVectorStores } = await import('../utils/indexedDBHelper');
      
      // Clear all existing Word vector stores
      await clearVectorStores('word');
      
      // Try to save the minimal data
      await saveToIndexedDB('word', documentId, minimalData, fileName);
      
      console.log(`Saved minimal Word vector store with ID: ${documentId}`);
      return documentId;
    }
  } catch (error) {
    console.error('Error saving Word vector store:', error);
    throw error;
  }
};
/**
 * Get available vector stores from IndexedDB
 * @returns {Promise<Array>} - List of available vector stores
 */
export const getAvailableVectorStores = async () => {
  try {
    // Use the indexedDBHelper to get all Word vector stores from the index
    const { getVectorStoreIndex } = await import('../utils/indexedDBHelper');
    return await getVectorStoreIndex('word');
  } catch (error) {
    console.error('Error getting available vector stores:', error);
    return [];
  }
};

/**
 * Load a vector store from IndexedDB
 * @param {string} documentId - The document ID to load the vector store from
 * @param {string} openAIApiKey - The OpenAI API key
 * @returns {Promise<MemoryVectorStore>} - The loaded vector store
 */
export const loadVectorStore = async (documentId, openAIApiKey) => {
  try {
    // Create embeddings instance
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey,
      modelName: 'text-embedding-3-small'
    });
    
    // Create a new vector store instance
    const vectorStore = new MemoryVectorStore(embeddings);
    
    // Import the IndexedDB helper
    const { loadVectorStore: loadFromIndexedDB } = await import('../utils/indexedDBHelper');
    
    // Load the vector store data from IndexedDB
    const vectorStoreData = await loadFromIndexedDB('word', documentId);
    
    // Load the documents and embeddings into the vector store
    if (vectorStoreData.documents && vectorStoreData.embeddings_map) {
      vectorStore.documents = vectorStoreData.documents;
      vectorStore.embeddings_map = vectorStoreData.embeddings_map;
      
      return vectorStore;
    } else {
      throw new Error('Invalid vector store data format');
    }
  } catch (error) {
    console.error('Error loading Word vector store:', error);
    throw error;
  }
};
