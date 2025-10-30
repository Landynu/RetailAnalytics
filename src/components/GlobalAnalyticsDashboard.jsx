import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Package, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const STRAIN_COLORS = {
  Sativa: '#10b981',
  Hybrid: '#f59e0b',
  Indica: '#8b5cf6',
  'N/A': '#6b7280'
};

const GlobalAnalyticsDashboard = ({ analytics, loading = false }) => {
  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardHeader>
              <div className="animate-pulse h-6 bg-muted rounded w-1/2 mb-2"></div>
              <div className="animate-pulse h-4 bg-muted rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="animate-pulse h-64 bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Data Available</h3>
          <p className="text-muted-foreground">
            Upload inventory data to see analytics
          </p>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const strainChartData = Object.keys(analytics.strainBreakdown || {})
    .filter(strain => strain !== 'N/A' && analytics.strainBreakdown[strain] > 0)
    .map(strain => ({
      name: strain,
      value: analytics.strainBreakdown[strain]
    }));

  const categoryChartData = (analytics.categoryPerformance || []).map(c => ({
    name: c.category.length > 15 ? c.category.substring(0, 15) + '...' : c.category,
    value: c.value,
    products: c.products
  }));

  const topBrandsChartData = (analytics.topBrands || []).map(b => ({
    name: b.brand.length > 15 ? b.brand.substring(0, 15) + '...' : b.brand,
    value: b.value,
    products: b.products
  }));

  const storeComparisonData = (analytics.storePerformance || []).map(s => ({
    name: s.name.length > 12 ? s.name.substring(0, 12) + '...' : s.name,
    value: s.value,
    products: s.products
  }));

  const topProductsData = analytics.topProductsByRevenue || [];
  const topProductsChartData = topProductsData.slice(0, 10).map(p => ({
    name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
    value: p.revenue,
    units: p.unitsSold
  }));
  
  // Debug: Log chart data to console
  if (topProductsChartData.length > 0) {
    console.log('Top Products Chart Data:', topProductsChartData);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Strain Distribution */}
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
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={11} />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
              <Bar dataKey="value" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Products by Sales */}
      {analytics.hasMovementData && topProductsChartData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Products by Revenue</CardTitle>
            <CardDescription>Based on sales transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topProductsChartData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} fontSize={11} />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'value') return [`$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'Revenue'];
                    return [value, name];
                  }}
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
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={11} />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
              <Bar dataKey="value" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Store Comparison */}
      {storeComparisonData.length > 1 && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Store Performance Comparison</CardTitle>
            <CardDescription>Inventory value across selected locations</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={storeComparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'value') return [`$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'Inventory Value'];
                    if (name === 'products') return [value, 'Products'];
                    return [value, name];
                  }}
                />
                <Bar dataKey="value" fill="#06b6d4" name="Inventory Value" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GlobalAnalyticsDashboard;
