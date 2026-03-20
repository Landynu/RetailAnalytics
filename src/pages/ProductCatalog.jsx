import React, { useState, useMemo } from 'react';
import { Link } from 'wasp/client/router';
import { useQuery } from 'wasp/client/operations';
import { getProductCatalog, getClassifications, getCategoryDefinitions } from 'wasp/client/operations';
import { updateProductEnrichment, syncAllProductEnrichments } from 'wasp/client/operations';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { ErrorState } from '../components/ErrorState';
import { Badge } from '../components/ui/badge';
import { Search, RefreshCw, Sparkles, Package, Tag, Leaf } from 'lucide-react';
import StrainTypeCell from '../components/StrainTypeCell';
import CategoryCell from '../components/CategoryCell';
import SubcategoryCell from '../components/SubcategoryCell';
import ProductImage from '../components/ProductImage';
import { migrateProductImages, configureS3CORS, checkS3Storage, checkImageMigrationStatus } from 'wasp/client/operations';
import FilterDropdown from '../components/FilterDropdown';

const ProductCatalog = () => {
  const [filters, setFilters] = useState({
    search: '',
    brands: [],
    categories: [],
    subcategories: [],
    strainTypes: [],
    inStock: true
  });
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  
  const { data: catalogData, isLoading, error: catalogError, refetch } = useQuery(getProductCatalog, {
    filters,
    limit,
    offset
  });
  
  const { data: classifications } = useQuery(getClassifications);
  const { data: categoryDefinitions } = useQuery(getCategoryDefinitions);

  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', action: null });

  const handleUpdateField = async (productId, field, value) => {
    try {
      await updateProductEnrichment({
        productId,
        updates: { [field]: value }
      });
      // Refetch to get updated data
      setTimeout(() => refetch(), 300);
    } catch (error) {
      toast.error('Error updating: ' + error.message);
    }
  };

  const handleCategoryChange = (productId) => {
    // Refetch when category changes to update subcategory options
    setTimeout(() => refetch(), 300);
  };

  const products = catalogData?.products || [];
  const total = catalogData?.total || 0;

  // Extract filter options from products
  const filterOptions = useMemo(() => {
    if (!products || products.length === 0) {
      return {
        brands: [],
        categories: [],
        subcategories: [],
        classifications: []
      };
    }

    // Extract unique values from products
    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
    const categories = [...new Set(products.map(p => p.parentCategory).filter(Boolean))].sort();
    const subcategories = [...new Set(products.map(p => p.subcategory).filter(Boolean))].sort();
    const classifications = [...new Set(products.map(p => p.strainType).filter(Boolean))].sort();

    return { brands, categories, subcategories, classifications };
  }, [products]);

  if (catalogError) {
    return (
      <div className="p-6">
        <ErrorState error={catalogError} onRetry={refetch} title="Failed to load product catalog" />
      </div>
    );
  }

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
            onClick={() => {
              setConfirmState({
                open: true,
                title: 'Sync Enrichments',
                description: 'This will sync existing product data (strainType to classification, categories to category definitions). Continue?',
                action: async () => {
                  try {
                    const result = await syncAllProductEnrichments();
                    toast.success(`Sync complete! Classifications: ${result.classifications.synced} synced, Categories: ${result.categories.synced} synced`);
                    refetch();
                  } catch (error) {
                    toast.error('Error: ' + error.message);
                  }
                }
              });
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Sync Enrichments
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirmState({
                open: true,
                title: 'Configure CORS',
                description: 'Configure CORS on S3 bucket to allow images to load in the browser? This will allow all origins to access images.',
                action: async () => {
                  try {
                    const result = await configureS3CORS();
                    toast.success('CORS configured successfully! Images should now load properly.');
                  } catch (error) {
                    toast.error('Error configuring CORS: ' + error.message + '. You may need to configure CORS manually in Railway object storage settings.');
                  }
                }
              });
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Configure CORS
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const result = await checkS3Storage();
                toast.success(`S3 Storage: ${result.message}. ${result.sampleObjects.length} sample objects found.`);
              } catch (error) {
                toast.error('Error checking S3 storage: ' + error.message);
              }
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Check S3 Storage
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const result = await checkImageMigrationStatus();
                toast.success(`Migration Status: ${result.totalWithImages} with images, ${result.migrated} migrated, ${result.withS3Paths} with S3 paths`);
              } catch (error) {
                toast.error('Error checking migration status: ' + error.message);
              }
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Check Migration Status
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirmState({
                open: true,
                title: 'Migrate Images',
                description: 'This will download and optimize all product images from CDN to S3 storage. This may take several minutes. Continue?',
                action: async () => {
                  try {
                    console.log('Starting image migration...');
                    const result = await migrateProductImages({ batchSize: 10 });
                    console.log('Migration result:', result);
                    toast.success(`Migration complete! Total: ${result.total}, Migrated: ${result.migrated}, Failed: ${result.failed}, Skipped: ${result.skipped}`);
                    refetch();
                  } catch (error) {
                    console.error('Migration error:', error);
                    toast.error('Error: ' + error.message + '. Check the server console for details.');
                  }
                }
              });
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
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>
          <FilterDropdown
            label="Brands"
            options={filterOptions.brands}
            selectedValues={filters.brands}
            onChange={(values) => setFilters({ ...filters, brands: values })}
            icon={Package}
          />
          <FilterDropdown
            label="Categories"
            options={filterOptions.categories}
            selectedValues={filters.categories}
            onChange={(values) => setFilters({ ...filters, categories: values })}
            icon={Tag}
          />
          <FilterDropdown
            label="Subcategories"
            options={filterOptions.subcategories}
            selectedValues={filters.subcategories}
            onChange={(values) => setFilters({ ...filters, subcategories: values })}
            icon={Tag}
          />
          <FilterDropdown
            label="Classifications"
            options={filterOptions.classifications}
            selectedValues={filters.strainTypes}
            onChange={(values) => setFilters({ ...filters, strainTypes: values })}
            icon={Leaf}
          />
          <Button
            variant={filters.inStock ? "default" : "outline"}
            onClick={() => setFilters({ ...filters, inStock: !filters.inStock })}
          >
            {filters.inStock ? '✓ In Stock Only' : 'Show All Products'}
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

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState({ ...confirmState, open })}
        title={confirmState.title}
        description={confirmState.description}
        onConfirm={() => {
          confirmState.action?.();
          setConfirmState({ open: false, title: '', description: '', action: null });
        }}
      />
    </div>
  );
};

export default ProductCatalog;

