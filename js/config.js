// ═══════════════════════════════════════════════════════════════
//  config.js
//
//  SCRIPT_URL and OBJECTIVES_URL have been moved to server-side
//  Netlify environment variables. They are no longer exposed to
//  the client. All Apps Script calls are now proxied through
//  auth-gated Netlify functions:
//
//    GET  /api/mainframe/data      — main spreadsheet data
//    GET  /api/mainframe/query     — read-only queries
//    POST /api/mainframe/submit    — mutations (form submissions)
//    GET  /api/objectives/data     — division objectives
// ═══════════════════════════════════════════════════════════════
