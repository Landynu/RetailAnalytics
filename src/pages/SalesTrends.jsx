import React, { useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getStoreAnalytics } from 'wasp/client/operations';
import { useParams, Link } from 'react-router';
import { StoreNav } from '../components/StoreNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Package, DollarSign, Leaf, Upload, Filter } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const STRAIN_COLORS = {
  Sativa: '#10b981',
  Hybrid: '#f59e0b',
  Indica: '#8b5cf6',
  'N/A': '#6b7280'
};

const SalesTrendsPage = () => {
  const { storeId } = useParams();
  const [excludeCategories, setExcludeCategories] = useState(['Accessories', 'Accessory']);
  const [showByRevenue, setShowByRevenue] = useState(true); // true = revenue, false = units
  
  const { data: analytics, isLoading, error } = useQuery(getStoreAnalytics, { 
    storeId, 
    excludeCategories 
  });

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
          <div className="text-destructive mb-4">Error: {error.message || error}</div>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </CardContent>
      </Card>
    </div>
  );

  if (!analytics || analytics.totalProducts === 0) {
    return (
      <div className="space-y-6">
        <StoreNav currentPage="trends" />
        <Card>
          <CardContent className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Inventory Data</h3>
            <p className="text-muted-foreground mb-6">
              Upload inventory data to see analytics and trends
            </p>
            <Link to="/upload">
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Go to Upload
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prepare chart data
  const strainChartData = Object.keys(analytics.strainBreakdown)
    .filter(strain => analytics.strainBreakdown[strain] > 0)
    .map(strain => ({
      name: strain,
      value: analytics.strainBreakdown[strain]
    }));

  const topProductsData = showByRevenue ? analytics.topProductsByRevenue : analytics.topProductsByUnits;
  const topProductsChartData = topProductsData.map(p => ({
    name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
    value: showByRevenue ? p.revenue : p.unitsSold
  }));

  const topBrandsChartData = analytics.topBrands.map(b => ({
    name: b.brand.length > 15 ? b.brand.substring(0, 15) + '...' : b.brand,
    value: b.value,
    products: b.products
  }));

  const categoryChartData = analytics.categoryPerformance.map(c => ({
    name: c.category,
    value: c.value,
    products: c.products
  }));

  const toggleCategoryFilter = (category) => {
    setExcludeCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  return (
    <div className="space-y-6">
      <StoreNav currentPage="trends" />
      
      {/* Category Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Category Filters
          </CardTitle>
          <CardDescription>
            Toggle categories to include/exclude from analytics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {analytics.availableCategories.map(category => {
              const isExcluded = excludeCategories.includes(category);
              return (
                <Button
                  key={category}
                  variant={isExcluded ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => toggleCategoryFilter(category)}
                  className={isExcluded ? 'opacity-50' : ''}
                >
                  {category}
                  {isExcluded && ' (Hidden)'}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Currently showing {analytics.totalProducts} products (excluding {excludeCategories.join(', ')})
          </p>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalProducts}</div>
            <p className="text-xs text-muted-foreground">SKUs in stock</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${analytics.totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">Inventory value</p>
          </CardContent>
        </Card>
        
        <Card className="bg-green-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-900">Sativa</CardTitle>
            <Leaf className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">{analytics.strainBreakdown.Sativa}</div>
            <p className="text-xs text-green-700">units</p>
          </CardContent>
        </Card>
        
        <Card className="bg-amber-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-900">Hybrid</CardTitle>
            <Leaf className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900">{analytics.strainBreakdown.Hybrid}</div>
            <p className="text-xs text-amber-700">units</p>
          </CardContent>
        </Card>
        
        <Card className="bg-purple-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-900">Indica</CardTitle>
            <Leaf className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">{analytics.strainBreakdown.Indica}</div>
            <p className="text-xs text-purple-700">units</p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Strain Type Distribution */}
        {strainChartData.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Strain Type Distribution</CardTitle>
              <CardDescription>Flower inventory breakdown by strain</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={strainChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {strainChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STRAIN_COLORS[entry.name] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Strain Type Distribution</CardTitle>
              <CardDescription>No flower products in inventory</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] flex items-center justify-center">
              <p className="text-muted-foreground">Upload flower products to see strain distribution</p>
            </CardContent>
          </Card>
        )}

        {/* Category Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Category Performance</CardTitle>
            <CardDescription>Inventory value by category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                <Bar dataKey="value" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top 10 Products by Sales */}
        {analytics.hasMovementData && topProductsData.length > 0 ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Top 10 Products by Sales</CardTitle>
                  <CardDescription>
                    {showByRevenue ? 'Revenue' : 'Units sold'} from sales transactions
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowByRevenue(!showByRevenue)}
                >
                  {showByRevenue ? 'Show Units' : 'Show Revenue'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topProductsChartData} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={150} />
                  <Tooltip 
                    formatter={(value) => showByRevenue ? `$${value.toFixed(2)}` : `${value} units`} 
                  />
                  <Bar dataKey="value" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Products by Sales</CardTitle>
              <CardDescription>Sales transaction data</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] flex items-center justify-center">
              <div className="text-center">
                <p className="text-muted-foreground mb-2">No sales data available</p>
                <p className="text-xs text-muted-foreground">Upload inventory logs to see sales analytics</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Brands */}
        <Card>
          <CardHeader>
            <CardTitle>Top Brands</CardTitle>
            <CardDescription>Inventory value by brand</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topBrandsChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                <Bar dataKey="value" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Info Note */}
      {!analytics.hasMovementData && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Sales data (Top 10 Products chart) requires inventory logs to be uploaded. Upload inventory logs at <Link to="/upload" className="underline">Global Upload</Link> to see sales analytics.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SalesTrendsPage;
