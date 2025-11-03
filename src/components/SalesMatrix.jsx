import React from 'react';

const SalesMatrix = ({ salesMatrix, stores }) => {
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
