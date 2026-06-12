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

  console.log("Events columns:", events.length > 0 ? Object.keys(events[0]) : "No events");
  console.log("Nodes columns:", nodes.length > 0 ? Object.keys(nodes[0]) : "No nodes");
  console.log("Connections columns:", connections.length > 0 ? Object.keys(connections[0]) : "No connections");

} catch (error) {
  console.error("Error reading file:", error.message);
}
