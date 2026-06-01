// ── GET /api/version — returns the current deploy ID for client-side cache busting.
// Netlify sets DEPLOY_ID automatically on every deploy. The client stores this in
// localStorage; when it changes, all cached data is wiped so users never see stale
// data after a deployment without having to manually clear their cache.
'use strict';

exports.handler = async () => ({
    statusCode: 200,
    headers: {
        'Content-Type':          'application/json',
        'Cache-Control':         'no-store',
        'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify({ v: process.env.DEPLOY_ID || '' })
});
