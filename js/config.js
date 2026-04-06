// ═══════════════════════════════════════════════════════════════
//  config.js
//  Set your Apps Script deployment URL here.
//  Add this file to .gitignore so the URL isn't public.
//  On Netlify, inject this via an Environment Variable instead:
//    SCRIPT_URL = https://script.google.com/macros/s/ABC.../exec
//  and use a Netlify build plugin or edge function to inject it,
//  OR simply set it here if your repo is private.
// ═══════════════════════════════════════════════════════════════

window.SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxoE_N0kDDIPmScmttFSZnn7qw9__xF4Padlr5dgrOsPTefMAo_GK__kCphzmJuHQ93/exec';

// ── Division Objectives Apps Script URL ───────────────────────
// Set this to your Division Objectives deployment URL.
// The script must expose a doGet handler that accepts ?action=api
window.OBJECTIVES_URL = 'https://script.google.com/macros/s/AKfycbxOLOBFXb7vk46LuwF0FF_eZoIzf0bs4cX4TEa5BgN19jgFJmHeBEdZgtd8M_Oq26zSmw/exec';