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
      <h2 className="text-xl font-semibold text-emerald-800 mb-3">Top Selling Products by Location</h2>
      <p className="text-sm text-emerald-700 mb-4">Units sold in the selected period</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border">
          <thead className="bg-background sticky top-0">
            <tr>
              <th className="px-3 py-3 text-left font-semibold border">Product</th>
              <th className="px-3 py-3 text-left font-semibold border">Brand</th>
              <th className="px-3 py-3 text-left font-semibold border">Category</th>
              {stores.map(store => (
                <th key={store.id} className="px-3 py-3 text-right font-semibold border">
                  {store.name}
                </th>
              ))}
              <th className="px-3 py-3 text-right font-semibold border">Total</th>
            </tr>
          </thead>
          <tbody>
            {salesMatrix.map((row, idx) => (
              <tr key={idx} className="hover:bg-muted/30 border-b">
                <td className="px-3 py-3 font-medium border">{row.productName}</td>
                <td className="px-3 py-3 text-muted-foreground border">{row.brand}</td>
                <td className="px-3 py-3 text-muted-foreground text-sm border">{row.category}</td>
                {stores.map(store => (
                  <td key={store.id} className="px-3 py-3 text-right border text-base">
                    {row[store.name] || 0}
                  </td>
                ))}
                <td className="px-3 py-3 text-right font-semibold border text-base">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesMatrix;
