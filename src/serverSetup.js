import express from 'express';
// Import cache module to initialize Redis connection on server startup
// The cache module will handle connection lazily, so just importing it is enough
import './cache.js';

export const serverMiddlewareFn = (middlewareConfig) => {
  // CORS configuration - must be set before other middleware
  const allowedOrigins = [
    'https://retail-analytics-client-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173', // Vite dev server default port
  ];

  middlewareConfig.set('cors', (req, res, next) => {
    const origin = req.headers.origin;
    
    // When Access-Control-Allow-Credentials is true, we cannot use '*'
    // We must specify the exact origin or allow all in dev
    if (origin) {
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else if (process.env.NODE_ENV !== 'production') {
        // In development, allow any origin (more permissive for testing)
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      // In production, if origin not allowed, don't set header (will be blocked by browser)
    } else {
      // Same-origin request (no origin header), allow it
      // For same-origin, we can use '*' or omit the header
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    // Set CORS headers
    // Note: When using credentials, origin must be specific (not '*')
    if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production')) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    next();
  });

  // Configure Express to handle larger payloads for CSV uploads
  middlewareConfig.set('express.json', express.json({ limit: '10mb' }));
  middlewareConfig.set('express.urlencoded', express.urlencoded({ limit: '10mb', extended: true }));
  
  // Add cache headers for static assets to improve performance
  middlewareConfig.set('staticCache', (req, res, next) => {
    // Cache static assets (js, css, images, fonts) aggressively
    if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
      // Cache for 1 year - these are versioned/hashed files
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Cache HTML files for shorter duration to allow quick updates
    else if (req.url.endsWith('.html') || req.url === '/') {
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    }
    next();
  });
  
  return middlewareConfig;
};
