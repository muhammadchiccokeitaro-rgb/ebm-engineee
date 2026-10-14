'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useEBMStore } from '../store/ebmStore';
import SensitivityWindow from './SensitivityWindow';
import NestedPitWindow from './NestedPitWindow';
import WorkspaceModal from './WorkspaceModal';
import { TrendingUp, BarChart2 } from 'lucide-react';

const Rnd = dynamic(() => import('react-rnd').then(m => m.Rnd), { ssr: false });

interface MiniBar {
  id: string;
  label: string;
  icon: React.ReactNode;
  onRestore: () => void;
}

export default function WindowManager() {
  const {
    showSensitivity, setShowSensitivity,
    showWorkspaceModal, setShowWorkspaceModal,
    nestedPits,
    isNestedPitWindowOpen, setIsNestedPitWindowOpen
  } = useEBMStore();
  const chartRef = useRef<any>(null);

  // ── Sensitivity window state ──
  const [sensitivityMinimized, setSensitivityMinimized] = useState(false);
  const [sensitivityPos, setSensitivityPos] = useState({ x: 80, y: 80 });
  const [sensitivitySize, setSensitivitySize] = useState({ width: 560, height: 500 });

  // ── Nested Pit window state ──
  const [nestedPitMinimized, setNestedPitMinimized] = useState(false);
  const [nestedPitPos, setNestedPitPos] = useState({ x: 660, y: 80 });
  const [nestedPitSize, setNestedPitSize] = useState({ width: 580, height: 520 });

  const minimizedBars: MiniBar[] = [];
  if (showSensitivity && sensitivityMinimized) {
    minimizedBars.push({
      id: 'sensitivity',
      label: 'Sensitivity Analysis',
      icon: <TrendingUp size={12} />,
      onRestore: () => setSensitivityMinimized(false),
    });
  }
  if (isNestedPitWindowOpen && nestedPitMinimized && nestedPits.length > 0) {
    minimizedBars.push({
      id: 'nested-pit',
      label: 'Nested Pit Analysis',
      icon: <BarChart2 size={12} />,
      onRestore: () => setNestedPitMinimized(false),
    });
  }

  return (
    <>
      {/* Workspace Modal (full-screen overlay) */}
      {showWorkspaceModal && (
        <WorkspaceModal onClose={() => setShowWorkspaceModal(false)} />
      )}

      {/* Sensitivity Floating Window */}
      {showSensitivity && !sensitivityMinimized && (
        <Rnd
          size={sensitivitySize}
          position={sensitivityPos}
          onDragStop={(_e: any, d: any) => setSensitivityPos({ x: d.x, y: d.y })}
          onResizeStop={(_e: any, _dir: any, ref: any, _delta: any, pos: any) => {
            setSensitivitySize({ width: ref.offsetWidth, height: ref.offsetHeight });
            setSensitivityPos(pos);
          }}
          minWidth={400}
          minHeight={350}
          bounds="window"
          dragHandleClassName="window-drag-handle"
          style={{ zIndex: 100, position: 'fixed' }}
          enableResizing={{
            bottom: true, bottomRight: true, right: true,
            top: false, topLeft: false, topRight: false,
            left: true, bottomLeft: false,
          }}
        >
          <div
            style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(100,100,200,0.15)' }}
          >
            <SensitivityWindow
              chartRef={chartRef}
              onClose={() => { setShowSensitivity(false); setSensitivityMinimized(false); }}
              onMinimize={() => setSensitivityMinimized(true)}
            />
          </div>
        </Rnd>
      )}

      {/* Nested Pit Floating Window */}
      {isNestedPitWindowOpen && !nestedPitMinimized && nestedPits.length > 0 && (
        <Rnd
          size={nestedPitSize}
          position={nestedPitPos}
          onDragStop={(_e: any, d: any) => setNestedPitPos({ x: d.x, y: d.y })}
          onResizeStop={(_e: any, _dir: any, ref: any, _delta: any, pos: any) => {
            setNestedPitSize({ width: ref.offsetWidth, height: ref.offsetHeight });
            setNestedPitPos(pos);
          }}
          minWidth={460}
          minHeight={400}
          bounds="window"
          dragHandleClassName="window-drag-handle"
          style={{ zIndex: 100, position: 'fixed' }}
          enableResizing={{
            bottom: true, bottomRight: true, right: true,
            top: false, topLeft: false, topRight: false,
            left: true, bottomLeft: false,
          }}
        >
          <div
            style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(100,180,100,0.15)' }}
          >
            <NestedPitWindow
              onClose={() => { setIsNestedPitWindowOpen(false); setNestedPitMinimized(false); }}
              onMinimize={() => setNestedPitMinimized(true)}
            />
          </div>
        </Rnd>
      )}

      {/* Taskbar for minimized windows */}
      {minimizedBars.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-[150]">
          {minimizedBars.map(bar => (
            <button
              key={bar.id}
              onClick={bar.onRestore}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1e2d]/90 backdrop-blur border border-[#3a3a52] rounded-full text-xs text-gray-300 hover:text-white hover:border-emerald-500 transition-all shadow-lg"
            >
              {bar.icon}
              {bar.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
