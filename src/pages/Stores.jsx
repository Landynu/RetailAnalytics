import React from 'react';
import { useQuery } from 'wasp/client/operations';
import { getUserStores } from 'wasp/client/operations';
import { toggleStoreActive, toggleStoreFavourite, toggleStorePrimary } from 'wasp/client/operations';
import { toast } from 'sonner';
import { CreateStoreModal } from '../components/CreateStoreModal';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Plus, Store as StoreIcon, Star, Crown, Eye, EyeOff } from 'lucide-react';

const Stores = () => {
  const { data: stores, isLoading, refetch } = useQuery(getUserStores);

  const handleToggleActive = async (storeId) => {
    try {
      await toggleStoreActive({ storeId });
      refetch();
    } catch (error) {
      toast.error('Error toggling store status: ' + error.message);
    }
  };

  const handleToggleFavourite = async (storeId) => {
    try {
      await toggleStoreFavourite({ storeId });
      refetch();
    } catch (error) {
      toast.error('Error toggling favourite: ' + error.message);
    }
  };

  const handleTogglePrimary = async (storeId) => {
    try {
      await toggleStorePrimary({ storeId });
      refetch();
    } catch (error) {
      toast.error('Error setting primary store: ' + error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="animate-pulse h-12 bg-muted rounded mb-6"></div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse h-48 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  // Sort stores: primary first, then favourites, then active, then disabled
  const sortedStores = stores ? [...stores].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1;
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  }) : [];

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Store Management</h1>
            <p className="text-muted-foreground mt-1">
              Manage your store locations and settings
            </p>
          </div>
          <CreateStoreModal onStoreCreated={refetch}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Store
            </Button>
          </CreateStoreModal>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <StoreIcon className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Total Stores</p>
                <p className="text-2xl font-bold">{stores?.length || 0}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Eye className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{stores?.filter(s => s.isActive).length || 0}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Star className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm text-muted-foreground">Favourites</p>
                <p className="text-2xl font-bold">{stores?.filter(s => s.isFavourite).length || 0}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Crown className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">Primary</p>
                <p className="text-2xl font-bold">{stores?.filter(s => s.isPrimary).length || 0}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Store Cards */}
        {sortedStores.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedStores.map(store => (
              <Card key={store.id} className={`p-6 relative ${!store.isActive ? 'opacity-60' : ''}`}>
                {/* Primary Store Crown */}
                {store.isPrimary && (
                  <div className="absolute top-3 right-3">
                    <Crown className="h-6 w-6 text-purple-600 fill-purple-600" />
                  </div>
                )}

                <div className="space-y-4">
                  {/* Store Name & Location */}
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {store.name}
                      {store.isFavourite && (
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground">{store.location}</p>
                  </div>

                  {/* Status Badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={store.isActive ? "default" : "secondary"}>
                      {store.isActive ? (
                        <>
                          <Eye className="h-3 w-3 mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3 w-3 mr-1" />
                          Disabled
                        </>
                      )}
                    </Badge>
                    {store.isPrimary && (
                      <Badge variant="outline" className="border-purple-600 text-purple-600">
                        <Crown className="h-3 w-3 mr-1" />
                        Primary
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-2 border-t">
                    <Button
                      variant={store.isPrimary ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTogglePrimary(store.id)}
                      disabled={!store.isActive && !store.isPrimary}
                      className="w-full"
                    >
                      <Crown className="h-4 w-4 mr-2" />
                      {store.isPrimary ? 'Unset Primary' : 'Set as Primary'}
                    </Button>

                    <div className="flex gap-2">
                      <Button
                        variant={store.isFavourite ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleToggleFavourite(store.id)}
                        disabled={!store.isActive && !store.isFavourite}
                        className="flex-1"
                      >
                        <Star className={`h-4 w-4 mr-2 ${store.isFavourite ? 'fill-current' : ''}`} />
                        Favourite
                      </Button>

                      <Button
                        variant={store.isActive ? "destructive" : "default"}
                        size="sm"
                        onClick={() => handleToggleActive(store.id)}
                        className="flex-1"
                      >
                        {store.isActive ? (
                          <>
                            <EyeOff className="h-4 w-4 mr-2" />
                            Disable
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4 mr-2" />
                            Enable
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <StoreIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Stores Found</h3>
            <p className="text-muted-foreground mb-6">
              Create your first store to get started
            </p>
            <CreateStoreModal onStoreCreated={refetch}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Store
              </Button>
            </CreateStoreModal>
          </div>
        )}

        {/* Info Section */}
        <Card className="p-6 bg-muted/50">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Crown className="h-5 w-5 text-purple-600" />
            About Primary Store
          </h3>
          <p className="text-sm text-muted-foreground">
            The primary store is used as a reference point in the Ordering Dashboard. 
            When viewing category filters, you'll see the primary store's product count 
            followed by the total across all stores. For example: "Edibles: 45 (120)" 
            indicates 45 products in the primary store out of 120 total.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default Stores;
