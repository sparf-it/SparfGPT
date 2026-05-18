import React, { useState, useContext } from 'react';
import { FiUpload, FiFile, FiX, FiClock } from 'react-icons/fi';
import { extractTextFromPDF, createVectorStore, saveVectorStore, getAvailableVectorStores } from '../services/pdfService';
import { SettingsContext } from '../context/SettingsContext';
import './PDFUpload.css';

const PDFUpload = ({ onPDFSelect }) => {
  const { settings } = useContext(SettingsContext);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [availablePDFs, setAvailablePDFs] = useState(getAvailableVectorStores());
  const [activeDocumentId, setActiveDocumentId] = useState(null);

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.type.includes('pdf')) {
      alert('Please select a valid PDF file');
      return;
    }

    try {
      setIsUploading(true);
      setProgress(10);

      // Extract text from PDF
      const text = await extractTextFromPDF(file);
      setProgress(40);

      // Get API key from localStorage directly to ensure we have it
      const apiKey = localStorage.getItem('openai_api_key');
      if (!apiKey) {
        throw new Error('OpenAI API key is not set. Please add your API key in the settings.');
      }
      
      // Create vector store from text with the API key
      const vectorStore = await createVectorStore(text, apiKey);
      setProgress(80);

      // Save vector store to localStorage
      const documentId = await saveVectorStore(vectorStore, file.name);
      setProgress(100);

      // Update available PDFs
      setAvailablePDFs(getAvailableVectorStores());
      
      // Set as active document
      setActiveDocumentId(documentId);
      if (onPDFSelect) {
        onPDFSelect(documentId, file.name);
      }
    } catch (error) {
      console.error('Error processing PDF:', error);
      alert('Failed to process PDF. Please try again.');
    } finally {
      setIsUploading(false);
      setProgress(0);
      // Reset file input
      event.target.value = null;
    }
  };

  // Handle document selection
  const handleDocumentSelect = (documentId, fileName) => {
    setActiveDocumentId(documentId);
    if (onPDFSelect) {
      onPDFSelect(documentId, fileName);
    }
  };

  // Remove a document
  const handleRemoveDocument = (e, documentId) => {
    e.stopPropagation();
    
    // Remove from localStorage
    localStorage.removeItem(documentId);
    
    // Update state
    setAvailablePDFs(getAvailableVectorStores());
    
    // Reset active document if it was removed
    if (activeDocumentId === documentId) {
      setActiveDocumentId(null);
      if (onPDFSelect) {
        onPDFSelect(null, null);
      }
    }
  };

  return (
    <div className="pdf-upload-container">
      <div className="pdf-upload-header">
        <h3>PDF Documents</h3>
        <label className="upload-button">
          <FiUpload />
          <span>Upload PDF</span>
          <input 
            type="file" 
            accept=".pdf" 
            onChange={handleFileUpload} 
            disabled={isUploading}
            style={{ display: 'none' }}
          />
        </label>
      </div>
      
      {isUploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="progress-text">Processing PDF... {progress}%</div>
        </div>
      )}
      
      <div className="pdf-documents-list">
        {availablePDFs.length === 0 ? (
          <div className="no-documents">
            <FiFile />
            <p>No PDF documents uploaded yet</p>
          </div>
        ) : (
          availablePDFs.map(doc => (
            <div 
              key={doc.id} 
              className={`pdf-document-item ${activeDocumentId === doc.id ? 'active' : ''}`}
              onClick={() => handleDocumentSelect(doc.id, doc.fileName)}
            >
              <div className="pdf-document-icon">
                <FiFile />
              </div>
              <div className="pdf-document-info">
                <div className="pdf-document-name">{doc.fileName}</div>
                <div className="pdf-document-date">
                  <FiClock /> {new Date(doc.timestamp).toLocaleDateString()}
                </div>
              </div>
              <button 
                className="remove-document-btn"
                onClick={(e) => handleRemoveDocument(e, doc.id)}
                title="Remove document"
              >
                <FiX />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PDFUpload;
