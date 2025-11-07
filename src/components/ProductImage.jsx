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
    
    // Check if it's a Railway S3 URL
    if (url.includes('storage.railway.app') || url.includes('b1.us-west-1.storage.railway.app')) {
      // Extract the path from the Railway URL
      // Format: https://b1.us-west-1.storage.railway.app/object-storage-xxx/productimages/brand/product.webp
      try {
        const urlObj = new URL(url);
        // Find the path after the bucket name (productimages/...)
        const pathMatch = urlObj.pathname.match(/\/productimages\/(.+)$/);
        if (pathMatch) {
          const imagePath = `productimages/${pathMatch[1]}`;
          
          // In development, Wasp client runs on :3000, server on :3001
          // In production, they're on the same origin
          // Use window.location to determine the correct server URL
          const isDevelopment = window.location.hostname === 'localhost' && window.location.port === '3000';
          const serverUrl = isDevelopment 
            ? 'http://localhost:3001'  // Wasp dev server
            : window.location.origin;  // Same origin in production
          
          return `${serverUrl}/api/images/proxy?path=${encodeURIComponent(imagePath)}`;
        }
      } catch (e) {
        console.warn('Failed to parse Railway URL:', url, e);
      }
    }
    
    // Not a Railway URL or parsing failed, return as-is
    return url;
  };

  // Build fallback chain based on variant
  // Use proxy for Railway S3 images to avoid CORS issues
  const getImageChain = () => {
    const chain = [];
    
    // Normal flow: try S3 images first (via proxy), then CDN fallback
    if (variant === 'full') {
      // Try optimized S3 images first, then fallback to CDN
      if (product.imageStoragePath) {
        const proxyUrl = convertToProxyUrl(product.imageStoragePath);
        if (proxyUrl) chain.push(proxyUrl);
      }
      if (product.imageThumbnailPath) {
        const proxyUrl = convertToProxyUrl(product.imageThumbnailPath);
        if (proxyUrl) chain.push(proxyUrl);
      }
    } else if (variant === 'thumbnail' || variant === 'auto') {
      // Try thumbnail first, then full-size, then CDN
      if (product.imageThumbnailPath) {
        const proxyUrl = convertToProxyUrl(product.imageThumbnailPath);
        if (proxyUrl) chain.push(proxyUrl);
      }
      if (product.imageStoragePath) {
        const proxyUrl = convertToProxyUrl(product.imageStoragePath);
        if (proxyUrl) chain.push(proxyUrl);
      }
    }
    
    // Always add CDN URL as final fallback (most reliable)
    if (product.imageUrl) {
      chain.push(product.imageUrl);
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

