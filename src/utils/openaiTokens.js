import React from 'react';

/**
 * This file provides a client-side implementation of token visualization
 * that aims to demonstrate how OpenAI's tokenizer works.
 * 
 * While not exactly the same as OpenAI's tiktoken library, it shows the
 * key concepts of how tokens work in GPT models.
 */

// Token visualization colors
const TOKEN_COLORS = [
  '#E6F7FF', // light blue
  '#FFF7E6', // light orange
  '#F6FFED', // light green
  '#FFF1F0', // light red
  '#F9F0FF', // light purple
];

/**
 * Converts text to tokens using an approximation of OpenAI's tokenization
 * @param {string} text - The text to tokenize
 * @returns {Array} - Array of token objects
 */
export const tokenizeText = (text) => {
  if (!text) return [];
  
  // This regex pattern provides a better approximation of GPT tokenization
  // than simple word splitting, though it's still not identical to tiktoken
  const pattern = /(?:[\p{L}\p{N}]+|[^\p{L}\p{N}\s]+|\s+)/gu;
  const matches = Array.from(text.matchAll(pattern));
  
  const tokens = [];
  let tokenId = 1000; // Starting ID for demo purposes
  
  matches.forEach((match, index) => {
    const tokenText = match[0];
    
    // Check for special cases to show how common words stay as one token
    if (/^(the|and|in|of|to|a|is|that|for|it|with|as|be|on|you|this|by|are|not|from)$/i.test(tokenText)) {
      tokens.push({ id: tokenId++, text: tokenText });
    } 
    // Handle spaces - typically space is joined with the next token in tiktoken
    else if (/^\s+$/.test(tokenText)) {
      tokens.push({ id: tokenId++, text: tokenText, isSpace: true });
    }
    // Split longer uncommon words into smaller chunks to simulate tiktoken
    else if (tokenText.length > 5 && !/^[0-9]+$/.test(tokenText)) {
      // Split words into chunks of 4-5 characters
      for (let i = 0; i < tokenText.length; i += 4) {
        const chunk = tokenText.slice(i, Math.min(i + 4, tokenText.length));
        tokens.push({ id: tokenId++, text: chunk });
      }
    }
    // Handle other tokens normally
    else {
      tokens.push({ id: tokenId++, text: tokenText });
    }
  });
  
  return tokens;
};

/**
 * Renders tokens with highlighting similar to OpenAI tokenizer
 * @param {string} text - The text to tokenize and display
 * @returns {React.Element} - Token visualization component
 */
export const visualizeTokens = (text) => {
  if (!text) {
    return <div style={{ padding: '10px' }}>No text to tokenize</div>;
  }
  
  const tokens = tokenizeText(text);
  const displayableTokens = tokens.filter(token => !token.isSpace);
  
  return (
    <div style={{ 
      border: '1px solid #ddd',
      borderRadius: '4px',
      padding: '15px',
      backgroundColor: '#f9f9f9'
    }}>
      <div style={{ 
        fontWeight: 'bold', 
        marginBottom: '10px',
        borderBottom: '1px solid #eee',
        paddingBottom: '5px'
      }}>
        GPT Tokenization ({displayableTokens.length} tokens)
      </div>
      
      <div style={{ 
        lineHeight: '2.5',
        fontFamily: 'monospace',
        fontSize: '14px'
      }}>
        {displayableTokens.map((token, index) => {
          let displayText = token.text;
          
          // The following 'if (token.isSpace)' block will not be entered for displayableTokens,
          // as they are already filtered. It's kept for structural similarity to original if needed elsewhere.
          if (token.isSpace) { 
            if (displayText === ' ') displayText = '·'; 
            else if (displayText === '\n') displayText = '↵'; 
            else if (displayText === '\t') displayText = '→'; 
          }
          
          return (
            <span 
              key={index}
              style={{
                backgroundColor: TOKEN_COLORS[index % TOKEN_COLORS.length],
                padding: '3px 6px',
                margin: '0 2px',
                borderRadius: '4px',
                border: '1px solid rgba(0,0,0,0.1)',
                display: 'inline-block'
              }}
              title={`Token ID: ${token.id}`}
            >
              {displayText}
            </span>
          );
        })}
      </div>
      
      <div style={{ marginTop: '15px', fontSize: '0.9em', color: '#666' }}>
        <p style={{ margin: '0 0 8px 0' }}>
          <strong>Note:</strong> This is a browser-side approximation of how GPT models tokenize text.
        </p>

        <p style={{ margin: '0' }}>
          For the exact OpenAI tokenization, visit the{' '}
          <a 
            href="https://platform.openai.com/tokenizer" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ color: '#1677ff' }}
          >
            OpenAI Tokenizer
          </a>
        </p>
      </div>
    </div>
  );
};
