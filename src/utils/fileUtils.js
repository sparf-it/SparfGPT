import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

// Function to parse different file formats
export const parseFile = async (file) => {
  const fileExtension = file.name.split('.').pop().toLowerCase();
  const fileId = uuidv4();
  
  // Basic file metadata
  const fileInfo = {
    id: fileId,
    name: file.name,
    type: file.type,
    size: file.size,
    extension: fileExtension,
    content: null,
    uploadedAt: new Date().toISOString()
  };
  
  try {
    // Handle different file types
    switch (fileExtension) {
      case 'txt':
      case 'md':
      case 'js':
      case 'py':
      case 'html':
      case 'css':
      case 'json':
      case 'csv':
        // Text files
        fileInfo.content = await readTextFile(file);
        break;
        
      case 'pdf':
        // Parse PDF files
        fileInfo.content = await readPdfFile(file);
        break;
        
      case 'docx':
        // Parse DOCX files
        fileInfo.content = await readDocxFile(file);
        break;
        
      case 'xlsx':
        // Parse Excel files
        fileInfo.content = await readExcelFile(file);
        break;
        
      default:
        fileInfo.content = `File type .${fileExtension} is not supported for parsing.`;
    }
    
    return fileInfo;
  } catch (error) {
    console.error('Error parsing file:', error);
    throw new Error(`Failed to parse file: ${error.message}`);
  }
};

// Function to read text files
const readTextFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      resolve(event.target.result);
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    reader.readAsText(file);
  });
};

// Function to read PDF files - browser-compatible approach
const readPdfFile = (file) => {
  return new Promise((resolve, reject) => {
    // For now, we'll use a simplified approach that extracts text from the filename
    // and informs the user that PDF content extraction is limited in the browser
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        // Create a message that explains the PDF handling limitations
        const pdfInfo = `
PDF File: ${file.name}
Size: ${formatFileSize(file.size)}
Type: ${file.type}

[Note: This is a PDF file. Due to browser limitations, the full text content cannot be automatically extracted. 
The AI will be able to see this file information but not the complete contents.
For best results with PDFs, consider extracting key text portions and sharing them directly in the chat.]
`;
        resolve(pdfInfo);
      } catch (error) {
        console.error('Error handling PDF:', error);
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    // Just read as data URL to get basic file info
    reader.readAsDataURL(file);
  });
};

// Function to read DOCX files - browser-compatible approach
const readDocxFile = (file) => {
  return new Promise((resolve, reject) => {
    // For now, we'll use a simplified approach that extracts text from the filename
    // and informs the user that DOCX content extraction is limited in the browser
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        // Create a message that explains the DOCX handling limitations
        const docxInfo = `
Word Document: ${file.name}
Size: ${formatFileSize(file.size)}
Type: ${file.type}

[Note: This is a Word document. Due to browser limitations, the full text content cannot be automatically extracted.
The AI will be able to see this file information but not the complete contents.
For best results with Word documents, consider copying key text portions and sharing them directly in the chat.]
`;
        resolve(docxInfo);
      } catch (error) {
        console.error('Error handling DOCX:', error);
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    // Just read as data URL to get basic file info
    reader.readAsDataURL(file);
  });
};

// Function to read Excel files
const readExcelFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = event.target.result;
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get the first worksheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Format as a readable string
        let content = `Sheet: ${firstSheetName}\n\n`;
        
        // Add all rows with proper formatting
        jsonData.forEach((row, rowIndex) => {
          if (row.length > 0) {
            content += row.join('\t') + '\n';
          }
        });
        
        // If there are multiple sheets, add a note
        if (workbook.SheetNames.length > 1) {
          content += `\n\nNote: This file contains ${workbook.SheetNames.length} sheets. Only the first sheet (${firstSheetName}) is shown.`;
        }
        
        resolve(content);
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// Function to convert file size to human-readable format
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Function to prepare file content for API context
export const prepareFileForContext = (fileInfo) => {
  // For text-based files, we can use the content directly
  if (fileInfo.content) {
    return {
      id: fileInfo.id,
      name: fileInfo.name,
      content: fileInfo.content
    };
  }
  
  // For binary files, we would need to handle them differently
  return {
    id: fileInfo.id,
    name: fileInfo.name,
    content: `[Binary file: ${fileInfo.name}]`
  };
};

// Function to export conversation to different formats
export const exportConversation = (conversation, format) => {
  switch (format) {
    case 'json':
      return {
        data: JSON.stringify(conversation, null, 2),
        filename: `${conversation.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`,
        type: 'application/json'
      };
      
    case 'txt':
      const txtContent = conversation.messages.map(msg => 
        `${msg.role.toUpperCase()}: ${msg.content}`
      ).join('\n\n');
      
      return {
        data: txtContent,
        filename: `${conversation.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`,
        type: 'text/plain'
      };
      
    case 'pdf':
      // PDF generation would require a PDF library
      return {
        data: null,
        filename: `${conversation.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
        type: 'application/pdf'
      };
      
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
};
