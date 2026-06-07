PRODUCT REQUIREMENT DOCUMENT

Geopolitical Knowledge Graph Platform



Version: 1.0 — Final & Locked

Date: June 2026

Author: Harshvardhan Gaikwad

Status: Ready for AI-Assisted Development



This document is the single authoritative reference for building the Geopolitical Knowledge Graph Platform. All product decisions, data structures, technical choices, and implementation milestones contained herein are final. AI coding agents must not deviate from or extend the scope defined in this document.



1. Product Overview

The Geopolitical Knowledge Graph Platform is a curator-driven, self-hosted web application that visualizes real-world geopolitical events as an interactive knowledge graph. It renders the same manually curated dataset through two distinct visual lenses:

Map View — a geographic Leaflet.js canvas showing capital-to-capital connection lines between actor nations

Node View — an abstract D3.js force-directed physics network showing node circles grouped by country cluster



The platform has no AI-generated content, no public user accounts, and no social features. All data is entered exclusively by a single curator/administrator. Public users are strictly view-only.



1.1 Core Principles

Curator-first:  Every node, event, connection, tag, and remark is manually created and controlled by the admin. The system has zero generative or inferential capabilities.

Event-centric navigation:  All public interactions begin with selecting a Macro Event. There is no country-first, tag-first, or actor-first navigation path.

Two lenses, one dataset:  Map View and Node View render the same underlying data. Switching between them preserves the active event and timeline context.

Clarity over density:  Edge consolidation and uniform node sizing prevent visual clutter. One line per country pair. Thickness encodes relationship density.

View-only public access:  No public user can create, edit, delete, or annotate any data. Read is the only permitted public operation.





2. Explicit Out of Scope

The following items are explicitly excluded from this product. They must not be implemented, referenced, or stubbed:

Public user accounts or any form of public authentication

Light mode or any theme-switching mechanism

Directional arrows on any connection line in Map View or Node View

AI-generated nodes, events, connections, tags, summaries, or geopolitical interpretations

Social sharing, comments, likes, reactions, or any user-generated content

Notifications or alert systems of any kind

Recommendation engines or content suggestion systems

Analytics dashboards or public usage tracking

Complex manual web-form entry for large-scale node creation

Multi-admin access, role-based permissions, or team collaboration features

Mobile-responsive layouts (undefined for MVP — desktop only)

Light/dark mode toggle

OAuth, GitHub login, or any third-party authentication provider





3. Data Model

3.1 Source of Truth

The Excel Master Ledger workbook is the definitive ground truth for all platform data. It contains 4 sheets that map directly and completely to 4 PostgreSQL tables. The Cluster column previously present in the Nodes sheet has been permanently removed and does not exist anywhere in the product — not in the database, not in the UI, not in the upload parser.



3.2 PostgreSQL Schema — 4 Tables (Strictly Locked)

The database contains exactly 4 tables. No additional tables may be created.



-- TABLE 1: MACRO EVENTS

CREATE TABLE events (

  event_id    VARCHAR(50) PRIMARY KEY,   -- Format: 'EVENT 01', 'EVENT 02'

  title       VARCHAR(255) NOT NULL,

  start_date  DATE NOT NULL,

  actors      TEXT[],   -- Curator reference only; app ignores this column

  tags        TEXT[]    -- Parsed from comma-separated string

);



-- TABLE 2: GEOPOLITICAL NODES

CREATE TABLE nodes (

  node_id        INT PRIMARY KEY,         -- Format: 001, 002, 003

  title          VARCHAR(255) NOT NULL,

  date           DATE NOT NULL,

  actors         TEXT[] NOT NULL,          -- Parsed from comma-separated string

  parent_country VARCHAR(100),             -- NULL = non-state actor node

  tags           TEXT[],

  remarks        TEXT

);



-- TABLE 3: EVENT-NODE MAPPING (Many-to-Many bridge)

CREATE TABLE event_node_mapping (

  event_id  VARCHAR(50) REFERENCES events(event_id) ON DELETE CASCADE,

  node_id   INT REFERENCES nodes(node_id) ON DELETE CASCADE,

  PRIMARY KEY (event_id, node_id)

);



-- TABLE 4: NODE-TO-NODE CONNECTIONS

CREATE TABLE node_connections (

  connection_id  VARCHAR(50) PRIMARY KEY,  -- Format: 'C001', 'C002'

  node_a         INT REFERENCES nodes(node_id) ON DELETE CASCADE,

  node_b         INT REFERENCES nodes(node_id) ON DELETE CASCADE

);



3.3 Excel-to-Database Column Mapping

Events Sheet → events table


|  | 
| --- | --- |

| Excel Column | DB Column | Type | Notes |

| Event ID | event_id | VARCHAR(50) PK | Primary key |

| Title | title | VARCHAR(255) |  |

| Date | start_date | DATE |  |

| Actors | actors | TEXT[] | Parsed from comma-separated; app ignores this — actors derived at node level |

| Tags | tags | TEXT[] | Parsed from comma-separated string |






Nodes Sheet → nodes table + event_node_mapping table


|  | 
| --- | --- |

| Excel Column | DB Column | Notes |

| Node ID | node_id | Primary key |

| Title | title |  |

| Date | date |  |

| Actors | actors | TEXT[]; parsed from comma-separated |

| Parent Country | parent_country | NULL = non-state actor node |

| Parent Event(s) | event_node_mapping | Format 'E01, E02' → split → inserted as separate rows in event_node_mapping table |

| Tags | tags | TEXT[]; parsed from comma-separated |

| Remarks | remarks |  |

| Connected Nodes | — (ignored) | IGNORED on upload. Curator reference only. Connections sheet is sole source of truth. |






Connections Sheet → node_connections table


|  | 
| --- | --- |

| Excel Column | DB Column | Notes |

| Connection ID | connection_id | Primary key |

| Node A | node_a | Foreign key → nodes.node_id |

| Node B | node_b | Foreign key → nodes.node_id |

| Node A Title (Short) | — (ignored) | IGNORED on upload. Human readability only. |

| Node B Title (Short) | — (ignored) | IGNORED on upload. Human readability only. |






NOTE: The Summary sheet in the Excel workbook is entirely ignored by the upload parser.





4. Public Side

4.1 Landing Screen

Full-screen dark world map (Leaflet.js, muted slate tile layer, no country illumination on load)

Left sidebar: scrollable list of all Macro Events ordered chronologically

Top-left: global search bar

Top-right: circular admin icon (links to /admin)

No event is pre-selected on load

Map does not permit public panning or zooming in MVP

Countries are never clickable at any point in the product



4.2 Event Selected — Map View

Triggered by: user clicks a Macro Event from the left sidebar.

Selected event is highlighted in the sidebar

All countries that appear as actors in the event's associated nodes are illuminated on the map

Non-participating countries remain dark and unilluminated

Capital-to-capital connection lines render between all actor country pairs

Timeline bar appears at the bottom of the viewport

Map View / Node View toggle appears in the top navigation bar



Edge Rendering Rules

One line per pair:  Exactly one visible line between any two entities on the canvas, regardless of shared node count.

Thickness encodes density:  Edge pixel weight scales proportionally with the count of nodes shared between that entity pair within the active timeline window.

Non-directional:  No arrows. Lines have no direction markers of any kind.

Capital anchoring:  Lines connect strictly from capital coordinate to capital coordinate using a fixed internal lookup table. No external geolocation API.

Multi-actor radiation:  If a node has one primary driver and multiple secondary actors (e.g., USA → France and USA → Germany), two separate lines radiate from the driver's capital — one to each secondary actor. Secondary actors are not connected to each other unless a separate explicit node defines that relationship.



Non-State Actor Rendering in Map View

Nodes with NULL parent_country have no geographic coordinate and cannot be placed on the map canvas

Non-state actor nodes are rendered as white circles inside a dedicated cluster panel pinned to the right edge of the viewport, overlaying the map

Connection lines between a country actor and a non-state actor run from the country's capital coordinate on the map to the non-state actor's position in the right panel

These lines may visually cross other countries on the map canvas — this is acceptable and by design

Line behavior (thickness, hover, click modal) is identical to country-to-country lines



4.3 Map View — Line Hover State

Hovering over a connection line zooms the map viewport into the geographic region between the two connected entities

A scrollable card-list panel appears alongside the connection showing all constituent nodes

Each card displays: 'Node [ID] — [Title]'

Panel is vertically scrollable when node count is high

All map animations pause during hover state

Clicking a node card opens the Node Detail Modal



Interaction flow:

[Hover over connection line]

  → Viewport zooms to connection region

  → Scrollable node card list panel appears



[Click a node card in the panel]

  → Node Detail Modal opens (50% viewport overlay)



4.4 Node Detail Modal — Map View and Node View (Identical Component)

The same modal component is used in both Map View and Node View. Behavior and layout are identical.

Centered overlay covering approximately 50% of the viewport

Displays all node fields: Node ID, Title, Date, Actors, Parent Country, Parent Event(s), Tags, Remarks, Connected Nodes (list of IDs and titles)

Closes via explicit close button or clicking outside the modal area

Does not navigate to a new page



4.5 Node View Screen

Triggered by: user clicks the Map/Node toggle (only active when a Macro Event is selected).

Full-screen 2D canvas driven by D3.js force-directed physics simulation

All map geography is removed — abstract layout only

Auto-zoom-to-fit triggers on mount: all nodes of the active event are simultaneously visible without manual adjustment

Node View canvas supports user panning and zooming after initial auto-fit



Node Circle Rendering

All circles are uniform in shape and equal in size to each other

Shared circle size scales down uniformly as the total node count increases — all circles remain equal to one another

Each circle is labeled with the explicit actors involved in that node

Hover states are completely disabled — click is the only interaction

Clicking any node circle opens the Node Detail Modal



Country Cluster Rendering

Nodes sharing the same parent_country value are visually grouped into a cluster

Each country cluster has a distinct consistent color (exact palette to be proposed by developer and approved by curator)

Cluster positions are not fixed — the physics simulation determines placement based on available space and connection density



Non-State Actor Cluster in Node View

Nodes with NULL parent_country render as white circles

Grouped into a dedicated cluster pinned to the right-hand perimeter of the canvas

Connection lines to/from non-state actors are rendered identically to country-to-country connections



Connection Rendering in Node View

Same single-line-per-pair rule as Map View

Same proportional edge thickness rule as Map View

Non-directional — no arrows



4.6 Timeline Bar

Permanently mounted at the bottom of the viewport in both Map View and Node View

Only visible when a Macro Event is active

Calculates Δt = (latest node date in event) − (earliest node date in event)

Divides Δt into exactly 4 equal sequential quarter blocks: Q1, Q2, Q3, Q4

All Time button sits on the left side of the timeline bar

The active selection (quarter or All Time) is visually illuminated/highlighted

Selecting a quarter: both Map View and Node View filter to show only nodes whose dates fall within that block

All Time mode: all nodes across all quarters are rendered simultaneously



4.7 Search Experience

Google-style search bar, permanently visible at the top-left of the screen

Typing triggers a live dropdown results panel

Results split into two tiers: top tier = matching Macro Events, bottom tier = matching individual Node Titles

Clicking a Macro Event result: loads that event into the workspace (identical to sidebar click)

Clicking a Node result: auto-loads its parent event context and opens the Node Detail Modal for that node





5. Admin Side

All admin functionality is located at the /admin route. This route is inaccessible to public users.



5.1 Admin Authentication

Single password prompt displayed at /admin

Password is stored as a Vercel Environment Variable named ADMIN_PASSWORD

On correct entry: a secure browser session token is created and the admin is granted access

On incorrect entry: an error message is displayed; no lockout mechanism is required for MVP

Session persists until the browser is closed or the admin explicitly signs out

LOCKED: No OAuth. No GitHub login. No multi-factor authentication. No third-party auth provider of any kind.



5.2 Admin Landing Screen — Data Grid

Displays all existing nodes in a spreadsheet-style interface (AG Grid or TanStack Table)

Column structure mirrors the Excel Nodes sheet exactly, excluding the removed Cluster column and the read-only Connected Nodes column

Events and Connections are accessible in separate tabs or sections within the same admin screen

All columns are visible by default with no pagination in MVP



Inline Editing

Admin clicks any cell to enter edit mode directly in the grid — identical to editing a cell in Excel

Changes are persisted to the database on cell exit (blur) or explicit save action

No separate form or modal opens for editing — all edits happen in-grid



Adding a Single Node

A new empty row can be added at the bottom of the grid

Admin fills in cells inline — equivalent to adding a new row in Excel

Row is inserted into the database on save



5.3 Excel Upload Workflow

Location: Upload button/drop zone at the bottom of the admin screen.

Mechanism: Admin clicks to browse or drag-and-drops the Excel file directly onto the zone.



Parser Behavior

SheetJS reads all sheets in the uploaded workbook upon drop

Sheets processed: Events, Nodes, Connections

Sheets ignored: Summary

Columns ignored during upload: Connected Nodes (Nodes sheet), Node A Title Short (Connections sheet), Node B Title Short (Connections sheet), Actors (Events sheet)

Parent Event(s) column: parser splits comma-separated shorthand values (e.g., 'E01, E02') and generates corresponding rows in the event_node_mapping table

Comma-separated text fields (Actors, Tags) are parsed into PostgreSQL TEXT[] arrays



Upload Logic — Three Cases

Case 1 — New record:  ID does not exist in the database → inserted immediately with no prompt.

Case 2 — Identical record:  ID exists and all field values are identical → silently skipped. No action taken.

Case 3 — Conflict:  ID exists but one or more field values differ → conflict workflow triggered (see 5.4).



5.4 Upload Conflict Resolution Workflow

LOCKED DECISION: Conflicts are never auto-resolved. The system never overwrites without explicit admin action.



When an uploaded row matches an existing database record by ID but contains different field values:

Step 1: The system does NOT overwrite the existing database record

Step 2: The system does NOT silently ignore the conflict

Step 3: The conflicting row is highlighted in red inside the Admin data grid

Step 4: An import summary panel displays the total count of new records added and total conflicts flagged

Step 5: Admin manually reviews each red-highlighted row in the grid

Step 6: Admin resolves the conflict by editing the relevant cell(s) directly in the grid — choosing to keep the existing value or type the new value

Step 7: Once the admin edits and saves the conflicting row, the red highlight clears and the row returns to normal state



5.5 Cache Invalidation

After any write operation (upload, inline edit, new row addition), Next.js server caches are invalidated immediately

Public map and node views reflect updates upon next page load without requiring a server restart





6. System Behaviour Rules — Locked

These decisions are final. AI coding agents must not override, extend, or reinterpret these rules during implementation.




|  | 
| --- | --- |

| # | Rule | Detail |

| 01 | Single line per entity pair | Only one visible line between any two entities on the canvas. Thickness encodes shared node count. |

| 02 | No directional arrows | All connection lines are non-directional. No arrowheads under any condition. |

| 03 | Event-first navigation | No geographic or tag-based entry point exists. Users always select a Macro Event first. |

| 04 | Map panning disabled (MVP) | The Leaflet.js canvas is static for public users. No pan, no zoom. |

| 05 | Node View panning enabled | The D3.js canvas supports panning and zooming after auto-fit on load. |

| 06 | Hover disabled in Node View | No hover states on node circles. Click is the only interaction. |

| 07 | Identical modals | The Node Detail Modal is the same component rendered identically in both Map View and Node View. |

| 08 | Uniform node circles | All node circles in Node View are equal in size. Size shrinks uniformly as total node count grows. |

| 09 | Non-state actor lines cross map | Lines from country capitals to the right-side non-state panel may cross other countries. Accepted. |

| 10 | White = non-state actors | All non-state actor node circles are white in both Map View and Node View. |

| 11 | Conflicts never auto-resolved | Upload conflicts are flagged red. Admin always decides manually. System never overwrites silently. |

| 12 | No Cluster column | The Cluster field is permanently removed from the data model, database, UI, and upload parser. |

| 13 | Connected Nodes column ignored | The Connections sheet is the sole source of connection truth. Connected Nodes in Nodes sheet is ignored on upload. |

| 14 | Single administrator | Exactly one admin user. No role hierarchy. No multi-user access. |

| 15 | Permanent dark mode | No light mode. No theme toggle. Dark mode is fixed and unconditional. |

| 16 | Countries non-clickable | Country shapes on the map are never interactive. No hover, no click, no tooltip on countries. |

| 17 | No global mega-web | There is no view that renders all nodes without an active event selected. Event selection is mandatory. |

| 18 | Curator-only data entry | No AI, no public user, no automated system adds, edits, or deletes nodes, events, or connections. |








7. Technical Design

7.1 Tech Stack — Locked


|  | 
| --- | --- |

| Layer | Technology | Notes |

| Framework | Next.js (App Router) | Frontend UI and backend API routes in a single codebase and single Vercel deployment |

| Hosting | Vercel | Directly integrated with GitHub repository |

| Database | PostgreSQL | Exactly 4 tables — strictly locked |

| Map Engine | Leaflet.js | Dark slate tile layer; no illuminated base map |

| Node Graph Engine | D3.js | Force-directed 2D physics simulation |

| Styling | Tailwind CSS | Permanent dark mode; no light mode; no theme toggle |

| Admin Data Grid | AG Grid or TanStack Table | Final choice at developer discretion; AG Grid preferred for cell styling API |

| Excel Processing | SheetJS (xlsx) | Parses uploaded Excel workbook into structured data for DB insertion |

| Authentication | Vercel Environment Variable | ADMIN_PASSWORD env var; simple session token; zero OAuth complexity |






7.2 Architecture Notes

No separate backend server. Next.js API routes handle all database reads and writes.

Country capital coordinates are stored as a static internal JavaScript object within the codebase. No external geolocation API is called at runtime.

Non-state actor panel is a fixed UI overlay component — not a Leaflet layer. It sits on top of the map canvas.

All database operations use parameterized queries to prevent SQL injection.

Next.js server cache is invalidated on every admin write operation to keep public views current.



7.3 Performance Targets


|  | 
| --- | --- |

| Metric | Target | Notes |

| MVP node capacity | 500 nodes | Rendered client-side without server-side pagination |

| MVP connection capacity | 1,000 edges | Rendered client-side without server-side pagination |

| Filter / timeline action | < 150ms | View must update within 150 milliseconds |

| View toggle (Map ↔ Node) | < 150ms | Canvas swap must feel native |

| Post-MVP scaling | 500+ nodes | Transition to server-side paginated queries when node count exceeds MVP threshold |








8. Implementation Milestones

Milestones are designed for sequential execution by an AI coding agent. Each milestone must be fully complete and verified before the next begins.



Milestone 1 — Foundation & Admin

Deliverables:

Initialize Next.js project with Tailwind CSS configured in permanent dark mode

Configure PostgreSQL connection via Prisma or raw pg pool

Create all 4 database tables with exact schema from Section 3.2

Build /admin route with ADMIN_PASSWORD session authentication

Build AG Grid or TanStack Table admin data grid displaying all nodes

Implement SheetJS Excel upload pipeline: parse all 3 sheets, ignore specified columns, insert new records, flag conflicts in red

Implement inline cell editing in the admin grid

Implement single-row manual node addition

Implement upload conflict resolution workflow (red highlight, admin edit to resolve, clear on save)

Implement Next.js cache invalidation on every write operation



Milestone 2 — Map View

Deliverables:

Integrate Leaflet.js with a dark slate tile layer (e.g., CartoDB Dark Matter)

Build and integrate static capital coordinate lookup object

Build left sidebar with chronological Macro Event list

Implement event selection state machine: illuminate participating countries, suppress non-participants

Render capital-to-capital connection lines for all actor pairs in the active event

Implement edge consolidation rule: one line per country pair, thickness proportional to shared node count within active timeline

Implement line hover state: viewport zoom to connection region, scrollable node card panel

Implement Node Detail Modal: 50% overlay, all node fields, close behavior

Build top-left global search bar with two-tier live dropdown (events tier above, nodes tier below)

Build Map View / Node View toggle button in top navigation

Build non-state actor right-side panel overlay with white node circles and connecting lines to map



Milestone 3 — Node View

Deliverables:

Build D3.js force-directed canvas component

Implement auto-zoom-to-fit on event load

Render uniform-size node circles with proportional size scaling as node count changes

Implement country-based color clustering (distinct color per parent_country value)

Render non-state actor cluster as white circles pinned to right-hand perimeter

Render connection lines between nodes with same edge thickness rules as Map View

Disable all hover states on node circles

Wire click-to-modal behavior using the same Node Detail Modal component from Milestone 2

Implement Map/Node toggle to switch canvas while preserving active event context



Milestone 4 — Timeline, Auth Hardening & Deployment

Deliverables:

Build timeline bar component at viewport bottom

Implement Δt calculation: (latest node date) − (earliest node date) for the active event

Divide Δt into exactly 4 equal quarter blocks with Q1, Q2, Q3, Q4 labels

Build All Time button on the left side of the timeline bar

Implement active selection visual highlighting on the timeline

Wire quarter filter to Map View: show only nodes within the active quarter's date range

Wire quarter filter to Node View: show only nodes and connections within the active quarter's date range

Implement All Time mode: render all nodes across all quarters simultaneously

Final ADMIN_PASSWORD authentication hardening and session management

Configure all Vercel Environment Variables

Deploy to production on Vercel

Validate cache invalidation across all write operations in production





9. Open Decisions

These items were not explicitly resolved during product discussions. They must be decided before or during development — not assumed by the developer or AI agent.




|  | 
| --- | --- |

| # | Open Decision | Context |

| 01 | AG Grid vs TanStack Table | Both are valid choices. AG Grid has a superior built-in cell styling API which may simplify conflict-row red highlighting. Final choice at developer discretion. |

| 02 | Node color palette for country clusters | The specific color assigned to each country cluster in Node View was not defined. Developer to propose a palette; curator approves before deployment. |

| 03 | Map tile provider URL | A specific dark slate tile provider (e.g., CartoDB Dark Matter, Stamen Toner) was not locked. Developer to select and confirm with curator. |

| 04 | Admin password reset workflow | No recovery mechanism was defined if the curator forgets ADMIN_PASSWORD. Updating the Vercel environment variable is the technical fallback but this should be documented clearly for the curator. |

| 05 | Session expiry duration | Duration of the admin session token after login was not defined. Recommend 24 hours but curator to confirm. |

| 06 | Country color assignment logic | Whether country colors are hard-coded per country name or assigned dynamically from a palette on first render was not decided. |




