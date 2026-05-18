import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

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
  
  // Save method for serialization
  async save() {
    // Return a serializable representation of the store
    return {
      documents: this.documents,
      embeddings_map: this.embeddings_map
    };
  }
  
  // Static method to load from documents
  static async fromDocuments(docs, embeddings) {
    const store = new MemoryVectorStore(embeddings);
    await store.addDocuments(docs);
    return store;
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
}

/**
 * Function to get the OpenAI client with the current API key
 * @returns {Promise<OpenAI>} - The OpenAI client
 */
const getOpenAIClient = async () => {
  // For API key, we'll still use localStorage as this is user preference, not file data
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

/**
 * Extract information from an image using OpenAI's Vision API
 * @param {File} file - The image file to analyze
 * @returns {Promise<string>} - The extracted information
 */
export const extractInfoFromImage = async (file) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('Starting image analysis for', file.name);
      
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          // Create initial text with basic information about the image
          let extractedInfo = `Image: ${file.name}\n\n`;
          
          // Get the image data URL from the FileReader for use in multiple blocks
          const img = reader.result;
          
          try {
            // Get the OpenAI client - use await since it's now async
            const openai = await getOpenAIClient();
            
            // Use the GPT-4o Vision API to analyze the image
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "system",
                  content: "You are an expert at analyzing images. Provide a detailed description of the image, including objects, people, text, scenes, colors, and any other relevant information. Be comprehensive but concise."
                },
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Describe this image in detail:" },
                    {
                      type: "image_url",
                      image_url: {
                        url: img,
                      },
                    },
                  ],
                },
              ],
              max_tokens: 500,
            });
            
            // Process the response
            const analysisText = response.choices[0].message.content;
            extractedInfo += `Analysis: ${analysisText}`;
            
            console.log('Image analysis successful');
            // Return both the image data URL and the extracted info
            resolve({ 
              extractedInfo,
              imageDataUrl: img // Include the image data URL for display in chat
            });
          } catch (visionError) {
            console.error('Error analyzing image with Vision API:', visionError);
            // Try to get some additional context from the file name
            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            extractedInfo += `This image appears to be about: ${fileNameWithoutExt.replace(/[_-]/g, " ")}\n\n`;
            extractedInfo += `File type: ${file.type}\n`;
            extractedInfo += `File size: ${(file.size / 1024).toFixed(2)} KB\n\n`;
            console.log('Using filename and metadata as context due to Vision API error');
            
            // Still include the image data URL even when Vision API fails
            resolve({
              extractedInfo,
              imageDataUrl: img
            });
          }
        } catch (imgError) {
          console.error('Error during image processing:', imgError);
          // Fall back to a simple text extraction for reliability
          const fallbackText = `Image: ${file.name}\n\nUnable to analyze image content. Using filename as context.\n\nThe image appears to be named: ${file.name}`;
          console.log('Using fallback text for image');
          
          // Even in this error case, try to include the image data if available
          if (reader && reader.result) {
            resolve({
              extractedInfo: fallbackText,
              imageDataUrl: reader.result
            });
          } else {
            // Last resort fallback without image data
            resolve({
              extractedInfo: fallbackText,
              imageDataUrl: null
            });
          }
        }
      };
      
      reader.onerror = (error) => {
        console.error('Error reading file:', error);
        reject(new Error('Failed to read image file'));
      };
      
      // Start reading the file as a data URL
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error('Error in image analysis:', error);
      reject(new Error('Failed to analyze image'));
    }
  });
};

/**
 * Create a vector store from extracted image information
 * @param {string} text - The text extracted from the image analysis
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
      throw new Error('Invalid or empty text extracted from image');
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
      throw new Error('No text chunks created from image analysis');
    }
    
    // Create documents from the text chunks
    const docs = textChunks.map(chunk => new Document({
      pageContent: chunk,
      metadata: {
        source: 'image-analysis',
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
  try {
    console.log(`Querying vector store with question: "${question}"`);
    
    // Make sure we have a valid vector store
    if (!vectorStore || !vectorStore.similaritySearch) {
      console.error('Invalid vector store provided');
      return [];
    }
    
    // Query the vector store for relevant document chunks
    const results = await vectorStore.similaritySearch(question, k);
    
    console.log(`Query returned ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Error querying vector store:', error);
    return [];
  }
};

/**
 * Create a vector store from extracted image information (alias for createVectorStore)
 * @param {string} text - The text extracted from the image analysis
 * @param {string} openAIApiKey - The OpenAI API key
 * @returns {Promise<MemoryVectorStore>} - The vector store
 */
export const createImageVectorStore = createVectorStore;

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
 * @param {string} imageDataUrl - The image data URL
 * @returns {Promise<string>} - The document ID under which the vector store was saved
 */
export const saveVectorStore = async (vectorStore, fileName, imageDataUrl) => {
  try {
    // Check if the vector store is valid
    if (!vectorStore || !vectorStore.documents || vectorStore.documents.length === 0) {
      throw new Error('Invalid vector store');
    }
    
    // Generate a key for the vector store
    const timestamp = Date.now();
    const safeFileName = fileName.replace(/\s+/g, '_').toLowerCase();
    const documentId = `image_vector_store_${safeFileName}_${timestamp}`;
    
    console.log(`Preparing to save image vector store for ${fileName}...`);
    
    try {
      // Save the vector store data (and ensure it can be serialized)
      const vectorStoreData = await vectorStore.save();
      
      // Add the image data URL to the serialized store if it exists
      if (imageDataUrl) {
        vectorStoreData.imageDataUrl = imageDataUrl;
      }
      
      // Check the size of the data before saving to IndexedDB
      const serializedData = JSON.stringify(vectorStoreData);
      const dataSize = new Blob([serializedData]).size;
      const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(2);
      
      console.log(`Image vector store size: ${dataSizeMB} MB`);
      
      // If the data is very large, reduce its size by simplifying the structure
      let optimizedData = vectorStoreData;
      if (dataSize > 50 * 1024 * 1024) { // More than 50MB
        console.warn(`Image vector store is very large (${dataSizeMB} MB). Optimizing...`);
        
        // Remove any unnecessary properties to reduce size
        if (vectorStoreData.documents) {
          // Simplify documents by keeping only essential fields
          optimizedData.documents = vectorStoreData.documents.map(doc => ({
            id: doc.id,
            pageContent: doc.pageContent,
            metadata: { source: doc.metadata?.source || 'image-analysis' }
          }));
        }
        
        // Recalculate the size after optimization
        const optimizedSize = new Blob([JSON.stringify(optimizedData)]).size;
        console.log(`Optimized vector store size: ${(optimizedSize / (1024 * 1024)).toFixed(2)} MB`);
      }
      
      // Import the IndexedDB helper
      const { saveVectorStore: saveToIndexedDB, clearVectorStores } = await import('../utils/indexedDBHelper');
      
      // Clear any old image vector stores before saving to prevent quota issues
      await clearVectorStores('image');
      
      // Save to IndexedDB
      await saveToIndexedDB('image', documentId, optimizedData, fileName);
      
      console.log(`Successfully saved image vector store with ID: ${documentId}`);
      return documentId;
    } catch (serializationError) {
      console.error('Error serializing or saving vector store:', serializationError);
      
      // Try a more aggressive optimization as a fallback
      console.warn('Attempting emergency optimization of vector store data...');
      
      // Create a minimal version with just the essential data
      const minimalData = {
        documents: vectorStore.documents.map(doc => ({
          id: doc.id,
          pageContent: typeof doc.pageContent === 'string' && doc.pageContent.length > 1000 ?
            doc.pageContent.substring(0, 1000) + '...' : doc.pageContent,
          metadata: { source: 'image-analysis' }
        })).slice(0, 10), // Limit to first 10 documents
        embeddings_map: {}
      };
      
      // Add just a few essential embeddings
      const docIds = minimalData.documents.map(d => d.id);
      docIds.forEach(id => {
        if (vectorStore.embeddings_map[id]) {
          minimalData.embeddings_map[id] = vectorStore.embeddings_map[id];
        }
      });
      
      // Import the IndexedDB helper
      const { saveVectorStore: saveToIndexedDB, clearVectorStores } = await import('../utils/indexedDBHelper');
      
      // Clear all existing image vector stores
      await clearVectorStores('image');
      
      // Try to save the minimal data
      await saveToIndexedDB('image', documentId, minimalData, fileName);
      
      console.log(`Saved minimal image vector store with ID: ${documentId}`);
      return documentId;
    }
  } catch (error) {
    console.error('Error saving Image vector store:', error);
    throw error;
  }
};

/**
 * Get available vector stores from IndexedDB
 * @returns {Promise<Array>} - List of available vector stores
 */
export const getAvailableVectorStores = async () => {
  try {
    // Use the indexedDBHelper to get all Image vector stores from the index
    const { getVectorStoreIndex } = await import('../utils/indexedDBHelper');
    return await getVectorStoreIndex('image');
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
    const vectorStoreData = await loadFromIndexedDB('image', documentId);
    
    // Load the documents and embeddings into the vector store
    if (vectorStoreData.documents && vectorStoreData.embeddings_map) {
      vectorStore.documents = vectorStoreData.documents;
      vectorStore.embeddings_map = vectorStoreData.embeddings_map;
      
      // Store the image data URL in the vector store if it exists
      if (vectorStoreData.imageDataUrl) {
        vectorStore.imageDataUrl = vectorStoreData.imageDataUrl;
      }
      
      return vectorStore;
    } else {
      throw new Error('Invalid vector store data format');
    }
  } catch (error) {
    console.error('Error loading Image vector store:', error);
    throw error;
  }
};
