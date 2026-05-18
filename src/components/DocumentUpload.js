import React, { useState, useEffect } from 'react';
import { extractTextFromPDF } from '../services/pdfService';
import { extractTextFromWord } from '../services/wordService';
import { extractTextFromExcel } from '../services/excelService';
import { extractInfoFromImage } from '../services/imageService';
import { createVectorStore as createPdfVectorStore, saveVectorStore as savePdfVectorStore, getAvailableVectorStores as getPdfVectorStores } from '../services/pdfService';
import { createVectorStore as createWordVectorStore, saveVectorStore as saveWordVectorStore, getAvailableVectorStores as getWordVectorStores } from '../services/wordService';
import { createVectorStore as createExcelVectorStore, saveVectorStore as saveExcelVectorStore, getAvailableVectorStores as getExcelVectorStores } from '../services/excelService';
import { createVectorStore as createImageVectorStore, saveVectorStore as saveImageVectorStore, getAvailableVectorStores as getImageVectorStores } from '../services/imageService';
import './DocumentUpload.css';

const DocumentUpload = ({ 
  onPDFSelect, 
  onWordSelect, 
  onExcelSelect, 
  onImageSelect, 
  documentType = 'pdf' 
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [availableDocuments, setAvailableDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  
  // Load available documents on component mount
  useEffect(() => {
    const loadDocuments = () => {
      try {
        let docs = [];
        switch (documentType) {
          case 'pdf':
            docs = getPdfVectorStores();
            break;
          case 'word':
            docs = getWordVectorStores();
            break;
          case 'excel':
            docs = getExcelVectorStores();
            break;
          case 'image':
            docs = getImageVectorStores();
            break;
          default:
            docs = getPdfVectorStores();
        }
        
        setAvailableDocuments(docs);
      } catch (error) {
        console.error(`Error loading ${documentType} documents:`, error);
        setError(`Failed to load documents: ${error.message}`);
      }
    };
    
    loadDocuments();
  }, [documentType]);
  
  // Handle document file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Reset state
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    
    try {
      // Check if the file has an acceptable extension
      let isValidFile = false;
      let extractFunction, createVectorStoreFunction, saveVectorStoreFunction;
      
      switch (documentType) {
        case 'pdf':
          isValidFile = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          extractFunction = extractTextFromPDF;
          createVectorStoreFunction = createPdfVectorStore;
          saveVectorStoreFunction = savePdfVectorStore;
          break;
        case 'word':
          isValidFile = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                        file.name.toLowerCase().endsWith('.docx');
          extractFunction = extractTextFromWord;
          createVectorStoreFunction = createWordVectorStore;
          saveVectorStoreFunction = saveWordVectorStore;
          break;
        case 'excel':
          isValidFile = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                        file.name.toLowerCase().endsWith('.xlsx');
          extractFunction = extractTextFromExcel;
          createVectorStoreFunction = createExcelVectorStore;
          saveVectorStoreFunction = saveExcelVectorStore;
          break;
        case 'image':
          isValidFile = file.type.startsWith('image/') || 
                        /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
          extractFunction = extractInfoFromImage;
          createVectorStoreFunction = createImageVectorStore;
          saveVectorStoreFunction = saveImageVectorStore;
          break;
        default:
          isValidFile = false;
      }
      
      if (!isValidFile) {
        throw new Error(`Invalid file type. Please upload a ${documentType.toUpperCase()} file.`);
      }
      
      // Check file size (limit to 10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File is too large. Maximum size is 10MB.');
      }
      
      // Step 1: Extract text from document
      setProgress(10);
      console.log(`Starting ${documentType} text extraction for ${file.name}`);
      const extractedText = await extractFunction(file);
      
      if (!extractedText || extractedText.length < 10) {
        throw new Error(`Failed to extract text from the ${documentType} file.`);
      }
      
      console.log(`Successfully extracted text from ${documentType}. Length: ${extractedText.length} characters`);
      setProgress(40);
      
      // Step 2: Create vector store from extracted text
      // Get API key from localStorage
      const apiKey = localStorage.getItem('openai_api_key');
      if (!apiKey) {
        throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
      }
      
      console.log(`Creating vector store from ${documentType} text...`);
      const vectorStore = await createVectorStoreFunction(extractedText, apiKey);
      setProgress(70);
      
      // Step 3: Save vector store to localStorage
      console.log(`Saving ${documentType} vector store...`);
      const documentId = await saveVectorStoreFunction(vectorStore, file.name);
      setProgress(90);
      
      // Step 4: Refresh document list
      const updatedDocuments = documentType === 'pdf' ? getPdfVectorStores() : 
                               documentType === 'word' ? getWordVectorStores() :
                               documentType === 'excel' ? getExcelVectorStores() :
                               getImageVectorStores();
      setAvailableDocuments(updatedDocuments);
      
      // Step 5: Set the current document active
      console.log(`${documentType.toUpperCase()} processed successfully. Document ID: ${documentId}`);
      setProgress(100);
      
      // Call the appropriate selection handler
      switch (documentType) {
        case 'pdf':
          onPDFSelect(documentId, file.name);
          break;
        case 'word':
          onWordSelect(documentId, file.name);
          break;
        case 'excel':
          onExcelSelect(documentId, file.name);
          break;
        case 'image':
          onImageSelect(documentId, file.name);
          break;
        default:
          console.log(`Unknown document type: ${documentType}`);
          break;  
      }
      
      // Reset selected file input
      event.target.value = null;
    } catch (error) {
      console.error(`Error processing ${documentType}:`, error);
      setError(`Error processing ${documentType}: ${error.message}`);
      
      // Reset selected file input
      event.target.value = null;
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Handle document selection from the list
  const handleDocumentSelect = (documentId, fileName) => {
    setSelectedDocument(documentId);
    
    // Call the appropriate selection handler
    switch (documentType) {
      case 'pdf':
        onPDFSelect(documentId, fileName);
        break;
      case 'word':
        onWordSelect(documentId, fileName);
        break;
      case 'excel':
        onExcelSelect(documentId, fileName);
        break;
      case 'image':
        onImageSelect(documentId, fileName);
        break;
      default:
        console.log(`Unknown document type: ${documentType}`);
        break;  
    }
  };
  
  // Determine the file input accept attribute based on document type
  const getAcceptAttribute = () => {
    switch (documentType) {
      case 'pdf':
        return '.pdf,application/pdf';
      case 'word':
        return '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'excel':
        return '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'image':
        return '.jpg,.jpeg,.png,.gif,.webp,image/*';
      default:
        return '';
    }
  };
  
  // Get document type label
  const getDocumentTypeLabel = () => {
    switch (documentType) {
      case 'pdf':
        return 'PDF';
      case 'word':
        return 'Word';
      case 'excel':
        return 'Excel';
      case 'image':
        return 'Image';
      default:
        return 'Document';
    }
  };
  
  return (
    <div className="document-upload">
      <h3>{getDocumentTypeLabel()} Document Upload</h3>
      
      <div className="upload-section">
        <p>Upload a {getDocumentTypeLabel()} file to query:</p>
        <input
          type="file"
          onChange={handleFileUpload}
          accept={getAcceptAttribute()}
          disabled={isProcessing}
          className="file-input"
        />
        
        {isProcessing && (
          <div className="processing">
            <div className="progress-bar">
              <div className="progress" style={{ width: `${progress}%` }}></div>
            </div>
            <p>Processing {getDocumentTypeLabel()}... {progress}%</p>
          </div>
        )}
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>
      
      {availableDocuments.length > 0 && (
        <div className="available-documents">
          <h4>Available Documents</h4>
          <ul>
            {availableDocuments.map(doc => (
              <li 
                key={doc.key} 
                className={selectedDocument === doc.key ? 'selected' : ''}
                onClick={() => handleDocumentSelect(doc.key, doc.fileName)}
              >
                {doc.fileName}
                <span className="document-date">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;
