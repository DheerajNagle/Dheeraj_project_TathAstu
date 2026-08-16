import { useState } from 'react';

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
}

export interface ModifierSelection {
  spiceLevel: 'MILD' | 'MEDIUM' | 'SPICY';
  extras: ModifierOption[];
}

interface ModifierModalProps {
  isOpen: boolean;
  itemName: string;
  itemPrice: number;
  onClose: () => void;
  onConfirm: (selection: ModifierSelection) => void;
}

const SPICE_LEVELS: ('MILD' | 'MEDIUM' | 'SPICY')[] = ['MILD', 'MEDIUM', 'SPICY'];

const EXTRA_OPTIONS: ModifierOption[] = [
  { id: 'ext_cheese', name: 'Extra Cheese', price: 40.0 },
  { id: 'ext_butter', name: 'Extra Butter/Ghee', price: 20.0 },
  { id: 'ext_portion', name: 'Extra Portion', price: 80.0 },
];

export function ModifierModal({ isOpen, itemName, itemPrice, onClose, onConfirm }: ModifierModalProps) {
  const [spiceLevel, setSpiceLevel] = useState<'MILD' | 'MEDIUM' | 'SPICY'>('MEDIUM');
  const [selectedExtras, setSelectedExtras] = useState<ModifierOption[]>([]);

  if (!isOpen) return null;

  const toggleExtra = (option: ModifierOption) => {
    setSelectedExtras(prev => {
      const exists = prev.find(o => o.id === option.id);
      if (exists) {
        return prev.filter(o => o.id !== option.id);
      }
      return [...prev, option];
    });
  };

  const extraTotal = selectedExtras.reduce((sum, o) => sum + o.price, 0);
  const finalPrice = itemPrice + extraTotal;

  const handleConfirm = () => {
    onConfirm({
      spiceLevel,
      extras: selectedExtras,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-100 animate-slide-up">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <div>
            <h3 className="font-extrabold text-gray-800 text-lg">Customize Item</h3>
            <p className="text-xs text-gray-400 mt-0.5">{itemName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 font-bold flex items-center justify-center transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Spice Level selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Spice Level</label>
            <div className="grid grid-cols-3 gap-2">
              {SPICE_LEVELS.map(level => (
                <button
                  key={level}
                  onClick={() => setSpiceLevel(level)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border capitalize transition-all ${
                    spiceLevel === level
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {level.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Extras selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Add Extra Toppings / Portions</label>
            <div className="space-y-2">
              {EXTRA_OPTIONS.map(option => {
                const isSelected = selectedExtras.some(o => o.id === option.id);
                return (
                  <div
                    key={option.id}
                    onClick={() => toggleExtra(option)}
                    className={`flex justify-between items-center p-3.5 rounded-xl border-2 cursor-pointer transition-all hover:bg-gray-50 ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/20'
                        : 'border-gray-100 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300'
                      }`}>
                        {isSelected && '✓'}
                      </div>
                      <span className="text-xs font-bold text-gray-700">{option.name}</span>
                    </div>
                    <span className="text-xs font-black text-orange-600">+₹{option.price.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 block uppercase">Total Cost</span>
            <span className="text-xl font-black text-orange-600">₹{finalPrice.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-orange-500 text-white text-xs font-bold rounded-xl shadow-lg hover:bg-orange-600 hover:shadow-orange-500/20 active:scale-95 transition-all"
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
