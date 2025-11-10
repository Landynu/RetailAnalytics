import sharp from 'sharp';
import { S3Client, PutObjectCommand, HeadObjectCommand, PutBucketCorsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Initialize S3 client (exported for use in other modules)
export const getS3Client = () => {
  let endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'us-east-1'; // Default to us-east-1 (change to us-west-1 for Railway if needed)
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 configuration missing. Please set S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY');
  }

  // Railway's object storage is Wasabi-backed in production
  // Only use Wasabi endpoint in production when Railway endpoint is detected
  // In development, use the configured endpoint as-is (preserves existing behavior)
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Only override endpoint in production when:
  // 1. Railway endpoint is detected, AND
  // 2. Wasabi endpoint is explicitly enabled OR endpoint already is Wasabi
  if (isProduction && endpoint.includes('storage.railway.app')) {
    const useWasabiEndpoint = process.env.S3_USE_WASABI_ENDPOINT === 'true' || 
                             endpoint.includes('wasabisys.com');
    
    if (useWasabiEndpoint) {
      // Railway storage is Wasabi-backed - use Wasabi endpoint for API calls
      // Wasabi endpoint format for path-style: https://s3.{region}.wasabisys.com
      const wasabiRegion = region || 'us-west-1';
      endpoint = `https://s3.${wasabiRegion}.wasabisys.com`;
      console.log('[S3Client] Using Wasabi endpoint (Railway storage is Wasabi-backed):', endpoint);
    }
  }
  // In development, always use the configured endpoint as-is (no changes)

  return new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for Railway/S3-compatible storage (path-style URLs)
  });
};

// Get public URL for an object
// Uses Railway endpoint for public URLs (what users see), not Wasabi endpoint (used for API calls)
const getPublicUrl = (storagePath) => {
  // Priority 1: Explicit public URL (most flexible)
  const publicUrl = process.env.S3_PUBLIC_URL;
  if (publicUrl) {
    return `${publicUrl}/${storagePath}`;
  }

  // Priority 2: Railway endpoint (for public-facing URLs in production)
  // In production, use Railway endpoint for public URLs even if API calls use Wasabi
  // In development, use the configured endpoint
  const railwayEndpoint = process.env.RAILWAY_S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET_NAME;
  const configuredEndpoint = process.env.S3_ENDPOINT;

  // Use Railway endpoint if set, otherwise fall back to configured endpoint
  const endpointForPublicUrl = railwayEndpoint || configuredEndpoint;

  if (endpointForPublicUrl && bucket) {
    // Railway S3-compatible storage uses path-style: https://{endpoint}/{bucket}/{path}
    try {
      const url = new URL(endpointForPublicUrl);
      // Remove trailing slash from pathname if present
      const cleanPath = url.pathname.replace(/\/$/, '');
      return `${url.protocol}//${url.hostname}${cleanPath}/${bucket}/${storagePath}`;
    } catch {
      // If endpoint is not a full URL, try common patterns
      // Pattern 1: https://{endpoint}/{bucket}/{path} (Railway path-style)
      if (endpointForPublicUrl.includes('://')) {
        // Already has protocol, use as-is
        return `${endpointForPublicUrl}/${bucket}/${storagePath}`;
      }
      // Pattern 2: https://{bucket}.{endpoint}/{path} (virtual-hosted style)
      return `https://${bucket}.${endpointForPublicUrl}/${storagePath}`;
    }
  }

  throw new Error('Cannot construct public URL. Please set S3_PUBLIC_URL, RAILWAY_S3_ENDPOINT, or ensure S3_ENDPOINT and S3_BUCKET_NAME are set');
};

// List objects in S3 bucket (for verification)
export const listS3Objects = async (prefix = 'productimages/', maxKeys = 1000) => {
  const s3Client = getS3Client();
  const bucket = process.env.S3_BUCKET_NAME;

  if (!bucket) {
    throw new Error('S3_BUCKET_NAME not set');
  }

  try {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    const response = await s3Client.send(command);
    return {
      objects: response.Contents || [],
      count: response.KeyCount || 0,
      isTruncated: response.IsTruncated || false,
    };
  } catch (error) {
    throw new Error(`Error listing S3 objects: ${error.message}`);
  }
};

// Configure CORS on the S3 bucket
export const configureBucketCORS = async () => {
  const s3Client = getS3Client();
  const bucket = process.env.S3_BUCKET_NAME;

  if (!bucket) {
    throw new Error('S3_BUCKET_NAME not set');
  }

  try {
    const corsConfiguration = {
      CORSRules: [
        {
          AllowedOrigins: ['*'], // Allow all origins - change to specific domains in production
          AllowedMethods: ['GET', 'HEAD'], // Only allow reading images
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
          MaxAgeSeconds: 3000, // Cache preflight for 50 minutes
        },
      ],
    };

    const command = new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: corsConfiguration,
    });

    await s3Client.send(command);
    console.log('✅ CORS configuration applied successfully to bucket:', bucket);
    return true;
  } catch (error) {
    console.error('❌ Error configuring CORS:', error.message);
    throw new Error(`Failed to configure CORS: ${error.message}`);
  }
};

// Download image from CDN
const downloadImageFromCDN = async (url) => {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RetailAnalytics/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check file size (max 50MB)
    if (buffer.length > 50 * 1024 * 1024) {
      throw new Error('Image file too large (max 50MB)');
    }

    return { buffer, contentType, originalSize: buffer.length };
  } catch (error) {
    if (error.message.includes('Failed to download')) {
      throw error;
    }
    throw new Error(`Error downloading image from ${url}: ${error.message}`);
  }
};

// Sanitize filename for storage
const sanitizeFilename = (brand, productName, extension = 'webp') => {
  const sanitize = (str) => {
    if (!str) return 'unknown';
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 100); // Limit length
  };

  const brandClean = sanitize(brand);
  const productClean = sanitize(productName);
  return `${brandClean}/${productClean}.${extension}`;
};

// Optimize image using sharp
const optimizeImage = async (imageBuffer, options = {}) => {
  const {
    maxWidth = 1200,
    quality = 85,
    format = 'webp',
  } = options;

  try {
    let pipeline = sharp(imageBuffer);

    // Get metadata
    const metadata = await pipeline.metadata();
    const originalWidth = metadata.width || 0;

    // Resize if needed (maintain aspect ratio, no upscaling)
    if (originalWidth > maxWidth) {
      pipeline = pipeline.resize(maxWidth, null, {
        withoutEnlargement: true,
        fit: 'inside',
      });
    }

    // Strip EXIF metadata first (before format conversion)
    pipeline = pipeline.withMetadata({ exif: null });

    // Convert to WebP and optimize
    if (format === 'webp') {
      pipeline = pipeline.webp({ quality });
      // Keep alpha for WebP (supports transparency), but remove if not needed
      // We'll let WebP encoder handle this automatically
    } else {
      pipeline = pipeline
        .jpeg({ quality: quality - 5 }) // Slightly lower quality for JPEG
        .removeAlpha(); // JPEG doesn't support transparency
    }

    const optimizedBuffer = await pipeline.toBuffer();
    return optimizedBuffer;
  } catch (error) {
    // Fallback to JPEG if WebP conversion fails
    if (format === 'webp') {
      console.warn(`WebP conversion failed, falling back to JPEG: ${error.message}`);
      return optimizeImage(imageBuffer, { ...options, format: 'jpeg', quality: 80 });
    }
    throw error;
  }
};

// Generate thumbnail
const generateThumbnail = async (imageBuffer, size = 300) => {
  try {
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(size, size, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .withMetadata({ exif: null }) // Strip EXIF first
      .webp({ quality: 85 }) // WebP supports transparency, encoder handles alpha automatically
      .toBuffer();

    return thumbnailBuffer;
  } catch (error) {
    throw new Error(`Error generating thumbnail: ${error.message}`);
  }
};

// Upload to S3
const uploadToS3 = async (imageBuffer, storagePath, contentType = 'image/webp') => {
  const s3Client = getS3Client();
  const bucket = process.env.S3_BUCKET_NAME;

  if (!bucket) {
    throw new Error('S3_BUCKET_NAME not set');
  }

  try {
    // Check if object already exists (skip if it does)
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: storagePath,
      }));
      console.log(`Object already exists at ${storagePath}, skipping upload`);
      return getPublicUrl(storagePath);
    } catch (error) {
      // Object doesn't exist, proceed with upload
      if (error.name !== 'NotFound') {
        throw error;
      }
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      Body: imageBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // Cache for 1 year
      // Note: CORS headers need to be configured on the bucket level in Railway
      // These metadata fields won't help with CORS, but they're good practice
      Metadata: {
        'access-control-allow-origin': '*', // This won't work - CORS must be set on bucket
      },
    });

    await s3Client.send(command);
    return getPublicUrl(storagePath);
  } catch (error) {
    throw new Error(`Error uploading to S3: ${error.message}`);
  }
};

// Complete migration for a single product
export const migrateProductImage = async (product, context) => {
  const { id, name, brand, imageUrl, imageMigrationStatus } = product;

  // Skip if no image URL
  if (!imageUrl) {
    return {
      productId: id,
      status: 'SKIPPED',
      reason: 'No image URL',
    };
  }

  // Skip if already migrated
  if (imageMigrationStatus === 'MIGRATED') {
    return {
      productId: id,
      status: 'SKIPPED',
      reason: 'Already migrated',
    };
  }

  try {
    // Download image
    const { buffer, contentType, originalSize } = await downloadImageFromCDN(imageUrl);

    // Optimize full-size image
    const optimizedBuffer = await optimizeImage(buffer, {
      maxWidth: 1200,
      quality: 85,
      format: 'webp',
    });

    // Generate thumbnail
    const thumbnailBuffer = await generateThumbnail(buffer, 300);

    // Generate storage paths
    const fullSizePath = `productimages/${sanitizeFilename(brand, name, 'webp')}`;
    const thumbnailPath = `productimages/${sanitizeFilename(brand, name, 'webp').replace('.webp', '-thumb.webp')}`;

    // Upload both images
    const fullSizeUrl = await uploadToS3(optimizedBuffer, fullSizePath, 'image/webp');
    const thumbnailUrl = await uploadToS3(thumbnailBuffer, thumbnailPath, 'image/webp');

    // Update database - store both path and full URL for flexibility
    await context.entities.ProductCatalog.update({
      where: { id },
      data: {
        imageStoragePath: fullSizeUrl, // Store full URL for easy client access
        imageThumbnailPath: thumbnailUrl, // Store full URL for easy client access
        imageOriginalSize: originalSize,
        imageOptimizedSize: optimizedBuffer.length,
        imageMigratedAt: new Date(),
        imageMigrationStatus: 'MIGRATED',
      },
    });

    const compressionRatio = ((1 - optimizedBuffer.length / originalSize) * 100).toFixed(1);

    return {
      productId: id,
      status: 'MIGRATED',
      originalSize,
      optimizedSize: optimizedBuffer.length,
      compressionRatio: `${compressionRatio}%`,
      fullSizeUrl,
      thumbnailUrl,
    };
  } catch (error) {
    // Mark as failed
    await context.entities.ProductCatalog.update({
      where: { id },
      data: {
        imageMigrationStatus: 'FAILED',
      },
    }).catch(() => {
      // Ignore update errors
    });

    return {
      productId: id,
      status: 'FAILED',
      error: error.message,
    };
  }
};

// Batch migration
export const migrateAllProductImages = async (context, batchSize = 10, maxProducts = null) => {
  const results = {
    migrated: [],
    failed: [],
    skipped: [],
    total: 0,
  };

  try {
    console.log('📦 Fetching products that need image migration...');
    
    // Count total products that need migration
    const totalCount = await context.entities.ProductCatalog.count({
      where: {
        imageUrl: { not: null },
        OR: [
          { imageMigrationStatus: null },
          { imageMigrationStatus: 'PENDING' },
          { imageMigrationStatus: 'FAILED' },
        ],
      },
    });

    console.log(`📊 Found ${totalCount} products to migrate`);
    
    if (maxProducts) {
      console.log(`⚠️ Limiting to first ${maxProducts} products`);
    }
    
    if (totalCount === 0) {
      console.log('✅ No products need migration. All done!');
      return results;
    }

    // Process in chunks to handle large datasets
    const fetchChunkSize = maxProducts || 1000; // Fetch 1000 at a time to avoid memory issues
    let processedCount = 0;
    let offset = 0;
    
    while (offset < totalCount && (!maxProducts || processedCount < maxProducts)) {
      const remaining = maxProducts ? maxProducts - processedCount : totalCount - offset;
      const currentChunkSize = Math.min(fetchChunkSize, remaining);
      
      // Get products for this chunk
      const products = await context.entities.ProductCatalog.findMany({
        where: {
          imageUrl: { not: null },
          OR: [
            { imageMigrationStatus: null },
            { imageMigrationStatus: 'PENDING' },
            { imageMigrationStatus: 'FAILED' },
          ],
        },
        take: currentChunkSize,
        skip: offset,
        orderBy: { id: 'asc' }, // Consistent ordering
      });

      if (products.length === 0) {
        console.log('No more products to process.');
        break;
      }

      results.total += products.length;
      const totalBatches = Math.ceil(products.length / batchSize);
      console.log(`📦 Chunk ${Math.floor(offset / fetchChunkSize) + 1}: Processing ${products.length} products (${totalBatches} batches)...`);
      
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        const batchResults = await Promise.allSettled(
          batch.map(product => migrateProductImage(product, context))
        );

        let batchMigrated = 0;
        let batchFailed = 0;
        let batchSkipped = 0;

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const productResult = result.value;
          if (productResult.status === 'MIGRATED') {
            results.migrated.push(productResult);
            batchMigrated++;
          } else if (productResult.status === 'FAILED') {
            results.failed.push(productResult);
            batchFailed++;
            // Only log failures for debugging
            console.log(`  ❌ Failed: ${batch[index].name} - ${productResult.error}`);
          } else {
            results.skipped.push(productResult);
            batchSkipped++;
          }
        } else {
          results.failed.push({
            productId: batch[index].id,
            status: 'FAILED',
            error: result.reason?.message || 'Unknown error',
          });
          batchFailed++;
          console.log(`  ❌ Failed: ${batch[index].name} - ${result.reason?.message || 'Unknown error'}`);
        }
      });

      console.log(`  Batch ${batchNumber}/${totalBatches}: ${batchMigrated} migrated, ${batchFailed} failed, ${batchSkipped} skipped`);

        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < products.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      processedCount += products.length;
      offset += products.length;
      
      console.log(`✅ Chunk complete: ${processedCount}/${totalCount} (${Math.round(processedCount / totalCount * 100)}%) - ${results.migrated.length} migrated, ${results.failed.length} failed`);
    }
    
    console.log(`\n🎉 Migration complete!`);
    console.log(`📊 Summary: ${results.migrated.length} migrated, ${results.failed.length} failed, ${results.skipped.length} skipped`);

    return results;
  } catch (error) {
    throw new Error(`Error migrating product images: ${error.message}`);
  }
};

