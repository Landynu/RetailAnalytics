import express from 'express';
// Import cache module to initialize Redis connection on server startup
// The cache module will handle connection lazily, so just importing it is enough
import './cache.js';

export const serverMiddlewareFn = (middlewareConfig) => {
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
