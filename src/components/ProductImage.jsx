import React, { useState, useEffect } from 'react';

/**
 * ProductImage - Reusable component for displaying product images
 * Supports optimized S3 images with fallback chain:
 * 1. imageStoragePath (optimized full-size)
 * 2. imageThumbnailPath (thumbnail)
 * 3. imageUrl (original CDN)
 * 4. Placeholder
 * 
 * @param {Object} product - Product object with image fields
 * @param {string} variant - 'full' | 'thumbnail' | 'auto'
 * @param {string} className - Additional CSS classes
 * @param {boolean} lazy - Enable lazy loading
 */
const ProductImage = ({ 
  product, 
  variant = 'auto',
  className = '',
  lazy = true,
  onClick
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Convert Railway S3 URL to proxy URL to avoid CORS issues
  const convertToProxyUrl = (url) => {
    if (!url) return null;
    
    // Check if it's a Railway S3 URL (multiple possible patterns)
    const isRailwayS3 = url.includes('storage.railway.app') || 
                       url.includes('b1.us-west-1.storage.railway.app') ||
                       (url.includes('railway.app') && url.includes('/productimages/'));
    
    if (isRailwayS3) {
      // Extract the path from the Railway URL
      // Format: https://b1.us-west-1.storage.railway.app/object-storage-xxx/productimages/brand/product.webp
      // Or: https://{endpoint}/{bucket}/productimages/brand/product.webp
      try {
        const urlObj = new URL(url);
        // Find the path after the bucket name (productimages/...)
        // Try multiple patterns to handle different Railway URL formats
        let pathMatch = urlObj.pathname.match(/\/productimages\/(.+)$/);
        
        // If no match, try matching from the end (in case bucket name is in path)
        if (!pathMatch) {
          pathMatch = urlObj.pathname.match(/productimages\/(.+)$/);
        }
        
        if (pathMatch) {
          const imagePath = `productimages/${pathMatch[1]}`;
          
          // In development, Wasp client runs on :3000, server on :3001
          // In production, client and server are on different subdomains
          const isDevelopment = window.location.hostname === 'localhost' && window.location.port === '3000';
          let serverUrl;
          
          if (isDevelopment) {
            serverUrl = 'http://localhost:3001';  // Wasp dev server
          } else {
            // Production: client and server are on different subdomains
            // Client: retail-analytics-client-production.up.railway.app or analytics.wiidsk.ca
            // Server: retail-analytics-server-production.up.railway.app
            const hostname = window.location.hostname;
            if (hostname.includes('analytics.wiidsk.ca')) {
              // Custom domain pointing to client - server is still on Railway subdomain
              // Use the Railway server subdomain for API calls
              serverUrl = 'https://retail-analytics-server-production.up.railway.app';
            } else if (hostname.includes('retail-analytics-client')) {
              // Railway client subdomain - use server subdomain with https
              const serverHostname = hostname.replace('client', 'server');
              serverUrl = `https://${serverHostname}`;
            } else {
              // Fallback: try same origin (in case server is proxied)
              serverUrl = window.location.origin;
            }
          }
          
          const proxyUrl = `${serverUrl}/api/images/proxy?path=${encodeURIComponent(imagePath)}`;
          
          // Debug logging (both dev and production for troubleshooting)
          const isProduction = window.location.hostname.includes('retail-analytics');
          if (isDevelopment || isProduction) {
            console.debug('[ProductImage] Converting Railway URL to proxy:', { 
              original: url, 
              proxy: proxyUrl,
              imagePath,
              serverUrl
            });
          }
          
          return proxyUrl;
        } else {
          // Log if we detected Railway but couldn't extract path
          console.warn('[ProductImage] Railway URL detected but path extraction failed:', url, 'pathname:', urlObj.pathname);
        }
      } catch (e) {
        console.warn('[ProductImage] Failed to parse Railway URL:', url, e);
      }
    }
    
    // Not a Railway URL or parsing failed, return as-is
    return url;
  };

  // Build fallback chain based on variant
  // Use proxy for Railway S3 images to avoid CORS issues
  const getImageChain = () => {
    const chain = [];
    const isDevelopment = window.location.hostname === 'localhost';
    
    // Debug: Log what image fields we have
    if (isDevelopment || window.location.hostname.includes('retail-analytics')) {
      console.debug('[ProductImage] Image fields for product:', {
        id: product.id,
        name: product.name,
        imageStoragePath: product.imageStoragePath,
        imageThumbnailPath: product.imageThumbnailPath,
        imageUrl: product.imageUrl,
        imageMigrationStatus: product.imageMigrationStatus
      });
    }
    
    // Normal flow: try S3 images first (via proxy), then CDN fallback
    if (variant === 'full') {
      // Try optimized S3 images first, then fallback to CDN
      if (product.imageStoragePath) {
        const proxyUrl = convertToProxyUrl(product.imageStoragePath);
        if (proxyUrl) {
          chain.push(proxyUrl);
          if (isDevelopment || window.location.hostname.includes('retail-analytics')) {
            console.debug('[ProductImage] Added imageStoragePath to chain:', proxyUrl);
          }
        } else {
          // URL wasn't converted to proxy - might not be Railway URL
          if (isDevelopment || window.location.hostname.includes('retail-analytics')) {
            console.warn('[ProductImage] imageStoragePath not converted to proxy:', product.imageStoragePath);
          }
        }
      }
      if (product.imageThumbnailPath) {
        const proxyUrl = convertToProxyUrl(product.imageThumbnailPath);
        if (proxyUrl) {
          chain.push(proxyUrl);
          if (isDevelopment || window.location.hostname.includes('retail-analytics')) {
            console.debug('[ProductImage] Added imageThumbnailPath to chain:', proxyUrl);
          }
        }
      }
    } else if (variant === 'thumbnail' || variant === 'auto') {
      // Try thumbnail first, then full-size, then CDN
      if (product.imageThumbnailPath) {
        const proxyUrl = convertToProxyUrl(product.imageThumbnailPath);
        if (proxyUrl) {
          chain.push(proxyUrl);
          if (isDevelopment || window.location.hostname.includes('retail-analytics')) {
            console.debug('[ProductImage] Added imageThumbnailPath to chain:', proxyUrl);
          }
        }
      }
      if (product.imageStoragePath) {
        const proxyUrl = convertToProxyUrl(product.imageStoragePath);
        if (proxyUrl) {
          chain.push(proxyUrl);
          if (isDevelopment || window.location.hostname.includes('retail-analytics')) {
            console.debug('[ProductImage] Added imageStoragePath to chain:', proxyUrl);
          }
        }
      }
    }
    
    // Always add CDN URL as final fallback (most reliable)
    if (product.imageUrl) {
      chain.push(product.imageUrl);
      if (isDevelopment || window.location.hostname.includes('retail-analytics')) {
        console.debug('[ProductImage] Added imageUrl (CDN) to chain as fallback:', product.imageUrl);
      }
    }
    
    if (isDevelopment || window.location.hostname.includes('retail-analytics')) {
      console.debug('[ProductImage] Final image chain:', chain);
    }
    
    return chain;
  };

  const imageChain = getImageChain();
  const imageUrl = imageChain[currentImageIndex] || null;
  const hasImage = !!imageUrl;

  // Reset when product changes
  useEffect(() => {
    setCurrentImageIndex(0);
    setImageError(false);
    setImageLoading(true);
  }, [product.id, variant]);

  return (
    <div className={`relative ${className}`}>
      {imageLoading && hasImage && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />
      )}
      {hasImage ? (
        <img
          src={imageUrl}
          alt={product.name || 'Product image'}
          className={`w-full h-full object-cover rounded ${
            imageLoading ? 'opacity-0' : 'opacity-100'
          } transition-opacity duration-300 ${onClick ? 'cursor-pointer' : ''}`}
          loading={lazy ? 'lazy' : 'eager'}
          onLoad={() => setImageLoading(false)}
          onError={(e) => {
            // Try next image in fallback chain
            if (currentImageIndex < imageChain.length - 1) {
              setCurrentImageIndex(currentImageIndex + 1);
              setImageLoading(true);
              setImageError(false);
            } else {
              // All images failed
              setImageError(true);
              setImageLoading(false);
            }
          }}
          onClick={onClick}
        />
      ) : (
        <div className="w-full h-full bg-gray-200 rounded flex items-center justify-center">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
    </div>
  );
};

export default ProductImage;

