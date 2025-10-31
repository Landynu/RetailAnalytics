// Simple script to call the enrichProductFormats action
// Run with: node run-format-enrichment.js

const response = await fetch('http://localhost:3000/api/enrichProductFormats', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({})
});

const result = await response.json();
console.log('Format enrichment result:', result);
