import React, { useState } from 'react';
import { Link } from 'wasp/client/router';
import { useQuery } from 'wasp/client/operations';
import { getProductCatalog, getClassifications, getCategoryDefinitions } from 'wasp/client/operations';
import { updateProductEnrichment, syncAllProductEnrichments } from 'wasp/client/operations';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Search, RefreshCw, Sparkles } from 'lucide-react';
import StrainTypeCell from '../components/StrainTypeCell';
import CategoryCell from '../components/CategoryCell';
import SubcategoryCell from '../components/SubcategoryCell';
import ProductImage from '../components/ProductImage';
import { migrateProductImages, configureS3CORS } from 'wasp/client/operations';

const ProductCatalog = () => {
  const [filters, setFilters] = useState({
    search: '',
    brands: [],
    categories: [],
    strainTypes: [],
    inStock: false
  });
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  
  const { data: catalogData, isLoading, refetch } = useQuery(getProductCatalog, {
    filters,
    limit,
    offset
  });
  
  const { data: classifications } = useQuery(getClassifications);
  const { data: categoryDefinitions } = useQuery(getCategoryDefinitions);

  const handleUpdateField = async (productId, field, value) => {
    try {
      await updateProductEnrichment({
        productId,
        updates: { [field]: value }
      });
      // Refetch to get updated data
      setTimeout(() => refetch(), 300);
    } catch (error) {
      alert('Error updating: ' + error.message);
    }
  };

  const handleCategoryChange = (productId) => {
    // Refetch when category changes to update subcategory options
    setTimeout(() => refetch(), 300);
  };

  const products = catalogData?.products || [];
  const total = catalogData?.total || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Product Catalog</h1>
          <p className="text-sm text-gray-500 mt-1">Enrich product data - cannabinoids, classifications, categories, and formats</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{total} products</Badge>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={async () => {
              if (confirm('This will sync existing product data (strainType → classification, categories → category definitions). Continue?')) {
                try {
                  const result = await syncAllProductEnrichments();
                  alert(`Sync complete!\nClassifications: ${result.classifications.synced} synced\nCategories: ${result.categories.synced} synced`);
                  refetch();
                } catch (error) {
                  alert('Error: ' + error.message);
                }
              }
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Sync Enrichments
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={async () => {
              if (confirm('Configure CORS on S3 bucket to allow images to load in the browser? This will allow all origins to access images.')) {
                try {
                  const result = await configureS3CORS();
                  alert('✅ CORS configured successfully! Images should now load properly.');
                } catch (error) {
                  alert('❌ Error configuring CORS: ' + error.message + '\n\nYou may need to configure CORS manually in Railway object storage settings.');
                }
              }
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Configure CORS
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={async () => {
              if (confirm('This will download and optimize all product images from CDN to S3 storage. This may take several minutes. Continue?')) {
                try {
                  console.log('Starting image migration...');
                  const result = await migrateProductImages({ batchSize: 10 });
                  console.log('Migration result:', result);
                  
                  const message = `Migration Complete!\n\n` +
                    `Total: ${result.total}\n` +
                    `✅ Migrated: ${result.migrated}\n` +
                    `❌ Failed: ${result.failed}\n` +
                    `⏭️ Skipped: ${result.skipped}\n\n` +
                    `Check the server console for detailed logs.`;
                  
                  alert(message);
                  refetch();
                } catch (error) {
                  console.error('Migration error:', error);
                  alert('Error: ' + error.message + '\n\nCheck the server console for details.');
                }
              }
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Migrate Images
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>
          <Button
            variant={filters.inStock ? "default" : "outline"}
            onClick={() => setFilters({ ...filters, inStock: !filters.inStock })}
          >
            {filters.inStock ? '✓ In Stock Only' : 'Show In Stock Only'}
          </Button>
        </div>
      </Card>

      {/* Products Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Image</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Brand</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Category</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Subcategory</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Classification</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">THC</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">CBD</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Format</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    Loading products...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No products found
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <ProductImage 
                        product={product} 
                        variant="thumbnail"
                        className="w-16 h-16"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link 
                        to={`/product/${product.id}`}
                        className="font-medium text-teal-600 hover:text-teal-800 hover:underline"
                      >
                        {product.name}
                      </Link>
                      <div className="text-xs text-gray-500">{product.gtin}</div>
                    </td>
                    <td className="px-4 py-3">{product.brand || '-'}</td>
                    <td className="px-4 py-3">
                      <CategoryCell 
                        product={product}
                        categoryDefinitions={categoryDefinitions || []}
                        onCategoryChange={() => handleCategoryChange(product.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <SubcategoryCell 
                        product={product}
                        categoryDefinitions={categoryDefinitions || []}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StrainTypeCell 
                        product={product}
                        classifications={classifications || []}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        step="0.1"
                        value={product.thc || ''}
                        onChange={(e) => handleUpdateField(product.id, 'thc', parseFloat(e.target.value) || null)}
                        className="w-20"
                        placeholder="0.0"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        step="0.1"
                        value={product.cbd || ''}
                        onChange={(e) => handleUpdateField(product.id, 'cbd', parseFloat(e.target.value) || null)}
                        className="w-20"
                        placeholder="0.0"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={product.format || ''}
                        onChange={(e) => handleUpdateField(product.id, 'format', e.target.value)}
                        className="w-32"
                        placeholder="Format"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-gray-500">
              Showing {offset + 1} to {Math.min(offset + limit, total)} of {total}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ProductCatalog;

