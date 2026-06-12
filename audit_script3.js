const xlsx = require('xlsx');
const fs = require('fs');

const filePath = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\scratch\\geopnodes\\7June GeoP Master Ledger Backup1.xlsx";

try {
  const workbook = xlsx.readFile(filePath);
  
  const eventsSheet = workbook.Sheets['Events'];
  const nodesSheet = workbook.Sheets['Nodes'];
  const connectionsSheet = workbook.Sheets['Connections'];
  
  const events = eventsSheet ? xlsx.utils.sheet_to_json(eventsSheet) : [];
  const nodes = nodesSheet ? xlsx.utils.sheet_to_json(nodesSheet) : [];
  const connections = connectionsSheet ? xlsx.utils.sheet_to_json(connectionsSheet) : [];

  const eventIds = new Set(events.map(e => String(e['Event ID']).trim()));
  const nodeIds = new Set(nodes.map(n => String(n['Node ID']).trim()));
  
  let missingEvents = 0;
  let missingNodes = 0;
  let brokenConnections = 0;
  let orphanNodes = 0;
  let orphanConnections = 0;
  
  const inconsistencies = [];

  // Check Nodes
  nodes.forEach((n, i) => {
    const parentEventsStr = String(n['Parent Event(s)'] || '').trim();
    if (!parentEventsStr || parentEventsStr === 'undefined') {
      orphanNodes++;
      inconsistencies.push(`Node **${n['Node ID']}** (Row ${i+2}) is missing a Parent Event ID.`);
    } else {
      // Split by comma in case there are multiple
      const parentEvents = parentEventsStr.split(',').map(e => e.trim()).filter(e => e);
      parentEvents.forEach(eventId => {
        if (!eventIds.has(eventId)) {
          missingEvents++;
          inconsistencies.push(`Node **${n['Node ID']}** (Row ${i+2}) references missing Event ID: \`${eventId}\``);
        }
      });
    }
  });

  // Check Connections
  connections.forEach((c, i) => {
    const sourceNode = String(c['Node A'] || '').trim();
    const targetNode = String(c['Node B'] || '').trim();
    
    if (!sourceNode || !targetNode || sourceNode === 'undefined' || targetNode === 'undefined') {
      orphanConnections++;
      inconsistencies.push(`Connection **${c['Connection ID'] || 'Unknown'}** (Row ${i+2}) is missing Node A or Node B.`);
    } else {
      if (!nodeIds.has(sourceNode)) {
        missingNodes++;
        brokenConnections++;
        inconsistencies.push(`Connection **${c['Connection ID'] || 'Unknown'}** (Row ${i+2}) references missing Node A: \`${sourceNode}\``);
      }
      if (!nodeIds.has(targetNode)) {
        missingNodes++;
        brokenConnections++;
        inconsistencies.push(`Connection **${c['Connection ID'] || 'Unknown'}** (Row ${i+2}) references missing Node B: \`${targetNode}\``);
      }
    }
  });

  let report = `# Repository Audit Report\n\n`;
  report += `## Summary Statistics\n`;
  report += `- **Total Events**: ${events.length}\n`;
  report += `- **Total Nodes**: ${nodes.length}\n`;
  report += `- **Total Connections**: ${connections.length}\n\n`;
  
  report += `## Discrepancies\n`;
  report += `- **Missing Events**: ${missingEvents}\n`;
  report += `- **Missing Nodes**: ${missingNodes}\n`;
  report += `- **Broken Connections**: ${brokenConnections}\n`;
  report += `- **Orphan Nodes**: ${orphanNodes}\n`;
  report += `- **Orphan Connections**: ${orphanConnections}\n\n`;
  
  if (inconsistencies.length > 0) {
    report += `## Inconsistencies / Flagged Issues\n`;
    report += `> [!WARNING]\n> The upload failed integrity checks. Please review the following inconsistencies.\n\n`;
    inconsistencies.forEach(inc => {
      report += `- ${inc}\n`;
    });
  } else {
    report += `> [!NOTE]\n> No referential integrity issues found! The repository is in a valid state.\n`;
  }

  const outputFilePath = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\a0abefa1-68c5-469b-90b6-e05a714f59f2\\repository_audit_report.md";
  fs.writeFileSync(outputFilePath, report);
  console.log("Report generated at " + outputFilePath);

} catch (error) {
  console.error("Error reading file:", error.message);
}
