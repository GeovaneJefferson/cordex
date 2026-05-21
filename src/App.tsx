import React from 'react';
import { AppProvider } from './store/AppContext';
import { LeftNav } from './components/Leftnav';
import { Sidebar } from './components/Sidebar';
import { EditorContainer } from './components/EditorContainer';
import { StatusBar } from './components/StatusBar';
import { FileContextMenu } from './components/FileContextMenu';
import { BugFixModal } from './components/BugFixModal';
import { AISettingsModal } from './components/AISettingsModal';

const App: React.FC = () => (
  <AppProvider>
    <div className="flex h-screen w-screen overflow-hidden pb-[22px]">
      <LeftNav />
      <Sidebar />
      <EditorContainer />
    </div>
    <StatusBar />
    <FileContextMenu />
    <BugFixModal />
    <AISettingsModal />
  </AppProvider>
);

export default App;
