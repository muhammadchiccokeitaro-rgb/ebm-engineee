'use client';

import TopToolbar from '../components/TopToolbar';
import ProjectExplorer from '../components/ProjectExplorer';
import PitViewer3D from '../components/PitViewer3D';
import ExecutiveReportView from '../components/ExecutiveReportView';
import ToastNotification from '../components/ToastNotification';
import WindowManager from '../components/WindowManager';
import { useEBMStore } from '../store/ebmStore';

export default function Home() {
  const { activeTab } = useEBMStore();

  return (
    <main className="flex flex-col h-screen w-screen overflow-hidden bg-[#050510]">
      <TopToolbar />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Tab 1: 3D Workspace (ProjectExplorer + Full-Width 3D Pit Canvas) */}
        <div
          className={`w-full h-full overflow-hidden ${
            activeTab === 'workspace'
              ? 'flex flex-1 z-10'
              : 'invisible pointer-events-none absolute inset-0 -z-10'
          }`}
        >
          <ProjectExplorer />
          <PitViewer3D />
        </div>

        {/* Tab 2: Executive Report & Analytics (Dedicated Full-Screen Dashboard) */}
        {activeTab === 'report' && (
          <div className="flex flex-1 w-full h-full overflow-hidden z-10">
            <ExecutiveReportView />
          </div>
        )}
      </div>
      <ToastNotification />
      {/* Floating Windows Layer */}
      <WindowManager />
    </main>
  );
}
