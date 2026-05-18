/**
 * Utility functions for handling images
 */

/**
 * Downloads an image from a URL
 * 
 * @param {string} url - The URL of the image to download
 * @param {string} filename - The filename to save the image as
 */
export const downloadImage = (url, filename = 'generated-image.png') => {
  try {
    // Create an invisible image element to load the image
    const img = document.createElement('img');
    img.style.display = 'none';
    img.crossOrigin = 'anonymous'; // This won't work for OpenAI URLs, but we'll use a different approach
    
    // When the image loads, draw it on a canvas and download from there
    img.onload = () => {
      // Create a canvas element
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw the image on the canvas
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      // Try to get the image data as a data URL
      try {
        // Get the data URL from the canvas
        const dataUrl = canvas.toDataURL('image/png');
        
        // Create a download link
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        
        // Trigger the download
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        document.body.removeChild(link);
        document.body.removeChild(img);
      } catch (canvasError) {
        console.error('Canvas error:', canvasError);
        // If canvas.toDataURL fails due to tainted canvas, fall back to opening in new tab
        openImageInNewTab(url, filename);
      }
    };
    
    // Handle errors
    img.onerror = () => {
      document.body.removeChild(img);
      console.error('Error loading image');
      // Fall back to opening in new tab
      openImageInNewTab(url, filename);
    };
    
    // Set the source and add to document to start loading
    img.src = url;
    document.body.appendChild(img);
  } catch (error) {
    console.error('Error downloading image:', error);
    // Fall back to opening in new tab
    openImageInNewTab(url, filename);
  }
};

/**
 * Fallback method to open the image in a new tab
 * 
 * @param {string} url - The URL of the image
 * @param {string} filename - The suggested filename (for user information)
 */
const openImageInNewTab = (url, filename) => {
  try {
    // Alert the user about the fallback method
    alert(`Due to security restrictions, we can't download the image directly.\n\nThe image will open in a new tab. Right-click on it and select 'Save image as...' to download it as ${filename}.`);
    
    // Open the image in a new tab
    window.open(url, '_blank');
  } catch (error) {
    console.error('Error opening image in new tab:', error);
    alert('Failed to open image. Please try right-clicking on the image and select "Save image as..."');
  }
};

/**
 * Extracts the image URL from markdown content
 * 
 * @param {string} markdownContent - The markdown content containing an image
 * @returns {string|null} - The extracted image URL or null if not found
 */
export const extractImageUrl = (markdownContent) => {
  if (!markdownContent) return null;
  
  // Match markdown image syntax: ![alt text](url)
  const match = markdownContent.match(/!\[.*?\]\((.*?)\)/);
  if (match && match[1]) {
    return match[1];
  }
  
  return null;
};
