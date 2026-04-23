'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';

export interface AsyncOption {
  id: string | bigint;
  name: string;
  [key: string]: unknown;
}

interface AsyncSearchableSelectProps {
  value: string;
  onChange: (id: string) => void;
  onSelectFull?: (option: AsyncOption | null) => void;
  fetchOptions: (search: string) => Promise<AsyncOption[]>;
  initialDisplay?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minSearchLength?: number;
}

export default function AsyncSearchableSelect({
  value,
  onChange,
  onSelectFull,
  fetchOptions,
  initialDisplay = '',
  label,
  placeholder = '-- Select --',
  className = '',
  disabled = false,
  minSearchLength = 1,
}: AsyncSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState<AsyncOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [displayName, setDisplayName] = useState(initialDisplay);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync displayName when initialDisplay is provided after mount (edit form)
  useEffect(() => {
    if (initialDisplay && !displayName) {
      setDisplayName(initialDisplay);
    }
  }, [initialDisplay, displayName]);

  // Debounced fetch whenever searchTerm changes while open
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchTerm.trim().length < minSearchLength) {
      setOptions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await fetchOptions(searchTerm);
        setOptions(results);
        setHighlightedIndex(results.length > 0 ? 0 : -1);
      } catch {
        setOptions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, isOpen, fetchOptions]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setOptions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const handleSelect = (option: AsyncOption) => {
    setDisplayName(option.name);
    onChange(String(option.id));
    onSelectFull?.(option);
    setIsOpen(false);
    setSearchTerm('');
    setOptions([]);
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDisplayName('');
    onChange('');
    onSelectFull?.(null);
    setSearchTerm('');
    setOptions([]);
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setSearchTerm('');
      setOptions([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => prev < options.length - 1 ? prev + 1 : prev);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && options[highlightedIndex]) {
          handleSelect(options[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm('');
        setOptions([]);
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-bold text-gray-700 mb-2">{label}</label>
      )}

      {/* Trigger */}
      <div
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        className={`
          relative w-full rounded-md border px-4 py-3 text-left
          focus:outline-none focus:ring-1 transition-colors
          ${disabled
            ? 'bg-gray-100 cursor-not-allowed border-gray-300'
            : 'bg-white cursor-pointer border-gray-300 focus:border-blue-500 focus:ring-blue-500 hover:border-gray-400'
          }
        `}
      >
        <span className={displayName ? 'text-gray-900' : 'text-gray-400'}>
          {displayName || placeholder}
        </span>
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          {value && !disabled && (
            <XMarkIcon
              className="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-pointer pointer-events-auto mr-1"
              onClick={handleClear}
            />
          )}
          <ChevronDownIcon
            className={`h-5 w-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
          <div className="p-2 border-b border-gray-200">
            <input
              ref={inputRef}
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="輸入關鍵字搜尋..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <ul ref={listRef} className="max-h-60 overflow-auto py-1" role="listbox">
            {isLoading ? (
              <li className="px-4 py-2 text-sm text-gray-500 text-center">搜尋中...</li>
            ) : searchTerm.trim().length < minSearchLength ? (
              <li className="px-4 py-2 text-sm text-gray-400 text-center">
                再輸入 {minSearchLength - searchTerm.trim().length} 個字開始搜尋
              </li>
            ) : options.length === 0 ? (
              <li className="px-4 py-2 text-sm text-gray-500 text-center">無符合的選項</li>
            ) : (
              options.map((option, index) => {
                const isSelected = String(option.id) === value;
                const isHighlighted = index === highlightedIndex;
                return (
                  <li
                    key={String(option.id)}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(option)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`
                      px-4 py-2 cursor-pointer text-sm transition-colors
                      ${isSelected ? 'bg-blue-100 text-blue-900 font-medium' : 'text-gray-900'}
                      ${isHighlighted && !isSelected ? 'bg-gray-100' : ''}
                      ${!isSelected && !isHighlighted ? 'hover:bg-gray-50' : ''}
                    `}
                  >
                    {option.name}
                    {isSelected && <span className="ml-2 text-blue-600">✓</span>}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
