import React from 'react';
import { X } from 'lucide-react';
import { Badge } from './ui/badge';

const FilterChip = ({ label, value, onRemove, colorClass = 'bg-blue-100 text-blue-800 hover:bg-blue-200' }) => {
  return (
    <Badge 
      variant="secondary" 
      className={`${colorClass} flex items-center gap-1 pl-2 pr-1 py-1 cursor-pointer transition-colors`}
    >
      <span className="text-xs font-medium">{label}: {value}</span>
      <button
        onClick={onRemove}
        className="ml-1 hover:bg-black/10 rounded-full p-0.5 transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
};

export default FilterChip;
