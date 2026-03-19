import React from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from 'wasp/client/operations';
import { generateSmartMenu } from 'wasp/client/operations';
import { StoreNav } from '../components/StoreNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Menu, Package, Upload, Star, DollarSign } from 'lucide-react';

const SmartMenuPage = () => {
  const { storeId } = useParams();
  const { data: smartMenu, isLoading, error } = useQuery(generateSmartMenu, { storeId });

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
      <Card>
        <CardContent className="text-center py-8">
          <div className="text-destructive mb-4">Error: {error}</div>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </CardContent>
      </Card>
    </div>
  );

  const totalProducts = smartMenu.reduce((acc, menu) => acc + menu.products.length, 0);
  const averagePrice = smartMenu.length > 0 
    ? smartMenu.reduce((acc, menu) => 
        acc + menu.products.reduce((sum, product) => sum + product.price, 0), 0
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
            <p className="text-xs text-muted-foreground">
              Available in smart menu
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Price</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${averagePrice.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Per product
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Menu Sections</CardTitle>
            <Menu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{smartMenu.length}</div>
            <p className="text-xs text-muted-foreground">
              Inventory uploads
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Smart Menu</h2>
        {smartMenu.length === 0 ? (
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
          smartMenu.map(menu => (
            <Card key={menu.inventoryId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Menu Section #{menu.inventoryId}</CardTitle>
                  <Badge variant="outline">{menu.products.length} items</Badge>
                </div>
                <CardDescription>
                  Curated product selection for optimal sales
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {menu.products.map((product, index) => (
                    <div key={product.gtin} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full">
                          <span className="text-sm font-semibold text-primary">{index + 1}</span>
                        </div>
                        <div>
                          <div className="font-medium">{product.name}</div>
                          <div className="text-sm text-muted-foreground">GTIN: {product.gtin}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-right">
                          <div className="font-semibold text-lg">${product.price.toFixed(2)}</div>
                        </div>
                        <div className="flex items-center text-yellow-500">
                          <Star className="h-4 w-4 fill-current" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {smartMenu.length > 0 && (
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