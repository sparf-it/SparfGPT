import { OpenAIEmbeddings } from '@langchain/openai';
import { v4 as uuidv4 } from 'uuid';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/webpack';

// Configure PDF.js to use a blank worker URL (webpack will handle bundling)
GlobalWorkerOptions.workerSrc = '';
console.log('PDF.js configured to use webpack-bundled worker');

// Simple Document class to replace the LangChain Document class
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
 * Extract text from a PDF file using PDF.js
 * @param {File} file - The PDF file to extract text from
 * @returns {Promise<string>} - The extracted text
 */
export const extractTextFromPDF = async (file) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('Starting PDF text extraction for', file.name);
      
      // Read file as ArrayBuffer
      const reader = new FileReader();
      
      reader.onload = function() {
        // Use a try/catch block for the entire PDF processing
        try {
          // Simple options for PDF.js - minimizing potential issues
          const loadingTask = getDocument({
            data: new Uint8Array(reader.result),
            // Disable features that could cause problems
            disableStream: true,
            disableAutoFetch: true,
          });
          
          loadingTask.promise
            .then(function(pdf) {
              console.log('PDF loaded successfully with', pdf.numPages, 'pages');
              
              // We'll extract text one page at a time
              let fullText = '';
              let pendingPages = [];
              
              // Determine how many pages to process (limit for performance)
              const pagesToProcess = Math.min(pdf.numPages, 50);
              
              // Process each page
              for (let i = 1; i <= pagesToProcess; i++) {
                // Create array of page processing promises
                const pagePromise = pdf.getPage(i).then(function(page) {
                  return page.getTextContent().then(function(textContent) {
                    // Extract strings from text items
                    const strings = textContent.items.map(function(item) {
                      return item.str;
                    });
                    
                    // Join strings with spaces and return with page number
                    return `[Page ${i}]\n${strings.join(' ')}\n\n`;
                  });
                }).catch(function(err) {
                  console.warn('Error extracting text from page', i, err);
                  return `[Page ${i} - Error: Could not extract text]\n\n`;
                });
                
                pendingPages.push(pagePromise);
              }
              
              // Wait for all pages to be processed
              return Promise.all(pendingPages).then(function(pageTexts) {
                // Combine all page texts
                fullText = pageTexts.join('');
                
                if (pdf.numPages > pagesToProcess) {
                  fullText += `[Note: Only extracted ${pagesToProcess} of ${pdf.numPages} pages due to size limitations]`;
                }
                
                console.log('PDF text extracted successfully, length:', fullText.length, 'characters');
                return fullText;
              });
            })
            .then(function(text) {
              // Check if we got meaningful text
              if (!text || text.length < 50) {
                console.warn('Extracted text is suspiciously short:', text);
                resolve(`The PDF ${file.name} appears to contain little or no extractable text. It may be scanned or image-based.`);
              } else {
                // Success! We have the text
                resolve(text);
              }
            })
            .catch(function(err) {
              console.error('PDF.js error:', err);
              // Try a last resort simple extraction
              try {
                const text = `Document: ${file.name}\n\nThe PDF content could not be fully extracted. Using file metadata as context.`;
                resolve(text);
              } catch (e) {
                reject(new Error(`Failed to extract text from PDF: ${err.message}`));
              }
            });
        } catch (mainError) {
          console.error('Main PDF processing error:', mainError);
          reject(new Error(`PDF processing error: ${mainError.message}`));
        }
      };
      
      reader.onerror = function(event) {
        console.error('Error reading file:', event);
        reject(new Error('Could not read the PDF file'));
      };
      
      reader.readAsArrayBuffer(file);
      
    } catch (error) {
      console.error('PDF extraction error:', error);
      reject(new Error(`PDF extraction failed: ${error.message}`));
    }
  });
};

/**
 * Process PDF page text content with layout awareness
 * @param {Object} textContent - The PDF.js text content object
 * @returns {string} - Processed text with layout preserved
 */
async function processPageText(textContent) {
  // Early exit for empty content
  if (!textContent || !textContent.items || textContent.items.length === 0) {
    return '';
  }
  
  // Group text items by their vertical position (y-coordinate)
  const textByLines = {};
  
  for (const item of textContent.items) {
    if (!item.transform || item.transform.length < 6) continue;
    
    // Get vertical position and round to handle slight variations
    const y = Math.round(item.transform[5]);
    
    // Create array for this y-position if it doesn't exist
    if (!textByLines[y]) {
      textByLines[y] = [];
    }
    
    // Add this text item with its horizontal position
    textByLines[y].push({
      text: item.str,
      x: item.transform[4]
    });
  }
  
  // Sort all lines by vertical position (top to bottom)
  const sortedLines = Object.keys(textByLines)
    .map(Number)
    .sort((a, b) => b - a); // Descending order (top of page to bottom)
  
  // Build text by processing each line
  let result = '';
  
  for (const y of sortedLines) {
    // Sort text items on this line by horizontal position (left to right)
    textByLines[y].sort((a, b) => a.x - b.x);
    
    // Join all text on this line with spaces
    const lineText = textByLines[y]
      .map(item => item.text)
      .join(' ')
      .trim();
    
    // Add to result if the line has content
    if (lineText) {
      result += lineText + '\n';
    }
  }
  
  return result;
}

/**
 * Last resort fallback for text extraction from PDF
 * @param {Uint8Array} data - The PDF file data
 * @returns {Promise<string>} - Extracted text or error message
 */
async function extractRawTextFallback(data) {
  try {
    // Try to load the PDF again with minimal options
    const pdfDoc = await getDocument({
      data: data,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true
    }).promise;
    
    let extractedText = '';
    const maxPages = Math.min(pdfDoc.numPages, 50);
    
    // Simple text extraction approach
    for (let i = 1; i <= maxPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        
        // Simple concatenation of all text items
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ');
        
        extractedText += pageText + '\n\n';
      } catch (e) {
        console.warn(`Fallback extraction error on page ${i}:`, e);
      }
    }
    
    return extractedText;
  } catch (error) {
    console.error('Raw text extraction fallback failed:', error);
    return '';
  }
}

/**
 * Create a vector store from extracted text
 * @param {string} text - The text extracted from the PDF
 * @param {string} openAIApiKey - The OpenAI API key
 * @returns {Promise<MemoryVectorStore>} - The vector store
 */
export const createVectorStore = async (text, openAIApiKey) => {
  // Create an AbortController for timeout management
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
  
  try {
    // Check if we have valid text
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      throw new Error('Invalid or empty text extracted from PDF');
    }
    
    // Create embeddings instance with appropriate options
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey,
      modelName: 'text-embedding-3-small',
      dangerouslyAllowBrowser: true, // Allow embeddings in browser environment
    });
    
    // Split the text into chunks with error handling
    const chunkSize = 500; // Smaller chunk size for safer processing
    const chunkOverlap = 50; // Smaller overlap
    let chunks = [];
    
    try {
      console.log('Text length for chunking:', text.length);
      
      // Safety check - if text is extremely large, truncate it
      const maxTextLength = 100000; // 100K characters max
      const safeText = text.length > maxTextLength ? 
        text.substring(0, maxTextLength) + "\n[Content truncated due to size]" : 
        text;
      
      // Very simple and safe chunking strategy - just break by size with minimal overlap
      // This avoids complex parsing that might cause errors with binary content
      let position = 0;
      
      // Limit to a reasonable number of chunks to prevent array length errors
      const maxChunks = 50;
      let chunkCount = 0;
      
      while (position < safeText.length && chunkCount < maxChunks) {
        const end = Math.min(position + chunkSize, safeText.length);
        const chunk = safeText.substring(position, end);
        if (chunk.trim().length > 0) { // Only add non-empty chunks
          chunks.push(chunk);
          chunkCount++;
        }
        position += (chunkSize - chunkOverlap);
      }
      
      console.log(`Created ${chunks.length} chunks from text`);
    } catch (chunkError) {
      console.error('Error chunking text:', chunkError);
      // Super simple fallback - just create a few chunks from the beginning
      chunks = [
        text.substring(0, 500),
        text.substring(500, 1000),
        text.substring(1000, 1500)
      ].filter(chunk => chunk && chunk.length > 0);
      console.log('Using fallback chunking strategy');
    }
    
    // If no chunks were created, throw an error
    if (chunks.length === 0) {
      throw new Error('No text chunks could be extracted from the PDF');
    }
    
    // Create Document objects with proper error handling
    const docs = chunks
      .filter(chunk => chunk && chunk.trim().length > 0) // Ensure no empty chunks
      .map((chunk, i) => new Document({
        pageContent: chunk,
        metadata: { chunk: i, source: 'pdf' }
      }));
    
    // Create and return the vector store with signal from AbortController
    const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
    
    // Clear the timeout since the operation completed successfully
    clearTimeout(timeoutId);
    
    return vectorStore;
  } catch (error) {
    // Clear the timeout to prevent memory leaks
    clearTimeout(timeoutId);
    
    console.error('Error creating vector store:', error);
    
    // Provide more specific error messages
    if (error.name === 'AbortError') {
      throw new Error('PDF processing timed out. The file may be too large or complex.');
    } else if (error.message.includes('API key')) {
      throw new Error('OpenAI API key issue: Please check your API key in settings.');
    } else {
      throw new Error(`Failed to create vector store: ${error.message}`);
    }
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
    // Validate inputs
    if (!vectorStore) {
      throw new Error('Vector store is not available. Please upload a PDF first.');
    }
    
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      throw new Error('Please provide a valid question about the PDF.');
    }
    
    // Make sure vectorStore has the similaritySearch method
    if (typeof vectorStore.similaritySearch !== 'function') {
      console.error('Vector store missing similaritySearch method');
      throw new Error('Invalid vector store: missing search functionality.');
    }
    
    // Debug the vector store content
    if (vectorStore.documents && vectorStore.documents.length > 0) {
      console.log('First document sample:', vectorStore.documents[0]);
    }
    
    // Perform the search with a timeout
    console.log(`Executing similaritySearch with question: "${question}" and k=${MAX_CHUNKS}`);
    
    try {
      // First try the similarity search - get more chunks than we need so we can filter by relevance
      const searchPromise = vectorStore.similaritySearch(question, MAX_CHUNKS * 2);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Search timed out after 15 seconds')), 15000);
      });
      
      // Race the search against the timeout
      let results = await Promise.race([searchPromise, timeoutPromise]);
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      // Filter results by relevance if the vectorStore returns similarity scores
      if (results && results.length > 0 && results[0].score !== undefined) {
        // Sort by score (highest first)
        results.sort((a, b) => b.score - a.score);
        
        // Define minimum threshold for relevance (adjust as needed)
        const threshold = 0.6;
        
        // Only include chunks with scores above the threshold
        const relevantResults = results.filter(doc => doc.score > threshold);
        
        // Cap at MAX_CHUNKS, but only use relevant results
        results = relevantResults.slice(0, MAX_CHUNKS);
        console.log(`Using ${results.length} relevant chunks out of ${relevantResults.length} above threshold`);
      } else {
        // If no scores available, just take the top k results
        results = results.slice(0, k);
      }
      
      // Validate results
      if (!results || results.length === 0) {
        console.warn('No relevant content found for query:', question);
        
        // If no results from similarity search, try a fallback approach - return some documents directly
        console.log('Trying fallback: returning documents directly');
        if (vectorStore.documents && vectorStore.documents.length > 0) {
          // Get a strategic sample of documents when we need to fall back
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
          
          console.log(`Returning ${fallbackResults.length} documents as fallback`);
          return fallbackResults;
        }  
        
        return [];
      }
      
      console.log(`Search successful, found ${results.length} relevant chunks`);
      if (results.length > 0) {
        console.log('First result sample:', results[0].pageContent.substring(0, 100) + '... (truncated)');
      }
      
      return results;
    } catch (searchError) {
      console.error('Error during similarity search:', searchError);
      
      // Fallback: If search fails, return some documents directly
      if (vectorStore.documents && vectorStore.documents.length > 0) {
        console.log('Search failed, using fallback approach');
        
        // Get a strategic sample of documents when we need to fall back
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
        
        console.log(`Returning ${fallbackResults.length} documents as fallback`);
        return fallbackResults;
      }
      
      throw searchError;
    }
  } catch (error) {
    // Clear the timeout to prevent memory leaks
    clearTimeout(timeoutId);
    
    console.error('Error querying vector store:', error);
    
    // Provide more specific error messages
    if (error.name === 'AbortError' || error.message.includes('timed out')) {
      throw new Error('Search operation timed out. Please try a simpler question or check your connection.');
    } else if (error.message.includes('API key')) {
      throw new Error('OpenAI API key issue: Please check your API key in settings.');
    } else {
      throw new Error(`Failed to query vector store: ${error.message}`);
    }
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
    const documentId = `pdf_vector_store_${safeFileName}_${timestamp}`;
    
    console.log(`Preparing to save PDF vector store for ${fileName}...`);
    
    try {
      // Save the vector store data
      const vectorStoreData = await vectorStore.save();
      
      // Check the size of the data before saving to IndexedDB
      const serializedData = JSON.stringify(vectorStoreData);
      const dataSize = new Blob([serializedData]).size;
      const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(2);
      
      console.log(`PDF vector store size: ${dataSizeMB} MB`);
      
      // If the data is very large, optimize it
      let optimizedData = vectorStoreData;
      if (dataSize > 20 * 1024 * 1024) { // More than 20MB
        console.warn(`PDF vector store is large (${dataSizeMB} MB). Optimizing...`);
        
        // Optimize document structure
        if (vectorStoreData.documents) {
          optimizedData.documents = vectorStoreData.documents.map(doc => ({
            id: doc.id,
            pageContent: doc.pageContent,
            metadata: {
              source: doc.metadata?.source || 'pdf',
              page: doc.metadata?.page
            }
          }));
        }
        
        // Recalculate size after optimization
        const optimizedSize = new Blob([JSON.stringify(optimizedData)]).size;
        console.log(`Optimized PDF vector store size: ${(optimizedSize / (1024 * 1024)).toFixed(2)} MB`);
      }

      // Import the IndexedDB helper
      const { saveVectorStore: saveToIndexedDB, clearVectorStores } = await import('../utils/indexedDBHelper');
      
      // Clear old PDF vector stores to make room for the new one
      await clearVectorStores('pdf');
      
      // Save to IndexedDB
      await saveToIndexedDB('pdf', documentId, optimizedData, fileName);
      
      console.log(`Successfully saved PDF vector store with ID: ${documentId}`);
      return documentId;
    } catch (savingError) {
      console.error('Error serializing or saving PDF vector store:', savingError);
      
      // Try emergency fallback with minimal data
      console.warn('Attempting emergency optimization of PDF vector store...');
      
      // Create a minimal version with just essential data
      const minimalData = {
        documents: vectorStore.documents.map(doc => ({
          id: doc.id,
          pageContent: typeof doc.pageContent === 'string' && doc.pageContent.length > 1000 ?
            doc.pageContent.substring(0, 1000) + '...' : doc.pageContent,
          metadata: { source: 'pdf', page: doc.metadata?.page }
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
      
      // Clear all existing PDF vector stores
      await clearVectorStores('pdf');
      
      // Try to save the minimal data
      await saveToIndexedDB('pdf', documentId, minimalData, fileName);
      
      console.log(`Saved minimal PDF vector store with ID: ${documentId}`);
      return documentId;
    }
  } catch (error) {
    console.error('Error saving PDF vector store:', error);
    throw error;
  }
};

/**
 * Get available vector stores from IndexedDB
 * @returns {Promise<Array>} - List of available vector stores
 */
export const getAvailableVectorStores = async () => {
  try {
    // Use the indexedDBHelper to get all PDF vector stores from the index
    const { getVectorStoreIndex } = await import('../utils/indexedDBHelper');
    return await getVectorStoreIndex('pdf');
  } catch (error) {
    console.error('Error getting available vector stores:', error);
    return [];
  }
};

/**
 * Load a vector store from IndexedDB
 * @param {string} documentId - The document ID or key to load the vector store from
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
    const vectorStoreData = await loadFromIndexedDB('pdf', documentId);

    // Load the documents and embeddings into the vector store
    if (vectorStoreData.documents && vectorStoreData.embeddings_map) {
      vectorStore.documents = vectorStoreData.documents;
      vectorStore.embeddings_map = vectorStoreData.embeddings_map;

      return vectorStore;
    } else {
      throw new Error('Invalid vector store data format');
    }
  } catch (error) {
    console.error('Error loading PDF vector store:', error);
    throw error;
  }
};

/**
 * Search for any store that matches a partial string
 * This function is now handled by the IndexedDB helper
 * @param {string} partialMatch - Partial string to match against keys
 * @returns {Array<string>} - Matching keys
 * @deprecated Use IndexedDB helper functions instead
 */
const searchLocalStorageForPartialMatch = (partialMatch) => {
  console.warn('searchLocalStorageForPartialMatch is deprecated, use IndexedDB helper functions instead');
  return [];
};

/**
 * Find any vector store in IndexedDB
 * @param {string} openAIApiKey - The OpenAI API key
 * @returns {Promise<MemoryVectorStore>} - The loaded vector store
 */
export const findAnyVectorStore = async (openAIApiKey) => {
  try {
    // Get the available vector stores from IndexedDB
    const index = await getAvailableVectorStores();

    if (index.length > 0) {
      // Use the most recent one
      const documentId = index[0].id;
      return await loadVectorStore(documentId, openAIApiKey);
    }

    throw new Error('No vector stores found');
  } catch (error) {
    console.error('Error finding any vector store:', error);
    throw error;
  }
};
