import express from 'express';

// Middleware to handle larger payloads for CSV uploads
export const payloadSizeMiddleware = (req, res, next) => {
  // Increase payload size limit to 50MB for CSV uploads
  express.json({ limit: '50mb' })(req, res, next);
};

export default payloadSizeMiddleware;
