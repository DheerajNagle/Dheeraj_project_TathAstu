
interface SQLiteTable {
  id: string;
  table_number: string;
  status: string;
  capacity: number;
}

interface TableGridProps {
  tables: SQLiteTable[];
  activeOrders: any[];
  selectedTableNumber: string;
  onSelectTable: (tableNumber: string) => void;
}

export function TableGrid({ tables, activeOrders, selectedTableNumber, onSelectTable }: TableGridProps) {
  // Helper to find if a table has an active occupied order
  const getTableOrder = (tableNumber: string) => {
    return activeOrders.find(
      order => order.tableNumber === tableNumber && order.status !== 'COMPLETED' && order.status !== 'CANCELLED'
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-lg font-extrabold text-gray-800">Dining Floor Map</h3>
          <p className="text-xs text-gray-400 mt-0.5">Select a table to start billing or view live seat occupancy.</p>
        </div>
        <div className="flex gap-4 text-xs font-bold">
          <div className="flex items-center gap-1.5 text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
            <span>Vacant</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
            <span>Occupied</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
            <span>Reserved</span>
          </div>
        </div>
      </div>

      {/* Grid of Tables */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {tables.map(table => {
          const activeOrder = getTableOrder(table.table_number);
          const isOccupied = !!activeOrder;
          const isSelected = selectedTableNumber === table.table_number;

          // Determine color scheme based on status
          let borderTheme = 'border-gray-200 bg-white hover:border-orange-200';
          let badgeTheme = 'bg-green-50 text-green-700 border-green-200';
          let badgeText = 'Vacant';
          let dotColor = 'bg-green-500';

          if (isOccupied) {
            borderTheme = 'border-orange-500 bg-orange-50/10 shadow-sm';
            badgeTheme = 'bg-orange-100 text-orange-800 border-orange-200';
            badgeText = 'Occupied';
            dotColor = 'bg-orange-500';
          } else if (table.status === 'RESERVED') {
            borderTheme = 'border-gray-300 bg-gray-50';
            badgeTheme = 'bg-gray-100 text-gray-600 border-gray-200';
            badgeText = 'Reserved';
            dotColor = 'bg-gray-400';
          }

          if (isSelected) {
            borderTheme = 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/10 shadow-md';
          }

          return (
            <div
              key={table.id}
              onClick={() => table.status !== 'RESERVED' && onSelectTable(table.table_number)}
              className={`p-5 rounded-2xl border-2 flex flex-col items-center justify-between gap-4 cursor-pointer select-none transition-all ${borderTheme}`}
            >
              {/* Table Header */}
              <div className="w-full flex justify-between items-center text-xs">
                <span className="font-bold text-gray-400">Table</span>
                <span className="font-extrabold text-gray-500">{table.capacity} Pax</span>
              </div>

              {/* Graphical Table Shape */}
              <div className="relative w-20 h-20 flex items-center justify-center">
                {/* Chairs representations */}
                <div className="absolute top-0 w-4 h-2 rounded bg-gray-300"></div>
                <div className="absolute bottom-0 w-4 h-2 rounded bg-gray-300"></div>
                <div className="absolute left-0 w-2 h-4 rounded bg-gray-300"></div>
                <div className="absolute right-0 w-2 h-4 rounded bg-gray-300"></div>

                {/* Table Shape itself */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center font-black text-2xl shadow-sm border-2 ${
                  isSelected ? 'border-orange-500 text-orange-600' : 'border-gray-200 text-gray-800'
                } bg-white`}>
                  {table.table_number}
                </div>
              </div>

              {/* Status Badge */}
              <div className={`w-full text-center py-1 rounded-lg text-[10px] font-bold border ${badgeTheme}`}>
                <span className="flex items-center justify-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${isOccupied ? 'animate-pulse' : ''}`}></span>
                  {badgeText}
                </span>
              </div>

              {/* Active Order Preview */}
              {isOccupied && activeOrder && (
                <div className="w-full text-center border-t border-dashed border-orange-200 pt-3">
                  <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Cart Value</span>
                  <span className="text-sm font-black text-orange-600">₹{activeOrder.total.toFixed(2)}</span>
                  <span className="text-[9px] text-gray-400 font-semibold block mt-0.5">{activeOrder.order_number}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
