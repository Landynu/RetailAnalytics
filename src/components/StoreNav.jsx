import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from 'wasp/client/operations';
import { getStoreById } from 'wasp/client/operations';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Button } from './ui/button';
import { ArrowLeft, Upload, TrendingUp, Menu } from 'lucide-react';

export const StoreNav = ({ currentPage }) => {
  const { storeId } = useParams();
  const { data: store, isLoading, error } = useQuery(getStoreById, { storeId });

  if (isLoading) return <div className="animate-pulse h-16 bg-muted rounded"></div>;
  if (error) return <div className="text-destructive">Error loading store</div>;

  const tabs = [
    {
      id: 'upload',
      label: 'Upload Inventory',
      icon: Upload,
      href: `/store/${storeId}/upload`,
      active: currentPage === 'upload'
    },
    {
      id: 'trends',
      label: 'Sales Trends',
      icon: TrendingUp,
      href: `/store/${storeId}/trends`,
      active: currentPage === 'trends'
    },
    {
      id: 'menu',
      label: 'Smart Menu',
      icon: Menu,
      href: `/store/${storeId}/menu`,
      active: currentPage === 'menu'
    }
  ];

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{store?.name}</span>
        {currentPage && (
          <>
            <span>/</span>
            <span className="font-medium text-foreground capitalize">{currentPage}</span>
          </>
        )}
      </div>

      {/* Store Info */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{store?.name}</h1>
          <div className="flex items-center space-x-2 mt-1">
            <Badge variant="outline">{store?.location}</Badge>
            <span className="text-sm text-muted-foreground">Store ID: {storeId}</span>
          </div>
        </div>
        <Link to="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <Separator />

      {/* Navigation Tabs */}
      <div className="flex space-x-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link key={tab.id} to={tab.href}>
              <Button
                variant={tab.active ? "default" : "ghost"}
                size="sm"
                className="flex items-center space-x-2"
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

