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

  // Build fallback chain based on variant
  // TEMPORARY: Skip S3 images if they have CORS issues (Railway S3 needs CORS configuration)
  // Once CORS is configured on Railway, S3 images will work and this logic can be simplified
  const getImageChain = () => {
    const chain = [];
    const hasS3Images = product.imageStoragePath || product.imageThumbnailPath;
    const s3Url = product.imageStoragePath || product.imageThumbnailPath;
    const isRailwayS3 = s3Url && s3Url.includes('storage.railway.app');
    
    // For now, prefer CDN images if Railway S3 is detected (CORS not configured)
    // TODO: Once CORS is configured on Railway, remove this check and use S3 images first
    if (isRailwayS3 && product.imageUrl) {
      // Skip S3, use CDN directly
      chain.push(product.imageUrl);
      return chain;
    }
    
    // Normal flow: try S3 images first, then CDN fallback
    if (variant === 'full') {
      // Try optimized S3 images first, then fallback to CDN
      if (product.imageStoragePath) chain.push(product.imageStoragePath);
      if (product.imageThumbnailPath) chain.push(product.imageThumbnailPath);
    } else if (variant === 'thumbnail' || variant === 'auto') {
      // Try thumbnail first, then full-size, then CDN
      if (product.imageThumbnailPath) chain.push(product.imageThumbnailPath);
      if (product.imageStoragePath) chain.push(product.imageStoragePath);
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

  // Debug logging (remove in production if needed)
  if (!hasImage && product.imageUrl) {
    console.debug('ProductImage: No image URL found for', product.name, {
      imageStoragePath: product.imageStoragePath,
      imageThumbnailPath: product.imageThumbnailPath,
      imageUrl: product.imageUrl,
      variant
    });
  }

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
            // Check if this is a CORS error (OpaqueResponseBlocking)
            const isCorsError = imageUrl && imageUrl.includes('storage.railway.app');
            
            if (isCorsError) {
              console.warn(`ProductImage: CORS error loading S3 image for ${product.name}, falling back to CDN...`);
            } else {
              console.warn('ProductImage: Failed to load image', imageUrl, 'for product', product.name);
            }
            
            // Try next image in fallback chain
            if (currentImageIndex < imageChain.length - 1) {
              setCurrentImageIndex(currentImageIndex + 1);
              setImageLoading(true);
              setImageError(false);
            } else {
              // All images failed
              setImageError(true);
              setImageLoading(false);
              if (product.imageUrl) {
                console.warn(`ProductImage: All images failed for ${product.name}, including fallback to ${product.imageUrl}`);
              }
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

