import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { MapPin, Package, DollarSign, TrendingUp, Upload, Star, Power } from 'lucide-react';
import { Link } from 'wasp/client/router';
import { toggleStoreActive, toggleStoreFavourite } from 'wasp/client/operations';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

const CompactStoreCard = ({ store, metrics, onViewDetails }) => {
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggleFavourite = async (e) => {
    e.stopPropagation();
    if (isUpdating) return;
    
    // Can't favourite a disabled store
    if (!store.isActive && !store.isFavourite) {
      return;
    }
    
    setIsUpdating(true);
    try {
      await toggleStoreFavourite({ storeId: store.id });
      // Changes will appear on next page refresh
    } catch (error) {
      console.error('Error toggling favourite:', error);
      alert(error.message || 'Failed to update favourite status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleActive = async (e) => {
    e.stopPropagation();
    if (isUpdating) return;
    
    if (store.isActive) {
      // Show confirmation dialog when disabling
      setShowDisableDialog(true);
    } else {
      // Re-enable immediately
      setIsUpdating(true);
      try {
        await toggleStoreActive({ storeId: store.id });
        // Changes will appear on next page refresh
      } catch (error) {
        console.error('Error enabling store:', error);
        alert('Failed to enable store');
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const confirmDisable = async () => {
    setIsUpdating(true);
    try {
      await toggleStoreActive({ storeId: store.id });
      setShowDisableDialog(false);
      // Changes will appear on next page refresh
    } catch (error) {
      console.error('Error disabling store:', error);
      alert('Failed to disable store');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Card className={`hover:shadow-md transition-shadow ${!store.isActive ? 'opacity-60' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                {store.name}
                {!store.isActive && (
                  <Badge variant="destructive" className="text-xs">Disabled</Badge>
                )}
              </CardTitle>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                <MapPin className="h-3 w-3 mr-1" />
                {store.location}
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${store.isFavourite ? 'text-yellow-500 hover:text-yellow-600' : 'text-muted-foreground hover:text-yellow-500'}`}
                onClick={handleToggleFavourite}
                disabled={isUpdating || (!store.isActive && !store.isFavourite)}
                title={store.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
              >
                <Star className={`h-4 w-4 ${store.isFavourite ? 'fill-current' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${store.isActive ? 'text-green-600 hover:text-red-600' : 'text-red-600 hover:text-green-600'}`}
                onClick={handleToggleActive}
                disabled={isUpdating}
                title={store.isActive ? 'Disable store' : 'Enable store'}
              >
                <Power className="h-4 w-4" />
              </Button>
            </div>
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
          <Link to="/upload">
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

      {/* Disable Confirmation Dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {store.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Historical data will be preserved but excluded from analytics. The store will be removed from default filters and analysis. You can re-enable it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDisable} disabled={isUpdating}>
              {isUpdating ? 'Disabling...' : 'Disable Store'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CompactStoreCard;
