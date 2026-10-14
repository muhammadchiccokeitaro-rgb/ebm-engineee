'use client';

import React, { useState, useEffect, useRef } from 'react';

interface NumericInputProps {
  label: string;
  value: number;
  unit?: string;
  tooltip?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (val: number) => void;
}

export default function NumericInput({
  label,
  value,
  unit = '',
  tooltip = '',
  min,
  max,
  onChange,
}: NumericInputProps) {
  // Format to Indonesian locale (dot for thousands, comma for decimals)
  const formatValue = (num: number): string => {
    if (isNaN(num) || num === null || num === undefined) return '';
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(num);
  };

  const [rawText, setRawText] = useState<string>(() => formatValue(value));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize when store value changes externally
  useEffect(() => {
    if (!isFocused) {
      setRawText(formatValue(value));
      setErrorMsg(null);
    }
  }, [value, isFocused]);

  const parseInput = (text: string): number | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    // Replace all dots (thousand separators) and change comma to period
    const normalized = trimmed.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? null : num;
  };

  const commitValue = () => {
    const parsed = parseInput(rawText);

    if (parsed === null) {
      setErrorMsg('Nilai tidak boleh kosong');
      setRawText(formatValue(value));
      return;
    }

    if (min !== undefined && parsed < min) {
      setErrorMsg(`Nilai minimal ${min}`);
      setRawText(formatValue(value));
      return;
    }

    if (max !== undefined && parsed > max) {
      setErrorMsg(`Nilai maksimal ${max}`);
      setRawText(formatValue(value));
      return;
    }

    setErrorMsg(null);
    onChange(parsed);
    setRawText(formatValue(parsed));
  };

  const handleFocus = () => {
    setIsFocused(true);
    setErrorMsg(null);
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setRawText(formatValue(value));
      setErrorMsg(null);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 group/tooltip relative">
          <label className="text-xs text-[#9E9EA8] select-none">{label}</label>
          {tooltip && (
            <div className="relative flex items-center">
              <span className="text-gray-500 hover:text-gray-300 text-[10px] cursor-help">ⓘ</span>
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 bg-gray-900 border border-gray-700 text-gray-200 text-[10px] p-2 rounded shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
                {tooltip}
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-700"></div>
              </div>
            </div>
          )}
        </div>

        {/* Two-part layout: Right-aligned input and fixed right unit suffix */}
        <div
          className={`flex items-center w-36 bg-[#1A1A24] border rounded px-2 py-1 transition-colors ${
            errorMsg
              ? 'border-red-500/80 ring-1 ring-red-500/50'
              : isFocused
              ? 'border-blue-500/80 ring-1 ring-blue-500/30'
              : 'border-[#2A2A3A] hover:border-gray-600'
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-[#F1F1F4] font-mono text-xs text-right focus:outline-none placeholder-gray-600"
          />
          {unit && (
            <span className="text-[10px] font-mono text-[#787885] ml-1.5 shrink-0 select-none whitespace-nowrap">
              {unit.trim()}
            </span>
          )}
        </div>
      </div>
      {errorMsg && (
        <div className="text-[10px] text-red-400 text-right mt-0.5 tracking-tight font-sans">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
