import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { formatFileSize } from '../utils/fileUtils';
import './FileUploader.css';
import { FiUpload, FiFile, FiX, FiFileText, FiTable, FiImage } from 'react-icons/fi';
import { extractTextFromPDF, createVectorStore as createPdfVectorStore } from '../services/pdfService';
import { extractTextFromWord, createVectorStore as createWordVectorStore } from '../services/wordService';
import { extractTextFromExcel, createVectorStore as createExcelVectorStore } from '../services/excelService';
import { extractInfoFromImage, createVectorStore as createImageVectorStore } from '../services/imageService';

const FileUploader = ({ onUpload, onClose, currentFiles, onRemoveFile, onPDFSelect, onWordSelect, onExcelSelect, onImageSelect, initialFiles = [] }) => {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingFile, setProcessingFile] = useState(null);
  
  // Define maximum file size limit as a constant (5MB)
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
  
  const processDocumentFiles = useCallback(async (documentFiles) => {
    if (documentFiles.length === 0) return;
    
    setProcessing(true);
    setProcessingProgress(0);
    
    // Get API key from localStorage
    const apiKey = localStorage.getItem('openai_api_key');
    if (!apiKey) {
      setError('OpenAI API key is not set. Please add your API key in the settings.');
      setProcessing(false);
      return;
    }
    
    // Clear all existing vector stores before processing new files
    const clearExistingVectorStores = async () => {
      console.log('Clearing existing vector stores before adding new file');
      
      try {
        // Import the IndexedDB helper
        const { clearAllVectorStores } = await import('../utils/indexedDBHelper');
        
        // Clear all vector stores in IndexedDB
        await clearAllVectorStores();
        console.log('Successfully cleared all vector stores from IndexedDB');
      } catch (error) {
        console.error('Error clearing vector stores from IndexedDB:', error);
      }
    };
    
    // Clear existing vector stores before adding new file
    await clearExistingVectorStores();
    
    // Only process the first document file (enforce single file limit)
    const file = documentFiles[0];
    setProcessingFile(file.name);
    
    try {
      const fileType = file.type.toLowerCase();
      const fileName = file.name.toLowerCase();
      
      // Determine file type
      if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
        // Process PDF with error handling
        setProcessingProgress(10);
        try {
          const extractedText = await extractTextFromPDF(file);
          if (!extractedText || extractedText.trim() === '') {
            throw new Error('No text could be extracted from this PDF');
          }
          
          setProcessingProgress(40);
          // Add a short delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const vectorStore = await createPdfVectorStore(extractedText, apiKey);
          if (!vectorStore || !vectorStore.documents || vectorStore.documents.length === 0) {
            throw new Error('Failed to create vector store from PDF');
          }
          
          setProcessingProgress(70);
          // Add a short delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Generate a document ID with standard format
          const timestamp = Date.now();
          const safeFileName = file.name.replace(/\s+/g, '_').toLowerCase();
          const documentId = `pdf_vector_store_${safeFileName}_${timestamp}`;
          
          // Use the PDF service to save to IndexedDB
          const { saveVectorStore } = await import('../services/pdfService');
          const savedId = await saveVectorStore(vectorStore, file.name);
          
          // The index is automatically maintained by IndexedDB helper
          
          setProcessingProgress(100);
          if (onPDFSelect) onPDFSelect(savedId, file.name);
        } catch (pdfError) {
          console.error('PDF processing error:', pdfError);
          setError(`Error processing PDF ${file.name}: ${pdfError.message}`);
        }
      } 
      else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
        // Process Word document with error handling
        setProcessingProgress(10);
        try {
          const extractedResult = await extractTextFromWord(file);
          
          // Handle both string (legacy) and object (new format) returns
          let extractedText;
          if (typeof extractedResult === 'string') {
            extractedText = extractedResult;
          } else if (typeof extractedResult === 'object' && extractedResult !== null) {
            extractedText = extractedResult.text;
          } else {
            throw new Error('Invalid format returned from Word document extraction');
          }
          
          if (!extractedText || extractedText.trim() === '') {
            throw new Error('No text could be extracted from this Word document');
          }
          
          setProcessingProgress(40);
          // Add a short delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Pass either the string or the full object with metadata to createVectorStore
          const vectorStore = await createWordVectorStore(extractedResult, apiKey);
          if (!vectorStore || !vectorStore.documents || vectorStore.documents.length === 0) {
            throw new Error('Failed to create vector store from Word document');
          }
          
          setProcessingProgress(70);
          // Add a short delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Generate a document ID with standard format
          const timestamp = Date.now();
          const safeFileName = file.name.replace(/\s+/g, '_').toLowerCase();
          const documentId = `word_vector_store_${safeFileName}_${timestamp}`;
          
          // Use the Word service to save to IndexedDB
          const { saveVectorStore } = await import('../services/wordService');
          const savedId = await saveVectorStore(vectorStore, file.name);
          
          // The index is automatically maintained by IndexedDB helper
          
          setProcessingProgress(100);
          if (onWordSelect) onWordSelect(savedId, file.name);
        } catch (wordError) {
          console.error('Word processing error:', wordError);
          setError(`Error processing Word document ${file.name}: ${wordError.message}`);
        }
      } 
      else if (fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileName.endsWith('.xlsx')) {
        // Process Excel sheet with error handling
        setProcessingProgress(10);
        try {
          const extractedText = await extractTextFromExcel(file);
          if (!extractedText || extractedText.trim() === '') {
            throw new Error('No text could be extracted from this Excel file');
          }
          
          setProcessingProgress(40);
          // Add a short delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const vectorStore = await createExcelVectorStore(extractedText, apiKey);
          if (!vectorStore || !vectorStore.documents || vectorStore.documents.length === 0) {
            throw new Error('Failed to create vector store from Excel file');
          }
          
          setProcessingProgress(70);
          // Add a short delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Generate a document ID with standard format
          const timestamp = Date.now();
          const safeFileName = file.name.replace(/\s+/g, '_').toLowerCase();
          const documentId = `excel_vector_store_${safeFileName}_${timestamp}`;
          
          // Use the Excel service to save to IndexedDB
          const { saveVectorStore } = await import('../services/excelService');
          const savedId = await saveVectorStore(vectorStore, file.name);
          
          // The index is automatically maintained by IndexedDB helper
          
          setProcessingProgress(100);
          if (onExcelSelect) onExcelSelect(savedId, file.name);
        } catch (excelError) {
          console.error('Excel processing error:', excelError);
          setError(`Error processing Excel file ${file.name}: ${excelError.message}`);
        }
      } 
      else if (fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
        // Process image with error handling
        setProcessingProgress(10);
        try {
          // Extract information from the image using OpenAI's Vision API
          const extractedData = await extractInfoFromImage(file);
          // The extractInfoFromImage function now returns an object with extractedInfo and imageDataUrl
          if (!extractedData || !extractedData.extractedInfo) {
            throw new Error('No information could be extracted from this image');
          }
          
          // Get the imageDataUrl and extractedInfo from the result
          const { extractedInfo, imageDataUrl } = extractedData;
          
          setProcessingProgress(40);
          // Add a short delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Create vector store from the extracted image information
          const vectorStore = await createImageVectorStore(extractedInfo, apiKey);
          if (!vectorStore || !vectorStore.documents || vectorStore.documents.length === 0) {
            throw new Error('Failed to create vector store from image');
          }
          
          setProcessingProgress(70);
          // Add a short delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Generate a document ID with standard format
          const timestamp = Date.now();
          const safeFileName = file.name.replace(/\s+/g, '_').toLowerCase();
          const documentId = `image_vector_store_${safeFileName}_${timestamp}`;
          
          // Add the image data URL to the vector store for retrieval later
          vectorStore.imageDataUrl = imageDataUrl;
          
          // Use the Image service to save to IndexedDB
          const { saveVectorStore } = await import('../services/imageService');
          const savedId = await saveVectorStore(vectorStore, file.name, imageDataUrl);
          
          // The index is automatically maintained by IndexedDB helper
          
          setProcessingProgress(100);
          // Pass the image data URL to the onImageSelect callback
          if (onImageSelect) onImageSelect(savedId, file.name, imageDataUrl);
        } catch (imageError) {
          console.error('Image processing error:', imageError);
          setError(`Error processing image ${file.name}: ${imageError.message}`);
        }
      }
    } catch (err) {
      console.error('Error processing document file:', err);
      setError(`Error processing ${file.name}: ${err.message}`);
    }
    
    setProcessing(false);
    setProcessingFile(null);
    setProcessingProgress(0);
    
    // Auto-close the upload popup when processing is complete
    if (onClose) {
      // Add a small delay to ensure the user sees the progress completion
      setTimeout(() => {
        onClose();
      }, 500);
    }
  }, [onClose, onPDFSelect, onWordSelect, onExcelSelect, onImageSelect]);
  
  const onDrop = useCallback((acceptedFiles) => {
    setError(null);
    
    // Check file size (limit to 5MB per file)
    const oversizedFiles = acceptedFiles.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      // Create a more user-friendly error message with formatted file sizes
      const fileDetails = oversizedFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ');
      setError(`File size limit exceeded: Files must be under 5MB.\n\nOversized files: ${fileDetails}`);
      return;
    }
    
    // Auto-process document files (PDF, Word, Excel, images)
    const documentFiles = acceptedFiles.filter(file => {
      const fileType = file.type.toLowerCase();
      const fileName = file.name.toLowerCase();
      return (
        fileType === 'application/pdf' || fileName.endsWith('.pdf') ||
        fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx') ||
        fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileName.endsWith('.xlsx') ||
        fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
      );
    });
    
    // Other files are treated as regular context files
    const contextFiles = acceptedFiles.filter(file => !documentFiles.includes(file));
    
    // Process document files
    if (documentFiles.length > 0) {
      processDocumentFiles(documentFiles);
    }
    
    // Set remaining context files
    setFiles(contextFiles);
  }, [MAX_FILE_SIZE, processDocumentFiles]);
  
  // Effect to automatically process initialFiles when they're provided
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      // Check for files exceeding the size limit first
      const oversizedFiles = initialFiles.filter(file => file.size > MAX_FILE_SIZE);
      if (oversizedFiles.length > 0) {
        // Show error for oversized files
        const fileDetails = oversizedFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ');
        setError(`File size limit exceeded: Files must be under 5MB.\n\nOversized files: ${fileDetails}`);
        return;
      }
      
      // Process any document files that were dropped on the message input
      const documentFiles = initialFiles.filter(file => {
        const fileType = file.type.toLowerCase();
        const fileName = file.name.toLowerCase();
        return (
          fileType === 'application/pdf' || fileName.endsWith('.pdf') ||
          fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx') ||
          fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileName.endsWith('.xlsx') ||
          fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
        );
      });
      
      // Process document files if any
      if (documentFiles.length > 0) {
        processDocumentFiles(documentFiles);
      }
      
      // Set any remaining context files
      const contextFiles = initialFiles.filter(file => !documentFiles.includes(file));
      if (contextFiles.length > 0) {
        setFiles(contextFiles);
      }
    }
  }, [initialFiles, MAX_FILE_SIZE, processDocumentFiles]); // Re-run when initialFiles changes

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'text/javascript': ['.js'],
      'text/html': ['.html'],
      'text/css': ['.css'],
      'text/x-python': ['.py'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp']
    },
    maxFiles: 5
  });
  
  // Helper functions for the index updates
  const updatePdfVectorStoreIndex = (key, fileName) => {
    const indexKey = 'pdf_vector_store_index';
    let index = [];
    
    try {
      const indexStr = localStorage.getItem(indexKey);
      if (indexStr) {
        index = JSON.parse(indexStr);
      }
    } catch (error) {
      console.error('Error parsing PDF vector store index:', error);
    }
    
    // Add the new entry
    index.push({
      id: key,
      fileName,
      timestamp: Date.now()
    });
    
    // Save the updated index
    localStorage.setItem(indexKey, JSON.stringify(index));
  };
  
  const updateWordVectorStoreIndex = (key, fileName) => {
    const indexKey = 'word_vector_store_index';
    let index = [];
    
    try {
      const indexStr = localStorage.getItem(indexKey);
      if (indexStr) {
        index = JSON.parse(indexStr);
      }
    } catch (error) {
      console.error('Error parsing Word vector store index:', error);
    }
    
    // Add the new entry
    index.push({
      id: key,
      fileName,
      timestamp: Date.now()
    });
    
    // Save the updated index
    localStorage.setItem(indexKey, JSON.stringify(index));
  };
  
  const updateExcelVectorStoreIndex = (key, fileName) => {
    const indexKey = 'excel_vector_store_index';
    let index = [];
    
    try {
      const indexStr = localStorage.getItem(indexKey);
      if (indexStr) {
        index = JSON.parse(indexStr);
      }
    } catch (error) {
      console.error('Error parsing Excel vector store index:', error);
    }
    
    // Add the new entry
    index.push({
      id: key,
      fileName,
      timestamp: Date.now()
    });
    
    // Save the updated index
    localStorage.setItem(indexKey, JSON.stringify(index));
  };
  
  const updateImageVectorStoreIndex = (key, fileName) => {
    const indexKey = 'image_vector_store_index';
    let index = [];
    
    try {
      const indexStr = localStorage.getItem(indexKey);
      if (indexStr) {
        index = JSON.parse(indexStr);
      }
    } catch (error) {
      console.error('Error parsing Image vector store index:', error);
    }
    
    // Add the new entry
    index.push({
      id: key,
      fileName,
      timestamp: Date.now()
    });
    
    // Save the updated index
    localStorage.setItem(indexKey, JSON.stringify(index));
  };
  
  const handleUpload = () => {
    if (files.length === 0) return;
    onUpload(files);
  };
  
  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };
  
  return (
    <div className="file-uploader">
      <div className="file-uploader-header">
        <h3>Upload Files</h3>
        <button className="close-btn" onClick={onClose}>
          <FiX />
        </button>
      </div>
      
      <div className="file-uploader-content">
        {currentFiles.length > 0 && (
          <div className="current-files">
            <h4>Current Context Files</h4>
            <div className="file-list">
              {currentFiles.map(file => (
                <div key={file.id} className="file-item">
                  <FiFile />
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">({formatFileSize(file.size)})</span>
                  <button 
                    className="remove-file-btn" 
                    onClick={() => onRemoveFile(file.id)}
                    title="Remove file"
                  >
                    <FiX />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div 
          {...getRootProps()} 
          className={`dropzone ${isDragActive ? 'active' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="dropzone-content">
            <FiUpload size={24} />
            <p>{isDragActive ? 'Drop files here' : 'Drag & drop files here, or click to select'}</p>
            <p className="dropzone-hint"><strong>Maximum file size: 5MB</strong></p>
            <p className="dropzone-hint">PDF, Word, Excel, and images will be processed as queryable documents. Other files will be added as context.</p>
            <div className="document-types">
              <div className="document-type"><FiFile /> PDF</div>
              <div className="document-type"><FiFileText /> Word</div>
              <div className="document-type"><FiTable /> Excel</div>
              <div className="document-type"><FiImage /> Images</div>
            </div>
          </div>
        </div>
        
        {error && (
          <div className="upload-error">
            {error}
          </div>
        )}
        
        {processing && (
          <div className="processing-status">
            <h4>Processing Document</h4>
            <p>{processingFile}</p>
            <div className="progress-bar">
              <div className="progress" style={{ width: `${processingProgress}%` }}></div>
            </div>
            <p className="progress-text">{processingProgress}%</p>
          </div>
        )}
        
        {files.length > 0 && (
          <div className="selected-files">
            <h4>Selected Context Files</h4>
            <div className="file-list">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="file-item">
                  <FiFile />
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">({formatFileSize(file.size)})</span>
                  <button 
                    className="remove-file-btn"
                    onClick={() => removeFile(index)}
                    title="Remove file"
                  >
                    <FiX />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <div className="file-uploader-footer">
        <button className="cancel-btn" onClick={onClose}>
          Cancel
        </button>
        <button 
          className="upload-btn" 
          onClick={handleUpload}
          disabled={files.length === 0}
        >
          Upload {files.length > 0 ? `(${files.length})` : ''}
        </button>
      </div>
    </div>
  );
};

export default FileUploader;
