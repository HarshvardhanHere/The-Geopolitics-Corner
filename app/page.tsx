'use client';

import { useState, useEffect, useRef } from 'react';
import MapWrapper from '@/components/MapWrapper';
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
  const [loading, setLoading] = useState(true);

  // Global datasets
  const [events, setEvents] = useState<EventData[]>([]);
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [mappings, setMappings] = useState<MappingData[]>([]);
  const [connections, setConnections] = useState<ConnectionData[]>([]);

  // Selection states
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'node'>('map');
  const [timelineFilter, setTimelineFilter] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');
  
  // Detail Modal state
  const [activeDetailNode, setActiveDetailNode] = useState<NodeData | null>(null);

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

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

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
      // Single date case
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
    setViewMode('map');
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const handleSearchNodeClick = (node: NodeData) => {
    // 1. Locate parent event for the clicked node
    const mapping = mappings.find((m) => m.node_id === node.node_id);
    if (mapping) {
      const parentEvent = events.find((e) => e.event_id === mapping.event_id);
      if (parentEvent) {
        setSelectedEvent(parentEvent);
      }
    }
    // 2. Open detail modal
    setActiveDetailNode(node);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const navigateToNodeId = (nodeId: number) => {
    const targetNode = nodes.find(n => n.node_id === nodeId);
    if (targetNode) {
      // Find and load parent event
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#070913] text-slate-100 font-sans">
      {/* 1. Left Sidebar: Macro Events list */}
      <aside className="w-80 border-r border-slate-800 bg-[#0c101d] flex flex-col justify-between z-10 select-none shadow-xl">
        <div className="flex flex-col flex-1 min-h-0">
          {/* Logo / Header */}
          <div className="p-5 border-b border-slate-900 flex justify-between items-center bg-[#090d16]">
            <div>
              <h1 className="text-sm font-bold text-slate-100 tracking-wider font-mono">
                GEOPNODES GRAPH
              </h1>
              <p className="text-[10px] text-orange-500 font-mono mt-0.5 uppercase tracking-widest">
                Manually Curated Events
              </p>
            </div>
            <a
              href="/admin"
              className="w-8 h-8 rounded-full border border-slate-800 hover:border-orange-500/50 bg-[#111827] flex items-center justify-center hover:scale-105 transition-all text-slate-400 hover:text-orange-500"
              title="Curator Portal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </a>
          </div>

          {/* Events Scroll Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
              events.map((event) => {
                const isActive = selectedEvent?.event_id === event.event_id;
                return (
                  <button
                    key={event.event_id}
                    onClick={() => {
                      setSelectedEvent(event);
                      setTimelineFilter('ALL');
                      setViewMode('map');
                    }}
                    className={`w-full text-left p-3.5 border rounded-lg transition-all cursor-pointer flex flex-col gap-1.5 ${
                      isActive
                        ? 'bg-[#1c1615] border-orange-600/80 shadow-lg shadow-orange-950/20'
                        : 'bg-slate-900/40 border-slate-900 hover:border-slate-800 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] font-mono font-bold tracking-wider ${
                        isActive ? 'text-orange-500' : 'text-slate-400'
                      }`}>
                        {event.event_id}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {event.start_date}
                      </span>
                    </div>
                    <div className={`text-xs font-bold leading-normal ${
                      isActive ? 'text-slate-100' : 'text-slate-300'
                    }`}>
                      {event.title}
                    </div>
                    {event.tags && event.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {event.tags.map((t, idx) => (
                          <span key={idx} className="bg-slate-900 text-slate-400 border border-slate-800 rounded px-1.5 py-0.5 text-[9px] font-semibold font-mono">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 font-mono mt-1 font-semibold">
                      {event.nodeCount} {event.nodeCount === 1 ? 'node' : 'nodes'}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* 2. Main Workspace: Map / Search / Viewport Overlay */}
      <main className="flex-1 relative flex flex-col h-full bg-[#070913] select-none">
        
        {/* Global Search Experience (Google-style, top-left overlay) */}
        <div ref={searchContainerRef} className="absolute left-4 top-4 w-80 z-[1001]">
          <div className="bg-[#0f1422]/90 backdrop-blur-md border border-slate-800 rounded-lg flex items-center px-3 py-2 shadow-2xl focus-within:border-orange-500/50 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 mr-2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
            </svg>
            <input
              type="text"
              placeholder="Search events, node titles..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchDropdown(true);
              }}
              onFocus={() => setShowSearchDropdown(true)}
              className="bg-transparent border-none text-slate-100 text-xs w-full focus:outline-none placeholder-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-100 text-xs cursor-pointer px-1 font-bold"
              >
                &times;
              </button>
            )}
          </div>

          {/* Search Dropdown Panel (Requirement Section 4.7) */}
          {showSearchDropdown && searchQuery && (
            <div className="absolute left-0 right-0 top-11 bg-[#0f1422]/95 backdrop-blur-md border border-slate-800 rounded-lg shadow-2xl overflow-y-auto max-h-96 z-50 p-3 flex flex-col gap-4">
              {/* Event Results Tier */}
              <div>
                <h4 className="text-[10px] font-bold text-indigo-400 font-mono tracking-wider mb-2">
                  MACRO EVENTS ({filteredEventsResult.length})
                </h4>
                {filteredEventsResult.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic px-2">No matching events.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {filteredEventsResult.map((e) => (
                      <button
                        key={e.event_id}
                        onClick={() => handleSearchEventClick(e)}
                        className="w-full text-left hover:bg-slate-800/60 p-2 rounded text-xs transition-colors cursor-pointer group"
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
                )}
              </div>

              {/* Node Results Tier */}
              <div>
                <h4 className="text-[10px] font-bold text-indigo-400 font-mono tracking-wider mb-2">
                  INDIVIDUAL NODES ({filteredNodesResult.length})
                </h4>
                {filteredNodesResult.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic px-2">No matching node titles.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {filteredNodesResult.map((n) => (
                      <button
                        key={n.node_id}
                        onClick={() => handleSearchNodeClick(n)}
                        className="w-full text-left hover:bg-slate-800/60 p-2 rounded text-xs transition-colors cursor-pointer group"
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
                )}
              </div>
            </div>
          )}
        </div>

        {/* View Mode Toggle button (Only active when Macro Event is selected) */}
        {selectedEvent && (
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
        )}

        {/* 3. Render Views */}
        <div className="flex-1 w-full h-full relative">
          {viewMode === 'map' ? (
            <MapWrapper
              activeNodes={filteredActiveNodes}
              activeEvent={selectedEvent}
              onNodeClick={setActiveDetailNode}
            />
          ) : (
            /* Stub Node View component for Milestone 2 */
            <div className="flex items-center justify-center w-full h-full bg-[#070913] text-slate-400 font-mono text-xs border border-slate-900 select-none">
              <div className="text-center p-8 bg-[#0f1422] border border-slate-800 rounded-lg max-w-sm shadow-2xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-8 h-8 mx-auto text-orange-500/80 mb-4 animate-pulse">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.005 9.005 0 0 0-12 0M12 4.5v15m0-15a9 9 0 0 1 9 9m-9-9a9 9 0 0 0-9 9" />
                </svg>
                <h4 className="text-slate-200 font-bold mb-1">Node View Physics Simulation</h4>
                <p className="text-[10px] text-slate-500 leading-normal uppercase tracking-wider font-bold">
                  Locked / / Available in Milestone 3
                </p>
              </div>
            </div>
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

        {/* 5. Timeline bar component (Bottom overlay, Section 4.6) */}
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
                  
                  // Label date strings
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
    </div>
  );
}
export const dynamic = 'force-dynamic';
