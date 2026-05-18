/**
 * Utility functions for working with vector stores in chat context
 */

import { queryVectorStore as queryPdfVectorStore, loadVectorStore as loadPdfVectorStore } from '../services/pdfService';
import { queryVectorStore as queryWordVectorStore, loadVectorStore as loadWordVectorStore } from '../services/wordService';
import { queryVectorStore as queryExcelVectorStore, loadVectorStore as loadExcelVectorStore } from '../services/excelService';
import { queryVectorStore as queryImageVectorStore, loadVectorStore as loadImageVectorStore } from '../services/imageService';

/**
 * Get relevant chunks from vector stores for the given query
 * @param {Array} contextFiles - Array of file objects from the conversation context
 * @param {string} query - The user's query to search for relevant information
 * @param {Object} options - Additional options
 * @param {Object} options.vectorStores - Optional object containing pre-loaded vector stores
 * @param {number} options.maxChunksPerFile - Maximum number of chunks to return per file
 * @returns {Promise<string>} - System prompt with relevant context information
 */
export const getRelevantContextFromVectorStores = async (
  contextFiles, 
  query, 
  options = {}
) => {
  if (!contextFiles || contextFiles.length === 0) {
    console.log('No context files provided');
    return null;
  }

  const { 
    vectorStores = {}, 
    maxChunksPerFile = 3 
  } = options;

  let contextPrompt = 'Using the following files as context:\n\n';
  let hasAddedContext = false;
  
  // Get API key from localStorage
  const apiKey = localStorage.getItem('openai_api_key');
  if (!apiKey) {
    console.error('OpenAI API key is not set');
    return null;
  }

  // Process each context file
  for (const file of contextFiles) {
    try {
      console.log(`Processing context file for query: ${file.name}`);
      
      let relevantChunks = [];
      let vectorStore = null;
      
      // Determine file type from extension
      const fileType = file.name.toLowerCase().split('.').pop();
      
      // Check if we already have the vector store loaded
      if (fileType === 'pdf' && vectorStores.pdf) {
        console.log('Using provided PDF vector store');
        vectorStore = vectorStores.pdf;
      } else if (['docx', 'doc'].includes(fileType) && vectorStores.word) {
        console.log('Using provided Word vector store');
        vectorStore = vectorStores.word;
      } else if (['xlsx', 'xls', 'csv'].includes(fileType) && vectorStores.excel) {
        console.log('Using provided Excel vector store');
        vectorStore = vectorStores.excel;
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType) && vectorStores.image) {
        console.log('Using provided Image vector store');
        vectorStore = vectorStores.image;
      } else {
        // Try to load the vector store from localStorage
        try {
          if (fileType === 'pdf') {
            // Attempt to load the PDF vector store
            vectorStore = await loadPdfVectorStore(null, apiKey);
            console.log('Loaded PDF vector store from localStorage');
          } else if (['docx', 'doc'].includes(fileType)) {
            vectorStore = await loadWordVectorStore(null, apiKey);
            console.log('Loaded Word vector store from localStorage');
          } else if (['xlsx', 'xls', 'csv'].includes(fileType)) {
            vectorStore = await loadExcelVectorStore(null, apiKey);
            console.log('Loaded Excel vector store from localStorage');
          } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
            vectorStore = await loadImageVectorStore(null, apiKey);
            console.log('Loaded Image vector store from localStorage');
          }
        } catch (loadError) {
          console.error(`Error loading vector store for ${file.name}:`, loadError);
        }
      }
      
      // Query the vector store if available
      if (vectorStore) {
        console.log(`Querying vector store for file ${file.name}...`);
        
        // Ensure the embeddings have the API key
        if (vectorStore.embeddings) {
          vectorStore.embeddings.openAIApiKey = apiKey;
        }
        
        // Use the appropriate query function based on file type
        if (fileType === 'pdf') {
          relevantChunks = await queryPdfVectorStore(vectorStore, query, maxChunksPerFile);
        } else if (['docx', 'doc'].includes(fileType)) {
          relevantChunks = await queryWordVectorStore(vectorStore, query, maxChunksPerFile);
        } else if (['xlsx', 'xls', 'csv'].includes(fileType)) {
          relevantChunks = await queryExcelVectorStore(vectorStore, query, maxChunksPerFile);
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
          relevantChunks = await queryImageVectorStore(vectorStore, query, maxChunksPerFile);
        }
        
        console.log(`Retrieved ${relevantChunks?.length || 0} chunks for ${file.name}`);
      }
      
      // Add relevant chunks to the context prompt
      if (relevantChunks && relevantChunks.length > 0) {
        contextPrompt += `File: ${file.name}\nRelevant content:\n`;
        
        // Add each relevant chunk to the context
        for (let index = 0; index < relevantChunks.length; index++) {
          const chunk = relevantChunks[index];
          // Handle different chunk formats from different vector stores
          const chunkContent = chunk.pageContent || chunk.content || chunk;
          contextPrompt += `--- Chunk ${index + 1} ---
${chunkContent}\n\n`;
        }
        
        hasAddedContext = true;
      } else if (file.content) {
        // Fallback: If no relevant chunks found, use a limited portion of the file content
        console.log(`No relevant chunks found for ${file.name}, using limited file content as fallback`);
        const truncatedContent = file.content.length > 3000 ? 
          file.content.substring(0, 3000) + '... (content truncated)' : 
          file.content;
        
        contextPrompt += `File: ${file.name}\nContent: ${truncatedContent}\n\n`;
        hasAddedContext = true;
      }
    } catch (error) {
      console.error(`Error processing vector store for ${file.name}:`, error);
      
      // Fallback: If vector store query fails, use a limited portion of the file content
      if (file.content) {
        const truncatedContent = file.content.length > 3000 ? 
          file.content.substring(0, 3000) + '... (content truncated)' : 
          file.content;
        
        contextPrompt += `File: ${file.name}\nContent: ${truncatedContent}\n\n`;
        hasAddedContext = true;
      }
    }
  }
  
  // Complete the context prompt if context was added
  if (hasAddedContext) {
    contextPrompt += 'Now, responding to the user query:\n\n';
    return contextPrompt;
  }
  
  return null;
};
