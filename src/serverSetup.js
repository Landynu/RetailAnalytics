import express from 'express';
// Import cache module to initialize Redis connection on server startup
// The cache module will handle connection lazily, so just importing it is enough
import './cache.js';

export const serverMiddlewareFn = (middlewareConfig) => {
  // CORS configuration - must be set before other middleware
  // Use a very early position to ensure it runs before Wasp's built-in routes
  const allowedOrigins = [
    'https://retail-analytics-client-production.up.railway.app',
    'https://analytics.wiidsk.ca', // Custom domain
    'http://localhost:3000',
    'http://localhost:3001', // Wasp dev server port
    'http://localhost:5173', // Vite dev server default port
  ];

  // Use 'cors' as the key - Wasp will apply this early in the middleware chain
  middlewareConfig.set('cors', (req, res, next) => {
    const origin = req.headers.origin;
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // In development, be very permissive - allow any origin
    if (isDevelopment) {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      } else {
        // No origin header (same-origin or direct request) - allow all
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    } else {
      // Production: only allow specific origins
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      } else if (!origin) {
        // Same-origin request in production
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      // If origin not allowed in production, don't set header (browser will block)
    }

    // Always set these headers (they're safe even if origin isn't allowed)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cookie');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Set-Cookie');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight OPTIONS requests - MUST respond before other middleware
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

  // Configure Content-Security-Policy (CSP)
  // Allow inline scripts for Wasp's generated code
  // Only apply to HTML responses, not static assets or API endpoints
  middlewareConfig.set('csp', (req, res, next) => {
    // Skip CSP for static assets (js, css, images, fonts, etc.)
    // These don't need CSP headers
    if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json)$/)) {
      next();
      return;
    }

    // Skip CSP for API endpoints
    if (req.url.startsWith('/api/') || req.url.startsWith('/operations/') || req.url.startsWith('/auth/')) {
      next();
      return;
    }

    // Set permissive CSP that allows Wasp's inline scripts
    // This overrides any default CSP from Railway or Wasp
    const cspDirectives = [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: http: data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:",
      "style-src 'self' 'unsafe-inline' https: http:",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data: https: http:",
      "connect-src 'self' https: http: ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ];

    // Set CSP header - this will override any existing CSP
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

    next();
  });
  
  return middlewareConfig;
};
