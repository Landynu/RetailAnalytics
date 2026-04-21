import React from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ArrowRightLeft, AlertTriangle, Package, Warehouse, ChevronRight } from 'lucide-react';

const KPICard = ({ icon: Icon, label, value, subtext, color }) => (
  <Card className="p-4">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-slate-600">{label}</p>
        {subtext && <p className="text-xs text-slate-400 mt-0.5">{subtext}</p>}
      </div>
    </div>
  </Card>
);

const TransferOverview = ({
  transferPlan,
  categoryGaps,
  storeSummaries,
  hubStore,
  onNavigateToStore
}) => {
  const { transfers, staleFlags, hubRemaining } = transferPlan;

  const urgentCount = transfers.filter(t => t.priority === 'URGENT').length;
  const highCount = transfers.filter(t => t.priority === 'HIGH').length;
  const totalUnits = transfers.reduce((sum, t) => sum + t.qty, 0);

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          icon={ArrowRightLeft}
          label="Transfer Recommendations"
          value={transfers.length}
          subtext={`${totalUnits} units total`}
          color="bg-blue-50 text-blue-600"
        />
        <KPICard
          icon={AlertTriangle}
          label="Stale Products"
          value={staleFlags.length}
          subtext={`${staleFlags.reduce((s, f) => s + f.qty, 0)} units to move`}
          color="bg-amber-50 text-amber-600"
        />
        <KPICard
          icon={Package}
          label="Category Gaps"
          value={categoryGaps.length}
          subtext="Underrepresented categories"
          color="bg-purple-50 text-purple-600"
        />
        <KPICard
          icon={Warehouse}
          label="Hub Remaining"
          value={hubRemaining ? hubRemaining.remaining.toLocaleString() : '—'}
          subtext={hubRemaining ? `${hubRemaining.allocatedOut} allocated out` : ''}
          color="bg-green-50 text-green-600"
        />
      </div>

      {/* Priority breakdown */}
      {(urgentCount > 0 || highCount > 0) && (
        <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
          <span className="text-sm text-slate-600 font-medium">Priority breakdown:</span>
          {urgentCount > 0 && (
            <Badge className="bg-red-100 text-red-800 border-red-200">
              {urgentCount} URGENT
            </Badge>
          )}
          {highCount > 0 && (
            <Badge className="bg-orange-100 text-orange-800 border-orange-200">
              {highCount} HIGH
            </Badge>
          )}
          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
            {transfers.filter(t => t.priority === 'MEDIUM').length} MEDIUM
          </Badge>
          <Badge className="bg-slate-100 text-slate-700 border-slate-200">
            {transfers.filter(t => t.priority === 'LOW').length} LOW
          </Badge>
        </div>
      )}

      {/* Store Cards Grid */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Satellite Stores</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {storeSummaries.map(summary => {
            const urgent = transfers.filter(t => t.toStoreId === summary.storeId && t.priority === 'URGENT').length;
            const high = transfers.filter(t => t.toStoreId === summary.storeId && t.priority === 'HIGH').length;

            return (
              <Card key={summary.storeId} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-800">{summary.storeName}</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigateToStore(summary.storeId)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    View <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 flex items-center gap-1.5">
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Transfers
                    </span>
                    <span className="font-medium">
                      {summary.transfersIn} items ({summary.transferUnits} units)
                    </span>
                  </div>

                  {summary.staleCount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-amber-600 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Stale
                      </span>
                      <span className="font-medium text-amber-700">
                        {summary.staleCount} items ({summary.staleUnits} units)
                      </span>
                    </div>
                  )}

                  {summary.gapCount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-purple-600 flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        Gaps
                      </span>
                      <span className="font-medium text-purple-700">
                        {summary.gapCount} categories
                      </span>
                    </div>
                  )}

                  {(urgent > 0 || high > 0) && (
                    <div className="flex gap-1.5 mt-2 pt-2 border-t">
                      {urgent > 0 && (
                        <Badge className="bg-red-100 text-red-700 text-xs">{urgent} urgent</Badge>
                      )}
                      {high > 0 && (
                        <Badge className="bg-orange-100 text-orange-700 text-xs">{high} high</Badge>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TransferOverview;
