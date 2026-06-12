const xlsx = require('xlsx');

const filePath = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\scratch\\geopnodes\\7June GeoP Master Ledger Backup1.xlsx";

try {
  const workbook = xlsx.readFile(filePath);
  
  const eventsSheet = workbook.Sheets['Events'];
  const nodesSheet = workbook.Sheets['Nodes'];
  const connectionsSheet = workbook.Sheets['Connections'];
  
  const events = eventsSheet ? xlsx.utils.sheet_to_json(eventsSheet) : [];
  const nodes = nodesSheet ? xlsx.utils.sheet_to_json(nodesSheet) : [];
  const connections = connectionsSheet ? xlsx.utils.sheet_to_json(connectionsSheet) : [];

  let missingEvents = 0;
  let missingNodes = 0;
  let brokenConnections = 0;
  let duplicateEntries = 0;
  let orphanNodes = 0;
  let orphanConnections = 0;
  
  const eventIds = new Set(events.map(e => e.EventID || e.ID || e['Event ID']));
  const nodeIds = new Set(nodes.map(n => n.NodeID || n.ID || n['Node ID']));
  
  const inconsistencies = [];

  // Check Nodes
  nodes.forEach((n, i) => {
    const eventId = n.EventID || n['Event ID'];
    if (!eventId) {
      orphanNodes++;
      inconsistencies.push(`Node at row ${i+2} (${n.NodeID || n.Name || 'Unknown'}) is missing an Event ID.`);
    } else if (!eventIds.has(eventId)) {
      missingEvents++;
      inconsistencies.push(`Node at row ${i+2} references missing Event ID: ${eventId}`);
    }
  });

  // Check Connections
  connections.forEach((c, i) => {
    const sourceNode = c.SourceNodeID || c['Source Node ID'] || c.Source;
    const targetNode = c.TargetNodeID || c['Target Node ID'] || c.Target;
    
    if (!sourceNode || !targetNode) {
      orphanConnections++;
      inconsistencies.push(`Connection at row ${i+2} is missing source or target node.`);
    } else {
      if (!nodeIds.has(sourceNode)) {
        missingNodes++;
        brokenConnections++;
        inconsistencies.push(`Connection at row ${i+2} references missing Source Node: ${sourceNode}`);
      }
      if (!nodeIds.has(targetNode)) {
        missingNodes++;
        brokenConnections++;
        inconsistencies.push(`Connection at row ${i+2} references missing Target Node: ${targetNode}`);
      }
    }
  });

  console.log("=== Repository Audit Report ===");
  console.log(`Total Events: ${events.length}`);
  console.log(`Total Nodes: ${nodes.length}`);
  console.log(`Total Connections: ${connections.length}`);
  console.log(`Missing Events: ${missingEvents}`);
  console.log(`Missing Nodes: ${missingNodes}`);
  console.log(`Broken Connections: ${brokenConnections}`);
  console.log(`Duplicate Entries: ${duplicateEntries} (To be implemented fully based on keys)`);
  console.log(`Orphan Nodes: ${orphanNodes}`);
  console.log(`Orphan Connections: ${orphanConnections}`);
  
  if (inconsistencies.length > 0) {
    console.log("\n=== Inconsistencies / Flagged Issues ===");
    inconsistencies.slice(0, 50).forEach(inc => console.log("- " + inc));
    if (inconsistencies.length > 50) {
      console.log(`... and ${inconsistencies.length - 50} more issues.`);
    }
  } else {
    console.log("\nNo referential integrity issues found!");
  }

} catch (error) {
  console.error("Error reading file:", error.message);
}
