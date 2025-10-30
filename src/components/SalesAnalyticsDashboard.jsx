import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { TrendingUp, DollarSign } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const STRAIN_COLORS = {
  Sativa: '#10b981',
  Hybrid: '#f59e0b',
  Indica: '#8b5cf6'
};

const SalesAnalyticsDashboard = ({ salesData, loading = false }) => {
  const [showTopProductsBy, setShowTopProductsBy] = useState('revenue');
  const [showTopProductsView, setShowTopProductsView] = useState('total');
  const [showCategoryBy, setShowCategoryBy] = useState('revenue');
  const [showCategoryView, setShowCategoryView] = useState('total');
  const [showBrandsBy, setShowBrandsBy] = useState('revenue');
  const [showBrandsView, setShowBrandsView] = useState('total');
  const [showStoresBy, setShowStoresBy] = useState('revenue');
  const [showTrendsBy, setShowTrendsBy] = useState('revenue');
  const [showTrendsView, setShowTrendsView] = useState('total');

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

  // Custom tooltip with sum total
  const CustomTooltip = ({ active, payload, label, showBy }) => {
    if (!active || !payload || !payload.length) return null;
    
    const total = payload.reduce((sum, item) => sum + (item.value || 0), 0);
    const isRevenue = showBy === 'revenue';
    
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3">
        <p className="font-semibold mb-2">{label}</p>
        {payload.map((item, idx) => (
          <p key={idx} className="text-sm" style={{ color: item.color }}>
            {item.name}: {isRevenue 
              ? `$${(item.value || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
              : `${item.value || 0} units`}
          </p>
        ))}
        {payload.length > 1 && (
          <p className="text-sm font-semibold mt-2 pt-2 border-t">
            Total: {isRevenue
              ? `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
              : `${total} units`}
          </p>
        )}
      </div>
    );
  };

  // Get unique store names for multi-line/stacked chart (MUST be defined first)
  const storeNames = salesData.storePerformance?.map(s => s.name.substring(0, 12)) || [];
  const STORE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899'];

  // Get the correct data array based on toggle (revenue or units)
  const topProductsSourceData = showTopProductsBy === 'revenue' 
    ? (salesData.topProductsByRevenue || [])
    : (salesData.topProductsByUnits || []);

  // Prepare chart data with byStore flattened
  const topProductsChartData = topProductsSourceData.slice(0, 10).map(p => {
    const baseData = {
      name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
      fullName: p.name,
      brand: p.brand || 'Unknown',
      revenue: p.revenue,
      units: p.unitsSold
    };
    if (p.byStore) {
      Object.keys(p.byStore).forEach(storeName => {
        baseData[`${storeName}_revenue`] = p.byStore[storeName].revenue;
        baseData[`${storeName}_units`] = p.byStore[storeName].units;
      });
    }
    return baseData;
  });

  const categoryChartData = (salesData.categoryPerformance || []).map(c => {
    const baseData = {
      name: c.category.length > 15 ? c.category.substring(0, 15) + '...' : c.category,
      revenue: c.revenue,
      units: c.unitsSold
    };
    if (c.byStore) {
      Object.keys(c.byStore).forEach(storeName => {
        baseData[`${storeName}_revenue`] = c.byStore[storeName].revenue;
        baseData[`${storeName}_units`] = c.byStore[storeName].units;
      });
    }
    return baseData;
  });

  const topBrandsChartData = (salesData.topBrands || []).map(b => {
    const baseData = {
      name: b.brand.length > 15 ? b.brand.substring(0, 15) + '...' : b.brand,
      revenue: b.revenue,
      units: b.unitsSold
    };
    if (b.byStore) {
      Object.keys(b.byStore).forEach(storeName => {
        baseData[`${storeName}_revenue`] = b.byStore[storeName].revenue;
        baseData[`${storeName}_units`] = b.byStore[storeName].units;
      });
    }
    return baseData;
  });

  const storeComparisonData = (salesData.storePerformance || []).map(s => ({
    name: s.name.length > 12 ? s.name.substring(0, 12) + '...' : s.name,
    revenue: s.revenue,
    units: s.unitsSold
  }));

  // Sales trends - limit to last 30 days for readability
  const salesTrendsData = (salesData.salesTrends || [])
    .slice(-30)
    .map(t => {
      const baseData = {
        date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: t.netRevenue || 0,
        units: t.unitsSold || 0
      };
      
      // Flatten byStore data into individual dataKeys
      if (t.byStore) {
        Object.keys(t.byStore).forEach(storeName => {
          baseData[`${storeName}_revenue`] = t.byStore[storeName].revenue || 0;
          baseData[`${storeName}_units`] = t.byStore[storeName].units || 0;
        });
      }
      
      return baseData;
    });

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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Sales Trends (Last 30 Days)</CardTitle>
                <CardDescription>
                  {showTrendsView === 'total' ? 'Total' : 'By location'} - {showTrendsBy === 'revenue' ? 'revenue' : 'units sold'}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTrendsView(showTrendsView === 'total' ? 'by-location' : 'total')}
                >
                  {showTrendsView === 'total' ? 'By Location' : 'Show Total'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTrendsBy(showTrendsBy === 'revenue' ? 'units' : 'revenue')}
                >
                  {showTrendsBy === 'revenue' ? 'Show Units' : 'Show Revenue'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              {showTrendsView === 'total' ? (
                <LineChart data={salesTrendsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} fontSize={11} />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => showTrendsBy === 'revenue'
                      ? `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                      : `${value} units`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey={showTrendsBy} 
                    stroke="#10b981" 
                    name={showTrendsBy === 'revenue' ? 'Revenue' : 'Units'} 
                    strokeWidth={2} 
                  />
                </LineChart>
              ) : (
                <BarChart data={salesTrendsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} fontSize={11} />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => {
                      const isRevenue = showTrendsBy === 'revenue';
                      return isRevenue
                        ? [`$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, name]
                        : [`${value} units`, name];
                    }}
                  />
                  {storeNames.map((storeName, index) => (
                    <Bar 
                      key={storeName}
                      dataKey={`${storeName}_${showTrendsBy}`}
                      stackId="a"
                      fill={STORE_COLORS[index % STORE_COLORS.length]}
                      name={storeName}
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Products - Table View */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Top 10 Products by {showTopProductsBy === 'revenue' ? 'Revenue' : 'Units Sold'}</CardTitle>
              <CardDescription>
                Best performing products
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTopProductsBy(showTopProductsBy === 'revenue' ? 'units' : 'revenue')}
            >
              {showTopProductsBy === 'revenue' ? 'Show Units' : 'Show Revenue'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase bg-muted/50">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">#</th>
                  <th className="px-3 py-3 text-left font-semibold">Product</th>
                  <th className="px-3 py-3 text-left font-semibold">Brand</th>
                  {showTopProductsBy === 'revenue' ? (
                    <>
                      <th className="px-3 py-3 text-right font-semibold">Revenue</th>
                      <th className="px-3 py-3 text-right font-semibold">Units</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-3 text-right font-semibold">Units</th>
                      <th className="px-3 py-3 text-right font-semibold">Revenue</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {topProductsChartData.map((product, index) => (
                  <tr key={index} className="hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-3 text-muted-foreground font-medium">{index + 1}</td>
                    <td className="px-3 py-3 font-medium" title={product.fullName}>{product.name}</td>
                    <td className="px-3 py-3 text-muted-foreground">{product.brand}</td>
                    {showTopProductsBy === 'revenue' ? (
                      <>
                        <td className="px-3 py-3 text-right font-mono">
                          ${product.revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                        <td className="px-3 py-3 text-right">{product.units}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3 text-right">{product.units}</td>
                        <td className="px-3 py-3 text-right font-mono">
                          ${product.revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Sales by Category */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sales by Category</CardTitle>
              <CardDescription>
                {showCategoryView === 'total' ? 'Total' : 'By location'} - {showCategoryBy === 'revenue' ? 'revenue' : 'units sold'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCategoryView(showCategoryView === 'total' ? 'by-location' : 'total')}
              >
                {showCategoryView === 'total' ? 'By Location' : 'Show Total'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCategoryBy(showCategoryBy === 'revenue' ? 'units' : 'revenue')}
              >
                {showCategoryBy === 'revenue' ? 'Show Units' : 'Show Revenue'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={11} />
              <YAxis />
              <Tooltip content={showCategoryView === 'by-location' ? <CustomTooltip showBy={showCategoryBy} /> : undefined}
                formatter={showCategoryView === 'total' ? (value) => showCategoryBy === 'revenue' 
                  ? `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` 
                  : `${value} units` : undefined} />
              {showCategoryView === 'total' ? (
                <Bar dataKey={showCategoryBy} fill="#3b82f6" />
              ) : (
                storeNames.map((storeName, index) => (
                  <Bar 
                    key={storeName}
                    dataKey={`${storeName}_${showCategoryBy}`}
                    stackId="a"
                    fill={STORE_COLORS[index % STORE_COLORS.length]}
                    name={storeName}
                  />
                ))
              )}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sales by Brand */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Top Brands by Sales</CardTitle>
              <CardDescription>
                {showBrandsView === 'total' ? 'Total' : 'By location'} - {showBrandsBy === 'revenue' ? 'revenue' : 'units sold'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBrandsView(showBrandsView === 'total' ? 'by-location' : 'total')}
              >
                {showBrandsView === 'total' ? 'By Location' : 'Show Total'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBrandsBy(showBrandsBy === 'revenue' ? 'units' : 'revenue')}
              >
                {showBrandsBy === 'revenue' ? 'Show Units' : 'Show Revenue'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topBrandsChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={11} />
              <YAxis />
              <Tooltip content={showBrandsView === 'by-location' ? <CustomTooltip showBy={showBrandsBy} /> : undefined}
                formatter={showBrandsView === 'total' ? (value) => showBrandsBy === 'revenue'
                  ? `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                  : `${value} units` : undefined} />
              {showBrandsView === 'total' ? (
                <Bar dataKey={showBrandsBy} fill="#8b5cf6" />
              ) : (
                storeNames.map((storeName, index) => (
                  <Bar 
                    key={storeName}
                    dataKey={`${storeName}_${showBrandsBy}`}
                    stackId="a"
                    fill={STORE_COLORS[index % STORE_COLORS.length]}
                    name={storeName}
                  />
                ))
              )}
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Store Sales Comparison</CardTitle>
                <CardDescription>By {showStoresBy === 'revenue' ? 'revenue' : 'units sold'}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStoresBy(showStoresBy === 'revenue' ? 'units' : 'revenue')}
              >
                {showStoresBy === 'revenue' ? 'Show Units' : 'Show Revenue'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={storeComparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis 
                  tickFormatter={(value) => showStoresBy === 'revenue'
                    ? `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                    : value.toString()} 
                />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'revenue' || name === showStoresBy) return showStoresBy === 'revenue'
                      ? [`$${Number(value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'Revenue']
                      : [`${Math.round(value)} units`, 'Units Sold'];
                    return [value, name];
                  }}
                />
                <Bar dataKey={showStoresBy} fill="#06b6d4" name={showStoresBy === 'revenue' ? 'Revenue' : 'Units'} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SalesAnalyticsDashboard;
