import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { MapPin, Package, DollarSign, TrendingUp, Upload } from 'lucide-react';
import { Link } from 'wasp/client/router';

const CompactStoreCard = ({ store, metrics, onViewDetails }) => {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">{store.name}</CardTitle>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <MapPin className="h-3 w-3 mr-1" />
              {store.location}
            </div>
          </div>
          <Badge variant="outline" className="text-xs">Active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center">
            <Package className="h-3 w-3 mr-1.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Products:</span>
            <span className="ml-auto font-semibold">{metrics?.products || 0}</span>
          </div>
          <div className="flex items-center">
            <DollarSign className="h-3 w-3 mr-1.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Value:</span>
            <span className="ml-auto font-semibold">${(metrics?.value || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewDetails}
            className="w-full text-xs"
          >
            <TrendingUp className="h-3 w-3 mr-1" />
            View Details
          </Button>
          <Link to={`/store/${store.id}/upload`}>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
            >
              <Upload className="h-3 w-3 mr-1" />
              Upload
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default CompactStoreCard;
