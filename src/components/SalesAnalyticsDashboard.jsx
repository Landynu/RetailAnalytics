import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { TrendingUp, DollarSign } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const STRAIN_COLORS = {
  Sativa: '#10b981',
  Hybrid: '#f59e0b',
  Indica: '#8b5cf6'
};

const SalesAnalyticsDashboard = ({ salesData, loading = false }) => {
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

  if (!salesData || !salesData.hasData) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <TrendingUp className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Sales Data Available</h3>
          <p className="text-muted-foreground">
            Upload inventory logs to see sales analytics
          </p>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const topProductsChartData = (salesData.topProductsByRevenue || []).slice(0, 10).map(p => ({
    name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
    revenue: p.revenue,
    units: p.unitsSold
  }));

  const categoryChartData = (salesData.categoryPerformance || []).map(c => ({
    name: c.category.length > 15 ? c.category.substring(0, 15) + '...' : c.category,
    revenue: c.revenue,
    units: c.unitsSold
  }));

  const topBrandsChartData = (salesData.topBrands || []).map(b => ({
    name: b.brand.length > 15 ? b.brand.substring(0, 15) + '...' : b.brand,
    revenue: b.revenue,
    units: b.unitsSold
  }));

  const storeComparisonData = (salesData.storePerformance || []).map(s => ({
    name: s.name.length > 12 ? s.name.substring(0, 12) + '...' : s.name,
    revenue: s.revenue,
    units: s.unitsSold
  }));

  // Sales trends - limit to last 30 days for readability
  const salesTrendsData = (salesData.salesTrends || [])
    .slice(-30)
    .map(t => ({
      date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: t.revenue,
      units: t.unitsSold
    }));

  // Strain sales pie chart
  const strainSalesData = Object.keys(salesData.strainSales || {})
    .filter(strain => salesData.strainSales[strain] > 0)
    .map(strain => ({
      name: strain,
      value: salesData.strainSales[strain]
    }));

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Sales Trends Over Time */}
      {salesTrendsData.length > 0 && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Sales Trends (Last 30 Days)</CardTitle>
            <CardDescription>Daily revenue and units sold</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesTrendsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} fontSize={11} />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'revenue') return [`$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'Revenue'];
                    if (name === 'units') return [`${value} units`, 'Units Sold'];
                    return [value, name];
                  }}
                />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#10b981" name="Revenue" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="units" stroke="#3b82f6" name="Units" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Products by Revenue */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Products by Revenue</CardTitle>
          <CardDescription>Best selling products</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topProductsChartData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={150} fontSize={11} />
              <Tooltip 
                formatter={(value, name) => {
                  if (name === 'revenue') return [`$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'Revenue'];
                  if (name === 'units') return [`${value} units`, 'Units Sold'];
                  return [value, name];
                }}
              />
              <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sales by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Category</CardTitle>
          <CardDescription>Revenue by product category</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={11} />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
              <Bar dataKey="revenue" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sales by Brand */}
      <Card>
        <CardHeader>
          <CardTitle>Top Brands by Sales</CardTitle>
          <CardDescription>Revenue by brand</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topBrandsChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={11} />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
              <Bar dataKey="revenue" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Strain Sales Distribution */}
      {strainSalesData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sales by Strain Type</CardTitle>
            <CardDescription>Units sold by strain</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={strainSalesData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {strainSalesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STRAIN_COLORS[entry.name] || '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Store Performance Comparison */}
      {storeComparisonData.length > 1 && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Store Sales Comparison</CardTitle>
            <CardDescription>Revenue across selected locations</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={storeComparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(value) => `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'revenue') return [`$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'Revenue'];
                    if (name === 'units') return [`${value} units`, 'Units Sold'];
                    return [value, name];
                  }}
                />
                <Bar dataKey="revenue" fill="#06b6d4" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SalesAnalyticsDashboard;
