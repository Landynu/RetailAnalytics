import React from 'react';
import { useQuery } from 'wasp/client/operations';
import { getSalesTrends } from 'wasp/client/operations';
import { useParams, Link } from 'react-router-dom';
import { StoreNav } from '../components/StoreNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { TrendingUp, Package, DollarSign, Menu } from 'lucide-react';

const SalesTrendsPage = () => {
  const { storeId } = useParams();
  const { data: salesTrends, isLoading, error } = useQuery(getSalesTrends, { storeId });

  if (isLoading) return (
    <div className="space-y-6">
      <StoreNav currentPage="trends" />
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
      <StoreNav currentPage="trends" />
      <Card>
        <CardContent className="text-center py-8">
          <div className="text-destructive mb-4">Error: {error}</div>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </CardContent>
      </Card>
    </div>
  );

  const totalProducts = salesTrends.reduce((acc, trend) => acc + trend.products.length, 0);
  const totalValue = salesTrends.reduce((acc, trend) => 
    acc + trend.products.reduce((sum, product) => sum + product.price, 0), 0
  );

  return (
    <div className="space-y-6">
      <StoreNav currentPage="trends" />
      
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              Across {salesTrends.length} inventory uploads
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Inventory value
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Uploads</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesTrends.length}</div>
            <p className="text-xs text-muted-foreground">
              Data uploads
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Inventory Details</h2>
        {salesTrends.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No inventory data</h3>
              <p className="text-muted-foreground mb-4">
                Upload inventory data to see sales trends and analytics.
              </p>
              <Link to={`/store/${storeId}/upload`}>
                <Button>
                  <Package className="h-4 w-4 mr-2" />
                  Upload Inventory
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          salesTrends.map(trend => (
            <Card key={trend.inventoryId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Inventory Upload #{trend.inventoryId}</CardTitle>
                  <Badge variant="outline">{trend.products.length} products</Badge>
                </div>
                <CardDescription>
                  Product inventory and pricing data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {trend.products.map(product => (
                    <div key={product.gtin} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-sm text-muted-foreground">GTIN: {product.gtin}</div>
                      </div>
                      <div className="text-right">
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

      {salesTrends.length > 0 && (
        <div className="flex justify-center">
          <Link to={`/store/${storeId}/menu`}>
            <Button>
              <Menu className="h-4 w-4 mr-2" />
              View Smart Menu
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

export default SalesTrendsPage;