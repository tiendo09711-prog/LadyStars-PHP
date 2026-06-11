import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import './CustomSelect.css';

export interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  width?: number | string;
}

export function CustomSelect({ options, value, onChange, placeholder = 'Chọn', width = 180 }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="custom-select-container" ref={ref} style={{ width }}>
      <div 
        className={`custom-select-trigger ${isOpen ? 'active' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={selectedOption ? 'has-value' : 'placeholder'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={16} color="#64748b" />
      </div>
      {isOpen && (
        <div className="custom-select-popover">
          <div className="custom-select-search">
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              autoFocus 
            />
            <Search size={14} color="#94a3b8" />
          </div>
          <div className="custom-select-options">
            <div className="custom-select-option" onClick={() => { onChange(''); setIsOpen(false); }}>--</div>
            {filteredOptions.map(o => (
              <div 
                key={o.value} 
                className={`custom-select-option ${value === o.value ? 'selected' : ''}`} 
                onClick={() => { onChange(o.value); setIsOpen(false); }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
