import React from 'react';
import { useQuery } from 'wasp/client/operations';
import { getStoreAnalytics, getStoreById } from 'wasp/client/operations';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { ArrowLeft, Package, DollarSign, Leaf } from 'lucide-react';
import KPICard from './KPICard';
import GlobalAnalyticsDashboard from './GlobalAnalyticsDashboard';

const InPageStoreDetail = ({ storeId, onBack }) => {
  const { data: store, isLoading: storeLoading } = useQuery(getStoreById, { storeId });
  const { data: analytics, isLoading: analyticsLoading } = useQuery(getStoreAnalytics, { 
    storeId, 
    excludeCategories: [] // Show all categories for store detail view
  });

  const isLoading = storeLoading || analyticsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse h-10 bg-muted rounded w-1/3"></div>
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse h-32 bg-muted rounded"></div>
        ))}
      </div>
    );
  }

  if (!store || !analytics) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">Store not found or no data available</p>
          <Button onClick={onBack} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to All Locations
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Back Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="text-sm text-muted-foreground">Dashboard</div>
          <span className="text-muted-foreground">/</span>
          <h2 className="text-2xl font-bold">{store.name}</h2>
        </div>
      </div>

      {/* Store KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KPICard
          title="Total Products"
          value={analytics.totalProducts}
          description="SKUs in stock"
          icon={Package}
        />
        
        <KPICard
          title="Total Value"
          value={`$${analytics.totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
          description="Inventory value"
          icon={DollarSign}
        />
        
        <KPICard
          title="Sativa"
          value={analytics.strainBreakdown.Sativa}
          description="units"
          icon={Leaf}
          iconColor="text-green-600"
          bgColor="bg-green-50"
        />
        
        <KPICard
          title="Hybrid"
          value={analytics.strainBreakdown.Hybrid}
          description="units"
          icon={Leaf}
          iconColor="text-amber-600"
          bgColor="bg-amber-50"
        />
        
        <KPICard
          title="Indica"
          value={analytics.strainBreakdown.Indica}
          description="units"
          icon={Leaf}
          iconColor="text-purple-600"
          bgColor="bg-purple-50"
        />
      </div>

      {/* Store Analytics Dashboard */}
      <GlobalAnalyticsDashboard analytics={analytics} loading={false} />
    </div>
  );
};

export default InPageStoreDetail;
