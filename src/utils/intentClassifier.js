/**
 * Utility functions for classifying user input intent
 */


/**
 * Simple fallback classifier when AI classification is not available
 * 
 * This is a minimal fallback that doesn't use pattern matching, as requested by the user
 * It simply provides a reasonable default based on minimal context
 * 
 * @param {string} input - The user's input text
 * @param {Object} conversationContext - Optional context about the conversation
 * @param {boolean} conversationContext.lastMessageWasImage - Whether the last assistant message was an image
 * @param {boolean} conversationContext.isImageAnalysisMode - Whether an image has been uploaded for analysis
 * @returns {Object} - Object containing the classification result and confidence
 */
export const classifyIntent = (input, conversationContext = {}) => {
  if (!input || typeof input !== 'string') {
    return { intent: 'text', confidence: 1.0 };
  }

  // If we're in image analysis mode, we'll assume the user is asking about the uploaded image
  // rather than requesting a new image generation
  if (conversationContext.isImageAnalysisMode) {
    return { intent: 'text', confidence: 0.7, source: 'fallback-image-analysis-mode' };
  }
  
  // If the last message was an image, simple follow-ups might be about modifying the image
  if (conversationContext.lastMessageWasImage) {
    // Very short follow-ups after an image are likely image-related
    const normalizedInput = input.toLowerCase().trim();
    if (normalizedInput.split(' ').length < 5) {
      return { intent: 'image', confidence: 0.6, source: 'fallback-short-after-image' };
    }
  }
  
  // Without pattern matching, we default to text intent with moderate confidence
  // Actual classification should be done by the AI classifier
  return { intent: 'text', confidence: 0.5, source: 'fallback-default' };
};

/**
 * Uses the OpenAI API for intent classification without pattern-based fallbacks
 * 
 * @param {string} input - The user's input text
 * @param {Object} conversationContext - Optional context about the conversation
 * @returns {Promise<Object>} - Promise resolving to classification result
 */
export const classifyIntentWithAPI = async (input, conversationContext = {}) => {
  if (!input || typeof input !== 'string') {
    return { intent: 'text', confidence: 1.0 };
  }

  try {
    // Get the API key from local storage
    const apiKey = localStorage.getItem('openai_api_key');
    if (!apiKey) {
      console.error('OpenAI API key not found');
      return { intent: 'text', confidence: 0.5, source: 'fallback-no-api-key' };
    }
    
    // Build a context-aware system prompt
    let systemPrompt = `You are an expert classifier that determines if a user prompt is intended for image generation or text analysis.

CLASSIFICATION RULES:
- "image" intent: User wants to CREATE, GENERATE, DRAW, PAINT, DESIGN, or VISUALIZE a new image
- "text" intent: User wants information, analysis, explanation, or discussion

KEY INDICATORS FOR IMAGE GENERATION:
- Action verbs: "create", "generate", "draw", "make", "design", "paint", "show me", "visualize"
- Descriptive requests: "a picture of", "an image of", "illustration of"
- Artistic styles: "in the style of", "photorealistic", "cartoon", "sketch"
- Specific visual details: colors, composition, lighting, perspective

KEY INDICATORS FOR TEXT RESPONSE:
- Question words: "what", "why", "how", "when", "where", "who"
- Analysis requests: "explain", "describe", "tell me about", "analyze"
- References to existing content: "this image", "the picture", "that photo"`;
    
    // Add context about image analysis mode if it exists
    if (conversationContext.isImageAnalysisMode === true) {
      systemPrompt += '\n\nIMPORTANT CONTEXT: The user has recently UPLOADED AN IMAGE for analysis. References to "this image", "the image", "the picture" mean their uploaded image and require TEXT analysis, NOT new image generation.';
    }
    
    // Add context about previously generated images
    if (conversationContext.lastMessageWasImage === true) {
      systemPrompt += '\n\nIMPORTANT CONTEXT: The last message contained a generated image. Short follow-ups like "make it bigger", "change the color to blue", "add a sunset" likely mean generating a MODIFIED version of that image.';
    }
    
    systemPrompt += '\n\nRespond ONLY with a JSON object: {"intent": "image" or "text", "confidence": 0.0-1.0, "reasoning": "brief explanation"}';

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-6-luna', // Using GPT-6 Luna for classification and extraction tasks
        input: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Classify if this prompt is for image generation or text analysis: "${input}"`
          }
        ],
        max_output_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    // Extract text from the /responses output format (handles several shapes)
    let assistantMessage = '';
    if (typeof data.output_text === 'string') {
      assistantMessage = data.output_text;
    } else if (Array.isArray(data.output)) {
      const texts = [];
      for (const item of data.output) {
        const content = Array.isArray(item && item.content) ? item.content : [];
        for (const part of content) {
          if (!part) continue;
          if (typeof part.text === 'string') {
            texts.push(part.text);
          } else if (part.output_text && typeof part.output_text.text === 'string') {
            texts.push(part.output_text.text);
          } else if (typeof part.output_text === 'string') {
            texts.push(part.output_text);
          }
        }
      }
      assistantMessage = texts.join('');
    }

    if (!assistantMessage) {
      console.error('Unexpected /responses payload:', JSON.stringify(data).slice(0, 500));
      throw new Error('Invalid response from API');
    }

    console.log('Raw AI classification response:', assistantMessage);

    // Extract JSON from the response
    const jsonMatch = assistantMessage.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from API response');
    }

    try {
      const result = JSON.parse(jsonMatch[0]);
      if (result.intent && typeof result.confidence === 'number') {
        const intentResult = {
          intent: result.intent.toLowerCase(),
          confidence: result.confidence,
          reasoning: result.reasoning || '',
          source: 'ai'
        };
        console.log('AI determined intent:', intentResult.intent, 'with confidence:', intentResult.confidence);
        if (intentResult.reasoning) {
          console.log('AI reasoning:', intentResult.reasoning);
        }

        // Log a human-readable interpretation of the intent determination
        if (intentResult.intent === 'image') {
          console.log(`✅ AI determined this is ${intentResult.confidence >= 0.9 ? 'definitely' : 'likely'} an image generation request`);
        } else {
          console.log(`❌ AI determined this is ${intentResult.confidence >= 0.9 ? 'definitely' : 'likely'} NOT an image generation request`);
        }

        return intentResult;
      } else {
        throw new Error('Invalid JSON structure');
      }
    } catch (parseError) {
      console.error('Error parsing JSON from API response:', parseError);
      throw new Error('Failed to parse classifier response');
    }
  } catch (error) {
    console.error('Error in AI-based intent classification:', error);
    // Last resort fallback with neutral confidence
    return { intent: 'text', confidence: 0.5, source: 'error-fallback' };
  }
};
