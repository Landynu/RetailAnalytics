import React from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from 'wasp/client/operations';
import { generateSmartMenu } from 'wasp/client/operations';
import { StoreNav } from '../components/StoreNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ErrorState } from '../components/ErrorState';
import { Menu, Package, Upload, DollarSign, Layers } from 'lucide-react';

const SmartMenuPage = () => {
  const { storeId } = useParams();
  const { data: menuData, isLoading, error, refetch } = useQuery(generateSmartMenu, { storeId });

  if (isLoading) return (
    <div className="space-y-6">
      <StoreNav currentPage="menu" />
      <div className="space-y-4">
        <div className="animate-pulse h-8 bg-muted rounded w-1/3"></div>
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse h-32 bg-muted rounded"></div>
        ))}
      </div>
    </div>
  );

  if (error) return (
    <div className="space-y-6">
      <StoreNav currentPage="menu" />
      <ErrorState error={error} onRetry={refetch} title="Failed to load menu" />
    </div>
  );

  const { store, categories, totalProducts } = menuData;
  const averagePrice = totalProducts > 0
    ? categories.reduce((acc, cat) =>
        acc + cat.products.reduce((sum, p) => sum + p.price, 0), 0
      ) / totalProducts
    : 0;

  return (
    <div className="space-y-6">
      <StoreNav currentPage="menu" />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
            <p className="text-xs text-muted-foreground">In stock across all categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Price</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${averagePrice.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Per product</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
            <p className="text-xs text-muted-foreground">Menu sections</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{store.name} Menu</h2>
          <p className="text-sm text-muted-foreground">{store.location}</p>
        </div>

        {categories.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Menu className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No menu data available</h3>
              <p className="text-muted-foreground mb-4">
                Upload inventory data to generate your smart menu.
              </p>
              <Link to="/upload">
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Inventory
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          categories.map(({ category, products }) => (
            <Card key={category}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{category}</CardTitle>
                  <Badge variant="outline">{products.length} items</Badge>
                </div>
                <CardDescription>
                  Sorted by price, highest first
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {products.map((product, index) => (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center justify-center w-7 h-7 bg-primary/10 rounded-full">
                          <span className="text-xs font-semibold text-primary">{index + 1}</span>
                        </div>
                        <div>
                          <div className="font-medium text-sm">{product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {product.brand}
                            {product.strainType && product.strainType !== 'N/A' && (
                              <span> &middot; {product.strainType}</span>
                            )}
                            {product.thc && (
                              <span> &middot; THC {product.thc}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 text-right">
                        <div className="text-xs text-muted-foreground">
                          Qty: {product.quantity}
                        </div>
                        <div className="font-semibold">${product.price.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {categories.length > 0 && (
        <div className="flex justify-center space-x-4">
          <Link to="/upload">
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Upload More Inventory
            </Button>
          </Link>
          <Link to={`/store/${storeId}/trends`}>
            <Button variant="outline">
              <Package className="h-4 w-4 mr-2" />
              View Sales Trends
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default SmartMenuPage;
