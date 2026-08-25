// Server-side render test to catch any JSX / MUI runtime rendering errors
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './src/App.jsx';

try {
  console.log('🧪 Testing React component render with renderToString...');
  const html = renderToString(<App />);
  console.log(`✅ App rendered successfully! HTML length: ${html.length} chars.`);
} catch (err) {
  console.error('❌ React render failed with error:', err);
  process.exit(1);
}
