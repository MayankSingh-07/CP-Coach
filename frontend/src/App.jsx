import React, { useState, useEffect } from 'react';
import { Search, Activity, BookOpen, MessageSquareCode } from 'lucide-react';
import Dashboard from './components/Dashboard';
import ChatInterface from './components/ChatInterface';

function App() {
  const [handle, setHandle] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'coach'
  const [userData, setUserData] = useState(null);
  const [activeWorkspaceProblem, setActiveWorkspaceProblem] = useState(null);

  const getAccentColor = (rating) => {
    if (!rating) return '#94a3b8';
    if (rating < 1200) return '#94a3b8';
    if (rating < 1400) return '#10b981';
    if (rating < 1600) return '#22d3ee';
    if (rating < 1900) return '#3b82f6';
    if (rating < 2100) return '#a855f7';
    if (rating < 2300) return '#fb923c';
    if (rating < 2400) return '#f97316';
    if (rating < 3000) return '#ef4444';
    return '#dc2626';
  };

  const getAccentRGB = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlHandle = params.get('handle');
    if (urlHandle) {
      setHandle(urlHandle);
      performSync(urlHandle);
    }
  }, []);

  const performSync = async (targetHandle, forceRefresh = false) => {
    if (!targetHandle) return;
    setIsSyncing(true);
    
    try {
        const url = new URL(`http://localhost:8000/api/v1/analyze/${targetHandle}`);
        if (forceRefresh) {
            url.searchParams.append('force_refresh', 'true');
        }
      const response = await fetch(url, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      
      const data = await response.json();
      
      // Map weakness_index from backend to index expected by frontend
      const formattedTopics = data.tag_analysis.map(t => ({
        tag: t.tag,
        index: t.weakness_index
      }));

      setUserData({
        handle: data.handle,
        rating: data.rating,
        tag_analysis: data.tag_analysis,
        roadmap: data.roadmap,
        stats: data.stats,
        upsolve: data.upsolve,
        tag_coverage: data.tag_coverage,
        last_synced: data.last_synced
      });
    } catch (error) {
      console.error(error);
      alert("Error fetching data. Is the backend running?");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSync = async (e, forceRefresh = false) => {
    if (e) e.preventDefault();
    await performSync(handle, forceRefresh);
  };

  const accentHex = getAccentColor(userData?.rating);
  const accentStyle = {
    '--accent': accentHex,
    '--accent-rgb': getAccentRGB(accentHex)
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans" style={accentStyle}>
      {/* Navbar */}
      <header className="h-16 border-b border-border bg-surface flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-white bg-clip-text text-transparent">
            AI CP Coach
          </h1>
        </div>
        
        {/* Search & Sync View */}
        <form onSubmit={handleSync} className="flex items-center relative w-96">
          <Search className="w-4 h-4 absolute left-3 text-textMuted" />
          <input
            type="text"
            placeholder="Enter Codeforces handle..."
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="w-full bg-background border border-border rounded-md py-2 pl-9 pr-24 text-sm focus:outline-none focus:border-primary transition-colors"
          />
          <button 
            type="submit"
            disabled={isSyncing || !handle}
            className="absolute right-1 top-1 bottom-1 px-3 bg-primary hover:bg-primaryHover text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isSyncing ? 'Syncing...' : 'Sync'}
          </button>
        </form>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-surface p-4 flex flex-col gap-2 shrink-0">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${activeTab === 'dashboard' ? 'bg-primary/10 text-primary' : 'text-textMuted hover:bg-border/50 hover:text-textMain'}`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="font-medium">Analytics & Roadmap</span>
          </button>
          <button 
            onClick={() => setActiveTab('coach')}
            className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${activeTab === 'coach' ? 'bg-primary/10 text-primary' : 'text-textMuted hover:bg-border/50 hover:text-textMain'}`}
          >
            <MessageSquareCode className="w-5 h-5" />
            <span className="font-medium">AI Coach Workspace</span>
          </button>
        </aside>

        {/* Dynamic View */}
        <main className="flex-1 overflow-auto">
          {!userData ? (
            <div className="h-full flex flex-col items-center justify-center text-textMuted">
              <Activity className="w-12 h-12 mb-4 opacity-20" />
              <p>Enter a Codeforces handle to begin analysis</p>
            </div>
          ) : activeTab === 'dashboard' ? (
            <Dashboard 
              data={userData} 
              onSolveWithCoach={(prob) => {
                setActiveWorkspaceProblem(prob);
                setActiveTab('coach');
              }} 
              onRefresh={() => handleSync(null, true)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 bg-surface">
              <div className="max-w-md w-full border border-border p-8 bg-background flex flex-col items-center text-center space-y-4">
                <MessageSquareCode className="w-12 h-12 text-[var(--accent)] mb-2 opacity-80" />
                <h2 className="text-xl font-mono text-white tracking-widest uppercase">AI Coach Workspace</h2>
                <div className="h-[1px] w-full bg-border my-2"></div>
                <p className="text-sm font-mono text-[var(--verdict-wa)] bg-[var(--verdict-wa)]/10 px-4 py-2 border border-[var(--verdict-wa)]/20 uppercase tracking-widest inline-block">
                  Currently Under Construction
                </p>
                <p className="text-xs text-textMuted leading-relaxed mt-4">
                  We are actively building the interactive AI coaching environment. This feature will allow you to pair-program with an AI assistant that has full context of your Codeforces profile, past mistakes, and the specific problem you are trying to solve.
                </p>
                {activeWorkspaceProblem && (
                  <div className="mt-4 p-3 bg-surface border border-border w-full text-left">
                    <p className="text-[10px] text-textMuted uppercase mb-1">Queued Problem:</p>
                    <p className="text-sm font-mono text-[var(--accent)] truncate">{activeWorkspaceProblem.problem_name}</p>
                  </div>
                )}
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className="mt-6 px-4 py-2 bg-surface hover:bg-border border border-border text-xs uppercase tracking-widest transition-colors font-semibold"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
