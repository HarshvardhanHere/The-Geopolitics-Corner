'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import MapWrapper from '@/components/MapWrapper';
import NodeWrapper from '@/components/NodeWrapper';
import NodeDetailModal from '@/components/NodeDetailModal';

interface EventData {
  event_id: string;
  title: string;
  start_date: string;
  tags: string[];
  nodeCount: number;
}

interface NodeData {
  node_id: number;
  title: string;
  date: string;
  actors: string[];
  parent_country: string | null;
  tags: string[];
  remarks: string;
}

interface MappingData {
  event_id: string;
  node_id: number;
}

interface ConnectionData {
  connection_id: string;
  node_a: number;
  node_b: number;
}

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Global datasets
  const [events, setEvents] = useState<EventData[]>([]);
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [mappings, setMappings] = useState<MappingData[]>([]);
  const [connections, setConnections] = useState<ConnectionData[]>([]);

  // Selection states
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  // Fix 2 (Point 2): viewMode is stable state — only changes via explicit toggle clicks
  const [viewMode, setViewMode] = useState<'map' | 'node'>('map');
  const [timelineFilter, setTimelineFilter] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');

  // Detail Modal state
  const [activeDetailNode, setActiveDetailNode] = useState<NodeData | null>(null);

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Admin password modal state (Point 1 change 6)
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);

  // Welcome modal state
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('tgc_welcome_dismissed') !== 'true') {
      setShowWelcome(true);
    }
  }, []);

  const dismissWelcome = () => {
    setShowWelcome(false);
    sessionStorage.setItem('tgc_welcome_dismissed', 'true');
  };

  // Fetch all public data on load
  useEffect(() => {
    fetch('/api/public/data')
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events || []);
        setNodes(data.nodes || []);
        setConnections(data.connections || []);
        setMappings(data.mappings || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching data:', err);
        setLoading(false);
      });
  }, []);

  // Close search dropdown on click outside OR Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowSearchDropdown(false);
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Filter nodes for the active Macro Event
  const activeEventNodes = selectedEvent
    ? nodes.filter((n) =>
        mappings.some((m) => m.event_id === selectedEvent.event_id && m.node_id === n.node_id)
      )
    : [];

  // Calculate timeline quarter bounds
  const getQuarterBounds = () => {
    if (activeEventNodes.length === 0) return null;
    const dates = activeEventNodes.map((n) => new Date(n.date).getTime()).sort((a, b) => a - b);
    const minTime = dates[0];
    const maxTime = dates[dates.length - 1];
    const delta = maxTime - minTime;

    if (delta <= 0) {
      return [
        { start: minTime, end: minTime },
        { start: minTime, end: minTime },
        { start: minTime, end: minTime },
        { start: minTime, end: minTime },
      ];
    }

    const quarterSize = delta / 4;
    return [
      { start: minTime, end: minTime + quarterSize },
      { start: minTime + quarterSize, end: minTime + 2 * quarterSize },
      { start: minTime + 2 * quarterSize, end: minTime + 3 * quarterSize },
      { start: minTime + 3 * quarterSize, end: maxTime },
    ];
  };

  const quarters = getQuarterBounds();

  // Filter nodes by selected timeline quarter
  const filteredActiveNodes = activeEventNodes.filter((node) => {
    if (timelineFilter === 'ALL' || !quarters) return true;
    const time = new Date(node.date).getTime();
    const idx = parseInt(timelineFilter.replace('Q', '')) - 1;
    const q = quarters[idx];

    if (idx === 0) {
      return time >= q.start && time <= q.end;
    }
    return time > q.start && time <= q.end;
  });

  // Identify Non-State Actor Nodes in the active filtered set (parent_country is null)
  const activeNonStateNodes = filteredActiveNodes.filter(n => n.parent_country === null);

  // Search filter
  const filteredEventsResult = searchQuery
    ? events.filter(
        (e) =>
          e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  const filteredNodesResult = searchQuery
    ? nodes.filter((n) => n.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const handleSearchEventClick = (event: EventData) => {
    setSelectedEvent(event);
    setTimelineFilter('ALL');
    // Fix 2: Do NOT change viewMode here
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const handleSearchNodeClick = (node: NodeData) => {
    const mapping = mappings.find((m) => m.node_id === node.node_id);
    if (mapping) {
      const parentEvent = events.find((e) => e.event_id === mapping.event_id);
      if (parentEvent) {
        setSelectedEvent(parentEvent);
      }
    }
    setActiveDetailNode(node);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const navigateToNodeId = (nodeId: number) => {
    const targetNode = nodes.find(n => n.node_id === nodeId);
    if (targetNode) {
      const mapping = mappings.find(m => m.node_id === nodeId);
      if (mapping) {
        const parentEvent = events.find(e => e.event_id === mapping.event_id);
        if (parentEvent) {
          setSelectedEvent(parentEvent);
        }
      }
      setActiveDetailNode(targetNode);
    }
  };

  // Admin modal: authenticate then redirect to /admin (full edit)
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError('');
    setAdminAuthLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      if (res.ok) {
        setShowAdminModal(false);
        setAdminPassword('');
        router.push('/admin');
      } else {
        const data = await res.json();
        setAdminAuthError(data.error || 'Incorrect password');
      }
    } catch {
      setAdminAuthError('Network error. Please try again.');
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const openAdminModal = () => {
    setAdminPassword('');
    setAdminAuthError('');
    setShowAdminModal(true);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#070913] text-slate-100 font-sans">
      {/* 1. Left Sidebar: Macro Events list */}
      <aside className="w-80 border-r border-slate-800 bg-[#0c101d] flex flex-col justify-between z-10 select-none shadow-xl">
        <div className="flex flex-col flex-1 min-h-0">
          {/* Logo / Header */}
          <div className="p-5 border-b border-slate-900 flex justify-between items-center bg-[#090d16]">
            <div>
              <h1 className="text-sm font-bold text-slate-100 tracking-wider font-mono">
                The Geopolitics Corner
              </h1>
              <p className="text-[10px] text-orange-500 font-mono mt-0.5 uppercase tracking-widest">
                by Harshvardhan Gaikwad
              </p>
            </div>
            {/* Admin icon — always shows password prompt (Point 1 change 6) */}
            <button
              onClick={openAdminModal}
              className="w-8 h-8 rounded-full border border-slate-800 hover:border-orange-500/50 bg-[#111827] flex items-center justify-center hover:scale-105 transition-all text-slate-400 hover:text-orange-500 cursor-pointer"
              title="Curator Portal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </button>
          </div>

          {/* Search bar — moved into sidebar (Point 1 change 3) */}
          <div ref={searchContainerRef} className="px-4 pt-4 pb-2 relative">
            <div className="bg-[#0f1422]/90 border border-slate-800 rounded-lg flex items-center px-3 py-2 shadow-inner focus-within:border-orange-500/50 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
              </svg>
              <input
                type="text"
                placeholder="Search events, nodes..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onFocus={() => setShowSearchDropdown(true)}
                className="bg-transparent border-none text-slate-100 text-xs w-full focus:outline-none placeholder-slate-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-slate-100 text-xs cursor-pointer px-1 font-bold flex-shrink-0"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Search Dropdown */}
            {showSearchDropdown && searchQuery && (
              <div className="absolute left-4 right-4 top-[calc(100%-4px)] bg-[#0f1422]/98 border border-slate-800 rounded-lg shadow-2xl overflow-y-auto max-h-80 z-50 p-3 flex flex-col gap-4">

                {/* Unified empty state when both tiers have zero matches */}
                {filteredEventsResult.length === 0 && filteredNodesResult.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-slate-600">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
                    </svg>
                    <p className="text-xs text-slate-500 italic">No results found</p>
                  </div>
                ) : (
                  <>
                    {/* Event Results tier */}
                    {filteredEventsResult.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-bold text-indigo-400 font-mono tracking-wider mb-2">
                          MACRO EVENTS ({filteredEventsResult.length})
                        </h4>
                        <div className="flex flex-col gap-1.5">
                          {filteredEventsResult.map((e) => (
                            <button
                              key={e.event_id}
                              onClick={() => handleSearchEventClick(e)}
                              className="w-full text-left hover:bg-slate-800/60 p-2 rounded text-xs transition-colors cursor-pointer"
                            >
                              <span className="text-orange-500 font-mono text-[9px] font-bold block">
                                {e.event_id}
                              </span>
                              <span className="text-slate-200 font-semibold truncate block">
                                {e.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Node Results tier */}
                    {filteredNodesResult.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-bold text-indigo-400 font-mono tracking-wider mb-2">
                          INDIVIDUAL NODES ({filteredNodesResult.length})
                        </h4>
                        <div className="flex flex-col gap-1.5">
                          {filteredNodesResult.map((n) => (
                            <button
                              key={n.node_id}
                              onClick={() => handleSearchNodeClick(n)}
                              className="w-full text-left hover:bg-slate-800/60 p-2 rounded text-xs transition-colors cursor-pointer"
                            >
                              <span className="text-indigo-400 font-mono text-[9px] font-bold block">
                                Node {n.node_id}
                              </span>
                              <span className="text-slate-200 font-semibold truncate block">
                                {n.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Events Scroll Container */}
          <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-2">
            <h3 className="text-[10px] font-bold text-slate-400 font-mono tracking-wider mb-2">
              MACRO EVENTS TIMELINE
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500"></div>
              </div>
            ) : events.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-10 text-center">No Macro Events recorded.</p>
            ) : (
              [...events].sort((a, b) => (b.nodeCount || 0) - (a.nodeCount || 0)).map((event) => {
                const isActive = selectedEvent?.event_id === event.event_id;
                return (
                  <button
                    key={event.event_id}
                    onClick={() => {
                      // Fix 2 (Point 2): Do NOT change viewMode — only update selected event
                      setSelectedEvent(event);
                      setTimelineFilter('ALL');
                    }}
                    className={`w-full text-left p-3 border rounded-lg transition-all cursor-pointer flex flex-col gap-1 ${
                      isActive
                        ? 'bg-[#1c1615] border-orange-600/80 shadow-lg shadow-orange-950/20'
                        : 'bg-slate-900/40 border-slate-900 hover:border-slate-800 hover:bg-slate-900/60'
                    }`}
                  >
                    {/* Simplified: only title and node count (Point 1 change 2) */}
                    <div className={`text-xs font-bold leading-normal ${
                      isActive ? 'text-slate-100' : 'text-slate-300'
                    }`}>
                      {event.title}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono font-semibold">
                      {event.nodeCount} {event.nodeCount === 1 ? 'node' : 'nodes'}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Visit Repository button */}
        <div className="p-4 border-t border-slate-900 bg-[#090d16]">
          <a
            href="/admin?view=true"
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-600 text-slate-300 hover:text-slate-100 text-xs font-semibold transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
            Visit Repository
          </a>
        </div>
      </aside>

      {/* 2. Main Workspace: Map / Viewport Overlay */}
      <main className="flex-1 relative flex flex-col h-full bg-[#070913] select-none">

        {/* View Mode Toggle (always visible) */}
        <div className="absolute right-4 top-4 z-[1001]">
          <div className="bg-[#0f1422]/90 backdrop-blur-md border border-slate-800 rounded-lg p-1.5 flex gap-1 shadow-2xl">
            <button
              onClick={() => setViewMode('map')}
              className={`text-[10px] font-bold px-3 py-1.5 rounded transition-all cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-orange-600 text-white shadow shadow-orange-950/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Map View
            </button>
            <button
              onClick={() => setViewMode('node')}
              className={`text-[10px] font-bold px-3 py-1.5 rounded transition-all cursor-pointer ${
                viewMode === 'node'
                  ? 'bg-orange-600 text-white shadow shadow-orange-950/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Node View
            </button>
          </div>
        </div>

        {/* 3. Render Views */}
        <div className="flex-1 w-full h-full relative">
          {viewMode === 'map' ? (
            <MapWrapper
              activeNodes={filteredActiveNodes}
              activeEvent={selectedEvent}
              onNodeClick={setActiveDetailNode}
            />
          ) : (
            <NodeWrapper
              activeNodes={filteredActiveNodes}
              activeEvent={selectedEvent}
              connections={connections}
              onNodeClick={setActiveDetailNode}
            />
          )}

          {/* 4. Non-State Actor Right-Side panel (Map View Overlay, Section 4.2) */}
          {selectedEvent && viewMode === 'map' && activeNonStateNodes.length > 0 && (
            <div className="absolute right-4 top-24 bottom-24 w-60 z-[999] bg-[#0c101d]/60 backdrop-blur-md border border-slate-800/80 rounded-lg shadow-2xl p-4 flex flex-col">
              <h3 className="text-[10px] font-bold text-slate-400 font-mono tracking-wider border-b border-slate-900 pb-2 mb-3">
                NON-STATE ACTORS ({activeNonStateNodes.length})
              </h3>
              <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 items-center justify-center pr-1">
                {activeNonStateNodes.map((node) => (
                  <div
                    key={node.node_id}
                    id={`nonstate-${node.node_id}`}
                    onClick={() => setActiveDetailNode(node)}
                    className="w-12 h-12 rounded-full bg-white hover:bg-slate-100 text-slate-950 flex items-center justify-center text-[10px] font-bold text-center cursor-pointer shadow-lg hover:scale-110 transition-all border border-slate-300 select-none px-1 overflow-hidden truncate"
                    title={node.actors.join(', ')}
                  >
                    {node.actors[0] || 'NSA'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 5. Helper card — context-sensitive, bottom-right, always visible */}
        <div className="absolute bottom-20 right-4 z-[1000] max-w-[220px] pointer-events-none select-none">
          <div className="bg-[#0c101d]/60 backdrop-blur-sm border border-slate-800/50 rounded-lg px-3 py-2.5 shadow-lg">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              {viewMode === 'map'
                ? 'Select an event from the left panel to illuminate the countries involved. Click any connection line between two countries to see the nodes linking them. Click a node card to read the full details.'
                : 'Select an event from the left panel to see all involved countries rendered as a clustered network. Each circle is a node. Click any node to read its full details.'}
            </p>
          </div>
        </div>

        {/* 6. Timeline bar component (Bottom overlay, Section 4.6) */}
        {selectedEvent && activeEventNodes.length > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1001] w-full max-w-xl px-4 animate-slide-up">
            <div className="bg-[#0f1422]/90 backdrop-blur-md border border-slate-800 rounded-lg p-2.5 flex items-center gap-3 shadow-2xl">
              {/* All Time button */}
              <button
                onClick={() => setTimelineFilter('ALL')}
                className={`text-[10px] font-bold font-mono px-3 py-1.5 rounded transition-all cursor-pointer ${
                  timelineFilter === 'ALL'
                    ? 'bg-orange-600 text-white shadow shadow-orange-950/20'
                    : 'bg-slate-900/60 border border-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                All Time
              </button>

              <span className="w-px h-5 bg-slate-800" />

              {/* Quarters (Q1 to Q4) */}
              <div className="flex-1 grid grid-cols-4 gap-2">
                {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => {
                  const isActive = timelineFilter === q;
                  const idx = parseInt(q.replace('Q', '')) - 1;
                  const bound = quarters ? quarters[idx] : null;

                  const dateStr = bound
                    ? `${new Date(bound.start).toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${new Date(bound.end).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                    : '';

                  return (
                    <button
                      key={q}
                      onClick={() => setTimelineFilter(q as any)}
                      className={`text-[9px] font-bold font-mono py-1 rounded transition-all cursor-pointer text-center flex flex-col items-center justify-center ${
                        isActive
                          ? 'bg-orange-600 text-white shadow shadow-orange-950/20'
                          : 'bg-slate-900/60 border border-slate-850 hover:bg-slate-850 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>{q}</span>
                      {dateStr && <span className="text-[7px] font-normal opacity-70 mt-0.5">{dateStr}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 6. Node Detail Modal Overlay (Section 4.4) */}
      {activeDetailNode && (
        <NodeDetailModal
          node={activeDetailNode}
          allNodes={nodes}
          allEvents={events}
          allMappings={mappings}
          allConnections={connections}
          onClose={() => setActiveDetailNode(null)}
          onNavigateToNode={navigateToNodeId}
        />
      )}

      {/* 7. Curator Password Modal (Point 1 change 6 — always shown on admin icon click) */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-[#0f1422] border border-slate-800 rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
            {/* Close */}
            <button
              onClick={() => { setShowAdminModal(false); setAdminPassword(''); setAdminAuthError(''); }}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-200 transition-colors cursor-pointer text-lg leading-none"
            >
              &times;
            </button>

            <h2 className="text-base font-bold text-slate-100 mb-1 tracking-wide">Curator Access</h2>
            <p className="text-xs text-slate-400 mb-5">Enter the curator security key to access full edit mode.</p>

            <form onSubmit={handleAdminLogin} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Security Key</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  autoFocus
                  className="w-full bg-[#172033] border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                  placeholder="Enter password..."
                  required
                />
              </div>
              {adminAuthError && (
                <p className="text-red-400 text-xs font-mono -mt-2">{adminAuthError}</p>
              )}
              <button
                type="submit"
                disabled={adminAuthLoading}
                className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg py-2.5 font-semibold text-sm transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {adminAuthLoading ? 'Authenticating…' : 'Authenticate & Enter'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 9. Welcome Modal (first visit only, sessionStorage persisted) */}
      {showWelcome && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
          <div className="bg-[#0f1422] border border-slate-800 rounded-xl shadow-2xl w-full max-w-lg p-7 relative">
            <h2 className="text-lg font-bold text-slate-100 mb-4 tracking-wide">Welcome to The Geopolitics Corner</h2>
            <div className="text-xs text-slate-300 leading-relaxed space-y-3 mb-6">
              <p>
                This platform maps real-world geopolitical developments as an interactive visual knowledge graph. Every event, connection, and insight here is independently researched and manually curated — no AI fuss.
              </p>
              <p>
                <strong className="text-orange-400">Map View</strong> — Every geopolitical event involves multiple nations, often in ways that are not immediately obvious. This view illuminates the countries involved and draws the connections between them directly on a world map, making both explicit and implicit relationships visible at a glance.
              </p>
              <p>
                <strong className="text-orange-400">Node View</strong> — Nothing in geopolitics happens in isolation. This view renders the same events as a living web of interconnected nodes, revealing how individual developments shape and influence the broader course of global affairs.
              </p>
              <p>
                <strong className="text-orange-400">Repository</strong> — Browse the complete underlying database of events, nodes, and connections that power this platform.
              </p>
              <p className="text-slate-400 italic">
                Select any event from the left panel to begin.
              </p>
            </div>
            <button
              onClick={dismissWelcome}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded-lg py-2.5 font-semibold text-sm transition-all cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export const dynamic = 'force-dynamic';
