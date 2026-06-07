'use client';

import { useState, useEffect, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, RowClassParams } from 'ag-grid-community';

// AG Grid v35 register community modules
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
ModuleRegistry.registerModules([AllCommunityModule]);

const myTheme = themeQuartz.withParams({
  backgroundColor: '#0c101d',
  foregroundColor: '#f1f5f9',
  borderColor: '#1e293b',
});

interface NodeData {
  node_id: number;
  title: string;
  date: string;
  actors: string[];
  parent_country: string | null;
  tags: string[];
  remarks: string;
  parent_events?: string[];
  hasConflict?: boolean;
  conflict_desc?: string;
}

interface EventData {
  event_id: string;
  title: string;
  start_date: string;
  actors?: string[];
  tags: string[];
  hasConflict?: boolean;
  conflict_desc?: string;
}

interface ConnectionData {
  connection_id: string;
  node_a: number;
  node_b: number;
  hasConflict?: boolean;
  conflict_desc?: string;
}

interface UploadLogEntry {
  timestamp: string;
  filename: string;
  addedEvents: number;
  addedNodes: number;
  addedConnections: number;
  skipped: number;
  conflicts: number;
}

export default function AdminPage() {
  // Auth state
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Data states
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [connections, setConnectionData] = useState<ConnectionData[]>([]);

  // Selection states
  const [selectedCount, setSelectedCount] = useState(0);

  // Modified states (staged edits)
  const [modifiedNodes, setModifiedNodes] = useState<Set<number>>(new Set());
  const [modifiedEvents, setModifiedEvents] = useState<Set<string>>(new Set());
  const [modifiedConnections, setModifiedConnections] = useState<Set<string>>(new Set());

  // Deleted states
  const [deletedNodeIds, setDeletedNodeIds] = useState<number[]>([]);
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>([]);
  const [deletedConnectionIds, setDeletedConnectionIds] = useState<string[]>([]);

  // Active tab
  const [activeTab, setActiveTab] = useState<'nodes' | 'events' | 'connections'>('nodes');

  // Excel upload status & preview
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [pendingFilename, setPendingFilename] = useState<string>('');
  const [pendingPreview, setPendingPreview] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);

  // Upload logs
  const [uploadLogs, setUploadLogs] = useState<UploadLogEntry[]>([]);

  // References to grids
  const nodesGridRef = useRef<any>(null);
  const eventsGridRef = useRef<any>(null);
  const connectionsGridRef = useRef<any>(null);

  // Check auth session on load
  useEffect(() => {
    fetch('/api/auth')
      .then((res) => res.json())
      .then((data) => {
        setAuthenticated(data.authenticated);
        if (data.authenticated) {
          loadData();
          loadUploadLogs();
        }
      })
      .catch(() => setAuthenticated(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthenticated(true);
        loadData();
        loadUploadLogs();
      } else {
        const data = await res.json();
        setAuthError(data.error || 'Invalid password');
      }
    } catch (err) {
      setAuthError('An error occurred during login');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    setAuthenticated(false);
  };

  const loadData = async () => {
    try {
      const res = await fetch('/api/admin/data');
      if (res.ok) {
        const data = await res.json();
        setNodes(data.nodes);
        setEvents(data.events);
        setConnectionData(data.connections);
        
        // Reset modified tracking and selections
        setModifiedNodes(new Set());
        setModifiedEvents(new Set());
        setModifiedConnections(new Set());
        setDeletedNodeIds([]);
        setDeletedEventIds([]);
        setDeletedConnectionIds([]);
        setSelectedCount(0);
      }
    } catch (err) {
      console.error('Failed to load admin data', err);
    }
  };

  const loadUploadLogs = () => {
    const logsJson = localStorage.getItem('upload_logs');
    if (logsJson) {
      try {
        setUploadLogs(JSON.parse(logsJson));
      } catch (e) {
        console.error('Failed to parse upload logs', e);
      }
    }
  };

  const saveUploadLog = (entry: UploadLogEntry) => {
    setUploadLogs((current) => {
      const updated = [entry, ...current].slice(0, 10);
      localStorage.setItem('upload_logs', JSON.stringify(updated));
      return updated;
    });
  };

  // Upload parser request (returns preview data, does NOT write to database)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingFilename(file.name);
    setUploadStatus('Parsing file and checking database for conflicts...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setUploadStatus('Parsing completed. Review preview before committing.');
        setPendingPreview(data);
        setShowPreviewModal(true);
      } else {
        setUploadStatus(`Error: ${data.error || 'Failed to parse file'}`);
      }
    } catch (err) {
      setUploadStatus('An error occurred during file upload');
    } finally {
      // Clear file input value so same file can be re-selected if needed
      e.target.value = '';
    }
  };

  // Confirms the preview and triggers database write for new records
  const handleConfirmImport = async () => {
    if (!pendingPreview) return;

    setUploadStatus('Writing new records to the database...');
    setShowPreviewModal(false);

    try {
      const res = await fetch('/api/admin/import-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: pendingPreview.preview.events,
          nodes: pendingPreview.preview.nodes,
          connections: pendingPreview.preview.connections,
          nodeMappings: pendingPreview.preview.nodeMappings,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setUploadStatus('Import completed. Stale conflict rows are highlighted in red below.');
        
        // Log this upload
        const newLog: UploadLogEntry = {
          timestamp: new Date().toISOString(),
          filename: pendingFilename,
          addedEvents: pendingPreview.summary.addedEvents,
          addedNodes: pendingPreview.summary.addedNodes,
          addedConnections: pendingPreview.summary.addedConnections,
          skipped: pendingPreview.summary.skipped,
          conflicts: pendingPreview.summary.conflicts,
        };
        saveUploadLog(newLog);

        // Render database data and overlay conflicts
        if (pendingPreview.conflicts && pendingPreview.conflicts.length > 0) {
          const updatedNodes = [...nodes];
          const updatedEvents = [...events];
          const updatedConnections = [...connections];

          pendingPreview.conflicts.forEach((conflict: any) => {
            const conflictRecord = {
              ...conflict.excelRecord,
              hasConflict: true,
              conflict_desc: conflict.description,
              dbRecord: conflict.dbRecord,
              excelRecord: conflict.excelRecord,
            };

            if (conflict.type === 'node') {
              const idx = updatedNodes.findIndex((n) => n.node_id === conflict.id);
              if (idx !== -1) {
                updatedNodes[idx] = conflictRecord;
              } else {
                updatedNodes.push(conflictRecord);
              }
              setModifiedNodes((prev) => new Set(prev).add(conflict.id));
            } else if (conflict.type === 'event') {
              const idx = updatedEvents.findIndex((e) => e.event_id === conflict.id);
              if (idx !== -1) {
                updatedEvents[idx] = conflictRecord;
              } else {
                updatedEvents.push(conflictRecord);
              }
              setModifiedEvents((prev) => new Set(prev).add(conflict.id));
            } else if (conflict.type === 'connection') {
              const idx = updatedConnections.findIndex((c) => c.connection_id === conflict.id);
              if (idx !== -1) {
                updatedConnections[idx] = conflictRecord;
              } else {
                updatedConnections.push(conflictRecord);
              }
              setModifiedConnections((prev) => new Set(prev).add(conflict.id));
            }
          });

          setNodes(updatedNodes);
          setEvents(updatedEvents);
          setConnectionData(updatedConnections);
        }

        // Pull non-conflicting new items from database
        const freshRes = await fetch('/api/admin/data');
        if (freshRes.ok) {
          const freshData = await freshRes.json();
          
          setNodes((current) => {
            const conflictsOnly = current.filter((n) => n.hasConflict);
            const freshNonConflicts = freshData.nodes.filter(
              (fn: any) => !conflictsOnly.some((c) => c.node_id === fn.node_id)
            );
            return [...freshNonConflicts, ...conflictsOnly].sort((a, b) => a.node_id - b.node_id);
          });

          setEvents((current) => {
            const conflictsOnly = current.filter((e) => e.hasConflict);
            const freshNonConflicts = freshData.events.filter(
              (fe: any) => !conflictsOnly.some((c) => c.event_id === fe.event_id)
            );
            return [...freshNonConflicts, ...conflictsOnly].sort((a, b) => a.event_id.localeCompare(b.event_id));
          });

          setConnectionData((current) => {
            const conflictsOnly = current.filter((c) => c.hasConflict);
            const freshNonConflicts = freshData.connections.filter(
              (fc: any) => !conflictsOnly.some((c) => c.connection_id === fc.connection_id)
            );
            return [...freshNonConflicts, ...conflictsOnly].sort((a, b) => a.connection_id.localeCompare(b.connection_id));
          });
        }
      } else {
        setUploadStatus(`Import failed: ${data.error || 'Database transaction error'}`);
      }
    } catch (err) {
      setUploadStatus('An error occurred during database import commit');
    } finally {
      setPendingPreview(null);
    }
  };

  const handleCancelImport = () => {
    setPendingPreview(null);
    setShowPreviewModal(false);
    setUploadStatus('Import cancelled.');
  };

  // Conflict Resolution Action Handler
  const resolveConflictRow = async (rowData: any, action: 'keep' | 'accept') => {
    let id = '';
    let type: 'node' | 'event' | 'connection' = 'node';

    if (rowData.node_id !== undefined) {
      id = rowData.node_id.toString();
      type = 'node';
    } else if (rowData.event_id !== undefined) {
      id = rowData.event_id;
      type = 'event';
    } else if (rowData.connection_id !== undefined) {
      id = rowData.connection_id;
      type = 'connection';
    }

    try {
      setUploadStatus(`Resolving conflict for ${id} (${action === 'accept' ? 'accepting Excel' : 'keeping DB'})...`);
      const res = await fetch('/api/admin/resolve-conflict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          id,
          action,
          excelRecord: rowData,
        }),
      });

      if (res.ok) {
        setUploadStatus(`Conflict for ${id} resolved successfully.`);
        // Reload fresh clean data from database
        loadData();
      } else {
        const data = await res.json();
        setUploadStatus(`Conflict resolution failed: ${data.error || 'Database error'}`);
      }
    } catch (err) {
      setUploadStatus('Network error during conflict resolution');
    }
  };

  // Add Rows Manual
  const handleAddNode = () => {
    const nextId = nodes.length > 0 ? Math.max(...nodes.map((n) => n.node_id)) + 1 : 1;
    const newNode: NodeData = {
      node_id: nextId,
      title: 'New Node',
      date: new Date().toISOString().split('T')[0],
      actors: [],
      parent_country: null,
      tags: [],
      remarks: '',
      parent_events: [],
    };
    setNodes((prev) => [...prev, newNode]);
    setModifiedNodes((prev) => new Set(prev).add(nextId));
    setActiveTab('nodes');
  };

  const handleAddEvent = () => {
    const nextNum = events.length + 1;
    const nextId = `EVENT ${nextNum.toString().padStart(2, '0')}`;
    const newEvent: EventData = {
      event_id: nextId,
      title: 'New Event',
      start_date: new Date().toISOString().split('T')[0],
      tags: [],
    };
    setEvents((prev) => [...prev, newEvent]);
    setModifiedEvents((prev) => new Set(prev).add(nextId));
    setActiveTab('events');
  };

  const handleAddConnection = () => {
    const nextNum = connections.length + 1;
    const nextId = `C${nextNum.toString().padStart(3, '0')}`;
    const newConn: ConnectionData = {
      connection_id: nextId,
      node_a: nodes[0]?.node_id || 1,
      node_b: nodes[1]?.node_id || 2,
    };
    setConnectionData((prev) => [...prev, newConn]);
    setModifiedConnections((prev) => new Set(prev).add(nextId));
    setActiveTab('connections');
  };

  // Mass deletion handler
  const handleDeleteSelected = async () => {
    let selectedRows: any[] = [];
    if (activeTab === 'nodes' && nodesGridRef.current) {
      selectedRows = nodesGridRef.current.api.getSelectedRows();
    } else if (activeTab === 'events' && eventsGridRef.current) {
      selectedRows = eventsGridRef.current.api.getSelectedRows();
    } else if (activeTab === 'connections' && connectionsGridRef.current) {
      selectedRows = connectionsGridRef.current.api.getSelectedRows();
    }

    if (selectedRows.length === 0) return;

    const confirmMsg = `Are you sure you want to delete the ${selectedRows.length} selected row(s) from the database? This action is irreversible.`;
    if (!window.confirm(confirmMsg)) return;

    setUploadStatus('Deleting selected records...');

    try {
      const payload: any = {
        deletedNodeIds: [],
        deletedEventIds: [],
        deletedConnectionIds: [],
      };

      if (activeTab === 'nodes') {
        payload.deletedNodeIds = selectedRows.map((r) => r.node_id);
      } else if (activeTab === 'events') {
        payload.deletedEventIds = selectedRows.map((r) => r.event_id);
      } else if (activeTab === 'connections') {
        payload.deletedConnectionIds = selectedRows.map((r) => r.connection_id);
      }

      const res = await fetch('/api/admin/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setUploadStatus(`Deleted ${selectedRows.length} records successfully.`);
        setSelectedCount(0);
        loadData();
      } else {
        const data = await res.json();
        setUploadStatus(`Delete failed: ${data.error || 'Database error'}`);
      }
    } catch (err) {
      setUploadStatus('Network error during deletion');
    }
  };

  // Save cell changes to Database
  const handleSaveChanges = async () => {
    const nodesToSave = nodes.filter((n) => modifiedNodes.has(n.node_id));
    const eventsToSave = events.filter((e) => modifiedEvents.has(e.event_id));
    const connectionsToSave = connections.filter((c) => modifiedConnections.has(c.connection_id));

    setUploadStatus('Saving staged cell edits...');

    try {
      const res = await fetch('/api/admin/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: nodesToSave,
          events: eventsToSave,
          connections: connectionsToSave,
          deletedNodeIds,
          deletedEventIds,
          deletedConnectionIds,
        }),
      });

      if (res.ok) {
        setUploadStatus('All edits saved successfully.');
        loadData();
      } else {
        const data = await res.json();
        setUploadStatus(`Save failed: ${data.error || 'Database error'}`);
      }
    } catch (err) {
      setUploadStatus('Network error during save');
    }
  };

  // Handle cell value changes
  const handleCellValueChanged = (params: any, type: 'node' | 'event' | 'connection') => {
    if (params.data.hasConflict) {
      params.data.hasConflict = false;
      params.data.conflict_desc = '';
    }

    if (type === 'node') {
      setModifiedNodes((prev) => new Set(prev).add(params.data.node_id));
    } else if (type === 'event') {
      setModifiedEvents((prev) => new Set(prev).add(params.data.event_id));
    } else if (type === 'connection') {
      setModifiedConnections((prev) => new Set(prev).add(params.data.connection_id));
    }
  };

  // Handle AG Grid row selection updates
  const handleSelectionChanged = (event: any) => {
    const selected = event.api.getSelectedRows();
    setSelectedCount(selected.length);
  };

  // Reset selection on tab switch
  const handleTabSwitch = (tab: 'nodes' | 'events' | 'connections') => {
    setActiveTab(tab);
    setSelectedCount(0);
    if (nodesGridRef.current?.api) nodesGridRef.current.api.deselectAll();
    if (eventsGridRef.current?.api) eventsGridRef.current.api.deselectAll();
    if (connectionsGridRef.current?.api) connectionsGridRef.current.api.deselectAll();
  };

  // Column definitions for AG Grid
  const checkboxCol: ColDef = {
    headerCheckboxSelection: true,
    checkboxSelection: true,
    width: 50,
    pinned: 'left',
    editable: false,
    sortable: false,
    filter: false,
  };

  const conflictResolutionCol = (type: 'node' | 'event' | 'connection'): ColDef => ({
    headerName: 'Conflict Resolution',
    width: 200,
    pinned: 'right',
    editable: false,
    cellRenderer: (params: any) => {
      if (!params.data || !params.data.hasConflict) return null;
      return (
        <div className="flex gap-2 items-center h-full">
          <button
            onClick={() => resolveConflictRow(params.data, 'keep')}
            className="bg-slate-700 hover:bg-slate-600 text-slate-100 text-[10px] px-2 py-1 rounded cursor-pointer transition-colors"
          >
            Keep DB
          </button>
          <button
            onClick={() => resolveConflictRow(params.data, 'accept')}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-100 text-[10px] px-2 py-1 rounded cursor-pointer transition-colors"
          >
            Accept Excel
          </button>
        </div>
      );
    },
  });

  const conflictDescCol: ColDef = {
    headerName: 'Conflict Description',
    field: 'conflict_desc',
    width: 300,
    editable: false,
    cellStyle: { color: '#f87171', fontStyle: 'italic' },
  };

  const nodeColumnDefs: ColDef<NodeData>[] = [
    checkboxCol,
    { headerName: 'Node ID', field: 'node_id', width: 90, editable: false },
    { headerName: 'Title', field: 'title', width: 200, editable: true },
    { headerName: 'Date', field: 'date', width: 110, editable: true },
    {
      headerName: 'Actors',
      field: 'actors',
      width: 160,
      editable: true,
      valueGetter: (params) => params.data?.actors?.join(', ') || '',
      valueSetter: (params) => {
        if (!params.data) return false;
        params.data.actors = params.newValue
          ? params.newValue.split(',').map((x: string) => x.trim()).filter(Boolean)
          : [];
        return true;
      },
    },
    { headerName: 'Parent Country', field: 'parent_country', width: 140, editable: true },
    {
      headerName: 'Parent Event(s)',
      field: 'parent_events',
      width: 150,
      editable: true,
      valueGetter: (params) => params.data?.parent_events?.join(', ') || '',
      valueSetter: (params) => {
        if (!params.data) return false;
        params.data.parent_events = params.newValue
          ? params.newValue.split(',').map((x: string) => x.trim()).filter(Boolean)
          : [];
        return true;
      },
    },
    {
      headerName: 'Tags',
      field: 'tags',
      width: 150,
      editable: true,
      valueGetter: (params) => params.data?.tags?.join(', ') || '',
      valueSetter: (params) => {
        if (!params.data) return false;
        params.data.tags = params.newValue
          ? params.newValue.split(',').map((x: string) => x.trim()).filter(Boolean)
          : [];
        return true;
      },
    },
    { headerName: 'Remarks', field: 'remarks', width: 200, editable: true },
    conflictDescCol,
    conflictResolutionCol('node'),
  ];

  const eventColumnDefs: ColDef<EventData>[] = [
    checkboxCol,
    { headerName: 'Event ID', field: 'event_id', width: 110, editable: false },
    { headerName: 'Title', field: 'title', width: 260, editable: true },
    { headerName: 'Date', field: 'start_date', width: 130, editable: true },
    {
      headerName: 'Tags',
      field: 'tags',
      width: 200,
      editable: true,
      valueGetter: (params) => params.data?.tags?.join(', ') || '',
      valueSetter: (params) => {
        if (!params.data) return false;
        params.data.tags = params.newValue
          ? params.newValue.split(',').map((x: string) => x.trim()).filter(Boolean)
          : [];
        return true;
      },
    },
    conflictDescCol,
    conflictResolutionCol('event'),
  ];

  const connectionColumnDefs: ColDef<ConnectionData>[] = [
    checkboxCol,
    { headerName: 'Connection ID', field: 'connection_id', width: 130, editable: false },
    {
      headerName: 'Node A',
      field: 'node_a',
      width: 120,
      editable: true,
      valueParser: (params) => parseInt(params.newValue, 10) || 0,
    },
    {
      headerName: 'Node B',
      field: 'node_b',
      width: 120,
      editable: true,
      valueParser: (params) => parseInt(params.newValue, 10) || 0,
    },
    conflictDescCol,
    conflictResolutionCol('connection'),
  ];

  // Grid styling rules
  const gridRowClassRules = {
    'conflict-row': (params: RowClassParams) => params.data.hasConflict === true,
  };

  if (authenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#070913] text-slate-100">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#070913]">
        <form
          onSubmit={handleLogin}
          className="bg-[#0f1422] border border-slate-800 p-8 rounded-lg shadow-2xl w-full max-w-sm"
        >
          <h1 className="text-xl font-bold text-slate-100 mb-6 text-center tracking-wide font-sans">
            Curator Access Portal
          </h1>
          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-2">Security Key</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#172033] border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
              required
            />
          </div>
          {authError && <p className="text-red-400 text-sm mb-4 font-mono">{authError}</p>}
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded py-2 transition-colors font-medium cursor-pointer"
          >
            Authenticate
          </button>
        </form>
      </div>
    );
  }

  const hasUnsavedChanges =
    modifiedNodes.size > 0 ||
    modifiedEvents.size > 0 ||
    modifiedConnections.size > 0 ||
    deletedNodeIds.length > 0 ||
    deletedEventIds.length > 0 ||
    deletedConnectionIds.length > 0;

  return (
    <div className="bg-[#070913] min-h-screen text-slate-100 font-sans p-6">
      {/* Top Header */}
      <header className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50 tracking-tight">
            Geopolitical Knowledge Graph Platform
          </h1>
          <p className="text-xs text-indigo-400 font-mono mt-1">
            Curator Workspace / / Dark Mode Enabled
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2 rounded transition-colors cursor-pointer"
        >
          Sign Out
        </button>
      </header>

      {/* Control Actions & Import Center */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Upload Excel Card */}
        <div className="bg-[#0f1422] border border-slate-800 p-5 rounded-lg flex flex-col justify-between shadow-lg">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">Upload Excel Ledger</h3>
            <p className="text-xs text-slate-400 mb-4">
              Upload Event, Node, and Connection spreadsheets. A preview will be generated before database updates.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="text-xs text-slate-400 file:bg-indigo-600 file:hover:bg-indigo-500 file:text-slate-100 file:border-none file:px-3 file:py-1.5 file:rounded file:cursor-pointer cursor-pointer transition-colors"
            />
            {uploadStatus && (
              <p className="text-xs text-indigo-300 font-mono mt-1 leading-relaxed">{uploadStatus}</p>
            )}
          </div>
        </div>

        {/* Local Storage Log Persist (Last 10 Uploads) */}
        <div className="bg-[#0f1422] border border-slate-800 p-5 rounded-lg shadow-lg flex flex-col h-[200px] overflow-hidden">
          <h3 className="text-sm font-semibold text-slate-200 mb-2">Persistent Upload Log</h3>
          <div className="flex-1 overflow-y-auto pr-1">
            {uploadLogs.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-6">
                No recent uploads logged.
              </p>
            ) : (
              <table className="w-full text-[10px] font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-left">
                    <th className="py-1 pr-2">Date/Time</th>
                    <th className="py-1 pr-2">File</th>
                    <th className="py-1 text-center">New</th>
                    <th className="py-1 text-center">Skip</th>
                    <th className="py-1 text-center text-red-400">Conf</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 text-slate-300">
                  {uploadLogs.map((log, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                      <td className="py-1 pr-2 text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-1 pr-2 truncate max-w-[80px]" title={log.filename}>
                        {log.filename}
                      </td>
                      <td className="py-1 text-center text-emerald-400">
                        {log.addedEvents + log.addedNodes + log.addedConnections}
                      </td>
                      <td className="py-1 text-center text-slate-400">
                        {log.skipped}
                      </td>
                      <td className="py-1 text-center text-red-400 font-semibold">
                        {log.conflicts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Sync Controls Card */}
        <div className="bg-[#0f1422] border border-slate-800 p-5 rounded-lg flex flex-col justify-between shadow-lg">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">Cell Edit Sync Panel</h3>
            <p className="text-xs text-slate-400 mb-4">
              Inline changes entered in the spreadsheet below are saved here.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSaveChanges}
              disabled={!hasUnsavedChanges}
              className={`w-full py-2 rounded text-xs font-bold transition-all ${
                hasUnsavedChanges
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-lg shadow-emerald-900/30'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Save Staged Cell Edits
            </button>
            {hasUnsavedChanges && (
              <p className="text-[10px] text-center text-amber-400 font-mono animate-pulse">
                Local changes are waiting to be saved.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Grid Tabs, Deletions, & Add Actions */}
      <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-1">
        <div className="flex gap-2">
          <button
            onClick={() => handleTabSwitch('nodes')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'nodes'
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Nodes ({nodes.length})
          </button>
          <button
            onClick={() => handleTabSwitch('events')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'events'
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Events ({events.length})
          </button>
          <button
            onClick={() => handleTabSwitch('connections')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'connections'
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Connections ({connections.length})
          </button>
        </div>
        
        <div className="flex gap-3 items-center">
          {/* Mass Delete Trigger */}
          <button
            onClick={handleDeleteSelected}
            disabled={selectedCount === 0}
            className={`text-xs px-3 py-1.5 rounded transition-all font-semibold ${
              selectedCount > 0
                ? 'bg-red-700 hover:bg-red-600 text-white cursor-pointer shadow-lg'
                : 'bg-slate-850 text-slate-600 cursor-not-allowed'
            }`}
          >
            Delete Selected ({selectedCount})
          </button>

          <span className="w-px h-5 bg-slate-800" />

          {/* Add Item Actions */}
          {activeTab === 'nodes' && (
            <button
              onClick={handleAddNode}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded transition-all font-semibold cursor-pointer"
            >
              + Add Node
            </button>
          )}
          {activeTab === 'events' && (
            <button
              onClick={handleAddEvent}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded transition-all font-semibold cursor-pointer"
            >
              + Add Event
            </button>
          )}
          {activeTab === 'connections' && (
            <button
              onClick={handleAddConnection}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded transition-all font-semibold cursor-pointer"
            >
              + Add Connection
            </button>
          )}
        </div>
      </div>

      {/* Grid Canvas */}
      <div className="bg-[#0f1422] border border-slate-800 rounded-lg p-2 shadow-inner">
        {activeTab === 'nodes' && (
          <div className="ag-theme-quartz-dark w-full h-[500px]">
            <AgGridReact
              ref={nodesGridRef}
              rowData={nodes}
              columnDefs={nodeColumnDefs}
              rowClassRules={gridRowClassRules}
              onCellValueChanged={(params) => handleCellValueChanged(params, 'node')}
              onSelectionChanged={handleSelectionChanged}
              rowSelection="multiple"
              domLayout="normal"
              theme={myTheme}
            />
          </div>
        )}

        {activeTab === 'events' && (
          <div className="ag-theme-quartz-dark w-full h-[500px]">
            <AgGridReact
              ref={eventsGridRef}
              rowData={events}
              columnDefs={eventColumnDefs}
              rowClassRules={gridRowClassRules}
              onCellValueChanged={(params) => handleCellValueChanged(params, 'event')}
              onSelectionChanged={handleSelectionChanged}
              rowSelection="multiple"
              domLayout="normal"
              theme={myTheme}
            />
          </div>
        )}

        {activeTab === 'connections' && (
          <div className="ag-theme-quartz-dark w-full h-[500px]">
            <AgGridReact
              ref={connectionsGridRef}
              rowData={connections}
              columnDefs={connectionColumnDefs}
              rowClassRules={gridRowClassRules}
              onCellValueChanged={(params) => handleCellValueChanged(params, 'connection')}
              onSelectionChanged={handleSelectionChanged}
              rowSelection="multiple"
              domLayout="normal"
              theme={myTheme}
            />
          </div>
        )}
      </div>

      {/* Preview Before Commit Dialog/Modal (Requirement 5) */}
      {showPreviewModal && pendingPreview && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#0f1422] border border-slate-800 rounded-lg max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-base font-bold text-slate-100 mb-2 tracking-wide font-sans">
              Import Preview Summary
            </h2>
            <p className="text-xs text-indigo-400 font-mono mb-4 truncate" title={pendingFilename}>
              File: {pendingFilename}
            </p>

            <div className="space-y-3 mb-6 font-mono text-xs border-y border-slate-800 py-4">
              <div className="flex justify-between">
                <span className="text-slate-400">New Events to be added:</span>
                <span className="text-emerald-400 font-bold">{pendingPreview.summary.addedEvents}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">New Nodes to be added:</span>
                <span className="text-emerald-400 font-bold">{pendingPreview.summary.addedNodes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">New Connections to be added:</span>
                <span className="text-emerald-400 font-bold">{pendingPreview.summary.addedConnections}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Identical rows to be skipped:</span>
                <span className="text-slate-500">{pendingPreview.summary.skipped}</span>
              </div>
              <div className="flex justify-between border-t border-slate-900 pt-2 mt-2">
                <span className="text-slate-400 font-bold text-red-400">Conflicts flagged (stale records):</span>
                <span className="text-red-400 font-bold">{pendingPreview.summary.conflicts}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 italic mb-6">
              * Conflicts will not overwrite database tables automatically. They will be loaded into the workspace highlighted in red, where you can inspect differences and choose to overwrite or dismiss them manually.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelImport}
                className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold rounded cursor-pointer transition-colors"
              >
                Cancel & Discard
              </button>
              <button
                onClick={handleConfirmImport}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded cursor-pointer transition-colors shadow-lg shadow-emerald-950/20"
              >
                Confirm Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
