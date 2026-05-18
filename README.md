### Build the deployment package
npm run build

### to Run linting
npm run lint

### to fix linting issues
npm run lint:fix  






# OpenAI Chat Interface

A modern web application that resembles the ChatGPT interface and leverages the OpenAI API to generate responses. This application is designed for educational purposes to help users understand how AI language models work.

## Features

### Core Functionality
- **OpenAI API Integration**: Seamless integration with OpenAI's powerful language models
- **ChatGPT-like Interface**: Clean, intuitive UI similar to ChatGPT
- **Conversation Management**: Save, name, and organize multiple conversations
- **File Context**: Upload files to provide context for AI responses
- **Image Generation**: Generate images using OpenAI's DALL-E

### Educational Features
- **Token Visualization**: View and highlight tokens used in requests and responses
- **API Response Inspection**: See the raw API responses for educational purposes
- **Parameter Adjustments**: Modify temperature, top_p, and max tokens to see how they affect responses

### Advanced Features
- **Multiple Export Formats**: Export conversations as PDF, TXT, or JSON
- **Document Parsing**: Support for various file formats (TXT, MD, PDF, DOCX, CSV, JSON, etc.)
- **Model Selection**: Choose between different OpenAI models (GPT-5, GPT-4o, GPT-4, GPT-3.5, etc.)
- **Responsive Design**: Works on desktop and mobile devices

## Technical Implementation

- Built with React for a responsive and interactive UI
- Uses modern JavaScript features and best practices
- Implements token highlighting and counting
- Supports markdown rendering in messages
- Handles file uploads and parsing
- Stores conversations in local storage for persistence
- Deploys easily to Netlify

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- OpenAI API key (for OpenAI functionality)
- Sparf AI API key (for Sparf AI functionality)

### Installation

1. Clone the repository
   ```
   git clone https://github.com/yourusername/sparf-gpt.git
   cd sparf-gpt
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Start the development server
   ```
   npm start
   ```

4. Build for production
   ```
   npm run build
   ```

### Deployment

The application is configured for easy deployment to Netlify. Simply connect your GitHub repository to Netlify, and it will automatically build and deploy the application.

## Usage

1. Enter your API keys in the settings panel
2. Start a new conversation
3. Type your message and send
4. Upload files for context if needed
5. Adjust model parameters as desired
6. Export or save conversations

## License

This project is licensed for educational purposes only.

