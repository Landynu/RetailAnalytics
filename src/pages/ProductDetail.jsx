import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Link } from 'wasp/client/router';
import { useQuery } from 'wasp/client/operations';
import { getProductById, getClassifications, getCategoryDefinitions } from 'wasp/client/operations';
import { updateProductEnrichment } from 'wasp/client/operations';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Edit2, Save, X } from 'lucide-react';
import StrainTypeCell from '../components/StrainTypeCell';
import CategoryCell from '../components/CategoryCell';
import SubcategoryCell from '../components/SubcategoryCell';
import ProductImage from '../components/ProductImage';

const ProductDetail = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [edits, setEdits] = useState({});
  
  const { data: product, isLoading, refetch } = useQuery(getProductById, { productId: parseInt(productId) });
  const { data: classifications } = useQuery(getClassifications);
  const { data: categoryDefinitions } = useQuery(getCategoryDefinitions);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Product Not Found</h2>
          <p className="text-gray-500 mb-4">The product you're looking for doesn't exist.</p>
          <Button onClick={() => navigate('/product-catalog')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Catalog
          </Button>
        </div>
      </div>
    );
  }

  const totalStock = product.stockLevels?.reduce((sum, stock) => sum + stock.quantity, 0) || 0;
  const storesWithStock = product.stockLevels?.filter(s => s.quantity > 0) || [];

  const handleSave = async () => {
    try {
      await updateProductEnrichment({
        productId: product.id,
        updates: edits
      });
      setEdits({});
      setIsEditing(false);
      refetch();
    } catch (error) {
      alert('Error saving: ' + error.message);
    }
  };

  const handleCancel = () => {
    setEdits({});
    setIsEditing(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="text-sm text-gray-500 mt-1">GTIN: {product.gtin}</p>
          </div>
        </div>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)}>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Product Image */}
      {product.imageUrl || product.imageStoragePath ? (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Product Image</h2>
          <div className="max-w-md">
            <ProductImage 
              product={product} 
              variant="full"
              className="w-full h-64"
            />
            {product.imageOptimizedSize && product.imageOriginalSize && (
              <div className="mt-2 text-xs text-gray-500">
                Optimized: {((product.imageOptimizedSize / 1024).toFixed(1))}KB 
                (Original: {((product.imageOriginalSize / 1024).toFixed(1))}KB, 
                {((1 - product.imageOptimizedSize / product.imageOriginalSize) * 100).toFixed(1)}% smaller)
              </div>
            )}
            {product.imageMigrationStatus && (
              <div className="mt-2">
                <Badge variant={product.imageMigrationStatus === 'MIGRATED' ? 'default' : 'outline'}>
                  {product.imageMigrationStatus}
                </Badge>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Brand</label>
              <div className="mt-1 text-lg">{product.brand || '-'}</div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-500">Category</label>
              <div className="mt-1">
                {isEditing ? (
                  <CategoryCell 
                    product={product}
                    categoryDefinitions={categoryDefinitions || []}
                    onCategoryChange={() => refetch()}
                  />
                ) : (
                  <div>
                    {product.categoryDefinition?.name || product.parentCategory || '-'}
                    {product.subcategoryDef && (
                      <span className="text-gray-500 ml-2">› {product.subcategoryDef.name}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Subcategory</label>
              <div className="mt-1">
                {isEditing ? (
                  <SubcategoryCell 
                    product={product}
                    categoryDefinitions={categoryDefinitions || []}
                  />
                ) : (
                  <div>{product.subcategoryDef?.name || product.subcategory || '-'}</div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Classification</label>
              <div className="mt-1">
                {isEditing ? (
                  <StrainTypeCell 
                    product={product}
                    classifications={classifications || []}
                  />
                ) : (
                  <div>
                    {product.classification ? (
                      <Badge className="bg-purple-500 text-white">{product.classification.name}</Badge>
                    ) : (
                      product.strainType || '-'
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Format</label>
              <div className="mt-1">
                {isEditing ? (
                  <Input
                    value={edits.format !== undefined ? edits.format : product.format || ''}
                    onChange={(e) => setEdits({ ...edits, format: e.target.value })}
                    placeholder="Format"
                  />
                ) : (
                  <div>{product.format || '-'}</div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Cannabinoids */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Cannabinoids</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">THC</label>
              <div className="mt-1">
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.1"
                    value={edits.thc !== undefined ? edits.thc : product.thc || ''}
                    onChange={(e) => setEdits({ ...edits, thc: parseFloat(e.target.value) || null })}
                    placeholder="0.0"
                  />
                ) : (
                  <div className="text-lg">{product.thc || '-'} {product.thc && '%'}</div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">CBD</label>
              <div className="mt-1">
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.1"
                    value={edits.cbd !== undefined ? edits.cbd : product.cbd || ''}
                    onChange={(e) => setEdits({ ...edits, cbd: parseFloat(e.target.value) || null })}
                    placeholder="0.0"
                  />
                ) : (
                  <div className="text-lg">{product.cbd || '-'} {product.cbd && '%'}</div>
                )}
              </div>
            </div>

            {product.cannabinoidProfile && (
              <div>
                <label className="text-sm font-medium text-gray-500">Other Cannabinoids</label>
                <div className="mt-1 text-sm">
                  <pre className="bg-gray-50 p-2 rounded text-xs overflow-auto">
                    {JSON.stringify(product.cannabinoidProfile, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Pricing */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Pricing</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Retail Price</label>
              <div className="mt-1 text-lg font-semibold">${product.retailPrice?.toFixed(2) || '0.00'}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Wholesale Cost</label>
              <div className="mt-1 text-lg">${product.wholesaleCost?.toFixed(2) || '0.00'}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Margin</label>
              <div className="mt-1 text-lg">
                {product.margin ? `${(product.margin * 100).toFixed(1)}%` : '-'}
              </div>
            </div>
          </div>
        </Card>

        {/* Inventory */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Inventory</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Total Stock</label>
              <div className="mt-1 text-2xl font-bold text-emerald-600">{totalStock} units</div>
            </div>
            
            {storesWithStock.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-500 mb-2 block">Stock by Location</label>
                <div className="space-y-2">
                  {storesWithStock.map(stock => (
                    <div key={stock.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="font-medium">{stock.store.friendlyName || stock.store.name}</span>
                      <Badge variant="outline" className="font-semibold">
                        {stock.quantity} units
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {storesWithStock.length === 0 && (
              <div className="text-sm text-gray-500">Out of stock at all locations</div>
            )}
          </div>
        </Card>
      </div>

      {/* Enrichment History */}
      {product.enrichments && product.enrichments.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Enrichment History</h2>
          <div className="space-y-2">
            {product.enrichments.map(enrichment => (
              <div key={enrichment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                <div>
                  <span className="font-medium">{enrichment.field}</span>
                  <span className="text-gray-500 ml-2">
                    {enrichment.oldValue} → {enrichment.newValue}
                  </span>
                </div>
                <span className="text-gray-400 text-xs">
                  {new Date(enrichment.enrichedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default ProductDetail;

