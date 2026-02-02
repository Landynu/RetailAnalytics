import { HttpError } from 'wasp/server';
import { migrateAllProductImages, configureBucketCORS } from '../services/imageMigration.js';

export const configureS3CORS = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log('🔧 Configuring CORS on S3 bucket...')

  try {
    await configureBucketCORS()
    return { success: true, message: 'CORS configured successfully' }
  } catch (error) {
    console.error('❌ Failed to configure CORS:', error.message)
    throw new HttpError(500, `Failed to configure CORS: ${error.message}`)
  }
}

export const migrateProductImages = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log('🖼️ Starting product image migration...')

  const batchSize = args?.batchSize || 10

  try {
    const results = await migrateAllProductImages(context, batchSize)

    console.log(`✅ Image migration complete: ${results.migrated.length} migrated, ${results.failed.length} failed, ${results.skipped.length} skipped`)

    return {
      migrated: results.migrated.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      total: results.total,
      details: {
        migrated: results.migrated.slice(0, 10), // Return first 10 for preview
        failed: results.failed.slice(0, 10),
      }
    }
  } catch (error) {
    console.error('❌ Image migration error:', error)
    throw new HttpError(500, `Image migration failed: ${error.message}`)
  }
}

export const checkS3Storage = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  try {
    const { listS3Objects } = await import('../services/imageMigration.js')
    const result = await listS3Objects('productimages/', 1000)

    return {
      objectCount: result.count,
      sampleObjects: result.objects.slice(0, 20).map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified
      })),
      isTruncated: result.isTruncated,
      message: `Found ${result.count} objects in S3 bucket${result.isTruncated ? ' (showing first 1000)' : ''}`
    }
  } catch (error) {
    console.error('❌ Error checking S3 storage:', error.message)
    throw new HttpError(500, `Failed to check S3 storage: ${error.message}`)
  }
}

export const checkImageMigrationStatus = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  try {
    const stats = await context.entities.ProductCatalog.groupBy({
      by: ['imageMigrationStatus'],
      _count: { id: true }
    })

    const totalWithImages = await context.entities.ProductCatalog.count({
      where: { imageUrl: { not: null } }
    })

    const migrated = await context.entities.ProductCatalog.count({
      where: { imageMigrationStatus: 'MIGRATED' }
    })

    const withS3Paths = await context.entities.ProductCatalog.count({
      where: {
        OR: [
          { imageStoragePath: { not: null } },
          { imageThumbnailPath: { not: null } }
        ]
      }
    })

    return {
      totalWithImages,
      migrated,
      withS3Paths,
      statusBreakdown: stats.reduce((acc, stat) => {
        acc[stat.imageMigrationStatus || 'NULL'] = stat._count.id
        return acc
      }, {}),
      message: `${migrated} products migrated, ${withS3Paths} have S3 paths stored`
    }
  } catch (error) {
    console.error('❌ Error checking migration status:', error.message)
    throw new HttpError(500, `Failed to check migration status: ${error.message}`)
  }
}
