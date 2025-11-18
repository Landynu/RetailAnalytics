import React, { useState, useMemo } from 'react';
import { useQuery } from 'wasp/client/operations';
import { Link } from 'wasp/client/router';
import { getProductActions } from 'wasp/client/operations';
import { updateProductAction, completeProductAction, reactivateProductAction, deleteProductAction, exportProductActions } from 'wasp/client/operations';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import {
  Check, X, Download, Edit2, Trash2, Clock,
  AlertCircle, TrendingDown, Tag, DollarSign,
  RefreshCcw, AlertTriangle, Package, Calendar, Eye,
  Filter, Search, ArrowRightLeft
} from 'lucide-react';
import { cn } from '../lib/utils';
import KPICard from '../components/KPICard';

const ACTION_TYPE_CONFIG = {
  DO_NOT_REORDER: {
    label: 'Do Not Reorder',
    icon: AlertCircle,
    color: 'bg-red-50 border-red-200',
    badgeColor: 'bg-red-100 text-red-800',
    description: 'Slow sales, poor feedback, discontinue'
  },
  TRANSFER: {
    label: 'Transfer',
    icon: ArrowRightLeft,
    color: 'bg-teal-50 border-teal-200',
    badgeColor: 'bg-teal-100 text-teal-800',
    description: 'Transfer to another location'
  },
  PUT_ON_SALE: {
    label: 'Put on Sale',
    icon: Tag,
    color: 'bg-purple-50 border-purple-200',
    badgeColor: 'bg-purple-100 text-purple-800',
    description: 'Clear out inventory, boost sales'
  },
  REVIEW_PRICING: {
    label: 'Review Pricing',
    icon: DollarSign,
    color: 'bg-blue-50 border-blue-200',
    badgeColor: 'bg-blue-100 text-blue-800',
    description: 'Margins too low/high, competitor pricing'
  },
  PRIORITY_RESTOCK: {
    label: 'Priority Restock',
    icon: AlertTriangle,
    color: 'bg-orange-50 border-orange-200',
    badgeColor: 'bg-orange-100 text-orange-800',
    description: 'High demand, running critically low'
  },
  CUSTOMER_FAVORITE: {
    label: 'Customer Favorite',
    icon: Check,
    color: 'bg-emerald-50 border-emerald-200',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    description: 'Always keep in stock'
  },
  PROMOTIONAL_CANDIDATE: {
    label: 'Promotional Candidate',
    icon: TrendingDown,
    color: 'bg-pink-50 border-pink-200',
    badgeColor: 'bg-pink-100 text-pink-800',
    description: 'High margin, good seller'
  },
  UPDATE_INFO: {
    label: 'Update Product Info',
    icon: Edit2,
    color: 'bg-yellow-50 border-yellow-200',
    badgeColor: 'bg-yellow-100 text-yellow-800',
    description: 'Missing details, incorrect data'
  },
  SUPPLIER_ISSUE: {
    label: 'Supplier Issue',
    icon: Package,
    color: 'bg-gray-50 border-gray-200',
    badgeColor: 'bg-gray-100 text-gray-800',
    description: 'Discontinued, quality problems'
  },
  SEASONAL: {
    label: 'Seasonal Item',
    icon: Calendar,
    color: 'bg-cyan-50 border-cyan-200',
    badgeColor: 'bg-cyan-100 text-cyan-800',
    description: 'Only order at certain times'
  },
  WATCH_PERFORMANCE: {
    label: 'Watch Performance',
    icon: Eye,
    color: 'bg-indigo-50 border-indigo-200',
    badgeColor: 'bg-indigo-100 text-indigo-800',
    description: 'Monitor for a few weeks'
  }
};

const ActionsPage = () => {
  const [status, setStatus] = useState('ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingAction, setEditingAction] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set(Object.keys(ACTION_TYPE_CONFIG)));

  const { data: actionsData, refetch, isLoading } = useQuery(getProductActions, {
    status,
    groupBy: 'actionType'
  });

  const handleUpdateNotes = async (actionId) => {
    try {
      await updateProductAction({ actionId, notes: editNotes });
      setEditingAction(null);
      setEditNotes('');
      refetch();
    } catch (error) {
      alert('Error updating notes: ' + error.message);
    }
  };

  const handleComplete = async (actionId) => {
    try {
      await completeProductAction({ actionId });
      refetch();
    } catch (error) {
      alert('Error completing action: ' + error.message);
    }
  };

  const handleReactivate = async (actionId) => {
    try {
      await reactivateProductAction({ actionId });
      refetch();
    } catch (error) {
      alert('Error reactivating action: ' + error.message);
    }
  };

  const handleDelete = async (actionId) => {
    if (!confirm('Are you sure you want to delete this action?')) return;
    try {
      await deleteProductAction({ actionId });
      refetch();
    } catch (error) {
      alert('Error deleting action: ' + error.message);
    }
  };

  const handleExport = async () => {
    try {
      const result = await exportProductActions({ status });
      const blob = new Blob([result.csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `product-actions-${status.toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Error exporting actions: ' + error.message);
    }
  };

  const toggleGroup = (actionType) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(actionType)) {
        newSet.delete(actionType);
      } else {
        newSet.add(actionType);
      }
      return newSet;
    });
  };

  // Filter actions by search term
  const filteredGrouped = useMemo(() => {
    if (!actionsData?.grouped || !searchTerm) return actionsData?.grouped || {};

    const filtered = {};
    Object.entries(actionsData.grouped).forEach(([type, actions]) => {
      const matchingActions = actions.filter(action =>
        action.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        action.product.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        action.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (matchingActions.length > 0) {
        filtered[type] = matchingActions;
      }
    });
    return filtered;
  }, [actionsData, searchTerm]);

  const totalCount = actionsData?.total || 0;
  const groupedActions = filteredGrouped || {};

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCcw className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Product Actions</h1>
          <p className="text-muted-foreground">Manage product tasks and flags</p>
        </div>
        <Button onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export to CSV
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Total Actions"
          value={totalCount}
          icon={AlertCircle}
        />
        <KPICard
          title="Action Types"
          value={Object.keys(groupedActions).length}
          icon={Tag}
        />
        <KPICard
          title="Status"
          value={status}
          icon={status === 'ACTIVE' ? Clock : Check}
        />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products, brands, or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={status === 'ACTIVE' ? 'default' : 'outline'}
              onClick={() => setStatus('ACTIVE')}
            >
              Active
            </Button>
            <Button
              variant={status === 'COMPLETED' ? 'default' : 'outline'}
              onClick={() => setStatus('COMPLETED')}
            >
              Completed
            </Button>
          </div>
        </div>
      </Card>

      {/* Action Groups */}
      {Object.keys(groupedActions).length === 0 ? (
        <Card className="p-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No actions found</h3>
          <p className="text-muted-foreground">
            {searchTerm
              ? 'Try adjusting your search terms'
              : status === 'ACTIVE'
                ? 'No active actions. Create actions from the Ordering page.'
                : 'No completed actions yet.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedActions)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([actionType, actions]) => {
              const config = ACTION_TYPE_CONFIG[actionType] || {
                label: actionType,
                icon: AlertCircle,
                color: 'bg-gray-50 border-gray-200',
                badgeColor: 'bg-gray-100 text-gray-800',
                description: ''
              };
              const Icon = config.icon;
              const isExpanded = expandedGroups.has(actionType);

              return (
                <Card key={actionType} className={cn('overflow-hidden', config.color)}>
                  <div
                    className="p-4 cursor-pointer hover:bg-black/5 transition-colors"
                    onClick={() => toggleGroup(actionType)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5" />
                        <div>
                          <h3 className="font-semibold text-lg">{config.label}</h3>
                          <p className="text-sm text-muted-foreground">{config.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge className={config.badgeColor}>
                          {actions.length} {actions.length === 1 ? 'item' : 'items'}
                        </Badge>
                        <div className={cn(
                          "transition-transform duration-200",
                          isExpanded ? "rotate-180" : ""
                        )}>
                          ▼
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t bg-white">
                      {actions.map((action) => (
                        <div
                          key={action.id}
                          className="p-4 border-b last:border-b-0 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex flex-col gap-3">
                            {/* Product Info */}
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <Link
                                  to={`/product/${action.product.id}`}
                                  className="font-semibold hover:text-teal-600 hover:underline"
                                >
                                  {action.product.name}
                                </Link>
                                <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
                                  {action.product.brand && (
                                    <span className="font-medium">{action.product.brand}</span>
                                  )}
                                  {action.product.parentCategory && (
                                    <span>• {action.product.parentCategory}</span>
                                  )}
                                  {action.product.subcategory && (
                                    <span>• {action.product.subcategory}</span>
                                  )}
                                </div>
                                {action.product.wholesaleCost && action.product.retailPrice && (
                                  <div className="flex gap-4 mt-1 text-sm">
                                    <span>Cost: ${action.product.wholesaleCost.toFixed(2)}</span>
                                    <span>Retail: ${action.product.retailPrice.toFixed(2)}</span>
                                    {action.product.margin && (
                                      <span className={cn(
                                        "font-medium",
                                        action.product.margin > 0.3 ? "text-emerald-600" : "text-red-600"
                                      )}>
                                        Margin: {(action.product.margin * 100).toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <Clock className="h-3 w-3 inline mr-1" />
                                {new Date(action.createdAt).toLocaleDateString('en-US', {
                                  timeZone: 'America/Chicago',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                            </div>

                            {/* Notes Section */}
                            {editingAction === action.id ? (
                              <div className="space-y-2">
                                <Input
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  placeholder="Add notes or suggestions (e.g., 'Sale price: $29.99')"
                                  className="w-full"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateNotes(action.id)}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingAction(null);
                                      setEditNotes('');
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  {action.notes ? (
                                    <div className="bg-white border rounded p-2 text-sm">
                                      {action.notes}
                                    </div>
                                  ) : (
                                    <div className="text-sm text-muted-foreground italic">
                                      No notes
                                    </div>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingAction(action.id);
                                    setEditNotes(action.notes || '');
                                  }}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-2">
                              {status === 'ACTIVE' ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleComplete(action.id)}
                                    className="gap-1"
                                  >
                                    <Check className="h-3 w-3" />
                                    Complete
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDelete(action.id)}
                                    className="gap-1 text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleReactivate(action.id)}
                                    className="gap-1 text-emerald-600 hover:text-emerald-700"
                                  >
                                    <RefreshCcw className="h-3 w-3" />
                                    Reactivate
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDelete(action.id)}
                                    className="gap-1 text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default ActionsPage;
