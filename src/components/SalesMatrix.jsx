import React from 'react';

const SalesMatrix = ({ salesMatrix, stores, isLoading = false }) => {
  // Show loading skeleton if data is still loading
  if (isLoading) {
    return (
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-emerald-800 mb-3">Top Selling Products by Location</h2>
        <p className="text-sm text-emerald-700 mb-4">Units sold in the selected period</p>
        <div className="overflow-x-auto">
          <div className="animate-pulse">
            <table className="w-full border-collapse border">
              <thead className="bg-background sticky top-0">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold border">
                    <div className="h-4 bg-muted rounded w-24"></div>
                  </th>
                  <th className="px-3 py-3 text-left font-semibold border">
                    <div className="h-4 bg-muted rounded w-20"></div>
                  </th>
                  <th className="px-3 py-3 text-left font-semibold border">
                    <div className="h-4 bg-muted rounded w-20"></div>
                  </th>
                  {stores && stores.map((store, idx) => (
                    <th key={store.id || idx} className="px-3 py-3 text-right font-semibold border">
                      <div className="h-4 bg-muted rounded w-16 ml-auto"></div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-semibold border">
                    <div className="h-4 bg-muted rounded w-12 ml-auto"></div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((row) => (
                  <tr key={row} className="hover:bg-muted/30 border-b">
                    <td className="px-3 py-3 border">
                      <div className="h-4 bg-muted rounded w-32"></div>
                    </td>
                    <td className="px-3 py-3 border">
                      <div className="h-4 bg-muted rounded w-24"></div>
                    </td>
                    <td className="px-3 py-3 border">
                      <div className="h-4 bg-muted rounded w-20"></div>
                    </td>
                    {stores && stores.map((store, idx) => (
                      <td key={store.id || idx} className="px-3 py-3 text-right border">
                        <div className="h-4 bg-muted rounded w-8 ml-auto"></div>
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right border">
                      <div className="h-4 bg-muted rounded w-10 ml-auto"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (!salesMatrix || salesMatrix.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-semibold bg-gradient-to-r from-[#14b8a6] via-[#0ea5e9] to-[#2563eb] bg-clip-text text-transparent mb-3">
        Top Selling Products by Location
      </h2>
      <p className="text-sm text-slate-600 mb-4 font-medium">Units sold in the selected period</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200/50 shadow-[0_1px_3px_rgba(0,0,0,0.05)] bg-white">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="px-4 py-4 text-left font-semibold text-sm border-r border-b border-slate-300/50 bg-gradient-to-b from-[#14b8a6]/10 via-[#0ea5e9]/5 to-[#2563eb]/10 text-slate-800">Product</th>
              <th className="px-4 py-4 text-left font-semibold text-sm border-r border-b border-slate-300/50 bg-gradient-to-b from-[#14b8a6]/10 via-[#0ea5e9]/5 to-[#2563eb]/10 text-slate-800">Brand</th>
              <th className="px-4 py-4 text-left font-semibold text-sm border-r border-b border-slate-300/50 bg-gradient-to-b from-[#14b8a6]/10 via-[#0ea5e9]/5 to-[#2563eb]/10 text-slate-800">Category</th>
              {stores.map(store => (
                <th key={store.id} className="px-4 py-4 text-right font-semibold text-sm border-r border-b border-slate-300/50 bg-gradient-to-b from-[#14b8a6]/10 via-[#0ea5e9]/5 to-[#2563eb]/10 text-slate-800">
                  {store.name}
                </th>
              ))}
              <th className="px-4 py-4 text-right font-semibold text-sm border-r border-b border-slate-300/50 bg-gradient-to-b from-[#14b8a6]/10 via-[#0ea5e9]/5 to-[#2563eb]/10 text-slate-800">Total</th>
            </tr>
          </thead>
          <tbody>
            {salesMatrix.map((row, idx) => {
              const isEven = idx % 2 === 0;
              return (
                <tr key={idx} className={`transition-all duration-200 ${
                  isEven 
                    ? 'bg-white hover:bg-gradient-to-r hover:from-teal-50/30 hover:to-blue-50/30' 
                    : 'bg-slate-50/30 hover:bg-gradient-to-r hover:from-teal-50/50 hover:to-blue-50/50'
                } border-b border-slate-200/50`}>
                  <td className="px-4 py-3 font-semibold border-r border-b border-slate-200/50 text-teal-800">{row.productName}</td>
                  <td className="px-4 py-3 text-slate-600 border-r border-b border-slate-200/50 font-medium">{row.brand}</td>
                  <td className="px-4 py-3 text-slate-500 text-sm border-r border-b border-slate-200/50">{row.category}</td>
                  {stores.map(store => (
                    <td key={store.id} className="px-4 py-3 text-right border-r border-b border-slate-200/50 text-base font-semibold text-slate-700">
                      {row[store.name] || 0}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-bold border-r border-b border-slate-200/50 text-base text-teal-700">{row.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesMatrix;
