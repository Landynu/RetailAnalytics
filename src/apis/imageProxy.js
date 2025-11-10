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

    // Log S3 configuration for debugging (without sensitive data)
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'us-east-1';
    console.log('[ImageProxy] S3 Config:', {
      endpoint: endpoint ? `${endpoint.substring(0, 30)}...` : 'missing',
      region,
      bucket: bucket ? `${bucket.substring(0, 20)}...` : 'missing',
      imagePath: imagePath.substring(0, 50)
    });

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
    console.error('Error proxying image:', {
      message: error.message,
      name: error.name,
      code: error.Code || error.code,
      endpoint: process.env.S3_ENDPOINT ? `${process.env.S3_ENDPOINT.substring(0, 30)}...` : 'missing',
      bucket: process.env.S3_BUCKET_NAME ? `${process.env.S3_BUCKET_NAME.substring(0, 20)}...` : 'missing',
      imagePath: imagePath.substring(0, 50)
    });
    
    if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
      res.status(404).json({ error: 'Image not found' });
      return;
    }
    
    // Check for endpoint mismatch error
    if (error.message.includes('must be addressed using the specified endpoint') || 
        error.Code === 'PermanentRedirect' || 
        error.code === 'PermanentRedirect') {
      console.error('[ImageProxy] S3 Endpoint mismatch. Current endpoint:', process.env.S3_ENDPOINT);
      
      // Try to extract the correct endpoint from the error
      let correctEndpoint = null;
      if (error.$metadata && error.$metadata.httpStatusCode === 301) {
        // Permanent redirect - check if there's a location header or endpoint in the error
        correctEndpoint = error.Endpoint || error.endpoint;
      }
      
      // Also check the error object directly for endpoint info
      if (!correctEndpoint && error.endpoint) {
        correctEndpoint = error.endpoint;
      }
      
      // Check if endpoint is in the error message or metadata
      if (!correctEndpoint) {
        // Try to extract from error message or metadata
        const endpointMatch = error.message?.match(/endpoint[:\s]+([^\s,]+)/i) || 
                             error.$response?.headers?.['x-amz-endpoint'] ||
                             error.$metadata?.endpoint;
        if (endpointMatch) {
          correctEndpoint = typeof endpointMatch === 'string' ? endpointMatch : endpointMatch[1];
        }
      }
      
      if (correctEndpoint) {
        // Ensure it's a full URL with protocol
        if (!correctEndpoint.startsWith('http://') && !correctEndpoint.startsWith('https://')) {
          correctEndpoint = `https://${correctEndpoint}`;
        }
        console.error('[ImageProxy] Correct endpoint should be:', correctEndpoint);
        console.error('[ImageProxy] Please update S3_ENDPOINT environment variable to:', correctEndpoint);
      } else {
        // Based on the logs, the correct endpoint appears to be Wasabi
        console.error('[ImageProxy] Based on error, endpoint should be: https://object-storage.s3.wasabisys.com');
        correctEndpoint = 'https://object-storage.s3.wasabisys.com';
      }
      
      res.status(500).json({ 
        error: 'S3 endpoint configuration error. Please check S3_ENDPOINT environment variable.',
        details: 'The bucket endpoint does not match the configured endpoint.',
        currentEndpoint: process.env.S3_ENDPOINT ? `${process.env.S3_ENDPOINT.substring(0, 50)}...` : 'missing',
        suggestedEndpoint: correctEndpoint || 'Check Railway S3 service settings'
      });
      return;
    }
    
    res.status(500).json({ error: `Failed to proxy image: ${error.message}` });
  }
};

