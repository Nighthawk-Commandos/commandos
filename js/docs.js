// ═══════════════════════════════════════════════════════════════
//  docs.js — Document Hub section
//  Lists accessible documents and renders their content.
//  Auth-gated (must be a division member or in a permitted group);
//  public documents are visible to all authenticated users.
// ═══════════════════════════════════════════════════════════════

import { esc } from './utils.js';

var _currentDoc = null;

export function renderDocsSection() {
    _currentDoc = null;
    var hs = document.getElementById('home-screen');
    if (!hs) return;
    hs.className = 'obj-mode';
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<aside class="obj-sidebar" data-accent="blue" id="docs-sidebar">' +
        '  <div class="obj-sidebar-logo">' +
        '    <div class="obj-sidebar-label">Nighthawk Commandos</div>' +
        '    <div class="obj-sidebar-title">Document<br>Hub</div>' +
        '  </div>' +
        '  <nav class="es-sidebar-nav" id="docs-nav"><div class="obj-loading" style="padding:16px">Loading…</div></nav>' +
        '  <div class="obj-sidebar-back">' +
        '    <button class="obj-hub-btn" data-click="showHomeScreen">← Back to Hub</button>' +
        (window._sysVersion ? '<div class="sidebar-version">' + window._sysVersion + '</div>' : '') +
        '  </div>' +
        '</aside>' +
        '<main class="obj-main" id="docs-main">' +
        '  <div class="obj-loading">Loading documents…</div>' +
        '</main>';

    _loadList();
}

function _loadList() {
    fetch('/api/docs/list')
        .then(function (r) { return r.json(); })
        .then(function (docs) {
            var nav  = document.getElementById('docs-nav');
            var main = document.getElementById('docs-main');
            if (!nav || !main) return;

            if (!Array.isArray(docs) || !docs.length) {
                nav.innerHTML  = '<div class="es-sidebar-nav-label">No documents</div>';
                main.innerHTML = '<div class="obj-empty" style="margin-top:40px">No documents available yet.</div>';
                return;
            }

            nav.innerHTML = '<div class="es-sidebar-nav-label">Documents</div>' +
                docs.map(function (d) {
                    return '<button class="es-nav-btn" data-click="docsOpenDoc" data-id="' + esc(d.id) + '">' + esc(d.title) + '</button>';
                }).join('');

            // Auto-open first doc
            main.innerHTML = '<div class="obj-empty" style="margin-top:40px">Select a document from the sidebar.</div>';
            if (docs.length === 1) _openDoc(docs[0].id);
        })
        .catch(function (err) {
            var main = document.getElementById('docs-main');
            if (main) main.innerHTML = '<div class="obj-error">Failed to load: ' + esc(err.message) + '</div>';
        });
}

function _openDoc(id) {
    var main = document.getElementById('docs-main');
    if (main) main.innerHTML = '<div class="obj-loading">Loading document…</div>';

    // Update active nav state
    document.querySelectorAll('.es-nav-btn[data-id]').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.id === id);
    });

    fetch('/api/docs/view?id=' + encodeURIComponent(id))
        .then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error || r.status); }); })
        .then(function (doc) {
            _currentDoc = doc;
            if (!main) return;
            var updated = doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString('en-GB') : '';
            main.innerHTML =
                '<div class="docs-title-row">' +
                '  <h1 class="docs-title">' + esc(doc.title) + '</h1>' +
                (updated ? '<div class="docs-meta">Last updated ' + esc(updated) + '</div>' : '') +
                '</div>' +
                '<div class="docs-content">' + _renderContent(doc.content || '') + '</div>';
        })
        .catch(function (err) {
            if (main) main.innerHTML = '<div class="obj-error">Could not load document: ' + esc(err.message) + '</div>';
        });
}

function _renderContent(raw) {
    if (!raw) return '';
    // New documents store HTML from the WYSIWYG editor — render directly.
    // Legacy plain-text documents start with a letter/number, not an HTML tag.
    if (/^\s*</.test(raw)) return raw;
    // Legacy plain-text fallback
    var s = esc(raw)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    return '<p>' + s + '</p>';
}


export function docsOpenDoc(el) {
    var id = el && el.dataset ? el.dataset.id : el;
    if (id) _openDoc(id);
}
