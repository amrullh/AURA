// fe-check.js — checks FE contract against running BE (per role).
// Usage:
//   node fe-check.js <token>
//   node fe-check.js <token> /api/invoices?queue=mine           (list)
//   node fe-check.js <token> /api/invoices/:id                  (detail)
//   node fe-check.js <token> /api/invoices/:id/decision         (decision)
//   node fe-check.js <token> /api/invoices/:id/file             (blob)
//   node fe-check.js <token> /api/batches                       (list)
//   node fe-check.js <token> /api/demo/sample-batch             (create)

var http = require('node:http');

var token = process.argv[2];
if (!token) {
  console.log('Usage: node fe-check.js <token> [url]');
  process.exit(1);
}
var target = process.argv[3] || '/api/dashboard/summary';
var method = process.argv[4] || 'GET';
var body = process.argv[5] ? JSON.parse(process.argv[5]) : null;

var options = {
  hostname: 'localhost',
  port: 3000,
  path: target,
  method: method,
  headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
};
if (body) {
  options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
}

var req = http.request(options, function (res) {
  var data = '';
  res.on('data', function (c) { data += c; });
  res.on('end', function () {
    var parsed;
    try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
    console.log('=== ' + method + ' ' + target);
    console.log('STATUS', res.statusCode);
    var hd = [];
    if (res.headers) {
      Object.keys(res.headers).forEach(function (k) { hd.push(k + ':' + res.headers[k]); });
    }
    console.log('HEADERS', JSON.stringify(hd));
    console.log('BODY', JSON.stringify(parsed));
  });
});
req.on('error', function (e) { console.log('ERR', e.message); });
req.setTimeout(15000, function () { console.log('TIMEOUT'); req.destroy(); });
if (body) req.write(JSON.stringify(body));
req.end();
