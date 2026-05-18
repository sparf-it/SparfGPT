/**
 * Browser-friendly tokenizer that approximates GPT tokenization
 * 
 * This is a simplified approximation of how GPT models tokenize text.
 * It's not 100% accurate but provides a reasonable estimate for educational purposes.
 */

/**
 * Tokenize text using a regex-based approach that approximates GPT tokenization
 * @param {string} text - The text to tokenize
 * @returns {Array} - Array of token objects with id, text, and isWhitespace properties
 */
export const tokenizeText = (text) => {
  if (!text) return [];
  
  // This regex pattern tries to approximate GPT tokenization by splitting on:
  // - Whitespace
  // - Punctuation
  // - Common prefixes and suffixes
  // - Numbers
  // - CamelCase and snake_case boundaries
  const pattern = /\s+|[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]|\b\w+\b|[A-Z][a-z]+|_+|\d+/g;
  const matches = text.match(pattern) || [];
  
  // Filter out empty strings and map to token objects
  return matches
    .filter(token => token.length > 0)
    .map((token, index) => ({
      id: index,
      text: token,
      isWhitespace: /^\s+$/.test(token)
    }));
};

/**
 * Count tokens in text using an improved approximation
 * @param {string} text - The text to count tokens for
 * @returns {number} - The approximate number of tokens
 */
export const countTokens = (text) => {
  if (!text) return 0;
  
  // GPT models typically use about 4 characters per token on average for English text
  // This is a rough approximation that works reasonably well for educational purposes
  const tokens = tokenizeText(text);
  
  // Apply some heuristics to better approximate GPT tokenization:
  // 1. Common words are often single tokens
  // 2. Numbers and special characters often count as separate tokens
  // 3. Very long words get split into multiple tokens
  
  let adjustedCount = 0;
  for (const token of tokens) {
    if (token.isWhitespace) {
      // Whitespace is usually counted as part of the next token
      continue;
    } else if (token.text.length <= 2) {
      // Very short tokens (1-2 chars) are often single tokens
      adjustedCount += 1;
    } else if (token.text.length > 10) {
      // Long tokens get split approximately every 4-5 characters
      adjustedCount += Math.ceil(token.text.length / 4);
    } else {
      // Average case - most words become single tokens
      adjustedCount += 1;
    }
  }
  
  return adjustedCount;
};

// Generate random colors for tokens
export const getTokenColor = (tokenIndex) => {
  const colors = [
    '#FFB6C1', // Light Pink
    '#ADD8E6', // Light Blue
    '#90EE90', // Light Green
    '#FFFFE0', // Light Yellow
    '#E6E6FA', // Lavender
    '#FFDAB9', // Peach
    '#D8BFD8', // Thistle
    '#B0E0E6', // Powder Blue
    '#FAFAD2', // Light Goldenrod
    '#F0FFF0', // Honeydew
  ];
  
  return colors[tokenIndex % colors.length];
};

// Highlight tokens in text
export const highlightTokens = (tokens, colorTokens = true) => {
  return tokens.map((token, index) => {
    if (token.isWhitespace) {
      return token.text;
    }
    
    const style = colorTokens 
      ? { backgroundColor: getTokenColor(index), padding: '2px', borderRadius: '3px', margin: '0 1px' }
      : { backgroundColor: '#f0f0f0', padding: '2px', borderRadius: '3px', margin: '0 1px' };
    
    return (
      <span key={token.id} style={style} title={`Token ${index + 1}`}>
        {token.text}
      </span>
    );
  });
};

// Format token count display
export const formatTokenCount = (count) => {
  // Handle undefined, null, or invalid count values
  if (count === undefined || count === null) {
    return '0 tokens';
  }
  return `${count.toLocaleString()} token${count !== 1 ? 's' : ''}`;
};

// Estimate token usage for a conversation
export const estimateConversationTokens = (messages) => {
  let total = 0;
  
  messages.forEach(message => {
    // Count tokens in the message content
    const contentTokens = countTokens(message.content);
    
    // Add tokens for message metadata (role, etc.)
    // This is a rough approximation
    const metadataTokens = 4; // ~4 tokens for message metadata
    
    total += contentTokens + metadataTokens;
  });
  
  return total;
};
