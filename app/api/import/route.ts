import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/db';

function parseCommaSeparated(val: any): string[] {
  if (val === null || val === undefined) return [];
  if (Array.isArray(val)) return val;
  return val.toString().split(',').map((item: string) => item.trim()).filter(Boolean);
}

function parseExcelDateStr(val: any): string {
  if (!val) return '';
  let d: Date;
  if (val instanceof Date) {
    d = val;
  } else {
    const str = val.toString().trim();
    const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}`);
    } else {
      const mmyyyy = str.match(/^(\d{1,2})\/(\d{4})$/);
      if (mmyyyy) {
        d = new Date(`${mmyyyy[2]}-${mmyyyy[1].padStart(2,'0')}-01`);
      } else {
        d = new Date(str);
      }
    }
  }
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

function expandEventId(shortId: string): string {
  const match = shortId.trim().match(/^E(\d+)$/i);
  if (match) {
    return `EVENT ${match[1].padStart(2, '0')}`;
  }
  return shortId.trim();
}

function areArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, i) => val === sortedB[i]);
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!verifySession(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });

    // Fetch current DB state for comparison
    const [dbEvents, dbNodes, dbConnections, dbMappings] = await Promise.all([
      prisma.event.findMany(),
      prisma.node.findMany(),
      prisma.nodeConnection.findMany(),
      prisma.eventNodeMapping.findMany(),
    ]);

    const dbEventsMap = new Map(dbEvents.map(e => [e.event_id, e]));
    const dbNodesMap = new Map(dbNodes.map(n => [n.node_id, n]));
    const dbConnectionsMap = new Map(dbConnections.map(c => [c.connection_id, c]));
    
    // Group mapping: node_id -> event_ids[]
    const dbNodeEventsMap = new Map<number, string[]>();
    for (const m of dbMappings) {
      if (!dbNodeEventsMap.has(m.node_id)) {
        dbNodeEventsMap.set(m.node_id, []);
      }
      dbNodeEventsMap.get(m.node_id)!.push(m.event_id);
    }

    const conflicts: any[] = [];
    let addedEventsCount = 0;
    let addedNodesCount = 0;
    let addedConnectionsCount = 0;
    let skippedCount = 0;

    const eventsToInsert: any[] = [];
    const nodesToInsert: any[] = [];
    const nodeMappingsToInsert: { node_id: number; event_id: string }[] = [];
    const connectionsToInsert: any[] = [];

    // --- PROCESS EVENTS SHEET ---
    const eventsSheet = workbook.Sheets['Events'];
    if (eventsSheet) {
      const rows = XLSX.utils.sheet_to_json<any>(eventsSheet, { defval: null });
      for (const row of rows) {
        const event_id = row['Event ID']?.toString().trim();
        const title = row['Title']?.toString().trim();
        const start_date = parseExcelDateStr(row['Date']);
        const tags = parseCommaSeparated(row['Tags']);

        if (!event_id || !title || !start_date) continue;

        const excelEvent = { event_id, title, start_date, tags };
        const dbEvent = dbEventsMap.get(event_id);

        if (!dbEvent) {
          // Case 1: New
          eventsToInsert.push({
            event_id,
            title,
            start_date,
            tags,
          });
          addedEventsCount++;
        } else {
          // Compare fields
          const dbEventFormatted = {
            event_id: dbEvent.event_id,
            title: dbEvent.title,
            start_date: dbEvent.start_date.toISOString().split('T')[0],
            tags: dbEvent.tags,
          };

          const diffs: string[] = [];
          if (excelEvent.title !== dbEventFormatted.title) {
            diffs.push(`Title differs — DB: "${dbEventFormatted.title}" / Excel: "${excelEvent.title}"`);
          }
          if (excelEvent.start_date !== dbEventFormatted.start_date) {
            diffs.push(`Date differs — DB: ${dbEventFormatted.start_date} / Excel: ${excelEvent.start_date}`);
          }
          if (!areArraysEqual(excelEvent.tags, dbEventFormatted.tags)) {
            diffs.push(`Tags differ — DB: [${dbEventFormatted.tags.join(', ')}] / Excel: [${excelEvent.tags.join(', ')}]`);
          }

          if (diffs.length > 0) {
            // Case 3: Conflict
            conflicts.push({
              id: event_id,
              type: 'event',
              description: diffs.join(' | '),
              dbRecord: dbEventFormatted,
              excelRecord: excelEvent,
            });
          } else {
            // Case 2: Identical
            skippedCount++;
          }
        }
      }
    }

    // --- PROCESS NODES SHEET ---
    const nodesSheet = workbook.Sheets['Nodes'];
    if (nodesSheet) {
      const rows = XLSX.utils.sheet_to_json<any>(nodesSheet, { defval: null });
      for (const row of rows) {
        const node_id_val = row['Node ID'];
        if (node_id_val === null || node_id_val === undefined) continue;
        const node_id = parseInt(node_id_val.toString().trim(), 10);
        if (isNaN(node_id)) continue;

        const title = row['Title']?.toString().trim() || '';
        const date = parseExcelDateStr(row['Date']);
        const actors = parseCommaSeparated(row['Actors']);
        const parent_country = row['Parent Country']?.toString().trim() || null;
        const tags = parseCommaSeparated(row['Tags']);
        const remarks = row['Remarks']?.toString().trim() || '';
        const parent_events = parseCommaSeparated(row['Parent Event(s)']).map(expandEventId);

        if (!date) continue;

        const excelNode = {
          node_id,
          title,
          date,
          actors,
          parent_country,
          tags,
          remarks,
          parent_events,
        };

        const dbNode = dbNodesMap.get(node_id);

        if (!dbNode) {
          // Case 1: New
          nodesToInsert.push({
            node_id,
            title,
            date,
            actors,
            parent_country,
            tags,
            remarks,
          });
          for (const eId of parent_events) {
            nodeMappingsToInsert.push({ node_id, event_id: eId });
          }
          addedNodesCount++;
        } else {
          // Compare fields
          const dbNodeEvents = dbNodeEventsMap.get(node_id) || [];
          const dbNodeFormatted = {
            node_id: dbNode.node_id,
            title: dbNode.title,
            date: dbNode.date.toISOString().split('T')[0],
            actors: dbNode.actors,
            parent_country: dbNode.parent_country,
            tags: dbNode.tags,
            remarks: dbNode.remarks || '',
            parent_events: dbNodeEvents,
          };

          const diffs: string[] = [];
          if (excelNode.title !== dbNodeFormatted.title) {
            diffs.push(`Title differs — DB: "${dbNodeFormatted.title}" / Excel: "${excelNode.title}"`);
          }
          if (excelNode.date !== dbNodeFormatted.date) {
            diffs.push(`Date differs — DB: ${dbNodeFormatted.date} / Excel: ${excelNode.date}`);
          }
          if (!areArraysEqual(excelNode.actors, dbNodeFormatted.actors)) {
            diffs.push(`Actors differ — DB: [${dbNodeFormatted.actors.join(', ')}] / Excel: [${excelNode.actors.join(', ')}]`);
          }
          if (excelNode.parent_country !== dbNodeFormatted.parent_country) {
            diffs.push(`Parent Country differs — DB: "${dbNodeFormatted.parent_country || 'NULL'}" / Excel: "${excelNode.parent_country || 'NULL'}"`);
          }
          if (!areArraysEqual(excelNode.tags, dbNodeFormatted.tags)) {
            diffs.push(`Tags differ — DB: [${dbNodeFormatted.tags.join(', ')}] / Excel: [${excelNode.tags.join(', ')}]`);
          }
          if (excelNode.remarks !== dbNodeFormatted.remarks) {
            diffs.push(`Remarks differ — DB: "${dbNodeFormatted.remarks}" / Excel: "${excelNode.remarks}"`);
          }
          if (!areArraysEqual(excelNode.parent_events, dbNodeFormatted.parent_events)) {
            diffs.push(`Parent Events differ — DB: [${dbNodeFormatted.parent_events.join(', ')}] / Excel: [${excelNode.parent_events.join(', ')}]`);
          }

          if (diffs.length > 0) {
            // Case 3: Conflict
            conflicts.push({
              id: node_id,
              type: 'node',
              description: diffs.join(' | '),
              dbRecord: dbNodeFormatted,
              excelRecord: excelNode,
            });
          } else {
            // Case 2: Identical
            skippedCount++;
          }
        }
      }
    }

    // --- PROCESS CONNECTIONS SHEET ---
    const connectionsSheet = workbook.Sheets['Connections'];
    if (connectionsSheet) {
      const rows = XLSX.utils.sheet_to_json<any>(connectionsSheet, { defval: null });
      for (const row of rows) {
        const connection_id = row['Connection ID']?.toString().trim();
        const node_a_val = row['Node A'];
        const node_b_val = row['Node B'];

        if (!connection_id || node_a_val === null || node_b_val === undefined) continue;

        const node_a = parseInt(node_a_val.toString().trim(), 10);
        const node_b = parseInt(node_b_val.toString().trim(), 10);
        if (isNaN(node_a) || isNaN(node_b)) continue;

        const excelConnection = { connection_id, node_a, node_b };
        const dbConn = dbConnectionsMap.get(connection_id);

        if (!dbConn) {
          // Case 1: New
          connectionsToInsert.push({
            connection_id,
            node_a,
            node_b,
          });
          addedConnectionsCount++;
        } else {
          const diffs: string[] = [];
          if (excelConnection.node_a !== dbConn.node_a) {
            diffs.push(`Node A differs — DB: ${dbConn.node_a} / Excel: ${excelConnection.node_a}`);
          }
          if (excelConnection.node_b !== dbConn.node_b) {
            diffs.push(`Node B differs — DB: ${dbConn.node_b} / Excel: ${excelConnection.node_b}`);
          }

          if (diffs.length > 0) {
            conflicts.push({
              id: connection_id,
              type: 'connection',
              description: diffs.join(' | '),
              dbRecord: {
                connection_id: dbConn.connection_id,
                node_a: dbConn.node_a,
                node_b: dbConn.node_b,
              },
              excelRecord: excelConnection,
            });
          } else {
            skippedCount++;
          }
        }
      }
    }

    // DO NOT write to DB. Return the parsed preview instead.
    return NextResponse.json({
      success: true,
      summary: {
        addedEvents: addedEventsCount,
        addedNodes: addedNodesCount,
        addedConnections: addedConnectionsCount,
        skipped: skippedCount,
        conflicts: conflicts.length,
      },
      preview: {
        events: eventsToInsert,
        nodes: nodesToInsert,
        nodeMappings: nodeMappingsToInsert,
        connections: connectionsToInsert
      },
      conflicts,
    });
  } catch (error: any) {
    console.error('Error importing Excel:', error);
    return NextResponse.json({ error: error.message || 'Error processing excel file' }, { status: 500 });
  }
}
