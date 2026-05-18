import React, { useState } from 'react';
import { fixVectorStoreKeys, resetAllVectorStores } from '../services/vectorStorefix';

/**
 * Component that provides buttons to fix vector store issues
 */
const VectorStoreFixer = () => {
  const [fixResult, setFixResult] = useState(null);
  const [resetResult, setResetResult] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleFixVectorStores = () => {
    try {
      const result = fixVectorStoreKeys();
      setFixResult(result);
      alert(`Vector store fix complete. Fixed: ${result.fixed}, Errors: ${result.errors}`);
    } catch (error) {
      console.error('Error fixing vector stores:', error);
      setFixResult({ error: error.message, fixed: 0, errors: 1 });
      alert('Error fixing vector stores: ' + error.message);
    }
  };

  const handleResetVectorStores = () => {
    if (window.confirm('Are you sure you want to reset all vector stores? This will delete all existing vector stores and cannot be undone.')) {
      try {
        const result = resetAllVectorStores();
        setResetResult(result);
        alert(`Reset complete. Deleted ${result.deletedCount} vector store entries.`);
      } catch (error) {
        console.error('Error resetting vector stores:', error);
        setResetResult({ error: error.message });
        alert('Error resetting vector stores: ' + error.message);
      }
    }
  };

  return (
    <div style={{ 
      padding: '15px', 
      margin: '10px 0', 
      border: '1px solid #ccc', 
      borderRadius: '5px',
      backgroundColor: '#f8f9fa'
    }}>
      <h3 style={{ marginTop: 0 }}>Vector Store Utilities</h3>
      <p>
        If you're experiencing "Vector store not found" errors when uploading files, 
        try using these utilities to fix the issue.
      </p>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <button 
          onClick={handleFixVectorStores}
          style={{
            padding: '8px 12px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Fix Vector Stores
        </button>
        
        <button 
          onClick={handleResetVectorStores}
          style={{
            padding: '8px 12px',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reset All Vector Stores
        </button>
      </div>
      
      {(fixResult || resetResult) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
            <h4 style={{ margin: 0, marginRight: '10px' }}>Results</h4>
            <button 
              onClick={() => setShowDetails(!showDetails)}
              style={{
                padding: '3px 6px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
            </button>
          </div>
          
          {fixResult && (
            <div style={{ marginBottom: '10px' }}>
              <p>
                <strong>Fix Results:</strong> {fixResult.fixed} fixed, {fixResult.errors} errors
                {fixResult.error && <span style={{ color: 'red' }}> - Error: {fixResult.error}</span>}
              </p>
              
              {showDetails && fixResult.details && (
                <ul style={{ 
                  maxHeight: '150px', 
                  overflowY: 'auto', 
                  backgroundColor: '#f1f1f1', 
                  padding: '10px', 
                  borderRadius: '4px', 
                  fontSize: '14px',
                  margin: '5px 0'
                }}>
                  {fixResult.details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          
          {resetResult && (
            <div>
              <p>
                <strong>Reset Results:</strong> {resetResult.deletedCount} vector stores deleted
                {resetResult.error && <span style={{ color: 'red' }}> - Error: {resetResult.error}</span>}
              </p>
            </div>
          )}
        </div>
      )}
      
      <div style={{ 
        backgroundColor: '#fff3cd', 
        padding: '10px', 
        borderRadius: '4px',
        borderLeft: '4px solid #ffc107',
        marginTop: '10px',
        fontSize: '14px'
      }}>
        <strong>Note:</strong> After fixing vector stores, you may need to reload the page and upload your files again.
        The "Reset" option will delete all existing vector stores and should only be used if the fix doesn't work.
      </div>
    </div>
  );
};

export default VectorStoreFixer;
