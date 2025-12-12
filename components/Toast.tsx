import React, { useEffect } from 'react';
import { ToastMessage } from '../types';

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const bgColors = {
    success: 'bg-green-600 border-green-500',
    error: 'bg-red-600 border-red-500',
    info: 'bg-indigo-600 border-indigo-500'
  };

  const icons = {
    success: (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  };

  return (
    <div className={`${bgColors[toast.type]} border text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 min-w-[320px] max-w-md transform transition-all duration-300 hover:scale-102`}>
      <div className="flex-shrink-0">
        {icons[toast.type]}
      </div>
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button 
        onClick={() => onDismiss(toast.id)} 
        className="text-white/60 hover:text-white transition-colors p-1"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};