import express from 'express';

export const serverMiddlewareFn = (middlewareConfig) => {
  // Configure Express to handle larger payloads for CSV uploads
  middlewareConfig.set('express.json', express.json({ limit: '10mb' }));
  middlewareConfig.set('express.urlencoded', express.urlencoded({ limit: '10mb', extended: true }));
  
  return middlewareConfig;
};
