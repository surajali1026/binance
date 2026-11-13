import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  Plus,
  Trash2,
  RotateCcw,
  Volume2,
  VolumeX,
  PlayCircle,
  CheckCircle2,
  Settings,
  Vibrate,
  Pencil,
  Power,
  Info,
} from 'lucide-react';
import { PriceAlert, PriceType, AlertCondition, AlertSoundType, AlertStatus, AlertEngineSettings } from '../types';
import { alertEngine } from '../services/alertEngine';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSymbol: string;
  currentPrice: number;
  priceType: PriceType;
  onAlertsChanged: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  currentSymbol,
  currentPrice,
  priceType,
  onAlertsChanged,
}) => {
  const [tab, setTab] = useState<'create' | 'list' | 'settings'>('create');
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);

  // Form states
  const [priceInput, setPriceInput] = useState<string>(currentPrice.toString());
  const [condition, setCondition] = useState<AlertCondition>('crossing');
  const [sound, setSound] = useState<AlertSoundType>('price_reach');
  const [vibrate, setVibrate] = useState<boolean>(true);
  const [repeat, setRepeat] = useState<'once' | 'every_time'>('once');
  const [note, setNote] = useState<string>('');

  // Settings states
  const [settings, setSettings] = useState<AlertEngineSettings>(alertEngine.getSettings());

  // Alerts list & feedback
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAlerts(alertEngine.getAlerts());
      setSettings(alertEngine.getSettings());
      if (!editingAlertId) {
        setPriceInput(currentPrice ? currentPrice.toString() : '');
      }
      setSuccessMsg('');
    }
  }, [isOpen, currentPrice, editingAlertId]);

  if (!isOpen) return null;

  const soundOptions: { id: AlertSoundType; label: string; desc: string }[] = [
    { id: 'price_reach', label: 'Price Reach', desc: 'Long, clear resonant harmonic bell tone' },
    { id: 'price_rise', label: 'Price Rise', desc: 'Distinct ascending melodic flourish' },
    { id: 'price_drop', label: 'Price Drop', desc: 'Distinct descending cascade tone' },
    { id: 'price_cross_above', label: 'Price Cross Above', desc: 'Sharp rising double bell strike' },
    { id: 'price_cross_below', label: 'Price Cross Below', desc: 'Deep falling gong resonance' },
  ];

  const handleSaveAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(priceInput);
    if (isNaN(parsedPrice) || parsedPrice <= 0) return;

    if (editingAlertId) {
      // Update existing alert
      alertEngine.updateAlert(editingAlertId, {
        price: parsedPrice,
        condition,
        sound,
        vibrate,
        repeat,
        note: note.trim() || undefined,
        status: 'active',
      });
      setSuccessMsg(`Alert updated for ${parsedPrice.toLocaleString()}`);
      setEditingAlertId(null);
    } else {
      // Create new alert
      alertEngine.addAlert({
        symbol: currentSymbol,
        price: parsedPrice,
        condition,
        createdPrice: currentPrice,
        repeat,
        note: note.trim() || undefined,
        sound,
        vibrate,
        priceType,
      });
      setSuccessMsg(`Alert set for ${currentSymbol} at ${parsedPrice.toLocaleString()}`);
    }

    setAlerts(alertEngine.getAlerts());
    onAlertsChanged();
    setTimeout(() => {
      setSuccessMsg('');
      setTab('list');
    }, 700);
  };

  const handleStartEdit = (alert: PriceAlert) => {
    setEditingAlertId(alert.id);
    setPriceInput(alert.price.toString());
    setCondition(alert.condition);
    setSound(alert.sound || 'price_reach');
    setVibrate(alert.vibrate !== false);
    setRepeat(alert.repeat);
    setNote(alert.note || '');
    setTab('create');
  };

  const handleDelete = (id: string) => {
    alertEngine.deleteAlert(id);
    setAlerts(alertEngine.getAlerts());
    onAlertsChanged();
  };

  const handleToggleStatus = (id: string, currentStatus: AlertStatus) => {
    const nextStatus: AlertStatus = currentStatus === 'active' ? 'disabled' : 'active';
    alertEngine.setAlertStatus(id, nextStatus);
    setAlerts(alertEngine.getAlerts());
    onAlertsChanged();
  };

  const handleReset = (id: string) => {
    alertEngine.setAlertStatus(id, 'active');
    setAlerts(alertEngine.getAlerts());
    onAlertsChanged();
  };

  const handleUpdateVolume = (vol: number) => {
    const updated = { ...settings, volume: vol };
    setSettings(updated);
    alertEngine.updateSettings(updated);
  };

  const handleToggleGlobalSound = () => {
    const updated = { ...settings, soundEnabled: !settings.soundEnabled };
    setSettings(updated);
    alertEngine.updateSettings(updated);
  };

  const handleToggleGlobalVibration = () => {
    const updated = { ...settings, vibrationEnabled: !settings.vibrationEnabled };
    setSettings(updated);
    alertEngine.updateSettings(updated);
    if (updated.vibrationEnabled) {
      alertEngine.triggerVibration([100, 50, 100]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-[#1E222D] border border-[#2B2F3A] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-[#D1D4DC] flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2B2F3A] bg-[#181B24]">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#2962FF]" />
            <span className="text-sm font-semibold">
              {editingAlertId ? 'Edit Alert' : `Price Alerts (${currentSymbol})`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('settings')}
              className={`p-1.5 rounded transition-colors ${
                tab === 'settings' ? 'text-[#2962FF] bg-[#2A2E39]' : 'text-[#787B86] hover:text-[#D1D4DC]'
              }`}
              title="Alert Audio & Vibration Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="text-[#787B86] hover:text-[#D1D4DC] p-1 rounded hover:bg-[#2A2E39]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-3 border-b border-[#2B2F3A] bg-[#181B24] text-xs font-medium">
          <button
            onClick={() => {
              setEditingAlertId(null);
              setTab('create');
            }}
            className={`py-2 text-center transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
              tab === 'create'
                ? 'border-[#2962FF] text-[#2962FF] bg-[#1E222D]'
                : 'border-transparent text-[#787B86] hover:text-[#D1D4DC]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{editingAlertId ? 'Edit' : 'Create'}</span>
          </button>
          <button
            onClick={() => setTab('list')}
            className={`py-2 text-center transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
              tab === 'list'
                ? 'border-[#2962FF] text-[#2962FF] bg-[#1E222D]'
                : 'border-transparent text-[#787B86] hover:text-[#D1D4DC]'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Alerts ({alerts.length})</span>
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`py-2 text-center transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
              tab === 'settings'
                ? 'border-[#2962FF] text-[#2962FF] bg-[#1E222D]'
                : 'border-transparent text-[#787B86] hover:text-[#D1D4DC]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Sounds & Vibration</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* TAB 1: CREATE / EDIT */}
          {tab === 'create' && (
            <form onSubmit={handleSaveAlert} className="flex flex-col gap-3.5 text-xs">
              {successMsg && (
                <div className="p-2.5 rounded bg-[#089981]/20 border border-[#089981]/40 text-[#089981] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between p-2 bg-[#131722] rounded border border-[#2B2F3A]">
                <span className="text-[#787B86]">Current {priceType.toUpperCase()} Price:</span>
                <span className="font-mono font-bold text-[#D1D4DC]">
                  {currentPrice.toLocaleString()} USDT
                </span>
              </div>

              {/* Trigger Price */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Trigger Price (USDT)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-sm font-mono text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none"
                  placeholder="e.g. 77500"
                />
              </div>

              {/* Condition */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as AlertCondition)}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-xs text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none cursor-pointer"
                >
                  <option value="crossing">Crossing (Either Up or Down)</option>
                  <option value="crossing_up">Crossing Up (Moves above target)</option>
                  <option value="crossing_down">Crossing Down (Moves below target)</option>
                  <option value="price_reach">Price Reach (Direct hit at level)</option>
                  <option value="price_rise">Price Rise (Bullish upward movement)</option>
                  <option value="price_drop">Price Drop (Bearish downward movement)</option>
                </select>
              </div>

              {/* Custom Notification Sound */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                    Notification Sound Tone
                  </label>
                  <button
                    type="button"
                    onClick={() => alertEngine.playSpecificSound(sound)}
                    className="flex items-center gap-1 text-[#2962FF] hover:underline"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Preview Sound</span>
                  </button>
                </div>
                <select
                  value={sound}
                  onChange={(e) => setSound(e.target.value as AlertSoundType)}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-xs text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none cursor-pointer"
                >
                  {soundOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.desc})
                    </option>
                  ))}
                </select>
              </div>

              {/* Vibration Toggle */}
              <div className="flex items-center justify-between p-2 rounded bg-[#131722] border border-[#2B2F3A]">
                <div className="flex items-center gap-2">
                  <Vibrate className="w-4 h-4 text-[#787B86]" />
                  <span>Vibrate on Android / Mobile</span>
                </div>
                <input
                  type="checkbox"
                  checked={vibrate}
                  onChange={(e) => setVibrate(e.target.checked)}
                  className="rounded text-[#2962FF] focus:ring-0 cursor-pointer"
                />
              </div>

              {/* Repeat Frequency */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Trigger Frequency
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRepeat('once')}
                    className={`py-1.5 px-3 rounded text-xs border text-center transition-colors ${
                      repeat === 'once'
                        ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-medium'
                        : 'border-[#2B2F3A] bg-[#131722] text-[#787B86] hover:text-[#D1D4DC]'
                    }`}
                  >
                    Only Once
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepeat('every_time')}
                    className={`py-1.5 px-3 rounded text-xs border text-center transition-colors ${
                      repeat === 'every_time'
                        ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-medium'
                        : 'border-[#2B2F3A] bg-[#131722] text-[#787B86] hover:text-[#D1D4DC]'
                    }`}
                  >
                    Every Time
                  </button>
                </div>
              </div>

              {/* Note */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Major resistance breakout"
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-xs text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full mt-2 py-2 px-4 rounded bg-[#2962FF] hover:bg-[#1e53e5] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {editingAlertId ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span>{editingAlertId ? 'Save Changes' : 'Create Alert'}</span>
              </button>
            </form>
          )}

          {/* TAB 2: ALERTS LIST */}
          {tab === 'list' && (
            <div className="flex flex-col gap-2 text-xs">
              {alerts.length === 0 ? (
                <div className="p-8 text-center text-[#787B86]">
                  No alerts created yet. Click &quot;Create&quot; to set your first alert.
                </div>
              ) : (
                alerts.map((item) => {
                  const isExpanded = expandedAlertId === item.id;
                  const statusColors = {
                    active: 'text-[#089981] bg-[#089981]/15 border-[#089981]/40',
                    triggered: 'text-[#F23645] bg-[#F23645]/15 border-[#F23645]/40',
                    disabled: 'text-[#787B86] bg-[#2A2E39] border-[#2B2F3A]',
                  };

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border transition-colors flex flex-col gap-2 ${
                        item.status === 'triggered'
                          ? 'border-[#F23645]/40 bg-[#F23645]/5'
                          : item.status === 'disabled'
                          ? 'border-[#2B2F3A] bg-[#181B24] opacity-60'
                          : 'border-[#2B2F3A] bg-[#131722]'
                      }`}
                    >
                      {/* Alert Main Row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-[#D1D4DC]">{item.symbol}</span>
                          <span className="font-mono font-bold text-[#2962FF]">
                            {item.price.toLocaleString()}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold border ${
                              statusColors[item.status]
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Enable/Disable Toggle */}
                          <button
                            onClick={() => handleToggleStatus(item.id, item.status)}
                            className={`p-1.5 rounded transition-colors ${
                              item.status === 'active'
                                ? 'text-[#089981] hover:bg-[#2A2E39]'
                                : 'text-[#787B86] hover:text-[#089981] hover:bg-[#2A2E39]'
                            }`}
                            title={item.status === 'active' ? 'Disable alert' : 'Enable alert'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          {/* Re-arm button if triggered */}
                          {item.status === 'triggered' && (
                            <button
                              onClick={() => handleReset(item.id)}
                              className="p-1.5 rounded text-[#787B86] hover:text-[#089981] hover:bg-[#2A2E39]"
                              title="Re-arm alert"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Edit button */}
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="p-1.5 rounded text-[#787B86] hover:text-[#2962FF] hover:bg-[#2A2E39]"
                            title="Edit alert"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {/* Details Toggle */}
                          <button
                            onClick={() => setExpandedAlertId(isExpanded ? null : item.id)}
                            className="p-1.5 rounded text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]"
                            title="View alert details"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 rounded text-[#787B86] hover:text-[#F23645] hover:bg-[#2A2E39]"
                            title="Delete alert"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Note snippet if present */}
                      {item.note && (
                        <div className="text-[11px] text-[#787B86] truncate">
                          Note: {item.note}
                        </div>
                      )}

                      {/* Expanded Details Section */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-[#2B2F3A] grid grid-cols-2 gap-2 text-[10px] text-[#787B86]">
                          <div>Condition: <span className="text-[#D1D4DC] capitalize">{item.condition.replace(/_/g, ' ')}</span></div>
                          <div>Sound: <span className="text-[#D1D4DC] capitalize">{item.sound.replace(/_/g, ' ')}</span></div>
                          <div>Created: <span className="text-[#D1D4DC]">{new Date(item.createdAt).toLocaleTimeString()}</span></div>
                          <div>
                            Triggered: <span className="text-[#D1D4DC]">{item.triggeredAt ? new Date(item.triggeredAt).toLocaleTimeString() : 'Never'}</span>
                          </div>
                          <div>Frequency: <span className="text-[#D1D4DC] capitalize">{item.repeat.replace('_', ' ')}</span></div>
                          <div>Vibration: <span className="text-[#D1D4DC]">{item.vibrate ? 'Enabled' : 'Disabled'}</span></div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {alerts.length > 0 && (
                <button
                  onClick={() => {
                    alertEngine.clearAllAlerts();
                    setAlerts([]);
                    onAlertsChanged();
                  }}
                  className="mt-3 text-[11px] text-[#F23645] hover:underline self-center p-1 cursor-pointer"
                >
                  Clear all alerts
                </button>
              )}
            </div>
          )}

          {/* TAB 3: CUSTOM SOUNDS & VIBRATION SETTINGS */}
          {tab === 'settings' && (
            <div className="flex flex-col gap-4 text-xs">
              {/* Global Sound Switch */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#131722] border border-[#2B2F3A]">
                <div className="flex items-center gap-2.5">
                  {settings.soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-[#089981]" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-[#787B86]" />
                  )}
                  <div>
                    <div className="font-semibold text-[#D1D4DC]">Alert Sound Chimes</div>
                    <div className="text-[10px] text-[#787B86]">Play audible alerts when triggers occur</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={handleToggleGlobalSound}
                  className="rounded text-[#2962FF] focus:ring-0 cursor-pointer w-4 h-4"
                />
              </div>

              {/* Volume Slider */}
              <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[#131722] border border-[#2B2F3A]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#D1D4DC]">Alert Volume</span>
                  <span className="font-mono text-[11px] text-[#2962FF]">
                    {Math.round(settings.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={settings.volume}
                  onChange={(e) => handleUpdateVolume(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[#2A2E39] rounded appearance-none cursor-pointer accent-[#2962FF]"
                />
              </div>

              {/* Global Vibration Switch */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#131722] border border-[#2B2F3A]">
                <div className="flex items-center gap-2.5">
                  <Vibrate className={`w-4 h-4 ${settings.vibrationEnabled ? 'text-[#089981]' : 'text-[#787B86]'}`} />
                  <div>
                    <div className="font-semibold text-[#D1D4DC]">Android Device Vibration</div>
                    <div className="text-[10px] text-[#787B86]">Haptic pulse when price alert triggers</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.vibrationEnabled}
                  onChange={handleToggleGlobalVibration}
                  className="rounded text-[#2962FF] focus:ring-0 cursor-pointer w-4 h-4"
                />
              </div>

              {/* Sound Previews List */}
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Sound Tone Library &amp; Previews
                </label>
                <div className="divide-y divide-[#2B2F3A] bg-[#131722] rounded-lg border border-[#2B2F3A]">
                  {soundOptions.map((s) => (
                    <div key={s.id} className="p-2.5 flex items-center justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-[#D1D4DC]">{s.label}</span>
                        <span className="text-[10px] text-[#787B86]">{s.desc}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => alertEngine.playSpecificSound(s.id)}
                        className="px-2.5 py-1 rounded bg-[#2962FF]/15 hover:bg-[#2962FF]/25 text-[#2962FF] text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
