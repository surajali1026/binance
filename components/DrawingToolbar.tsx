import React, { useState } from 'react';
import {
  Crosshair,
  TrendingUp,
  Minus,
  ArrowUpRight,
  MoveVertical,
  Maximize2,
  Square,
  Paintbrush,
  ArrowRight,
  Type,
  GitCommit,
  GitBranch,
  Ruler,
  CalendarRange,
  Percent,
  Sliders,
  Trash2,
  BellRing,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { DrawingTool } from '../types';

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onSelectTool: (tool: DrawingTool, continuous?: boolean) => void;
  drawingsCount: number;
  onClearDrawings: () => void;
  onOpenSettings: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  favoriteTools: DrawingTool[];
  onToggleFavorite: (tool: DrawingTool) => void;
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  activeTool,
  onSelectTool,
  drawingsCount,
  onClearDrawings,
  onOpenSettings,
  isCollapsed,
  onToggleCollapse,
  favoriteTools,
  onToggleFavorite,
}) => {
  const [openFlyoutCategory, setOpenFlyoutCategory] = useState<string | null>(null);
  // TradingView-style single-shot selection: long press never locks a tool.
  const handleSelectTool = (tool: DrawingTool) => {
    onSelectTool(tool, false);
    setOpenFlyoutCategory(null);
  };

  const categories = [
    {
      id: 'pointer',
      label: 'Cursor & Quick Alerts',
      icon: <Crosshair className="w-4 h-4" />,
      tools: [
        { id: 'cursor' as DrawingTool, label: 'Crosshair / Pointer', icon: <Crosshair className="w-4 h-4" /> },
        {
          id: 'crosshair_alert' as DrawingTool,
          label: 'Alert Pointer (+ Drop Alert Anywhere)',
          icon: <BellRing className="w-4 h-4 text-[#F23645]" />,
        },
      ],
    },
    {
      id: 'lines',
      label: 'Trend & Extended Lines',
      icon: <TrendingUp className="w-4 h-4" />,
      tools: [
        { id: 'trendline' as DrawingTool, label: 'Trend Line', icon: <TrendingUp className="w-4 h-4" /> },
        { id: 'horizontal_line' as DrawingTool, label: 'Horizontal Line / Level', icon: <Minus className="w-4 h-4" /> },
        { id: 'vertical_line' as DrawingTool, label: 'Vertical Line', icon: <MoveVertical className="w-4 h-4" /> },
        { id: 'ray' as DrawingTool, label: 'Ray Line', icon: <ArrowUpRight className="w-4 h-4" /> },
        { id: 'extended_line' as DrawingTool, label: 'Extended Line (Both Ends)', icon: <Maximize2 className="w-4 h-4" /> },
        { id: 'arrow' as DrawingTool, label: 'Arrow', icon: <ArrowRight className="w-4 h-4" /> },
      ],
    },
    {
      id: 'shapes',
      label: 'Shapes & Freehand',
      icon: <Square className="w-4 h-4" />,
      tools: [
        { id: 'rectangle' as DrawingTool, label: 'Rectangular Box / Zone', icon: <Square className="w-4 h-4" /> },
        { id: 'brush' as DrawingTool, label: 'Brush (Freehand)', icon: <Paintbrush className="w-4 h-4" /> },
      ],
    },
    {
      id: 'annotation',
      label: 'Text & Notes',
      icon: <Type className="w-4 h-4" />,
      tools: [
        { id: 'text' as DrawingTool, label: 'Text Annotation', icon: <Type className="w-4 h-4" /> },
      ],
    },
    {
      id: 'fib',
      label: 'Fibonacci Tools',
      icon: <GitCommit className="w-4 h-4" />,
      tools: [
        { id: 'fibonacci' as DrawingTool, label: 'Fibonacci Retracement', icon: <GitCommit className="w-4 h-4" /> },
        { id: 'fibonacci_extension' as DrawingTool, label: 'Fibonacci Extension (3-Point)', icon: <GitBranch className="w-4 h-4" /> },
      ],
    },
    {
      id: 'measure',
      label: 'Measurement & Prediction',
      icon: <Ruler className="w-4 h-4" />,
      tools: [
        { id: 'price_percentage_measure' as DrawingTool, label: 'Price Percentage Measure (% & Bars)', icon: <Percent className="w-4 h-4 text-[#089981]" /> },
        { id: 'price_range' as DrawingTool, label: 'Price Range', icon: <Ruler className="w-4 h-4" /> },
        { id: 'date_and_price_range' as DrawingTool, label: 'Date and Price Range', icon: <CalendarRange className="w-4 h-4" /> },
      ],
    },
  ];

  // Collapsed state: Render minimalist expand button
  if (isCollapsed) {
    return (
      <div className="absolute left-1 top-12 z-30">
        <button
          onClick={onToggleCollapse}
          className="w-7 h-8 bg-[#1E222D]/95 border border-[#2B2F3A] rounded-r-md flex items-center justify-center text-[#787B86] hover:text-[#2962FF] hover:bg-[#2A2E39] shadow-lg transition-colors cursor-pointer"
          title="Expand Drawing Toolbar"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <aside
      className="w-11 md:w-12 bg-[#131722] border-r border-[#2B2F3A] flex flex-col items-center py-1.5 gap-1 shrink-0 select-none z-30 transition-all duration-200"
      aria-label="Drawing Tools"
    >
      {/* Collapse button */}
      <button
        onClick={onToggleCollapse}
        className="w-7 h-6 rounded flex items-center justify-center text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D] transition-colors mb-0.5 cursor-pointer"
        title="Collapse Drawing Toolbar"
      >
        <PanelLeftClose className="w-3.5 h-3.5" />
      </button>

      {/* Tool Categories */}
      {categories.map((cat) => {
        const hasActiveTool = cat.tools.some((t) => t.id === activeTool);
        const isOpen = openFlyoutCategory === cat.id;

        return (
          <div key={cat.id} className="relative">
            <button
              onClick={() => {
                if (cat.tools.length === 1) {
                  onSelectTool(cat.tools[0].id, false);
                  setOpenFlyoutCategory(null);
                } else {
                  setOpenFlyoutCategory(isOpen ? null : cat.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setOpenFlyoutCategory(cat.id);
              }}
              title={cat.label}
              className={`w-8 h-8 rounded flex items-center justify-center transition-colors relative cursor-pointer ${
                hasActiveTool
                  ? 'bg-[#2962FF] text-white shadow-xs'
                  : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
              }`}
            >
              {hasActiveTool
                ? cat.tools.find((t) => t.id === activeTool)?.icon
                : cat.icon}
              {cat.tools.length > 1 && (
                <div className="absolute bottom-0.5 right-0.5 w-1 h-1 bg-current opacity-70 rounded-full" />
              )}
            </button>

            {/* Flyout Submenu with Favourite Star Icons */}
            {isOpen && (
              <div className="absolute left-10 top-0 ml-1 bg-[#1E222D] border border-[#2B2F3A] rounded-lg shadow-2xl py-1 z-50 min-w-64 text-[#D1D4DC] backdrop-blur-md">
                <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-[#787B86] border-b border-[#2B2F3A] flex items-center justify-between">
                  <span>{cat.label}</span>
                  <span className="text-[9px] text-[#787B86]">★ Favorite</span>
                </div>
                {cat.tools.map((t) => {
                  const isFav = favoriteTools.includes(t.id);
                  const isCurrent = activeTool === t.id;

                  return (
                    <div
                      key={t.id}
                      className={`flex items-center justify-between px-3 py-2 text-xs hover:bg-[#2A2E39] transition-colors ${
                        isCurrent ? 'bg-[#2A2E39]/60 text-[#2962FF] font-semibold' : ''
                      }`}
                    >
                      <button
                        onClick={() => handleSelectTool(t.id)}
                        className="flex-1 flex items-center gap-2 text-left cursor-pointer truncate mr-2"
                        title="Select tool for one drawing"
                      >
                        <span className="shrink-0">{t.icon}</span>
                        <span className="truncate">{t.label}</span>
                      </button>

                      {/* Favorite Star Icon */}
                      {t.id !== 'cursor' && t.id !== 'crosshair_alert' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(t.id);
                          }}
                          className={`p-1 rounded hover:bg-[#131722] transition-colors cursor-pointer ${
                            isFav ? 'text-[#F59E0B]' : 'text-[#787B86]/50 hover:text-[#F59E0B]'
                          }`}
                          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="w-6 h-px bg-[#2B2F3A] my-1" />

      {/* Drawing Settings Trigger */}
      <button
        onClick={onOpenSettings}
        title="Drawing Tool Settings (Color, Extensions, Thickness)"
        className="w-8 h-8 rounded flex items-center justify-center text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D] transition-colors cursor-pointer relative group"
      >
        <Sliders className="w-4 h-4" />
        <div className="absolute left-10 ml-1 px-2 py-1 bg-[#1E222D] border border-[#2B2F3A] text-white text-[11px] rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
          Drawing Settings
        </div>
      </button>

      {/* Clear Drawings Button */}
      <button
        onClick={onClearDrawings}
        disabled={drawingsCount === 0}
        title={drawingsCount > 0 ? `Clear ${drawingsCount} Drawing(s)` : 'No active drawings'}
        className={`w-8 h-8 rounded flex items-center justify-center transition-colors relative group ${
          drawingsCount > 0
            ? 'text-[#787B86] hover:text-[#F23645] hover:bg-[#1E222D] cursor-pointer'
            : 'text-[#787B86]/30 cursor-not-allowed'
        }`}
      >
        <Trash2 className="w-4 h-4" />
        <div className="absolute left-10 ml-1 px-2 py-1 bg-[#1E222D] border border-[#2B2F3A] text-white text-[11px] rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
          Clear {drawingsCount} Drawings
        </div>
      </button>
    </aside>
  );
};
