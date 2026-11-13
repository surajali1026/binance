import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  IPriceLine,
  CandlestickSeries,
  HistogramSeries,
  UTCTimestamp,
} from 'lightweight-charts';
import {
  CandleData,
  PriceType,
  DrawingTool,
  DrawingItem,
  DrawingPoint,
  PriceAlert,
  ReplayState,
  OHLCData,
  DrawingSettings,
} from '../types';
import {
  BinanceStreamManager,
  fetchHistoricalKlines,
  parseIntervalToMinutes,
} from '../services/binanceService';
import { alertEngine } from '../services/alertEngine';
import {
  Maximize2,
  Minimize2,
  RefreshCw,
  Camera,
  PlusCircle,
  Bell,
  Clock,
  Sparkles,
  GripVertical,
  Plus,
  Trash2,
  Pencil,
  Check,
} from 'lucide-react';

interface TradingChartProps {
  symbol: string;
  interval: string;
  priceType: PriceType;
  onChangePriceType: (type: PriceType) => void;
  onChangeInterval: (interval: string) => void;
  activeDrawingTool: DrawingTool;
  onResetDrawingTool: () => void;
  drawings: DrawingItem[];
  onAddDrawing: (drawing: DrawingItem) => void;
  onUpdateDrawing: (drawing: DrawingItem) => void;
  onDeleteDrawing: (id: string) => void;
  onClearDrawings: () => void;
  drawingSettings: DrawingSettings;
  replayState: ReplayState;
  onSelectCutoffCandle: (candle: CandleData) => void;
  onOpenAlertModal: (price?: number) => void;
  alerts: PriceAlert[];
  onAlertsChanged: () => void;
  onOpenCustomTimeframe: () => void;
}

export const TradingChart: React.FC<TradingChartProps> = ({
  symbol,
  interval,
  priceType,
  onChangePriceType,
  onChangeInterval,
  activeDrawingTool,
  onResetDrawingTool,
  drawings,
  onAddDrawing,
  onUpdateDrawing,
  onDeleteDrawing,
  drawingSettings,
  replayState,
  onSelectCutoffCandle,
  onOpenAlertModal,
  alerts,
  onAlertsChanged,
  onOpenCustomTimeframe,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const overlaySvgRef = useRef<SVGSVGElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const streamManagerRef = useRef<BinanceStreamManager | null>(null);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());

  // Full historical data
  const fullCandlesRef = useRef<CandleData[]>([]);
  const activeCandleRef = useRef<CandleData | null>(null);

  // Chart HUD & States
  const [ohlcHud, setOhlcHud] = useState<OHLCData | null>(null);
  const [countdownText, setCountdownText] = useState<string>('--:--');
  const [activePriceY, setActivePriceY] = useState<number | null>(null);
  const [isLogScale, setIsLogScale] = useState<boolean>(false);
  const [isAutoScale, setIsAutoScale] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Crosshair coordinates for quick alert "+" button on scale
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number; price: number } | null>(null);

  // Context menu
  const [showRightClickMenu, setShowRightClickMenu] = useState<{
    x: number;
    y: number;
    price: number;
  } | null>(null);

  // Dragging alert state
  const [draggingAlert, setDraggingAlert] = useState<{
    id: string;
    currentPrice: number;
  } | null>(null);

  // Drawing creation state
  const [creationPoints, setCreationPoints] = useState<DrawingPoint[]>([]);
  const [activeBrushPoints, setActiveBrushPoints] = useState<DrawingPoint[]>([]);
  const [isBrushDrawing, setIsBrushDrawing] = useState<boolean>(false);
  const [currentMouseCoord, setCurrentMouseCoord] = useState<{ x: number; y: number } | null>(null);

  // Selected drawing state for moving, resizing, and styling
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [editingTextDrawingId, setEditingTextDrawingId] = useState<string | null>(null);
  const [editTextValue, setEditTextValue] = useState<string>('');

  // Dragging / resizing an existing drawing
  const [draggingHandle, setDraggingHandle] = useState<{
    drawingId: string;
    pointIndex: number;
  } | null>(null);

  const [draggingWholeDrawing, setDraggingWholeDrawing] = useState<{
    drawingId: string;
    startPoint: DrawingPoint;
    initialPoints: DrawingPoint[];
  } | null>(null);

  // Live countdown timer calculation loop
  useEffect(() => {
    const updateCountdown = () => {
      const active = activeCandleRef.current;
      if (!active) {
        setCountdownText('--:--');
        return;
      }

      const now = Date.now();
      let closeMs = active.closeTimeMs;
      if (!closeMs) {
        const minutes = parseIntervalToMinutes(interval);
        closeMs = (active.time + minutes * 60) * 1000 - 1;
      }

      const diffMs = Math.max(0, closeMs - now);
      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      if (hours > 0) {
        setCountdownText(
          `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      } else {
        setCountdownText(
          `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }

      // Update Y pixel coordinate of active price on the right scale
      if (candleSeriesRef.current && active.close) {
        const y = candleSeriesRef.current.priceToCoordinate(active.close);
        setActivePriceY(y);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [interval]);

  // Keyboard shortcut listener for deleting selected drawings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        // Prevent deleting if user is currently typing in an input
        if (
          document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA'
        ) {
          return;
        }
        onDeleteDrawing(selectedDrawingId);
        setSelectedDrawingId(null);
      } else if (e.key === 'Escape') {
        setSelectedDrawingId(null);
        setCreationPoints([]);
        setIsBrushDrawing(false);
        setActiveBrushPoints([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDrawingId, onDeleteDrawing]);

  // Initialize Lightweight Charts Canvas
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#787B86',
        fontSize: 11,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif',
      },
      grid: {
        vertLines: { color: '#1E222D', style: LineStyle.Solid },
        horzLines: { color: '#1E222D', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#758696',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2A2E39',
        },
        horzLine: {
          color: '#758696',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2A2E39',
        },
      },
      rightPriceScale: {
        borderColor: '#2B2F3A',
        autoScale: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.18,
        },
        visible: true,
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: '#2B2F3A',
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Candlestick Series (#089981 Up, #F23645 Down)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#F23645',
      borderVisible: true,
      borderColor: '#378658',
      borderUpColor: '#089981',
      borderDownColor: '#F23645',
      wickVisible: true,
      wickUpColor: '#089981',
      wickDownColor: '#F23645',
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
    });
    candleSeriesRef.current = candlestickSeries;

    // Volume Histogram
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume_scale',
    });
    chart.priceScale('volume_scale').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
      visible: false,
    });
    volumeSeriesRef.current = volumeSeries;

    // Crosshair move listener for HUD & scale '+' alert button
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.point || !candleSeriesRef.current) {
        setCrosshairPos(null);
        const active = activeCandleRef.current;
        if (active) {
          const change = active.close - active.open;
          const changePercent = active.open !== 0 ? (change / active.open) * 100 : 0;
          setOhlcHud({
            open: active.open,
            high: active.high,
            low: active.low,
            close: active.close,
            volume: active.volume,
            change,
            changePercent,
            time: active.time,
          });
        }
        return;
      }

      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price !== null) {
        setCrosshairPos({
          x: param.point.x,
          y: param.point.y,
          price,
        });
      }

      const candleData = param.seriesData.get(candleSeriesRef.current) as {
        open?: number;
        high?: number;
        low?: number;
        close?: number;
      } | undefined;

      const volData = param.seriesData.get(volumeSeries) as { value?: number } | undefined;

      if (candleData && candleData.open !== undefined && candleData.close !== undefined) {
        const change = candleData.close - candleData.open;
        const changePercent = candleData.open !== 0 ? (change / candleData.open) * 100 : 0;
        setOhlcHud({
          open: candleData.open,
          high: candleData.high ?? candleData.open,
          low: candleData.low ?? candleData.open,
          close: candleData.close,
          volume: volData?.value ?? 0,
          change,
          changePercent,
          time: Number(param.time || Date.now() / 1000),
        });
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const streamManager = new BinanceStreamManager();
    streamManagerRef.current = streamManager;

    return () => {
      resizeObserver.disconnect();
      streamManager.destroy();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  const updatePricePrecision = (lastPrice: number) => {
    if (!candleSeriesRef.current) return;
    let precision = 2;
    let minMove = 0.01;
    if (lastPrice < 0.001) {
      precision = 6;
      minMove = 0.000001;
    } else if (lastPrice < 1) {
      precision = 4;
      minMove = 0.0001;
    } else if (lastPrice < 10) {
      precision = 3;
      minMove = 0.001;
    }
    candleSeriesRef.current.applyOptions({
      priceFormat: {
        type: 'price',
        precision,
        minMove,
      },
    });
  };

  // Load Historical Data & Connect WebSocket/Tick Stream
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadDataAndStream = async () => {
      try {
        const prevRange = chartRef.current?.timeScale().getVisibleLogicalRange();
        const candles = await fetchHistoricalKlines(symbol, interval, priceType, 1000);
        if (!isMounted) return;

        fullCandlesRef.current = candles;

        if (candles.length > 0) {
          const lastCandle = candles[candles.length - 1];
          activeCandleRef.current = lastCandle;
          updatePricePrecision(lastCandle.close);

          const change = lastCandle.close - lastCandle.open;
          const changePercent = (change / lastCandle.open) * 100;
          setOhlcHud({
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            close: lastCandle.close,
            volume: lastCandle.volume,
            change,
            changePercent,
            time: lastCandle.time,
          });

          // Set chart candle series
          const formattedCandles = candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));
          candleSeriesRef.current?.setData(formattedCandles);

          // Set volume series
          const formattedVolumes = candles.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? '#08998140' : '#F2364540',
          }));
          volumeSeriesRef.current?.setData(formattedVolumes);

          // Maintain zoom position
          if (prevRange && chartRef.current) {
            chartRef.current.timeScale().setVisibleLogicalRange(prevRange);
          } else {
            chartRef.current?.timeScale().fitContent();
          }

          streamManagerRef.current?.setActiveCandle(lastCandle);
        }

        setIsLoading(false);

        // Connect real-time WebSocket & Tick Stream
        if (streamManagerRef.current) {
          streamManagerRef.current.subscribe(
            symbol,
            interval,
            priceType,
            (updatedCandle, isClosed) => {
              if (replayState.isActive) return;

              activeCandleRef.current = updatedCandle;

              // Live candle movement update
              candleSeriesRef.current?.update({
                time: updatedCandle.time as UTCTimestamp,
                open: updatedCandle.open,
                high: updatedCandle.high,
                low: updatedCandle.low,
                close: updatedCandle.close,
              });

              volumeSeriesRef.current?.update({
                time: updatedCandle.time as UTCTimestamp,
                value: updatedCandle.volume,
                color: updatedCandle.close >= updatedCandle.open ? '#08998140' : '#F2364540',
              });

              const y = candleSeriesRef.current?.priceToCoordinate(updatedCandle.close);
              if (y !== undefined) setActivePriceY(y);

              const change = updatedCandle.close - updatedCandle.open;
              const changePercent = updatedCandle.open !== 0 ? (change / updatedCandle.open) * 100 : 0;
              setOhlcHud({
                open: updatedCandle.open,
                high: updatedCandle.high,
                low: updatedCandle.low,
                close: updatedCandle.close,
                volume: updatedCandle.volume,
                change,
                changePercent,
                time: updatedCandle.time,
              });

              if (isClosed) {
                fullCandlesRef.current.push(updatedCandle);
              }
            },
            (tickPrice, tickPriceType) => {
              if (replayState.isActive) return;
              alertEngine.checkTick(tickPrice, symbol, tickPriceType);
            }
          );
        }
      } catch (err) {
        if (isMounted) setIsLoading(false);
      }
    };

    loadDataAndStream();

    return () => {
      isMounted = false;
    };
  }, [symbol, interval, priceType]);

  // Handle Bar Replay slicing
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    if (replayState.isActive) {
      streamManagerRef.current?.setPaused(true);

      const replayBars = replayState.allCandles.slice(0, replayState.currentIndex + 1);
      if (replayBars.length > 0) {
        const last = replayBars[replayBars.length - 1];
        activeCandleRef.current = last;

        candleSeriesRef.current.setData(
          replayBars.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );

        volumeSeriesRef.current.setData(
          replayBars.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? '#08998140' : '#F2364540',
          }))
        );
      }
    } else {
      streamManagerRef.current?.setPaused(false);
      if (fullCandlesRef.current.length > 0) {
        candleSeriesRef.current.setData(
          fullCandlesRef.current.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
        volumeSeriesRef.current.setData(
          fullCandlesRef.current.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? '#08998140' : '#F2364540',
          }))
        );
      }
    }
  }, [replayState.isActive, replayState.currentIndex]);

  // Sync Price Alert lines on series
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const series = candleSeriesRef.current;

    priceLinesMapRef.current.forEach((line, alertId) => {
      const exists = alerts.some((a) => a.id === alertId && a.status === 'active' && a.symbol === symbol);
      if (!exists) {
        series.removePriceLine(line);
        priceLinesMapRef.current.delete(alertId);
      }
    });

    alerts
      .filter((a) => a.symbol === symbol && a.status === 'active')
      .forEach((alert) => {
        let priceLine = priceLinesMapRef.current.get(alert.id);
        const displayPrice = draggingAlert?.id === alert.id ? draggingAlert.currentPrice : alert.price;

        if (!priceLine) {
          priceLine = series.createPriceLine({
            price: displayPrice,
            color: '#F23645',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `Alert (${displayPrice.toFixed(2)})`,
          });
          priceLinesMapRef.current.set(alert.id, priceLine);
        } else {
          priceLine.applyOptions({
            price: displayPrice,
            title: `Alert (${displayPrice.toFixed(2)})`,
          });
        }
      });
  }, [alerts, symbol, draggingAlert]);

  // Draggable Alert Handler (Free moving)
  const handleAlertMouseDown = (alertId: string, initialPrice: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    let latestPrice = initialPrice;
    setDraggingAlert({ id: alertId, currentPrice: initialPrice });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!chartContainerRef.current || !candleSeriesRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const y = moveEvent.clientY - rect.top;
      const newPrice = candleSeriesRef.current.coordinateToPrice(y);
      if (newPrice !== null && newPrice > 0) {
        latestPrice = newPrice;
        setDraggingAlert({ id: alertId, currentPrice: newPrice });
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setDraggingAlert(null);
      alertEngine.updateAlertPrice(alertId, latestPrice);
      onAlertsChanged();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Convert time & price to SVG coordinates
  const getCoordinates = useCallback(
    (point: { time: number; price: number }): { x: number; y: number } | null => {
      if (!chartRef.current || !candleSeriesRef.current) return null;
      const x = chartRef.current.timeScale().timeToCoordinate(point.time as UTCTimestamp);
      const y = candleSeriesRef.current.priceToCoordinate(point.price);
      if (x === null || y === null) return null;
      return { x: Number(x), y: Number(y) };
    },
    []
  );

  // Canvas Pointer Down: Supports mouse & Android touch gestures
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!chartRef.current || !candleSeriesRef.current || !chartContainerRef.current) return;

    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = chartRef.current.timeScale().coordinateToTime(x) as number | null;
    const price = candleSeriesRef.current.coordinateToPrice(y);

    if (time === null || price === null) return;

    // Quick Alert Crosshair Tool
    if (activeDrawingTool === 'crosshair_alert') {
      alertEngine.addAlert({
        symbol,
        price,
        condition: 'crossing',
        createdPrice: activeCandleRef.current?.close || price,
        repeat: 'once',
        priceType,
        sound: 'price_reach',
        vibrate: true,
        note: `Set via Crosshair at ${price.toFixed(2)}`,
      });
      onAlertsChanged();
      onResetDrawingTool();
      return;
    }

    // Bar Replay Cutoff Selection
    if (replayState.isSelectingCutoff) {
      const closest = fullCandlesRef.current.reduce((prev, curr) =>
        Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev
      );
      if (closest) onSelectCutoffCandle(closest);
      return;
    }

    // Freehand Brush Tool
    if (activeDrawingTool === 'brush') {
      setIsBrushDrawing(true);
      setActiveBrushPoints([{ time, price }]);
      return;
    }

    // Text Tool (Single Click)
    if (activeDrawingTool === 'text') {
      const textVal = window.prompt('Enter Note / Text:', 'Key Level / Note') || 'Note';
      onAddDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'text',
        points: [{ time, price }],
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
        fontSize: drawingSettings.fontSize || 14,
        text: textVal,
      });
      onResetDrawingTool();
      return;
    }

    // Single-Point Tools: Horizontal & Vertical Line
    if (activeDrawingTool === 'horizontal_line') {
      onAddDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'horizontal_line',
        points: [{ time, price }],
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
        lineStyle: drawingSettings.lineStyle,
        extendLeft: drawingSettings.extendLeft,
        extendRight: drawingSettings.extendRight,
      });
      return;
    }

    if (activeDrawingTool === 'vertical_line') {
      onAddDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'vertical_line',
        points: [{ time, price }],
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
        lineStyle: drawingSettings.lineStyle,
      });
      return;
    }

    // Two-Point Tools (Trendline, Ray, Extended Line, Arrow, Rectangle, Fibonacci, Price Range, Date & Price Range)
    const twoPointTools: DrawingTool[] = [
      'trendline',
      'ray',
      'extended_line',
      'arrow',
      'rectangle',
      'fibonacci',
      'price_range',
      'date_and_price_range',
    ];

    if (twoPointTools.includes(activeDrawingTool)) {
      if (creationPoints.length === 0) {
        setCreationPoints([{ time, price }]);
      } else {
        onAddDrawing({
          id: 'drawing_' + Date.now(),
          tool: activeDrawingTool,
          points: [creationPoints[0], { time, price }],
          color: drawingSettings.color,
          lineWidth: drawingSettings.lineWidth,
          lineStyle: drawingSettings.lineStyle,
          extendLeft: activeDrawingTool === 'extended_line' ? true : drawingSettings.extendLeft,
          extendRight:
            activeDrawingTool === 'extended_line' || activeDrawingTool === 'ray'
              ? true
              : drawingSettings.extendRight,
          fillColor: drawingSettings.fillColor || drawingSettings.color,
          fillOpacity: drawingSettings.fillOpacity,
        });
        setCreationPoints([]);
      }
      return;
    }

    // Three-Point Tool: Fibonacci Extension
    if (activeDrawingTool === 'fibonacci_extension') {
      if (creationPoints.length === 0) {
        setCreationPoints([{ time, price }]);
      } else if (creationPoints.length === 1) {
        setCreationPoints([creationPoints[0], { time, price }]);
      } else if (creationPoints.length === 2) {
        onAddDrawing({
          id: 'drawing_' + Date.now(),
          tool: 'fibonacci_extension',
          points: [creationPoints[0], creationPoints[1], { time, price }],
          color: drawingSettings.color,
          lineWidth: drawingSettings.lineWidth,
          lineStyle: drawingSettings.lineStyle,
        });
        setCreationPoints([]);
      }
      return;
    }

    // Default Cursor mode: Deselect if clicked on empty canvas
    if (activeDrawingTool === 'cursor') {
      setSelectedDrawingId(null);
    }
  };

  // Canvas Pointer Move
  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentMouseCoord({ x, y });

    // Brush drawing in progress
    if (isBrushDrawing && chartRef.current && candleSeriesRef.current) {
      const time = chartRef.current.timeScale().coordinateToTime(x) as number | null;
      const price = candleSeriesRef.current.coordinateToPrice(y);
      if (time !== null && price !== null) {
        setActiveBrushPoints((prev) => [...prev, { time, price }]);
      }
      return;
    }

    // Dragging a specific point handle of a selected drawing
    if (draggingHandle && chartRef.current && candleSeriesRef.current) {
      const time = chartRef.current.timeScale().coordinateToTime(x) as number | null;
      const price = candleSeriesRef.current.coordinateToPrice(y);
      if (time !== null && price !== null) {
        const targetDrawing = drawings.find((d) => d.id === draggingHandle.drawingId);
        if (targetDrawing) {
          const updatedPoints = [...targetDrawing.points];
          updatedPoints[draggingHandle.pointIndex] = { time, price };
          onUpdateDrawing({ ...targetDrawing, points: updatedPoints });
        }
      }
      return;
    }

    // Dragging an entire drawing to move it
    if (draggingWholeDrawing && chartRef.current && candleSeriesRef.current) {
      const time = chartRef.current.timeScale().coordinateToTime(x) as number | null;
      const price = candleSeriesRef.current.coordinateToPrice(y);
      if (time !== null && price !== null) {
        const deltaPrice = price - draggingWholeDrawing.startPoint.price;
        const deltaTime = time - draggingWholeDrawing.startPoint.time;

        const targetDrawing = drawings.find((d) => d.id === draggingWholeDrawing.drawingId);
        if (targetDrawing) {
          const shiftedPoints = draggingWholeDrawing.initialPoints.map((pt) => ({
            time: pt.time + deltaTime,
            price: pt.price + deltaPrice,
          }));
          onUpdateDrawing({ ...targetDrawing, points: shiftedPoints });
        }
      }
    }
  };

  // Canvas Pointer Up
  const handleCanvasPointerUp = () => {
    if (isBrushDrawing && activeBrushPoints.length > 1) {
      onAddDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'brush',
        points: activeBrushPoints.slice(0, 2),
        brushPoints: activeBrushPoints,
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
      });
      setIsBrushDrawing(false);
      setActiveBrushPoints([]);
    }

    if (draggingHandle) {
      setDraggingHandle(null);
    }
    if (draggingWholeDrawing) {
      setDraggingWholeDrawing(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!candleSeriesRef.current || !chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const price = candleSeriesRef.current.coordinateToPrice(y);
    if (price !== null) {
      setShowRightClickMenu({
        x: e.clientX,
        y: e.clientY,
        price,
      });
    }
  };

  const formatPriceDisplay = (p: number): string => {
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    if (p >= 0.01) return p.toFixed(4);
    return p.toFixed(6);
  };

  const timeframes = [
    { label: '1m', val: '1m' },
    { label: '3m', val: '3m' },
    { label: '5m', val: '5m' },
    { label: '15m', val: '15m' },
    { label: '30m', val: '30m' },
    { label: '1h', val: '1h' },
    { label: '4h', val: '4h' },
    { label: '1D', val: '1d' },
    { label: '1W', val: '1w' },
  ];

  const isCurrentIntervalCustom = !timeframes.some((t) => t.val === interval);
  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId);

  return (
    <div className="relative flex-1 h-full bg-[#131722] flex flex-col overflow-hidden select-none">
      {/* Top Chart Header Toolbar */}
      <header className="h-10 bg-[#1E222D] border-b border-[#2B2F3A] flex items-center justify-between px-3 gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <div className="flex items-center gap-1.5 font-bold text-sm text-white shrink-0 tracking-tight">
            <span>{symbol}</span>
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#2A2E39] text-[#2962FF] uppercase">
              USDT.P
            </span>
          </div>

          <div className="w-px h-4 bg-[#2B2F3A] mx-1 shrink-0" />

          {/* 3-WAY PRICE SOURCE SWITCHER */}
          <div className="flex items-center p-0.5 bg-[#131722] rounded-md border border-[#2B2F3A] shrink-0">
            <button
              onClick={() => onChangePriceType('last')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap cursor-pointer ${
                priceType === 'last' ? 'bg-[#2962FF] text-white shadow-xs' : 'text-[#787B86] hover:text-[#D1D4DC]'
              }`}
            >
              Last Price
            </button>
            <button
              onClick={() => onChangePriceType('mark')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap cursor-pointer ${
                priceType === 'mark' ? 'bg-[#2962FF] text-white shadow-xs' : 'text-[#787B86] hover:text-[#D1D4DC]'
              }`}
            >
              Mark Price
            </button>
            <button
              onClick={() => onChangePriceType('index')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap cursor-pointer ${
                priceType === 'index' ? 'bg-[#2962FF] text-white shadow-xs' : 'text-[#787B86] hover:text-[#D1D4DC]'
              }`}
            >
              Index Price
            </button>
          </div>

          <div className="w-px h-4 bg-[#2B2F3A] mx-1 shrink-0" />

          {/* Timeframes */}
          <div className="flex items-center gap-0.5 shrink-0">
            {timeframes.map((tf) => (
              <button
                key={tf.val}
                onClick={() => onChangeInterval(tf.val)}
                className={`px-1.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  interval === tf.val
                    ? 'bg-[#2A2E39] text-[#2962FF] font-bold'
                    : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]/60'
                }`}
              >
                {tf.label}
              </button>
            ))}

            <button
              onClick={onOpenCustomTimeframe}
              className={`px-2 py-1 text-xs font-mono font-medium rounded border transition-colors flex items-center gap-1 cursor-pointer ${
                isCurrentIntervalCustom
                  ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-bold'
                  : 'border-[#2B2F3A] text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{isCurrentIntervalCustom ? interval : '+'}</span>
            </button>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onOpenAlertModal(activeCandleRef.current?.close)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-[#131722] border border-[#2B2F3A] text-[#D1D4DC] hover:border-[#2962FF] transition-colors cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5 text-[#2962FF]" />
            <span className="hidden sm:inline">Alert</span>
            {alerts.filter((a) => a.symbol === symbol && a.status === 'active').length > 0 && (
              <span className="ml-0.5 px-1 bg-[#2962FF] text-white text-[10px] rounded-full font-mono">
                {alerts.filter((a) => a.symbol === symbol && a.status === 'active').length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              if (!chartRef.current || !chartContainerRef.current) return;
              const canvas = chartContainerRef.current.querySelector('canvas');
              if (canvas) {
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = `${symbol}_${interval}_${Date.now()}.png`;
                a.click();
              }
            }}
            className="p-1.5 rounded text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] transition-colors cursor-pointer"
            title="Save PNG Snapshot"
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
                setIsFullscreen(true);
              } else {
                document.exitFullscreen().catch(() => {});
                setIsFullscreen(false);
              }
            }}
            className="p-1.5 rounded text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Crosshair Alert Tool Active Banner */}
      {activeDrawingTool === 'crosshair_alert' && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 bg-[#F23645] text-white px-4 py-1.5 rounded-full shadow-lg text-xs font-medium flex items-center gap-2 animate-bounce">
          <Bell className="w-3.5 h-3.5" />
          <span>Click anywhere on the chart to drop a price alert</span>
          <button
            onClick={onResetDrawingTool}
            className="ml-2 bg-black/20 hover:bg-black/40 rounded-full px-1.5 py-0.5 text-[10px]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Crosshair & OHLC HUD Overlay */}
      <div className="absolute top-12 left-4 z-10 pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-[#D1D4DC]">
          <span className="font-bold">{symbol}</span>
          <span className="text-[#787B86]">{interval}</span>
          <span className="text-[10px] text-[#2962FF] uppercase font-bold px-1 rounded bg-[#1E222D]">
            {priceType}
          </span>
        </div>

        {ohlcHud && (
          <div className="flex items-center gap-2.5 text-[11px] tabular-nums">
            <span className="text-[#787B86]">
              O <span className="text-[#D1D4DC]">{formatPriceDisplay(ohlcHud.open)}</span>
            </span>
            <span className="text-[#787B86]">
              H <span className="text-[#D1D4DC]">{formatPriceDisplay(ohlcHud.high)}</span>
            </span>
            <span className="text-[#787B86]">
              L <span className="text-[#D1D4DC]">{formatPriceDisplay(ohlcHud.low)}</span>
            </span>
            <span className="text-[#787B86]">
              C{' '}
              <span
                className={`font-semibold ${
                  ohlcHud.close >= ohlcHud.open ? 'text-[#089981]' : 'text-[#F23645]'
                }`}
              >
                {formatPriceDisplay(ohlcHud.close)}
              </span>
            </span>
            <span
              className={`font-medium ${
                ohlcHud.change >= 0 ? 'text-[#089981]' : 'text-[#F23645]'
              }`}
            >
              {ohlcHud.change >= 0 ? '+' : ''}
              {formatPriceDisplay(ohlcHud.change)} ({ohlcHud.change >= 0 ? '+' : ''}
              {ohlcHud.changePercent.toFixed(2)}%)
            </span>
          </div>
        )}
      </div>

      {/* Main Chart Canvas Container */}
      <div
        ref={chartContainerRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onContextMenu={handleContextMenu}
        className={`relative flex-1 w-full h-full overflow-hidden touch-none ${
          activeDrawingTool === 'crosshair_alert'
            ? 'cursor-cell'
            : activeDrawingTool !== 'cursor'
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
      >
        {isLoading && (
          <div className="absolute inset-0 bg-[#131722]/80 z-20 flex flex-col items-center justify-center gap-2 text-xs text-[#787B86]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#2962FF]" />
            <span>Fetching Binance {priceType.toUpperCase()} klines...</span>
          </div>
        )}

        {/* SVG Drawing Canvas with Interactive Selection & Point Handles */}
        <svg
          ref={overlaySvgRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-15"
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#2962FF" />
            </marker>
          </defs>

          {drawings.map((drawing) => {
            const isSelected = selectedDrawingId === drawing.id;
            const strokeDash =
              drawing.lineStyle === 'dashed'
                ? '6 4'
                : drawing.lineStyle === 'dotted'
                ? '2 2'
                : undefined;

            // Trendline, Ray, Extended Line, Arrow
            if (
              (drawing.tool === 'trendline' ||
                drawing.tool === 'ray' ||
                drawing.tool === 'extended_line' ||
                drawing.tool === 'arrow') &&
              drawing.points.length >= 2
            ) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              if (!p1 || !p2) return null;

              let x1: number = p1.x;
              let y1: number = p1.y;
              let x2: number = p2.x;
              let y2: number = p2.y;

              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;

              if (drawing.extendRight || drawing.tool === 'ray' || drawing.tool === 'extended_line') {
                x2 = 2500;
                y2 = p1.y + (dy / (dx || 0.001)) * (2500 - p1.x);
              }
              if (drawing.extendLeft || drawing.tool === 'extended_line') {
                x1 = 0;
                y1 = p1.y + (dy / (dx || 0.001)) * (0 - p1.x);
              }

              return (
                <g key={drawing.id}>
                  {/* Invisible wide stroke for easy clicking/touching */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={16}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedDrawingId(drawing.id);
                      setDraggingWholeDrawing({
                        drawingId: drawing.id,
                        startPoint: drawing.points[0],
                        initialPoints: drawing.points,
                      });
                    }}
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={drawing.color}
                    strokeWidth={drawing.lineWidth}
                    strokeDasharray={strokeDash}
                    markerEnd={drawing.tool === 'arrow' ? 'url(#arrowhead)' : undefined}
                  />

                  {/* Handles if selected */}
                  {isSelected && (
                    <>
                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r={6}
                        fill="#FFFFFF"
                        stroke="#2962FF"
                        strokeWidth={2}
                        className="pointer-events-auto cursor-grab"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingHandle({ drawingId: drawing.id, pointIndex: 0 });
                        }}
                      />
                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r={6}
                        fill="#FFFFFF"
                        stroke="#2962FF"
                        strokeWidth={2}
                        className="pointer-events-auto cursor-grab"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingHandle({ drawingId: drawing.id, pointIndex: 1 });
                        }}
                      />
                    </>
                  )}
                </g>
              );
            }

            // Horizontal Line
            if (drawing.tool === 'horizontal_line' && drawing.points[0]) {
              const coords = getCoordinates(drawing.points[0]);
              if (!coords) return null;
              return (
                <g key={drawing.id}>
                  <line
                    x1={0}
                    y1={coords.y}
                    x2="100%"
                    y2={coords.y}
                    stroke="transparent"
                    strokeWidth={16}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedDrawingId(drawing.id);
                    }}
                  />
                  <line
                    x1={drawing.extendLeft ? 0 : coords.x}
                    y1={coords.y}
                    x2={drawing.extendRight !== false ? '100%' : coords.x + 200}
                    y2={coords.y}
                    stroke={drawing.color}
                    strokeWidth={drawing.lineWidth}
                    strokeDasharray={strokeDash}
                  />
                  <text
                    x={10}
                    y={coords.y - 4}
                    fill={drawing.color}
                    fontSize={10}
                    fontFamily="monospace"
                  >
                    Level: {drawing.points[0].price.toFixed(2)}
                  </text>
                  {isSelected && (
                    <circle
                      cx={coords.x}
                      cy={coords.y}
                      r={6}
                      fill="#FFFFFF"
                      stroke="#2962FF"
                      strokeWidth={2}
                      className="pointer-events-auto cursor-ns-resize"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDraggingHandle({ drawingId: drawing.id, pointIndex: 0 });
                      }}
                    />
                  )}
                </g>
              );
            }

            // Vertical Line
            if (drawing.tool === 'vertical_line' && drawing.points[0]) {
              const coords = getCoordinates(drawing.points[0]);
              if (!coords) return null;
              return (
                <g key={drawing.id}>
                  <line
                    x1={coords.x}
                    y1={0}
                    x2={coords.x}
                    y2="100%"
                    stroke="transparent"
                    strokeWidth={16}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedDrawingId(drawing.id);
                    }}
                  />
                  <line
                    x1={coords.x}
                    y1={0}
                    x2={coords.x}
                    y2="100%"
                    stroke={drawing.color}
                    strokeWidth={drawing.lineWidth}
                    strokeDasharray={strokeDash}
                  />
                  {isSelected && (
                    <circle
                      cx={coords.x}
                      cy={coords.y}
                      r={6}
                      fill="#FFFFFF"
                      stroke="#2962FF"
                      strokeWidth={2}
                      className="pointer-events-auto cursor-ew-resize"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDraggingHandle({ drawingId: drawing.id, pointIndex: 0 });
                      }}
                    />
                  )}
                </g>
              );
            }

            // Rectangle Box
            if (drawing.tool === 'rectangle' && drawing.points.length >= 2) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              if (!p1 || !p2) return null;

              const x = Math.min(p1.x, p2.x);
              const y = Math.min(p1.y, p2.y);
              const w = Math.abs(p2.x - p1.x);
              const h = Math.abs(p2.y - p1.y);

              return (
                <g key={drawing.id}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={drawing.fillColor || drawing.color}
                    fillOpacity={drawing.fillOpacity || 0.2}
                    stroke={drawing.color}
                    strokeWidth={drawing.lineWidth}
                    strokeDasharray={strokeDash}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedDrawingId(drawing.id);
                      setDraggingWholeDrawing({
                        drawingId: drawing.id,
                        startPoint: drawing.points[0],
                        initialPoints: drawing.points,
                      });
                    }}
                  />
                  {isSelected && (
                    <>
                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r={6}
                        fill="#FFFFFF"
                        stroke="#2962FF"
                        strokeWidth={2}
                        className="pointer-events-auto cursor-grab"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingHandle({ drawingId: drawing.id, pointIndex: 0 });
                        }}
                      />
                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r={6}
                        fill="#FFFFFF"
                        stroke="#2962FF"
                        strokeWidth={2}
                        className="pointer-events-auto cursor-grab"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingHandle({ drawingId: drawing.id, pointIndex: 1 });
                        }}
                      />
                    </>
                  )}
                </g>
              );
            }

            // Freehand Brush
            if (drawing.tool === 'brush' && drawing.brushPoints && drawing.brushPoints.length > 1) {
              const pts = drawing.brushPoints
                .map((p) => getCoordinates(p))
                .filter((p): p is { x: number; y: number } => p !== null);

              if (pts.length < 2) return null;
              const pathStr = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((pt) => `L ${pt.x} ${pt.y}`).join(' ');

              return (
                <g key={drawing.id}>
                  <path
                    d={pathStr}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedDrawingId(drawing.id);
                    }}
                  />
                  <path
                    d={pathStr}
                    fill="none"
                    stroke={drawing.color}
                    strokeWidth={drawing.lineWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            }

            // Text Annotation
            if (drawing.tool === 'text' && drawing.points[0]) {
              const coords = getCoordinates(drawing.points[0]);
              if (!coords) return null;
              return (
                <g
                  key={drawing.id}
                  className="pointer-events-auto cursor-pointer"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedDrawingId(drawing.id);
                  }}
                  onDoubleClick={() => {
                    const next = window.prompt('Edit Text:', drawing.text || '');
                    if (next !== null) {
                      onUpdateDrawing({ ...drawing, text: next });
                    }
                  }}
                >
                  <rect
                    x={coords.x - 4}
                    y={coords.y - 18}
                    width={(drawing.text?.length || 4) * 8 + 12}
                    height={24}
                    fill="#1E222D"
                    fillOpacity={0.8}
                    rx={4}
                    stroke={isSelected ? '#2962FF' : '#2B2F3A'}
                    strokeWidth={1}
                  />
                  <text
                    x={coords.x + 2}
                    y={coords.y - 2}
                    fill={drawing.color}
                    fontSize={drawing.fontSize || 13}
                    fontWeight="500"
                    fontFamily="sans-serif"
                  >
                    {drawing.text || 'Note'}
                  </text>
                  {isSelected && (
                    <circle
                      cx={coords.x}
                      cy={coords.y - 6}
                      r={5}
                      fill="#FFFFFF"
                      stroke="#2962FF"
                      strokeWidth={2}
                      className="cursor-move"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDraggingHandle({ drawingId: drawing.id, pointIndex: 0 });
                      }}
                    />
                  )}
                </g>
              );
            }

            // Fibonacci Retracement
            if (drawing.tool === 'fibonacci' && drawing.points.length >= 2) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              if (!p1 || !p2) return null;

              const levels = [
                { ratio: 0, label: '0.0%' },
                { ratio: 0.236, label: '23.6%' },
                { ratio: 0.382, label: '38.2%' },
                { ratio: 0.5, label: '50.0%' },
                { ratio: 0.618, label: '61.8%' },
                { ratio: 0.786, label: '78.6%' },
                { ratio: 1.0, label: '100.0%' },
              ];

              const yDiff = p2.y - p1.y;
              const priceDiff = drawing.points[1].price - drawing.points[0].price;

              return (
                <g
                  key={drawing.id}
                  className="pointer-events-auto cursor-pointer"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedDrawingId(drawing.id);
                  }}
                >
                  {levels.map((lvl) => {
                    const y = p1.y + yDiff * lvl.ratio;
                    const price = drawing.points[0].price + priceDiff * lvl.ratio;
                    return (
                      <g key={lvl.label}>
                        <line
                          x1={Math.min(p1.x, p2.x)}
                          y1={y}
                          x2="100%"
                          y2={y}
                          stroke="#F59E0B"
                          strokeWidth={1}
                          strokeOpacity={0.8}
                          strokeDasharray={lvl.ratio === 0.5 ? 'none' : '3 3'}
                        />
                        <text
                          x={Math.max(p1.x, p2.x) + 5}
                          y={y - 3}
                          fill="#F59E0B"
                          fontSize={9}
                          fontFamily="monospace"
                        >
                          {lvl.label} ({price.toFixed(2)})
                        </text>
                      </g>
                    );
                  })}
                  {isSelected && (
                    <>
                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r={6}
                        fill="#FFFFFF"
                        stroke="#2962FF"
                        strokeWidth={2}
                        className="cursor-grab"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingHandle({ drawingId: drawing.id, pointIndex: 0 });
                        }}
                      />
                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r={6}
                        fill="#FFFFFF"
                        stroke="#2962FF"
                        strokeWidth={2}
                        className="cursor-grab"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingHandle({ drawingId: drawing.id, pointIndex: 1 });
                        }}
                      />
                    </>
                  )}
                </g>
              );
            }

            // Fibonacci Extension (3 Points: 0.618, 1.0, 1.618, 2.618)
            if (drawing.tool === 'fibonacci_extension' && drawing.points.length >= 3) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              const p3 = getCoordinates(drawing.points[2]);
              if (!p1 || !p2 || !p3) return null;

              const waveHeight = drawing.points[1].price - drawing.points[0].price;
              const extLevels = [
                { ratio: 0.618, label: '0.618 Fib Ext' },
                { ratio: 1.0, label: '1.0 Fib Ext' },
                { ratio: 1.618, label: '1.618 Fib Ext' },
                { ratio: 2.618, label: '2.618 Fib Ext' },
              ];

              return (
                <g
                  key={drawing.id}
                  className="pointer-events-auto cursor-pointer"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedDrawingId(drawing.id);
                  }}
                >
                  {/* Base trend connection */}
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#2962FF" strokeWidth={1.5} />
                  <line x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y} stroke="#2962FF" strokeWidth={1} strokeDasharray="3 3" />

                  {/* Extension horizontal lines */}
                  {extLevels.map((lvl) => {
                    const extPrice = drawing.points[2].price + waveHeight * lvl.ratio;
                    const y = candleSeriesRef.current?.priceToCoordinate(extPrice);
                    if (y === null || y === undefined) return null;

                    return (
                      <g key={lvl.label}>
                        <line x1={p3.x} y1={y} x2="100%" y2={y} stroke="#A855F7" strokeWidth={1} strokeDasharray="3 3" />
                        <text x={p3.x + 5} y={y - 3} fill="#A855F7" fontSize={9} fontFamily="monospace">
                          {lvl.label} ({extPrice.toFixed(2)})
                        </text>
                      </g>
                    );
                  })}

                  {isSelected && (
                    <>
                      <circle cx={p1.x} cy={p1.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="cursor-grab" onPointerDown={(e) => { e.stopPropagation(); setDraggingHandle({ drawingId: drawing.id, pointIndex: 0 }); }} />
                      <circle cx={p2.x} cy={p2.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="cursor-grab" onPointerDown={(e) => { e.stopPropagation(); setDraggingHandle({ drawingId: drawing.id, pointIndex: 1 }); }} />
                      <circle cx={p3.x} cy={p3.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="cursor-grab" onPointerDown={(e) => { e.stopPropagation(); setDraggingHandle({ drawingId: drawing.id, pointIndex: 2 }); }} />
                    </>
                  )}
                </g>
              );
            }

            // Price Range & Date/Price Range
            if (
              (drawing.tool === 'price_range' || drawing.tool === 'date_and_price_range') &&
              drawing.points.length >= 2
            ) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              if (!p1 || !p2) return null;

              const priceChange = drawing.points[1].price - drawing.points[0].price;
              const pricePercent = (priceChange / drawing.points[0].price) * 100;
              const isGain = priceChange >= 0;
              const x = Math.min(p1.x, p2.x);
              const y = Math.min(p1.y, p2.y);
              const w = Math.abs(p2.x - p1.x);
              const h = Math.abs(p2.y - p1.y);

              const timeDiffSec = Math.abs(drawing.points[1].time - drawing.points[0].time);
              const minutesPerBar = parseIntervalToMinutes(interval);
              const barCount = Math.max(1, Math.round(timeDiffSec / (minutesPerBar * 60)));

              return (
                <g
                  key={drawing.id}
                  className="pointer-events-auto cursor-pointer"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedDrawingId(drawing.id);
                  }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={isGain ? '#089981' : '#F23645'}
                    fillOpacity={0.15}
                    stroke={isGain ? '#089981' : '#F23645'}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                  <text
                    x={x + w / 2}
                    y={y + h / 2 - (drawing.tool === 'date_and_price_range' ? 6 : 0)}
                    fill={isGain ? '#089981' : '#F23645'}
                    fontSize={11}
                    fontFamily="monospace"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {isGain ? '+' : ''}
                    {priceChange.toFixed(2)} ({isGain ? '+' : ''}
                    {pricePercent.toFixed(2)}%)
                  </text>
                  {drawing.tool === 'date_and_price_range' && (
                    <text
                      x={x + w / 2}
                      y={y + h / 2 + 10}
                      fill="#D1D4DC"
                      fontSize={10}
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {barCount} bars, {Math.round(timeDiffSec / 3600)}h
                    </text>
                  )}
                  {isSelected && (
                    <>
                      <circle cx={p1.x} cy={p1.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="cursor-grab" onPointerDown={(e) => { e.stopPropagation(); setDraggingHandle({ drawingId: drawing.id, pointIndex: 0 }); }} />
                      <circle cx={p2.x} cy={p2.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="cursor-grab" onPointerDown={(e) => { e.stopPropagation(); setDraggingHandle({ drawingId: drawing.id, pointIndex: 1 }); }} />
                    </>
                  )}
                </g>
              );
            }

            return null;
          })}

          {/* Active 2-point / 3-point creation line preview */}
          {creationPoints.length > 0 && currentMouseCoord && (
            <line
              x1={getCoordinates(creationPoints[0])?.x || 0}
              y1={getCoordinates(creationPoints[0])?.y || 0}
              x2={currentMouseCoord.x}
              y2={currentMouseCoord.y}
              stroke="#2962FF"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}

          {/* Active Freehand Brush drawing in progress */}
          {isBrushDrawing && activeBrushPoints.length > 1 && (
            <path
              d={
                `M ${getCoordinates(activeBrushPoints[0])?.x || 0} ${getCoordinates(activeBrushPoints[0])?.y || 0} ` +
                activeBrushPoints
                  .slice(1)
                  .map((p) => {
                    const c = getCoordinates(p);
                    return c ? `L ${c.x} ${c.y}` : '';
                  })
                  .join(' ')
              }
              fill="none"
              stroke={drawingSettings.color}
              strokeWidth={drawingSettings.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {/* FLOATING ACTION TOOLBAR FOR SELECTED DRAWING */}
        {selectedDrawing && (
          <div
            style={{
              top: '56px',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
            className="absolute z-35 flex items-center gap-1.5 p-1.5 bg-[#1E222D]/95 border border-[#2B2F3A] rounded-lg shadow-2xl backdrop-blur-md select-none text-xs"
          >
            <span className="text-[10px] uppercase font-semibold text-[#787B86] px-1">
              {selectedDrawing.tool.replace(/_/g, ' ')}
            </span>

            {/* Color options */}
            <div className="flex items-center gap-1">
              {['#2962FF', '#089981', '#F23645', '#F59E0B', '#A855F7', '#FFFFFF'].map((col) => (
                <button
                  key={col}
                  onClick={() => onUpdateDrawing({ ...selectedDrawing, color: col })}
                  style={{ backgroundColor: col }}
                  className={`w-4 h-4 rounded-full border transition-transform ${
                    selectedDrawing.color === col ? 'border-white scale-110' : 'border-transparent'
                  }`}
                />
              ))}
            </div>

            <div className="w-px h-4 bg-[#2B2F3A] mx-0.5" />

            {/* Line Width */}
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  onClick={() => onUpdateDrawing({ ...selectedDrawing, lineWidth: w })}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    selectedDrawing.lineWidth === w
                      ? 'bg-[#2962FF] text-white font-bold'
                      : 'text-[#787B86] hover:text-[#D1D4DC]'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>

            {/* If Text: Edit text prompt */}
            {selectedDrawing.tool === 'text' && (
              <button
                onClick={() => {
                  const next = window.prompt('Edit Note Text:', selectedDrawing.text || '');
                  if (next !== null) {
                    onUpdateDrawing({ ...selectedDrawing, text: next });
                  }
                }}
                className="p-1 rounded text-[#787B86] hover:text-[#2962FF] hover:bg-[#2A2E39]"
                title="Edit Text"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="w-px h-4 bg-[#2B2F3A] mx-0.5" />

            {/* Delete button */}
            <button
              onClick={() => {
                onDeleteDrawing(selectedDrawing.id);
                setSelectedDrawingId(null);
              }}
              className="p-1 rounded text-[#787B86] hover:text-[#F23645] hover:bg-[#2A2E39] cursor-pointer"
              title="Delete Drawing (Del key)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* FREELY DRAGGABLE ALERTS INTERACTIVE HANDLES ON SCALE */}
        {alerts
          .filter((a) => a.symbol === symbol && a.status === 'active')
          .map((alert) => {
            const displayPrice = draggingAlert?.id === alert.id ? draggingAlert.currentPrice : alert.price;
            const y = candleSeriesRef.current?.priceToCoordinate(displayPrice);
            if (y === null || y === undefined) return null;

            return (
              <div
                key={alert.id}
                style={{ top: `${y - 10}px`, right: '55px' }}
                onMouseDown={(e) => handleAlertMouseDown(alert.id, alert.price, e)}
                className="absolute z-30 flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F23645] text-white text-[10px] font-mono font-bold shadow-md cursor-ns-resize hover:scale-105 transition-transform"
                title="Drag up/down to move alert price freely"
              >
                <GripVertical className="w-3 h-3 text-white/80" />
                <span>{displayPrice.toFixed(2)}</span>
              </div>
            );
          })}

        {/* TRADINGVIEW DYNAMIC COUNTDOWN TIMER: DIRECTLY BELOW PRICE ON THE SCALE */}
        {activePriceY !== null && activePriceY >= 20 && (
          <div
            style={{ top: `${activePriceY + 12}px`, right: '1px' }}
            className="absolute z-20 pointer-events-none bg-[#1E222D] border border-[#2B2F3A] px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums text-[#D1D4DC] shadow-sm select-none"
          >
            {countdownText}
          </div>
        )}

        {/* QUICK ALERT "+" BUTTON ON SCALE CROSSHAIR */}
        {crosshairPos && (
          <button
            style={{ top: `${crosshairPos.y - 10}px`, right: '55px' }}
            onClick={(e) => {
              e.stopPropagation();
              alertEngine.addAlert({
                symbol,
                price: crosshairPos.price,
                condition: 'crossing',
                createdPrice: activeCandleRef.current?.close || crosshairPos.price,
                repeat: 'once',
                priceType,
                sound: 'price_reach',
                vibrate: true,
                note: `Set from price scale at ${crosshairPos.price.toFixed(2)}`,
              });
              onAlertsChanged();
            }}
            className="absolute z-30 w-5 h-5 rounded-full bg-[#2962FF] hover:bg-[#1e53e5] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 cursor-pointer"
            title={`Add Alert at ${crosshairPos.price.toFixed(2)}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Bottom Right Scale Controls Bar ("auto", "log", reset) */}
      <div className="absolute bottom-6 right-16 z-20 flex items-center gap-1 bg-[#1E222D]/90 border border-[#2B2F3A] rounded-lg p-0.5 shadow-md backdrop-blur-xs select-none">
        <button
          onClick={() => {
            if (!chartRef.current) return;
            const nextAuto = !isAutoScale;
            setIsAutoScale(nextAuto);
            chartRef.current.priceScale('right').applyOptions({ autoScale: nextAuto });
          }}
          className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
            isAutoScale ? 'bg-[#2962FF] text-white' : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
          }`}
        >
          auto
        </button>
        <button
          onClick={() => {
            if (!chartRef.current) return;
            const nextLog = !isLogScale;
            setIsLogScale(nextLog);
            chartRef.current.priceScale('right').applyOptions({
              mode: nextLog ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
            });
          }}
          className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
            isLogScale ? 'bg-[#2962FF] text-white' : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
          }`}
        >
          log
        </button>
        <button
          onClick={() => {
            if (!chartRef.current) return;
            chartRef.current.timeScale().resetTimeScale();
            chartRef.current.priceScale('right').applyOptions({ autoScale: true });
            setIsAutoScale(true);
          }}
          className="px-1.5 py-0.5 text-[10px] text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] rounded transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Right Click Context Menu */}
      {showRightClickMenu && (
        <div
          style={{ top: showRightClickMenu.y, left: showRightClickMenu.x }}
          className="fixed z-50 bg-[#1E222D] border border-[#2B2F3A] rounded-lg shadow-2xl py-1 text-xs text-[#D1D4DC] min-w-44 select-none"
        >
          <button
            onClick={() => {
              onOpenAlertModal(showRightClickMenu.price);
              setShowRightClickMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#2962FF]" />
            <span>Add Alert at {showRightClickMenu.price.toFixed(2)}</span>
          </button>
          <button
            onClick={() => {
              onAddDrawing({
                id: 'drawing_' + Date.now(),
                tool: 'horizontal_line',
                points: [{ time: Math.floor(Date.now() / 1000), price: showRightClickMenu.price }],
                color: drawingSettings.color,
                lineWidth: drawingSettings.lineWidth,
                extendLeft: drawingSettings.extendLeft,
                extendRight: drawingSettings.extendRight,
              });
              setShowRightClickMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#089981]" />
            <span>Draw Horizontal Level</span>
          </button>
          <div className="w-full h-px bg-[#2B2F3A] my-1" />
          <button
            onClick={() => setShowRightClickMenu(null)}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2A2E39] text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
          >
            Close Menu
          </button>
        </div>
      )}
    </div>
  );
};
