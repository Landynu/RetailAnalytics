import React, { useState, useRef, useEffect } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Flag, AlertCircle, Tag, DollarSign, AlertTriangle,
  Check, TrendingDown, Edit2, Package, Calendar, Eye, ChevronDown, X, ArrowRightLeft
} from 'lucide-react';
import { cn } from '../lib/utils';
import { createProductAction, getActiveActionsByProduct } from 'wasp/client/operations';

const ACTION_TYPES = [
  {
    value: 'DO_NOT_REORDER',
    label: 'Do Not Reorder',
    icon: AlertCircle,
    color: 'text-red-600',
    description: 'Slow sales or poor feedback'
  },
  {
    value: 'TRANSFER',
    label: 'Transfer',
    icon: ArrowRightLeft,
    color: 'text-teal-600',
    description: 'Transfer to another location'
  },
  {
    value: 'PUT_ON_SALE',
    label: 'Put on Sale',
    icon: Tag,
    color: 'text-purple-600',
    description: 'Clear out inventory'
  },
  {
    value: 'REVIEW_PRICING',
    label: 'Review Pricing',
    icon: DollarSign,
    color: 'text-blue-600',
    description: 'Check margins or competitor pricing'
  },
  {
    value: 'PRIORITY_RESTOCK',
    label: 'Priority Restock',
    icon: AlertTriangle,
    color: 'text-orange-600',
    description: 'Running critically low'
  },
  {
    value: 'CUSTOMER_FAVORITE',
    label: 'Customer Favorite',
    icon: Check,
    color: 'text-emerald-600',
    description: 'Always keep in stock'
  },
  {
    value: 'PROMOTIONAL_CANDIDATE',
    label: 'Promotional Candidate',
    icon: TrendingDown,
    color: 'text-pink-600',
    description: 'High margin, good seller'
  },
  {
    value: 'UPDATE_INFO',
    label: 'Update Product Info',
    icon: Edit2,
    color: 'text-yellow-600',
    description: 'Missing or incorrect data'
  },
  {
    value: 'SUPPLIER_ISSUE',
    label: 'Supplier Issue',
    icon: Package,
    color: 'text-gray-600',
    description: 'Discontinued or quality problems'
  },
  {
    value: 'SEASONAL',
    label: 'Seasonal Item',
    icon: Calendar,
    color: 'text-cyan-600',
    description: 'Only order at certain times'
  },
  {
    value: 'WATCH_PERFORMANCE',
    label: 'Watch Performance',
    icon: Eye,
    color: 'text-indigo-600',
    description: 'Monitor for a few weeks'
  }
];

const ActionMenu = ({ productId, onActionCreated, activeActions: initialActiveActions = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeActions, setActiveActions] = useState(initialActiveActions);
  const [isFetchingActions, setIsFetchingActions] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  // Update active actions when prop changes
  useEffect(() => {
    setActiveActions(initialActiveActions);
  }, [initialActiveActions]);

  // Fetch active actions only when menu is opened (to get fresh data)
  const fetchActiveActions = async () => {
    setIsFetchingActions(true);
    try {
      const actions = await getActiveActionsByProduct({ productId });
      setActiveActions(actions || []);
    } catch (error) {
      console.error('Error fetching active actions:', error);
      setActiveActions(initialActiveActions);
    } finally {
      setIsFetchingActions(false);
    }
  };

  // Fetch actions when menu opens
  useEffect(() => {
    if (isOpen && !isFetchingActions) {
      fetchActiveActions();
    }
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCreateAction = async (actionType) => {
    setIsLoading(true);
    try {
      await createProductAction({ productId, actionType });
      await fetchActiveActions(); // Refresh the actions list
      if (onActionCreated) {
        onActionCreated();
      }
      setIsOpen(false);
    } catch (error) {
      alert('Error creating action: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const activeActionTypes = new Set(activeActions.map(a => a.actionType));

  return (
    <div className="relative inline-block" ref={menuRef}>
      <div className="flex flex-col items-center gap-0.5">
        <Button
          ref={buttonRef}
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={cn(
            "h-6 px-2 gap-1 hover:bg-slate-100"
          )}
        >
          <Flag className="h-4 w-4" />
          <ChevronDown className="h-3 w-3" />
        </Button>

        {/* Display active action symbols */}
        {activeActions.length > 0 && (
          <div className="flex gap-0.5 flex-wrap max-w-[60px] justify-center">
            {activeActions.slice(0, 3).map((action) => {
              const actionConfig = ACTION_TYPES.find(t => t.value === action.actionType);
              const Icon = actionConfig?.icon || Flag;
              return (
                <Icon
                  key={action.id}
                  className={cn("h-3 w-3", actionConfig?.color || "text-gray-600")}
                  title={actionConfig?.label}
                />
              );
            })}
            {activeActions.length > 3 && (
              <span className="text-[8px] text-gray-500">+{activeActions.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {isOpen && (
        <div
          className="fixed w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-[100]"
          style={{
            left: buttonRef.current ? `${buttonRef.current.getBoundingClientRect().left}px` : 0,
            top: buttonRef.current ? `${buttonRef.current.getBoundingClientRect().bottom + 4}px` : 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2 border-b">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Add Action</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {activeActions && activeActions.length > 0 && (
              <div className="p-2 bg-blue-50 border-b">
                <div className="text-xs font-semibold text-blue-900 mb-1">Active Actions:</div>
                <div className="flex flex-wrap gap-1">
                  {activeActions.map((action) => {
                    const actionConfig = ACTION_TYPES.find(t => t.value === action.actionType);
                    const Icon = actionConfig?.icon || Flag;
                    return (
                      <Badge key={action.id} variant="outline" className="text-xs gap-1">
                        <Icon className="h-3 w-3" />
                        {actionConfig?.label || action.actionType}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="py-1">
              {ACTION_TYPES.map((actionType) => {
                const Icon = actionType.icon;
                const isActive = activeActionTypes.has(actionType.value);

                return (
                  <button
                    key={actionType.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateAction(actionType.value);
                    }}
                    disabled={isLoading || isActive}
                    className={cn(
                      "w-full px-3 py-2 text-left hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                      isActive && "bg-gray-50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", actionType.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {actionType.label}
                          {isActive && (
                            <Badge variant="secondary" className="text-xs">Active</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {actionType.description}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionMenu;
