import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import './DateRangePicker.css';

interface DateRangePickerProps {
  value: { start: Date | null; end: Date | null };
  onChange: (range: { start: Date | null; end: Date | null }) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  // Local state for the popover
  const [tempStart, setTempStart] = useState<Date | null>(value.start);
  const [tempEnd, setTempEnd] = useState<Date | null>(value.end);

  // Month navigation states (1-indexed for month: 1=Jan, 12=Dec)
  const today = new Date();
  const [leftMonth, setLeftMonth] = useState(today.getMonth() + 1);
  const [leftYear, setLeftYear] = useState(today.getFullYear());
  const [rightMonth, setRightMonth] = useState(today.getMonth() + 1);
  const [rightYear, setRightYear] = useState(today.getFullYear());

  useEffect(() => {
    if (isOpen) {
      setTempStart(value.start);
      setTempEnd(value.end);
      if (value.start) {
        setLeftMonth(value.start.getMonth() + 1);
        setLeftYear(value.start.getFullYear());
      }
      if (value.end) {
        setRightMonth(value.end.getMonth() + 1);
        setRightYear(value.end.getFullYear());
      }
    }
  }, [isOpen, value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const formatDate = (d: Date | null) => {
    if (!d) return '';
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  const handleApply = () => {
    onChange({ start: tempStart, end: tempEnd });
    setIsOpen(false);
  };

  const handleClear = () => {
    setTempStart(null);
    setTempEnd(null);
    onChange({ start: null, end: null });
    setIsOpen(false);
  };

  const handleQuickSelect = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setTempStart(start);
    setTempEnd(end);
    setLeftMonth(start.getMonth() + 1);
    setLeftYear(start.getFullYear());
    setRightMonth(end.getMonth() + 1);
    setRightYear(end.getFullYear());
  };

  const renderCalendar = (month: number, year: number, setDate: (d: Date) => void) => {
    const daysInMonth = new Date(year, month, 0).getDate();
    // getDay() is 0 (Sun) to 6 (Sat). We want T2 (Mon)=0, CN (Sun)=6
    let startDay = new Date(year, month - 1, 1).getDay() - 1;
    if (startDay < 0) startDay = 6; 

    const blanks = Array.from({ length: startDay }).map((_, i) => <div key={`blank-${i}`} className="cal-day empty"></div>);
    const days = Array.from({ length: daysInMonth }).map((_, i) => {
      const d = new Date(year, month - 1, i + 1);
      const isStart = tempStart && d.getTime() === tempStart.getTime();
      const isEnd = tempEnd && d.getTime() === tempEnd.getTime();
      const isSelected = isStart || isEnd;
      return (
        <div 
          key={i} 
          className={`cal-day ${isSelected ? 'selected' : ''}`}
          onClick={() => setDate(d)}
        >
          {i + 1}
        </div>
      );
    });

    return (
      <div className="cal-grid">
        <div className="cal-header-day">T2</div>
        <div className="cal-header-day">T3</div>
        <div className="cal-header-day">T4</div>
        <div className="cal-header-day">T5</div>
        <div className="cal-header-day">T6</div>
        <div className="cal-header-day">T7</div>
        <div className="cal-header-day">CN</div>
        {blanks}
        {days}
      </div>
    );
  };

  const displayText = value.start && value.end ? `${formatDate(value.start)} - ${formatDate(value.end)}` : '';

  return (
    <div className="drp-container" ref={ref}>
      <div className="drp-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span style={{ position: 'absolute', top: -8, left: 10, background: 'white', padding: '0 4px', fontSize: 11, color: '#64748b' }}>Thời gian</span>
        <input 
          className="drp-input" 
          placeholder="01/06/2026 - 05/06/2026" 
          value={displayText}
          readOnly
        />
      </div>

      {isOpen && (
        <div className="drp-popover">
          <div className="drp-sidebar">
            <div className="drp-quick-item" onClick={() => handleQuickSelect(0)}>Hôm nay</div>
            <div className="drp-quick-item" onClick={() => handleQuickSelect(1)}>Hôm qua</div>
            <div className="drp-quick-item" onClick={() => handleQuickSelect(7)}>Tuần này</div>
            <div className="drp-quick-item" onClick={() => handleQuickSelect(14)}>Tuần trước</div>
            <div className="drp-quick-item" onClick={() => handleQuickSelect(30)}>Tháng này</div>
            <div className="drp-quick-item" onClick={() => handleQuickSelect(60)}>Tháng trước</div>
            <div className="drp-quick-item" onClick={() => handleQuickSelect(90)}>3 tháng</div>
            <div className="drp-quick-item" onClick={() => handleQuickSelect(180)}>6 tháng</div>
            <div className="drp-quick-item" onClick={() => handleQuickSelect(365)}>12 tháng</div>
          </div>
          
          <div className="drp-main">
            <div className="drp-calendars">
              {/* Left Calendar */}
              <div className="drp-cal-box">
                <div className="drp-input-box">
                  <span className="drp-input-label">Từ ngày</span>
                  <input value={formatDate(tempStart)} readOnly />
                </div>
                <div className="drp-month-nav">
                  <ChevronLeft size={16} color="#34d399" onClick={() => {
                    let m = leftMonth - 1; let y = leftYear;
                    if (m < 1) { m = 12; y--; }
                    setLeftMonth(m); setLeftYear(y);
                  }} style={{cursor:'pointer'}} />
                  <div className="drp-month-selects">
                    <span className="drp-select">Tháng {leftMonth} <ChevronDown size={14} /></span>
                    <span className="drp-select">{leftYear} <ChevronDown size={14} /></span>
                  </div>
                  <ChevronRight size={16} color="#34d399" onClick={() => {
                    let m = leftMonth + 1; let y = leftYear;
                    if (m > 12) { m = 1; y++; }
                    setLeftMonth(m); setLeftYear(y);
                  }} style={{cursor:'pointer'}} />
                </div>
                {renderCalendar(leftMonth, leftYear, setTempStart)}
              </div>

              {/* Right Calendar */}
              <div className="drp-cal-box">
                <div className="drp-input-box">
                  <span className="drp-input-label">Đến ngày</span>
                  <input value={formatDate(tempEnd)} readOnly />
                </div>
                <div className="drp-month-nav">
                  <ChevronLeft size={16} color="#34d399" onClick={() => {
                    let m = rightMonth - 1; let y = rightYear;
                    if (m < 1) { m = 12; y--; }
                    setRightMonth(m); setRightYear(y);
                  }} style={{cursor:'pointer'}} />
                  <div className="drp-month-selects">
                    <span className="drp-select">Tháng {rightMonth} <ChevronDown size={14} /></span>
                    <span className="drp-select">{rightYear} <ChevronDown size={14} /></span>
                  </div>
                  <ChevronRight size={16} color="#34d399" onClick={() => {
                    let m = rightMonth + 1; let y = rightYear;
                    if (m > 12) { m = 1; y++; }
                    setRightMonth(m); setRightYear(y);
                  }} style={{cursor:'pointer'}} />
                </div>
                {renderCalendar(rightMonth, rightYear, setTempEnd)}
              </div>
            </div>

            <div className="drp-footer">
              <button className="drp-btn-clear" onClick={handleClear}>Xóa</button>
              <button className="drp-btn-apply" onClick={handleApply}>Áp dụng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
