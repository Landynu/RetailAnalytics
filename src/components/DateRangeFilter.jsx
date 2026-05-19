import React, { useState, useRef } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { ChevronDown, Calendar, X } from 'lucide-react';
import DropdownPortal from './DropdownPortal';

const DateRangeFilter = ({ dateRange, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const triggerRef = useRef(null);

  const getRelativeDateRange = (preset) => {
    // Get current time in Central Time (UTC-6)
    const now = new Date();
    const centralNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));

    const end = new Date(centralNow);
    end.setHours(23, 59, 59, 999);
    let start = new Date(centralNow);

    switch (preset) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'last7':
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        break;
      case 'last14':
        start.setDate(start.getDate() - 14);
        start.setHours(0, 0, 0, 0);
        break;
      case 'last30':
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        break;
      case 'last90':
        start.setDate(start.getDate() - 90);
        start.setHours(0, 0, 0, 0);
        break;
      case 'thisMonth':
        start = new Date(start.getFullYear(), start.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'lastMonth':
        start = new Date(start.getFullYear(), start.getMonth() - 1, 1);
        end.setMonth(end.getMonth(), 0); // Last day of previous month
        end.setHours(23, 59, 59, 999);
        break;
      case 'thisYear':
        start = new Date(start.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        break;
      default:
        return null;
    }

    return { start: start.toISOString(), end: end.toISOString() };
  };

  const handlePresetClick = (preset) => {
    const range = getRelativeDateRange(preset);
    setActivePreset(preset);
    onChange({ ...range, preset }); // Include preset in the range object
    setIsOpen(false);
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      const start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      
      // Custom ranges don't include preset, so they won't be recalculated
      onChange({ start: start.toISOString(), end: end.toISOString() });
      setActivePreset('custom');
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    onChange(null);
    setActivePreset(null);
    setCustomStart('');
    setCustomEnd('');
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (!dateRange) return 'All Time';

    // Check if dateRange has a preset property (for relative ranges)
    if (dateRange.preset) {
      const presetLabels = {
        today: 'Today',
        last7: 'Last 7 Days',
        last14: 'Last 14 Days',
        last30: 'Last 30 Days',
        last90: 'Last 90 Days',
        thisMonth: 'This Month',
        lastMonth: 'Last Month',
        thisYear: 'This Year'
      };
      return presetLabels[dateRange.preset] || 'Custom Range';
    }

    // For custom date ranges, show the actual dates in Central Time
    const start = new Date(dateRange.start).toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const end = new Date(dateRange.end).toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return `${start} - ${end}`;
  };

  const presets = [
    { id: 'today', label: 'Today' },
    { id: 'last7', label: 'Last 7 Days' },
    { id: 'last14', label: 'Last 14 Days' },
    { id: 'last30', label: 'Last 30 Days' },
    { id: 'last90', label: 'Last 90 Days' },
    { id: 'thisMonth', label: 'This Month' },
    { id: 'lastMonth', label: 'Last Month' },
    { id: 'thisYear', label: 'This Year' }
  ];

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 min-w-[180px] justify-between"
        size="sm"
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span className="text-sm">{getDisplayText()}</span>
        </div>
        <div className="flex items-center gap-1">
          {dateRange && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              ✓
            </Badge>
          )}
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </Button>

      <DropdownPortal anchorRef={triggerRef} open={isOpen} onClose={() => setIsOpen(false)} align="left">
        <div className="w-[320px] bg-background border rounded-lg shadow-lg">
          <div className="p-2 border-b flex items-center justify-between">
            <span className="text-sm font-semibold">Date Range</span>
            {dateRange && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-6 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Preset Options */}
          <div className="p-2 space-y-1">
            <div className="text-xs font-medium text-muted-foreground mb-2">Quick Select</div>
            {presets.map(preset => (
              <button
                key={preset.id}
                onClick={() => handlePresetClick(preset.id)}
                className={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-secondary transition-colors ${
                  activePreset === preset.id ? 'bg-primary text-primary-foreground' : ''
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Date Range */}
          <div className="p-3 border-t space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Custom Range</div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={handleCustomApply}
                disabled={!customStart || !customEnd}
                className="w-full"
              >
                Apply Custom Range
              </Button>
            </div>
          </div>
        </div>
      </DropdownPortal>
    </div>
  );
};

export default DateRangeFilter;
