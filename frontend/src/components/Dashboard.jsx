import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';
import { ExternalLink, Swords, MessageSquare, RefreshCw, Search } from 'lucide-react';
import CFBadge from './CFBadge';

const Dashboard = ({ data, onSolveWithCoach, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('overview'); // overview, roadmap, upsolve, target
  const [upsolveView, setUpsolveView] = useState('attempted');
  
  // Target Practice Search State
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const [targetPracticeData, setTargetPracticeData] = useState(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState(''); 
  const [showSecondary, setShowSecondary] = useState(false);
  
  const primaryTags = useMemo(() => {
    if (!data?.tag_analysis) return [];
    return [...data.tag_analysis]
      .filter(t => t.state === 'Confirmed Weak' || t.state === 'Avoided')
      .sort((a, b) => {
        if (a.state === 'Avoided' && b.state !== 'Avoided') return -1;
        if (b.state === 'Avoided' && a.state !== 'Avoided') return 1;
        const gapA = a.target_rating - a.contest_reliability_rating;
        const gapB = b.target_rating - b.contest_reliability_rating;
        return gapB - gapA;
      });
  }, [data]);

  const handleTargetSearch = async (e) => {
    e.preventDefault();
    if (!targetSearchQuery.trim()) return;
    
    setTargetLoading(true);
    setTargetError('');
    setTargetPracticeData(null);
    
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/v1/practice/target`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: data.handle, tag: targetSearchQuery, force_refresh: false })
      });
      
      if (!res.ok) throw new Error('Failed to fetch target practice data');
      const resData = await res.json();
      setTargetPracticeData(resData);
    } catch (err) {
      setTargetError(err.message);
    } finally {
      setTargetLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
    
  const secondaryTags = useMemo(() => {
    if (!data?.tag_analysis) return [];
    return data.tag_analysis.filter(t => t.state === 'Low-confidence');
  }, [data]);
  
  // CF Verdict colors mapped from CSS variables
  const VERDICT_COLORS = {
    'OK': 'var(--verdict-ac)',
    'WRONG_ANSWER': 'var(--verdict-wa)',
    'TIME_LIMIT_EXCEEDED': 'var(--verdict-tle)',
    'MEMORY_LIMIT_EXCEEDED': 'var(--verdict-mle)',
    'COMPILATION_ERROR': 'var(--verdict-ce)',
    'RUNTIME_ERROR': 'var(--verdict-re)'
  };
  
  const verdictData = Object.entries(data.stats.verdicts || {}).map(([key, value]) => ({ 
    name: key === 'OK' ? 'ACCEPTED' : key, 
    value,
    color: VERDICT_COLORS[key] || '#808080'
  }));
  
  const solvesData = Object.entries(data.stats.solves_per_month || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([key, value]) => ({ month: key, solves: value }));

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Tabs & Sync */}
        <div className="flex justify-between items-center border-b border-border pb-2">
          <div className="flex gap-6">
            {['overview', 'roadmap', 'upsolve', 'target'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 uppercase text-xs tracking-wider transition-colors ${
                  activeTab === tab ? 'text-[var(--accent)] border-b border-[var(--accent)]' : 'text-textMuted hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-textMuted">
            {data.last_synced && <span>LAST_SYNC: {new Date(data.last_synced).toLocaleTimeString()}</span>}
            <button onClick={onRefresh} className="flex items-center gap-2 hover:text-white transition-colors border border-border px-2 py-1 bg-surface">
              <RefreshCw className="w-3 h-3" /> REFRESH
            </button>
          </div>
        </div>
        
        {/* Header Profile */}
        <div className="bg-surface border border-border p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <CFBadge handle={data.handle} rating={data.rating} />
        </div>

        {/* Strict Terminal Stat Cards */}
        {data.stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-surface border border-border p-4 flex flex-col justify-end">
              <h4 className="text-2xl font-mono text-white">{data.stats.current_streak}</h4>
              <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">Cur Streak</p>
            </div>
            <div className="bg-surface border border-border p-4 flex flex-col justify-end">
              <h4 className="text-2xl font-mono text-white">{data.stats.longest_streak}</h4>
              <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">Max Streak</p>
            </div>
            <div className="bg-surface border border-border p-4 flex flex-col justify-end">
              <h4 className="text-2xl font-mono text-white">{data.stats.total_solved}</h4>
              <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">Solved</p>
            </div>
            <div className="bg-surface border border-border p-4 flex flex-col justify-end">
              <h4 className="text-2xl font-mono text-white">{data.stats.accuracy}%</h4>
              <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">Accuracy</p>
            </div>
            <div className="bg-surface border border-border p-4 flex flex-col justify-end">
              <h4 className="text-2xl font-mono text-white">{data.stats.max_rating || 'N/A'}</h4>
              <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">Max Rating</p>
            </div>
            <div className="bg-surface border border-border p-4 flex flex-col justify-end">
              <h4 className="text-lg font-mono text-[var(--accent)] truncate">{data.stats.favorite_language}</h4>
              <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">Top Lang</p>
            </div>
          </div>
        )}

        {/* Tab Content: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Custom Topic Horizontal Bars */}
              <div className="bg-surface border border-border p-6 flex flex-col">
                <h3 className="text-xs uppercase tracking-widest text-textMuted mb-6">Effective Rating by Topic</h3>
                <div className="flex-1 space-y-4">
                  {primaryTags.concat(showSecondary ? secondaryTags : []).slice(0, 15).map(t => {
                    const ceiling = t.practice_ceiling_rating;
                    const diff = ceiling - data.rating;
                    const isPositive = diff >= 0;
                    const barWidth = Math.max(10, Math.min(100, (ceiling / (data.rating + 200)) * 100));
                    const contestRelPos = Math.max(10, Math.min(100, (t.contest_reliability_rating / (data.rating + 200)) * 100));
                    
                    return (
                      <div key={t.tag} className="flex items-center gap-3">
                        <div className="w-32 text-xs truncate font-mono flex items-center justify-between" title={t.tag}>
                          <span>{t.tag}</span>
                          {t.confidence === 'Low' && <span className="text-[8px] text-textMuted ml-1" title="Low Confidence">●</span>}
                        </div>
                        <div className="flex-1 h-2 bg-background border border-border overflow-hidden flex items-center relative">
                          <div 
                            className="h-full" 
                            style={{ 
                              width: `${barWidth}%`, 
                              backgroundColor: isPositive ? 'var(--verdict-ac)' : 'var(--verdict-wa)',
                              opacity: isPositive ? 1 : Math.max(0.4, 1 - (Math.abs(diff) / 500))
                            }}
                          ></div>
                          {t.contest_reliability_rating > 0 && (
                            <div 
                              className="absolute top-0 bottom-0 w-[2px] bg-white z-10" 
                              style={{ left: `${contestRelPos}%` }}
                              title={`Contest Reliability: ${t.contest_reliability_rating}`}
                            ></div>
                          )}
                        </div>
                        <div className="w-12 text-right font-mono text-xs" style={{ color: isPositive ? 'var(--verdict-ac)' : 'var(--verdict-wa)' }}>
                          {ceiling}
                        </div>
                      </div>
                    );
                  })}
                  
                  {secondaryTags.length > 0 && (
                    <button 
                      onClick={() => setShowSecondary(!showSecondary)}
                      className="w-full text-center text-[10px] text-textMuted hover:text-white uppercase tracking-widest pt-2 border-t border-border mt-4 transition-colors"
                    >
                      {showSecondary ? 'Show Less' : `Show ${secondaryTags.length} Low-Confidence Tags`}
                    </button>
                  )}
                </div>
              </div>
              
              {/* Solves Bar Chart */}
              <div className="bg-surface border border-border p-6">
                <h3 className="text-xs uppercase tracking-widest text-textMuted mb-6">Solves per Month</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={solvesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="month" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} tickMargin={10} fontFamily="monospace" />
                      <YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} tickMargin={10} fontFamily="monospace" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', fontFamily: 'monospace' }} 
                        cursor={{fill: 'var(--border-color)', opacity: 0.4}} 
                      />
                      <Bar dataKey="solves" fill="var(--accent)" maxBarSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Verdicts Pie Chart */}
              <div className="bg-surface border border-border p-6">
                <h3 className="text-xs uppercase tracking-widest text-textMuted mb-6">Verdict Breakdown</h3>
                <div className="h-[250px] w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={verdictData}
                        cx="40%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={1}
                        dataKey="value"
                        stroke="var(--bg-surface)"
                        strokeWidth={2}
                      >
                        {verdictData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', fontFamily: 'monospace' }} 
                        itemStyle={{ color: '#fff' }} 
                        formatter={(value, name) => {
                          const total = verdictData.reduce((sum, item) => sum + item.value, 0);
                          const percent = ((value / total) * 100).toFixed(1);
                          return [`${percent}% (${value})`, name];
                        }}
                      />
                      <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', color: '#a1a1aa' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Weak Topics List */}
              <div className="bg-surface border border-border p-6 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs uppercase tracking-widest text-textMuted">Top Weak Topics</h3>
                  <button onClick={() => setActiveTab('roadmap')} className="text-xs text-[var(--accent)] hover:underline">PRACTICE &rarr;</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3">
                  {primaryTags.filter(t => t.state === 'Avoided' || t.state === 'Confirmed Weak').slice(0,5).map(t => {
                    const isAvoided = t.state === 'Avoided';
                    return (
                    <div key={t.tag} className="flex justify-between items-center p-3 bg-background border border-border">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm">{t.tag}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider uppercase ${isAvoided ? 'bg-[var(--verdict-tle)] text-background' : 'bg-surface text-textMuted border border-border'}`}>
                            {t.state}
                          </span>
                        </div>
                        <div className={`flex gap-3 text-[10px] uppercase mt-1 ${t.confidence === 'Low' ? 'text-textMuted/50' : 'text-textMuted'}`}>
                          <span>Target: {t.target_rating}</span>
                          <span>Att: {t.actual_attempts}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-sm" style={{ color: isAvoided ? 'var(--verdict-tle)' : 'var(--verdict-wa)' }}>
                          {t.target_rating - t.contest_reliability_rating}
                        </span>
                        <p className="text-[10px] text-textMuted uppercase">Gap</p>
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            </div>
            
            {/* Activity Pattern Heatmap */}
            <div className="bg-surface border border-border p-6">
              <h3 className="text-xs uppercase tracking-widest text-textMuted mb-6">Activity Pattern</h3>
              <div className="overflow-x-auto pb-4">
                <div className="flex flex-col gap-0 min-w-[600px] border border-border w-max">
                  <div className="flex gap-0 ml-8 border-b border-border bg-background">
                    {[...Array(24)].map((_, i) => <div key={i} className="w-6 text-[10px] text-center text-textMuted font-mono py-1 border-r border-border last:border-r-0">{i}</div>)}
                  </div>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, dIdx) => (
                    <div key={day} className="flex gap-0 items-stretch border-b border-border last:border-b-0">
                      <div className="w-8 text-[10px] text-textMuted flex items-center justify-center font-mono border-r border-border bg-background uppercase">{day.slice(0,2)}</div>
                      {[...Array(24)].map((_, h) => {
                        const val = data.stats.activity_grid[`${dIdx},${h}`] || 0;
                        let opacity = 0;
                        if (val > 0) opacity = 0.2;
                        if (val > 2) opacity = 0.4;
                        if (val > 5) opacity = 0.7;
                        if (val > 10) opacity = 1;
                        return (
                          <div 
                            key={h} 
                            className="w-6 aspect-square border-r border-border last:border-r-0 hover:bg-white/10 transition-colors flex items-center justify-center font-mono text-[8px]" 
                            style={{ backgroundColor: `rgba(var(--accent-rgb), ${opacity})`, color: opacity > 0.5 ? '#fff' : 'var(--accent)' }}
                            title={`${val} submissions at ${h}:00`}
                          >
                            {val > 0 ? val : ''}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tag Coverage Heatmap */}
            <div className="bg-surface border border-border p-6">
              <h3 className="text-xs uppercase tracking-widest text-textMuted mb-6">Tag Coverage (Solves by Rating)</h3>
              <div className="overflow-x-auto pb-4">
                <div className="flex flex-col gap-0 min-w-[800px] border border-border w-max">
                  <div className="flex gap-0 ml-32 border-b border-border bg-background">
                    {['<1000', '1000-1199', '1200-1399', '1400-1599', '1600-1799', '1800-1999', '2000-2199', '2200-2399', '2400+'].map((band) => (
                      <div key={band} className="w-16 text-[10px] text-center text-textMuted font-mono py-1 border-r border-border last:border-r-0">{band}</div>
                    ))}
                  </div>
                  {Object.keys(data.tag_coverage).sort().map((tag, idx, arr) => (
                    <div key={tag} className={`flex gap-0 items-stretch ${idx !== arr.length - 1 ? 'border-b border-border' : ''}`}>
                      <div className="w-32 px-2 text-[10px] text-textMuted flex items-center font-mono border-r border-border bg-background truncate" title={tag}>{tag}</div>
                      {['<1000', '1000-1199', '1200-1399', '1400-1599', '1600-1799', '1800-1999', '2000-2199', '2200-2399', '2400+'].map((band, bIdx, bArr) => {
                        let matchKey = band;
                        if (band === '<1000') matchKey = '800-999';
                        if (band === '2400+') matchKey = '2400-2599'; 
                        
                        let val = 0;
                        if (band === '<1000') {
                          val = (data.tag_coverage[tag]['800-999'] || 0) + (data.tag_coverage[tag]['0-199'] || 0);
                        } else if (band === '2400+') {
                           val = Object.keys(data.tag_coverage[tag]).filter(k => parseInt(k) >= 2400).reduce((a,b) => a + data.tag_coverage[tag][b], 0);
                        } else {
                          val = data.tag_coverage[tag][band] || 0;
                        }

                        let opacity = 0;
                        if (val > 0) opacity = 0.2;
                        if (val > 2) opacity = 0.4;
                        if (val > 5) opacity = 0.7;
                        if (val > 10) opacity = 1;
                        
                        return (
                          <div 
                            key={band} 
                            className={`w-16 h-6 hover:bg-white/10 transition-colors flex items-center justify-center font-mono text-[10px] ${bIdx !== bArr.length - 1 ? 'border-r border-border' : ''}`}
                            style={{ backgroundColor: `rgba(var(--accent-rgb), ${opacity})`, color: opacity > 0.5 ? '#fff' : 'var(--accent)' }}
                            title={`${val} solves in ${band}`}
                          >
                            {val > 0 ? val : ''}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Tab Content: Roadmap */}
        {activeTab === 'roadmap' && (
          <div className="bg-surface border border-border p-6">
            <h3 className="text-xs uppercase tracking-widest text-textMuted mb-6">Roadmap</h3>
            <div className="space-y-8">
              {(() => {
                const avoidedTags = primaryTags.filter(t => t.state === 'Avoided');
                const weakTags = primaryTags.filter(t => t.state === 'Confirmed Weak');
                
                const renderTopicList = (topics, colorVar) => (
                  <div className="space-y-6">
                    {topics.slice(0, 5).map((topic, i) => {
                      const problems = data.roadmap?.recommended_problems?.filter(p => p.tag === topic.tag) || [];
                      const target = topic.target_rating;
                      
                      return (
                        <div key={i} className="flex gap-4 items-start relative group">
                          <div 
                            className="w-8 h-8 bg-background flex items-center justify-center shrink-0 font-mono text-sm z-10 border"
                            style={{ color: colorVar, borderColor: colorVar }}
                          >
                            {i + 1}
                          </div>
                          {i !== Math.min(4, topics.length - 1) && (
                            <div className="absolute left-4 top-8 bottom-[-24px] w-[1px] bg-border group-last:hidden"></div>
                          )}
                          <div className="bg-background p-4 flex-1 border border-border">
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-mono text-sm">{topic.tag}</h4>
                                {topic.confidence === 'Low' && <span className="text-[10px] text-textMuted">(Low Conf)</span>}
                              </div>
                              <span className="text-[10px] px-2 py-1 bg-surface border border-border text-textMuted font-mono uppercase tracking-wider">{topic.state}</span>
                            </div>
                            <p className="text-xs text-textMuted mb-4">TARGET RATING: {target}</p>
                            
                            <div className="space-y-2">
                              {problems.map((prob) => (
                                <div key={prob.id} className="flex flex-col gap-2 p-3 bg-surface border border-border hover:border-[var(--accent)] transition-colors">
                                  <div className="flex items-center gap-2">
                                    <a 
                                      href={prob.url} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="flex-1 flex items-center gap-3 overflow-hidden group/link"
                                    >
                                      <span className="text-[10px] font-mono px-2 py-1 bg-background text-textMuted border border-border shrink-0">
                                        {prob.rating}
                                      </span>
                                      <span className="text-sm font-mono truncate group-hover/link:text-[var(--accent)] transition-colors">
                                        {prob.problem_name}
                                      </span>
                                      <ExternalLink className="w-3 h-3 text-textMuted shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                                    </a>
                                    <button 
                                      onClick={() => onSolveWithCoach(prob)}
                                      className="shrink-0 px-3 py-1 bg-background hover:bg-border text-[var(--accent)] border border-border transition-colors flex items-center gap-2"
                                      title="Solve with Coach"
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                      <span className="text-[10px] uppercase tracking-wider font-semibold">Solve</span>
                                    </button>
                                  </div>
                                  {prob.reason && <p className="text-[10px] font-mono text-textMuted border-l-2 border-border pl-2">&gt; {prob.reason}</p>}
                                </div>
                              ))}
                              {problems.length === 0 && (
                                <p className="text-xs font-mono text-textMuted">&gt; No unsolved problems in range.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
                
                return (
                  <>
                    {weakTags.length > 0 && (
                      <div className="mb-10">
                        <h4 className="text-xs uppercase tracking-widest mb-6 border-b border-border pb-2" style={{ color: 'var(--verdict-wa)' }}>Confirmed Weak Topics</h4>
                        {renderTopicList(weakTags, 'var(--verdict-wa)')}
                      </div>
                    )}
                    {avoidedTags.length > 0 && (
                      <div>
                        <h4 className="text-xs uppercase tracking-widest mb-6 border-b border-border pb-2" style={{ color: 'var(--verdict-tle)' }}>Avoided Topics</h4>
                        {renderTopicList(avoidedTags, 'var(--verdict-tle)')}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Tab Content: Upsolving */}
        {activeTab === 'upsolve' && data.upsolve && (
          <div className="bg-surface border border-border p-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-border pb-4">
              <div>
                <h3 className="text-xs uppercase tracking-widest text-textMuted">Upsolving Arena</h3>
                <p className="text-[10px] text-textMuted mt-1">SPOILER-FREE TRAINING PROBLEMS & RECENT CONTESTS</p>
              </div>
              
              <div className="flex bg-background border border-border">
                <button
                  onClick={() => setUpsolveView('recommendations')}
                  className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                    upsolveView === 'recommendations' ? 'bg-[var(--accent)] text-background' : 'text-textMuted hover:text-white'
                  }`}
                >
                  AI PICKS
                </button>
                <button
                  onClick={() => setUpsolveView('attempted')}
                  className={`px-3 py-1.5 text-xs font-mono border-l border-border transition-colors ${
                    upsolveView === 'attempted' ? 'bg-[var(--accent)] text-background' : 'text-textMuted hover:text-white'
                  }`}
                >
                  ATTEMPTED
                </button>
                <button
                  onClick={() => setUpsolveView('unattempted')}
                  className={`px-3 py-1.5 text-xs font-mono border-l border-border transition-colors ${
                    upsolveView === 'unattempted' ? 'bg-[var(--accent)] text-background' : 'text-textMuted hover:text-white'
                  }`}
                >
                  UNATTEMPTED
                </button>
              </div>
            </div>
            
            {(() => {
              if (upsolveView === 'recommendations') {
                const problems = data.upsolve?.recommended_problems || [];
                
                if (!problems || problems.length === 0) {
                  return (
                    <div className="text-center p-8 border border-border bg-background">
                      <p className="text-sm font-mono text-textMuted">
                        &gt; NO RECOMMENDATIONS AVAILABLE AT THIS TIME.
                      </p>
                    </div>
                  );
                }
                
                return (
                  <div className="space-y-4">
                    {problems.map((prob, i) => (
                      <div key={`${prob.problem_id}-${i}`} className="bg-background border border-border p-4 hover:border-[var(--accent)] transition-colors">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className="text-[10px] font-mono px-2 py-1 bg-surface text-textMuted border border-border shrink-0">
                              {prob.rating || '???'}
                            </span>
                            <a 
                              href={prob.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-sm font-mono truncate hover:text-[var(--accent)] transition-colors group/link flex items-center gap-2"
                            >
                              {prob.problem_name}
                              <ExternalLink className="w-3 h-3 text-textMuted opacity-0 group-hover/link:opacity-100 transition-opacity" />
                            </a>
                          </div>
                          <button 
                            onClick={() => onSolveWithCoach(prob)}
                            className="shrink-0 px-3 py-1 bg-surface hover:bg-border text-[var(--accent)] border border-border transition-colors flex items-center gap-2"
                            title="Solve with Coach"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span className="text-[10px] uppercase tracking-wider font-semibold">Solve</span>
                          </button>
                        </div>
                        <p className="text-[11px] font-mono text-textMuted border-l-2 border-border pl-3 mt-2">
                          &gt; {prob.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              }

              // Attempted / Unattempted Contest View
              const problems = upsolveView === 'attempted' ? (data.upsolve?.attempted || []) : (data.upsolve?.unattempted || []);
              
              if (!problems || problems.length === 0) {
                let emptyMessage = "";
                const meta = data.upsolve?.metadata || {};
                
                if (upsolveView === 'attempted') {
                  if (meta.attempted_contests_count === 0) {
                    emptyMessage = "YOU DID NOT PARTICIPATE IN ANY OF THE 5 MOST RECENT CONTESTS.";
                  } else if (meta.attempted_in_range_count === 0) {
                    emptyMessage = "NO PROBLEMS EXISTED IN YOUR RATING RANGE IN THESE CONTESTS.";
                  } else {
                    emptyMessage = "YOU SOLVED ALL IN-RANGE PROBLEMS FROM THESE CONTESTS! (0 FAILED ATTEMPTS)";
                  }
                } else {
                  if (meta.unattempted_contests_count === 0) {
                    emptyMessage = "YOU PARTICIPATED IN ALL OF THE 5 MOST RECENT CONTESTS.";
                  } else if (meta.unattempted_in_range_count === 0) {
                    emptyMessage = "NO PROBLEMS EXISTED IN YOUR RATING RANGE IN THESE UNATTEMPTED CONTESTS.";
                  } else {
                    emptyMessage = "NO UNATTEMPTED PROBLEMS IN RECENT CONTESTS."; // Fallback
                  }
                }
                
                return (
                  <div className="text-center p-8 border border-border bg-background">
                    <p className="text-sm font-mono text-textMuted">
                      &gt; {emptyMessage}
                    </p>
                  </div>
                );
              }
              
              const groupedProblems = problems.reduce((acc, prob) => {
                const key = prob.contest_name;
                if (!acc[key]) acc[key] = [];
                acc[key].push(prob);
                return acc;
              }, {});
              
              return (
                <div className="space-y-6">
                  {Object.entries(groupedProblems).map(([contest, probs]) => (
                    <div key={contest} className="border border-border">
                      <div className="bg-background px-4 py-2 border-b border-border">
                        <h4 className="text-xs font-mono text-textMuted truncate" title={contest}>{contest}</h4>
                      </div>
                      <div className="p-4 bg-surface space-y-3">
                        {probs.map((prob) => (
                          <div key={prob.id} className="flex flex-col gap-2 p-3 bg-background border border-border hover:border-[var(--accent)] transition-colors">
                            <div className="flex items-center gap-2">
                              <a 
                                href={prob.url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="flex-1 flex items-center gap-3 overflow-hidden group/link"
                              >
                                <span className="text-[10px] font-mono px-2 py-1 bg-surface text-textMuted border border-border shrink-0">
                                  {prob.index}
                                </span>
                                <span className="text-[10px] font-mono px-2 py-1 bg-surface text-textMuted border border-border shrink-0">
                                  {prob.rating}
                                </span>
                                <span className="text-sm font-mono truncate group-hover/link:text-[var(--accent)] transition-colors">
                                  {prob.problem_name}
                                </span>
                                <ExternalLink className="w-3 h-3 text-textMuted shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                              </a>
                              <button 
                                onClick={() => onSolveWithCoach(prob)}
                                className="shrink-0 px-3 py-1 bg-surface hover:bg-border text-[var(--accent)] border border-border transition-colors flex items-center gap-2"
                                title="Solve with Coach"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span className="text-[10px] uppercase tracking-wider font-semibold">Solve</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
              
            })()}
          </div>
        )}

        {/* Tab Content: Target Practice */}
        {activeTab === 'target' && (
          <div className="bg-surface border border-border p-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-border pb-4">
              <div>
                <h3 className="text-xs uppercase tracking-widest text-textMuted">Target Practice</h3>
                <p className="text-[10px] text-textMuted mt-1">SEARCH A TAG TO GET YOUR EFFECTIVE RATING AND A TAILORED PROBLEM</p>
              </div>
            </div>
            
            <form onSubmit={handleTargetSearch} className="flex gap-2 mb-8">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input 
                  type="text" 
                  value={targetSearchQuery}
                  onChange={(e) => setTargetSearchQuery(e.target.value)}
                  placeholder="Enter a Codeforces tag (e.g., bitmasks, math, graphs)"
                  className="w-full bg-background border border-border py-3 pl-10 pr-4 text-sm font-mono focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <button 
                type="submit" 
                disabled={targetLoading || !targetSearchQuery.trim()}
                className="px-6 py-3 bg-[var(--accent)] text-background text-xs font-mono font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {targetLoading ? 'Searching...' : 'Search'}
              </button>
            </form>
            
            {targetError && (
              <div className="bg-background border border-[var(--verdict-wa)] p-4 mb-6">
                <p className="text-sm font-mono text-[var(--verdict-wa)]">&gt; ERROR: {targetError}</p>
              </div>
            )}
            
            {targetPracticeData && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-background border border-border p-4">
                    <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Tag</p>
                    <p className="text-sm font-mono font-bold">{targetPracticeData.tag}</p>
                  </div>
                  <div className="bg-background border border-border p-4">
                    <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Effective Target Rating</p>
                    <p className="text-sm font-mono font-bold text-[var(--accent)]">{targetPracticeData.target_rating}</p>
                  </div>
                </div>
                
                {targetPracticeData.recommended_problem ? (
                  <div className="space-y-3">
                    <h4 className="text-xs uppercase tracking-widest text-textMuted">Recommended Problem</h4>
                    <div className="bg-background border border-border p-4 hover:border-[var(--accent)] transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="text-[10px] font-mono px-2 py-1 bg-surface text-textMuted border border-border shrink-0">
                            {targetPracticeData.recommended_problem.rating || '???'}
                          </span>
                          <a 
                            href={targetPracticeData.recommended_problem.url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-sm font-mono truncate hover:text-[var(--accent)] transition-colors group/link flex items-center gap-2"
                          >
                            {targetPracticeData.recommended_problem.problem_name}
                            <ExternalLink className="w-3 h-3 text-textMuted opacity-0 group-hover/link:opacity-100 transition-opacity" />
                          </a>
                        </div>
                        <button 
                          onClick={() => onSolveWithCoach(targetPracticeData.recommended_problem)}
                          className="shrink-0 px-3 py-1 bg-surface hover:bg-border text-[var(--accent)] border border-border transition-colors flex items-center gap-2"
                          title="Solve with Coach"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span className="text-[10px] uppercase tracking-wider font-semibold">Solve</span>
                        </button>
                      </div>
                      <p className="text-[11px] font-mono text-textMuted border-l-2 border-border pl-3 mt-2">
                        &gt; {targetPracticeData.recommended_problem.reason}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-8 border border-border bg-background">
                    <p className="text-sm font-mono text-textMuted">
                      &gt; NO UNSOLVED PROBLEMS FOUND IN YOUR TARGET RATING RANGE.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
