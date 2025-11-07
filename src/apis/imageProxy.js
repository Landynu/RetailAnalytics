import { HttpError } from 'wasp/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '../services/imageMigration.js';

export const proxyImage = async (req, res, context) => {
  // Extract image path from URL
  // Expected format: /api/images/proxy?path=productimages/brand/product.webp
  let imagePath = null;
  
  // Try multiple ways to get the query parameter (Wasp/Express compatibility)
  if (req.query && req.query.path) {
    imagePath = req.query.path;
  } else if (req.url) {
    // Parse from URL directly
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      imagePath = url.searchParams.get('path');
    } catch (e) {
      // Fallback: manual parsing
      const match = req.url.match(/[?&]path=([^&]+)/);
      if (match) {
        imagePath = match[1];
      }
    }
  }
  
  // Decode URL-encoded path (e.g., productimages%2Fbrand%2Fproduct.webp -> productimages/brand/product.webp)
  if (imagePath) {
    try {
      imagePath = decodeURIComponent(imagePath);
    } catch (e) {
      console.error('Failed to decode image path:', imagePath, e);
      res.status(400).json({ error: 'Invalid image path encoding' });
      return;
    }
  }

  if (!imagePath) {
    console.error('No image path provided. Request:', {
      url: req.url,
      query: req.query,
      method: req.method,
      headers: req.headers
    });
    res.status(400).json({ error: 'Image path is required' });
    return;
  }

  // Security: Only allow paths starting with productimages/
  if (!imagePath.startsWith('productimages/')) {
    res.status(403).json({ error: 'Invalid image path' });
    return;
  }

  try {
    const s3Client = getS3Client();
    const bucket = process.env.S3_BUCKET_NAME;

    if (!bucket) {
      res.status(500).json({ error: 'S3 bucket not configured' });
      return;
    }

    // Fetch image from S3
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: imagePath,
    });

    const s3Response = await s3Client.send(command);

    // Get content type from S3 metadata or default to image/webp
    const contentType = s3Response.ContentType || 'image/webp';
    const contentLength = s3Response.ContentLength;
    const lastModified = s3Response.LastModified;
    const etag = s3Response.ETag;

    // Set CORS headers (since this is served from our server, no CORS issues)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Last-Modified, ETag');
    
    // Set Cross-Origin-Resource-Policy to allow cross-origin image loading
    // This is required for <img> tags loading from a different origin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // Set caching headers
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', contentType);
    
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    if (lastModified) {
      res.setHeader('Last-Modified', lastModified.toUTCString());
    }
    if (etag) {
      res.setHeader('ETag', etag);
    }

    // Handle HEAD requests (for preflight checks)
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }

    // Stream the image data
    const stream = s3Response.Body;
    if (stream) {
      // Convert stream to buffer and send
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      res.status(200).send(buffer);
    } else {
      res.status(500).json({ error: 'No image data received from S3' });
    }
  } catch (error) {
    console.error('Error proxying image:', error.message);
    if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
      res.status(404).json({ error: 'Image not found' });
      return;
    }
    res.status(500).json({ error: `Failed to proxy image: ${error.message}` });
  }
};

