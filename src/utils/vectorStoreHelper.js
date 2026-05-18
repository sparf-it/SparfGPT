/**
 * Helper functions for working with vector stores in the SparfGPT application
 */

import { queryVectorStore as queryPdfVectorStore, loadVectorStore as loadPdfVectorStore } from '../services/pdfService';
import { queryVectorStore as queryWordVectorStore, loadVectorStore as loadWordVectorStore } from '../services/wordService';
import { queryVectorStore as queryExcelVectorStore, loadVectorStore as loadExcelVectorStore } from '../services/excelService';
import { queryVectorStore as queryImageVectorStore, loadVectorStore as loadImageVectorStore } from '../services/imageService';

/**
 * Intercept and modify messages array to include relevant content from vector stores
 * @param {Array} messages - Array of message objects to be sent to the API
 * @param {string} userQuery - The user's query
 * @param {Array} contextFiles - Array of file objects from conversation context
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} - Modified messages array with relevant context
 */
export const enhanceMessagesWithVectorStoreContent = async (messages, userQuery, contextFiles, options = {}) => {
  if (!contextFiles || contextFiles.length === 0 || !messages || messages.length === 0) {
    console.log('No context files or messages to enhance');
    return messages;
  }

  const {
    vectorStores = {},
    maxChunksPerFile = 3,
    defaultSystemPrompt = '',
    includeFileMetadata = true,
    persistContext = true,
    debugMode = false
  } = options;

  try {
    let contextPrompt = 'Using the following files as context:\n\n';
    let hasAddedContext = false;
    
    // Get API key from localStorage - this is fine to keep in localStorage as it's a user preference
    const apiKey = localStorage.getItem('openai_api_key');
    if (!apiKey) {
      console.error('OpenAI API key is not set');
      return messages;
    }
    
    // Import the getVectorStoreIndex function to check available vector stores
    const { getVectorStoreIndex } = await import('./indexedDBHelper');

    if (debugMode) {
      console.log('Enhancing messages with vector store content');
      console.log('User query:', userQuery);
      console.log('Context files:', contextFiles.map(f => f.name));
    }

    // Check if any user message has document context
    let documentContext = null;
    if (messages && messages.length > 0) {
      // Look for the last user message with document context
      const userMessagesWithContext = messages.filter(m => m.role === 'user' && m.documentContext);
      if (userMessagesWithContext.length > 0) {
        documentContext = userMessagesWithContext[userMessagesWithContext.length - 1].documentContext;
        console.log('Found document context in user message:', documentContext);
      }
    }

    // Get available vector stores from IndexedDB
    console.log('Checking available vector stores in IndexedDB...');
    let availablePdfStores = [];
    let availableWordStores = [];
    let availableExcelStores = [];
    let availableImageStores = [];
    
    try {
      // Get the index of available vector stores from IndexedDB
      availablePdfStores = await getVectorStoreIndex('pdf');
      availableWordStores = await getVectorStoreIndex('word');
      availableExcelStores = await getVectorStoreIndex('excel');
      availableImageStores = await getVectorStoreIndex('image');
      
      console.log('Available vector stores:', {
        pdf: availablePdfStores.length,
        word: availableWordStores.length,
        excel: availableExcelStores.length,
        image: availableImageStores.length
      });
    } catch (indexError) {
      console.error('Error getting vector store index:', indexError);
    }
    
    // Process each context file
    for (const file of contextFiles) {
      try {
        console.log(`Processing context file for query: ${file.name}`);
        
        let relevantChunks = [];
        let vectorStore = null;
        
        // Check if this file matches the document context
        const matchesDocumentContext = documentContext && 
          documentContext.fileName === file.name && 
          documentContext.type === file.type;

        // Determine file type from extension or from document context
        let fileType;
        if (matchesDocumentContext) {
          fileType = documentContext.type === 'pdf' ? 'pdf' :
                    documentContext.type === 'word' ? 'docx' :
                    documentContext.type === 'excel' ? 'xlsx' :
                    documentContext.type === 'image' ? 'jpg' : file.name?.toLowerCase().split('.').pop();
          console.log(`Using document type from context: ${documentContext.type} (${fileType})`);
        } else {
          fileType = file.name?.toLowerCase().split('.').pop();
          console.log(`Using file extension to determine type: ${fileType}`);
        }
        
        // Priority 1: Try to use the document context's vectorStoreId if available and matching this file
        if (matchesDocumentContext && documentContext.vectorStoreId) {
          console.log(`Using vector store ID from document context: ${documentContext.vectorStoreId}`);
          let loadFunction;
          
          switch (documentContext.type) {
            case 'pdf':
              loadFunction = loadPdfVectorStore;
              // If PDF vector store is already in memory, use it
              if (vectorStores.pdf) {
                console.log('Using provided PDF vector store from context');
                vectorStore = vectorStores.pdf;
              }
              break;
            case 'word':
              loadFunction = loadWordVectorStore;
              // If Word vector store is already in memory, use it
              if (vectorStores.word) {
                console.log('Using provided Word vector store from context');
                vectorStore = vectorStores.word;
              }
              break;
            case 'excel':
              loadFunction = loadExcelVectorStore;
              // If Excel vector store is already in memory, use it
              if (vectorStores.excel) {
                console.log('Using provided Excel vector store from context');
                vectorStore = vectorStores.excel;
              }
              break;
            case 'image':
              loadFunction = loadImageVectorStore;
              // If Image vector store is already in memory, use it
              if (vectorStores.image) {
                console.log('Using provided Image vector store from context');
                vectorStore = vectorStores.image;
              }
              break;
            default:
              console.log('Unknown document type from context: ' + documentContext.type);
              break;
          }
          
          // If we don't already have the vector store, try to load it
          if (!vectorStore && loadFunction) {
            try {
              vectorStore = await loadFunction(documentContext.vectorStoreId, apiKey);
              console.log(`Successfully loaded ${documentContext.type} vector store with ID: ${documentContext.vectorStoreId}`);
            } catch (err) {
              console.warn(`Failed to load vector store with ID from document context: ${err.message}`);
            }
          }
        }
        
        // Priority 2: Check if we already have the right type of vector store loaded in memory
        if (!vectorStore) {
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
          }
        }
        
        // Priority 3: Try to load the vector store from IndexedDB
        if (!vectorStore) {
          try {
            // Check if we have any stores of this type available
            if (fileType === 'pdf' && availablePdfStores.length > 0) {
              // Use the most recent PDF store
              const mostRecentStore = availablePdfStores[0]; // They're already sorted by timestamp
              console.log(`Loading most recent PDF store: ${mostRecentStore.fileName} (${mostRecentStore.id})`);
              vectorStore = await loadPdfVectorStore(mostRecentStore.id, apiKey);
              console.log('Successfully loaded PDF vector store from IndexedDB');
            } else if (['docx', 'doc'].includes(fileType) && availableWordStores.length > 0) {
              // Use the most recent Word store
              const mostRecentStore = availableWordStores[0];
              console.log(`Loading most recent Word store: ${mostRecentStore.fileName} (${mostRecentStore.id})`);
              vectorStore = await loadWordVectorStore(mostRecentStore.id, apiKey);
              console.log('Successfully loaded Word vector store from IndexedDB');
            } else if (['xlsx', 'xls', 'csv'].includes(fileType) && availableExcelStores.length > 0) {
              // Use the most recent Excel store
              const mostRecentStore = availableExcelStores[0];
              console.log(`Loading most recent Excel store: ${mostRecentStore.fileName} (${mostRecentStore.id})`);
              vectorStore = await loadExcelVectorStore(mostRecentStore.id, apiKey);
              console.log('Successfully loaded Excel vector store from IndexedDB');
            } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType) && availableImageStores.length > 0) {
              // Use the most recent Image store
              const mostRecentStore = availableImageStores[0];
              console.log(`Loading most recent Image store: ${mostRecentStore.fileName} (${mostRecentStore.id})`);
              vectorStore = await loadImageVectorStore(mostRecentStore.id, apiKey);
              console.log('Successfully loaded Image vector store from IndexedDB');
            } else {
              console.log(`No ${fileType} vector stores available in IndexedDB`);
            }
          } catch (loadError) {
            console.error(`Error loading vector store for ${file.name}:`, loadError);
          }
        }
        
        // Query the vector store if available
        if (vectorStore) {
          console.log(`Querying vector store for file ${file.name}...`);
          console.log('Vector store documents:', vectorStore.documents?.length || 0);
          
          // Ensure the embeddings have the API key
          if (vectorStore.embeddings) {
            vectorStore.embeddings.openAIApiKey = apiKey;
          }
          
          try {
            // Use the appropriate query function based on file type
            if (fileType === 'pdf') {
              console.log('Using PDF vector store query function');
              relevantChunks = await queryPdfVectorStore(vectorStore, userQuery, maxChunksPerFile);
            } else if (['docx', 'doc'].includes(fileType)) {
              console.log('Using Word vector store query function');
              relevantChunks = await queryWordVectorStore(vectorStore, userQuery, maxChunksPerFile);
            } else if (['xlsx', 'xls', 'csv'].includes(fileType)) {
              console.log('Using Excel vector store query function');
              relevantChunks = await queryExcelVectorStore(vectorStore, userQuery, maxChunksPerFile);
            } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
              console.log('Using Image vector store query function');
              relevantChunks = await queryImageVectorStore(vectorStore, userQuery, maxChunksPerFile);
            }
            
            console.log(`Retrieved ${relevantChunks?.length || 0} chunks for ${file.name}`);
            
            // If we got no chunks back and we have documents, try to get at least something
            if ((!relevantChunks || relevantChunks.length === 0) && vectorStore.documents && vectorStore.documents.length > 0) {
              console.log('No chunks found from search, falling back to first few documents');
              // Take the first 2 documents as a fallback
              relevantChunks = vectorStore.documents.slice(0, 2);
              console.log('Added fallback chunks:', relevantChunks.length);
            }
          } catch (queryError) {
            console.error('Error querying vector store:', queryError);
            // Fallback: If query fails but we have documents, use the first few
            if (vectorStore.documents && vectorStore.documents.length > 0) {
              console.log('Using fallback documents due to query error');
              relevantChunks = vectorStore.documents.slice(0, 2);
            }
          }
        }
                // Add relevant chunks to the context prompt with improved handling for document types
        if (relevantChunks && relevantChunks.length > 0) {
          // Determine document type for better context inclusion
          let docTypeLabel = '';
          if (file.type === 'pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            docTypeLabel = 'PDF Document';
          } else if (file.type === 'word' || ['docx', 'doc'].includes(fileType)) {
            docTypeLabel = 'Word Document';
          } else if (file.type === 'excel' || ['xlsx', 'xls', 'csv'].includes(fileType)) {
            docTypeLabel = 'Excel Document';
          } else {
            docTypeLabel = 'Document';
          }
          
          // Add explicit document type and format to help the model understand the context
          contextPrompt += `File: ${file.name} (${docTypeLabel})\nRelevant content:\n`;
          
          // For documents (non-images), forcibly include more content to ensure proper context
          if (file.type === 'pdf' || file.type === 'word' || file.type === 'excel' || 
              ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv'].includes(fileType)) {
            console.log(`Adding document content from ${relevantChunks.length} chunks for ${file.name}`);
            
            // Include COMPLETE content of top chunks instead of truncating
            // eslint-disable-next-line no-loop-func
            relevantChunks.forEach((chunk, index) => {
              const chunkContent = chunk.pageContent || chunk.content || chunk;
              if (chunkContent) {
                contextPrompt += `--- Document Section ${index + 1} ---\n${chunkContent}\n\n`;
              }
            });
            
            // For PDF documents specifically, ensure we have plenty of content
            if ((file.type === 'pdf' || file.name.toLowerCase().endsWith('.pdf')) && 
                vectorStore && vectorStore.documents) {
              
              // For PDFs, include at least 10 chunks or 30% of available chunks, whichever is greater
              const pdfMinChunks = Math.max(10, Math.floor(vectorStore.documents.length * 0.3));
              const chunksToAdd = Math.min(pdfMinChunks, vectorStore.documents.length) - relevantChunks.length;
              
              if (chunksToAdd > 0) {
                console.log(`PDF special handling: Adding ${chunksToAdd} additional chunks from PDF`);
                // Get chunks we haven't already included
                const existingChunkIds = new Set(relevantChunks.map(c => c.id || ''));
                const additionalChunks = vectorStore.documents
                  .filter(doc => !existingChunkIds.has(doc.id || ''))
                  .slice(0, chunksToAdd);
                
                // eslint-disable-next-line no-loop-func
                additionalChunks.forEach((chunk, idx) => {
                  if (chunk && chunk.pageContent) {
                    contextPrompt += `--- PDF Content Section ${idx + 1} ---\n${chunk.pageContent}\n\n`;
                  }
                });
              }
            }
            // For other documents, add more chunks if available - up to 5 total
            else if (vectorStore && vectorStore.documents && vectorStore.documents.length > relevantChunks.length) {
              const additionalChunks = Math.min(5 - relevantChunks.length, vectorStore.documents.length - relevantChunks.length);
              if (additionalChunks > 0) {
                console.log(`Adding ${additionalChunks} additional chunks to ensure document context`);
                for (let i = 0; i < additionalChunks; i++) {
                  const extraChunk = vectorStore.documents[i];
                  if (extraChunk && extraChunk.pageContent) {
                    contextPrompt += `--- Additional Document Content ${i + 1} ---\n${extraChunk.pageContent}\n\n`;
                  }
                }
              }
            }
          } else {
            // For other file types, use the original approach
            // eslint-disable-next-line no-loop-func
            relevantChunks.forEach((chunk, index) => {
              const chunkContent = chunk.pageContent || chunk.content || chunk;
              contextPrompt += `--- Chunk ${index + 1} ---\n${chunkContent}\n\n`;
            });
          }
          
          hasAddedContext = true;
          console.log(`Successfully added content from ${file.name} to prompt`);
        } else if (file.content) {
          // Improved fallback: If no relevant chunks found, use more file content for documents
          console.log(`No relevant chunks found for ${file.name}, using file content as fallback`);
          
          // For document types, include more content
          if (file.type === 'pdf' || file.type === 'word' || file.type === 'excel' || 
              ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv'].includes(fileType)) {
            // Include up to 8000 characters for documents to ensure sufficient context
            const docContent = file.content.length > 8000 ? 
              file.content.substring(0, 8000) + '... (content truncated)' : 
              file.content;
            
            contextPrompt += `File: ${file.name} (Document)\nContent:\n${docContent}\n\n`;
            console.log(`Added extended fallback content (${docContent.length} chars) for document ${file.name}`);
          } else {
            // For other file types, use the original approach
            const truncatedContent = file.content.length > 3000 ? 
              file.content.substring(0, 3000) + '... (content truncated)' : 
              file.content;
            
            contextPrompt += `File: ${file.name}\nContent: ${truncatedContent}\n\n`;
          }
          
          hasAddedContext = true;
        }
        
        // Additional logging to verify content inclusion
        if (hasAddedContext) {
          console.log(`Content from ${file.name} added to prompt, first 100 chars: ${contextPrompt.slice(-300, -200)}...`);
        } else {
          console.warn(`Failed to add any content from ${file.name} to prompt`);
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
      
      // Find if there's already a system message
      const systemMessageIndex = messages.findIndex(msg => msg.role === 'system');
      
      if (systemMessageIndex !== -1) {
        // Get existing system message content
        const existingContent = messages[systemMessageIndex].content;
        
        // Check if the system message already has document context
        if (persistContext && existingContent.includes('Using the following files as context:')) {
          // Extract the original part of the system message before document context
          const originalPart = existingContent.split('Using the following files as context:')[0].trim();
          // Update with fresh context
          messages[systemMessageIndex].content = `${originalPart}\n\n${contextPrompt}`;
          
          if (debugMode) {
            console.log('Updated existing system message with fresh document context');
          }
        } else {
          // Add context to existing system message
          messages[systemMessageIndex].content = `${existingContent}\n\n${contextPrompt}`;
          
          if (debugMode) {
            console.log('Added document context to existing system message');
          }
        }
      } else {
        // Create a new system message with context if none exists
        const systemPrompt = defaultSystemPrompt || 'You are a helpful assistant.';
        messages.unshift({
          role: 'system',
          content: `${systemPrompt}\n\n${contextPrompt}`
        });
        
        if (debugMode) {
          console.log('Added new system message with context');
        }
      }
    } else if (defaultSystemPrompt && !messages.some(msg => msg.role === 'system')) {
      // Add default system prompt if no context was added and no system message exists
      messages.unshift({
        role: 'system',
        content: defaultSystemPrompt
      });
      
      if (debugMode) {
        console.log('No relevant context found, added default system prompt');
      }
    }
    
    return messages;
  } catch (error) {
    console.error('Error enhancing messages with vector store content:', error);
    return messages; // Return original messages if enhancement fails
  }
};
