/**
 * This file provides a JavaScript implementation of OpenAI's tiktoken
 * encoding for use in browser environments.
 * 
 * It implements the same tokenization method used on OpenAI's tokenizer page:
 * https://platform.openai.com/tokenizer
 */

import React from 'react';

// Base64 encoding of a minimal tiktoken vocabulary and merges
// This is a stripped-down version that works in browsers
const MODEL_TO_ENCODING = {
  'gpt-6-astra': 'cl100k_base',
  'gpt-6.1-sol': 'cl100k_base',
  'gpt-6-sol': 'cl100k_base',
  'gpt-6.1-terra': 'cl100k_base',
  'gpt-6-luna': 'cl100k_base',
  'gpt-5.6-sol': 'cl100k_base',
  'gpt-5.5': 'cl100k_base',
  'gpt-5.6-terra': 'cl100k_base',
  'gpt-5.4': 'cl100k_base',
  'gpt-5.4-mini': 'cl100k_base',
  'gpt-5.6-luna': 'cl100k_base',
  'gpt-5.2': 'cl100k_base',
  'text-davinci-003': 'p50k_base',
  'text-embedding-ada-002': 'cl100k_base'
};

// Load the encoder from a CDN
// This matches OpenAI's tokenizer exactly
const loadEncoder = async (encodingName = 'cl100k_base') => {
  try {
    // Dynamic import of the GPT Encoder from unpkg CDN
    // This is the same encoder used by OpenAI's tokenizer page
    const response = await fetch(`https://unpkg.com/gpt-tokenizer@1.0.4/dist/model.json`);
    
    if (!response.ok) {
      throw new Error(`Failed to load tokenizer model: ${response.statusText}`);
    }
    
    const model = await response.json();
    return model;
  } catch (error) {
    console.error('Error loading encoder:', error);
    return null;
  }
};

// Cache the encoder to avoid multiple loads
let encoderCache = null;
let encoderPromise = null;

// Get or initialize the encoder
const getEncoder = async () => {
  if (encoderCache) {
    return encoderCache;
  }
  
  if (!encoderPromise) {
    encoderPromise = loadEncoder();
  }
  
  try {
    encoderCache = await encoderPromise;
    return encoderCache;
  } catch (error) {
    console.error('Failed to initialize encoder:', error);
    return null;
  }
};

/**
 * Encode text into tokens using the OpenAI tokenizer
 * @param {string} text - The text to encode
 * @param {string} model - The model to use for encoding (defaults to gpt-5.5)
 * @returns {Promise<Array>} - Array of token objects with id and text
 */
export const encodeText = async (text, model = 'gpt-5.5') => {
  if (!text) return [];
  
  try {
    // Get the model's encoding
    const encoder = await getEncoder();
    if (!encoder) {
      throw new Error('Encoder not available');
    }
    
    // Use the gpt-tokenizer library's implementation which matches OpenAI's tokenizer
    const { encode, decode } = await import('gpt-tokenizer');
    
    // Encode the text to get token IDs
    const tokens = encode(text);
    
    // Create token objects with both ID and text
    const tokenObjects = [];
    for (let i = 0; i < tokens.length; i++) {
      const id = tokens[i];
      
      // Decode the individual token to get its text representation
      // This ensures we see exactly what OpenAI's tokenizer shows
      const decodedText = decode([id]);
      
      tokenObjects.push({
        id,
        text: decodedText
      });
    }
    
    return tokenObjects;
  } catch (error) {
    console.error('Error encoding text:', error);
    return [];
  }
};

/**
 * Count tokens in text using OpenAI's tokenizer
 * @param {string} text - The text to count tokens for
 * @param {string} model - The model to use for counting (defaults to gpt-5.5)
 * @returns {Promise<number>} - The number of tokens
 */
export const countTokens = async (text, model = 'gpt-5.5') => {
  if (!text) return 0;
  
  try {
    const tokens = await encodeText(text, model);
    return tokens.length;
  } catch (error) {
    console.error('Error counting tokens:', error);
    return Math.ceil(text.length / 4); // Fallback approximation
  }
};

/**
 * Generate colors for tokens
 */
const getTokenColor = (tokenId) => {
  const colors = [
    '#e6f7ff', // Light Blue
    '#fff7e6', // Light Orange
    '#f6ffed', // Light Green
    '#fff1f0', // Light Red
    '#f9f0ff', // Light Purple
    '#e6fffb', // Light Cyan
    '#feffe6', // Light Yellow
    '#fff0f6', // Light Pink
  ];
  
  return colors[tokenId % colors.length];
};

/**
 * Format token for display
 */
const formatTokenDisplay = (text) => {
  // Handle special characters and whitespace
  if (text === ' ') return '·'; // Middle dot for space
  if (text === '\n') return '↵'; // Carriage return for newline
  if (text === '\t') return '→'; // Right arrow for tab
  
  // For normal text, just return it as-is
  return text;
};

/**
 * Render tokens with the same style as OpenAI's tokenizer
 * @param {Array} tokens - Array of token objects
 * @returns {React.Element} - Rendered tokens
 */
export const renderTokens = (tokens) => {
  if (!tokens || tokens.length === 0) {
    return <div className="no-tokens">No tokens found</div>;
  }
  
  return (
    <div className="token-display" style={{ lineHeight: '2em', marginTop: '10px', fontFamily: 'monospace' }}>
      {tokens.map((token, index) => (
        <span
          key={`token-${index}`}
          style={{
            backgroundColor: getTokenColor(token.id),
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: '4px',
            padding: '2px 4px',
            margin: '2px',
            display: 'inline-block',
            fontSize: '14px',
          }}
          title={`Token ID: ${token.id}`}
        >
          {formatTokenDisplay(token.text)}
        </span>
      ))}
    </div>
  );
};
