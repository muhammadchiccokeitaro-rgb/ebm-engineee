'use client';

import { useEffect, useRef, useState } from 'react';
import { useEBMStore } from '../store/ebmStore';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

export default function ToastNotification() {
  const { error, successMsg, setError, setSuccessMsg } = useEBMStore();
  const [visible, setVisible] = useState(false);
  const [currentMsg, setCurrentMsg] = useState<string | null>(null);
  const [type, setType] = useState<'error' | 'success'>('error');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (error) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrentMsg(error);
      setType('error');
      setVisible(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setError(null);
      }, 6000);
    }
  }, [error, setError]);

  useEffect(() => {
    if (successMsg) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrentMsg(successMsg);
      setType('success');
      setVisible(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setSuccessMsg(null);
      }, 5000);
    }
  }, [successMsg, setSuccessMsg]);

  if (!visible || !currentMsg) return null;

  const isSuccess = type === 'success';

  return (
    <div
      className="fixed bottom-6 right-6 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-4 duration-300"
      role="alert"
    >
      <div
        className={`border rounded-xl shadow-2xl overflow-hidden ${
          isSuccess
            ? 'bg-[#0a1a0f] border-emerald-500/40 shadow-emerald-900/30'
            : 'bg-[#1a0a0a] border-red-500/40 shadow-red-900/30'
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4">
          <div className="shrink-0 mt-0.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isSuccess ? 'bg-emerald-500/15' : 'bg-red-500/15'
              }`}
            >
              {isSuccess ? (
                <CheckCircle2 size={16} className="text-emerald-400" />
              ) : (
                <AlertTriangle size={16} className="text-red-400" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-semibold mb-1 ${
                isSuccess ? 'text-emerald-300' : 'text-red-300'
              }`}
            >
              {isSuccess ? 'Berhasil' : 'Terjadi Kesalahan'}
            </p>
            <p
              className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${
                isSuccess ? 'text-emerald-200/70' : 'text-red-200/70'
              }`}
            >
              {currentMsg}
            </p>
          </div>
          <button
            onClick={() => {
              setVisible(false);
              setError(null);
              setSuccessMsg(null);
            }}
            className={`shrink-0 transition-colors p-0.5 ${
              isSuccess
                ? 'text-emerald-400/50 hover:text-emerald-300'
                : 'text-red-400/50 hover:text-red-300'
            }`}
            aria-label="Tutup notifikasi"
          >
            <X size={14} />
          </button>
        </div>

        {/* Auto-dismiss progress bar */}
        <div className={`h-0.5 ${isSuccess ? 'bg-emerald-900/30' : 'bg-red-900/30'}`}>
          <div
            className={`h-full origin-left ${isSuccess ? 'bg-emerald-500' : 'bg-red-500'}`}
            style={{
              animation: `toast-shrink ${isSuccess ? '5s' : '6s'} linear forwards`,
            }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes toast-shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
        @keyframes animate-in {
          from { opacity: 0; transform: translateY(1rem); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-in {
          animation: animate-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
