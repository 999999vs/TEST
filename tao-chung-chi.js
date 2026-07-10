/**
 * tao-chung-chi.js — Dựng HTTPS tin cậy cho mạng LAN (kiểu mkcert):
 *   1) CA gốc riêng (self-signed, cA:true) — CÀI MỘT LẦN trên mỗi máy → tin cậy.
 *   2) Chứng chỉ máy chủ (leaf, cA:false) do CA gốc KÝ, có SAN = localhost + IP LAN.
 * Trình duyệt đời mới CHỈ tin khi leaf là cert máy chủ hợp lệ do một CA đáng tin ký —
 * đây là lý do cert "tự ký vừa-là-CA-vừa-là-leaf" trước đây vẫn báo "không bảo mật".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function layIPs() {
  const ips = ['127.0.0.1'];
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal && ips.indexOf(ni.address) < 0) ips.push(ni.address);
    }
  } catch (e) {}
  return ips;
}

function _serial() {
  const b = crypto.randomBytes(16); b[0] = b[0] & 0x7f; // dương
  return b.toString('hex');
}

function _taoCA(forge) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = _serial();
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(cert.validity.notBefore.getTime());
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 10);
  const attrs = [
    { name: 'commonName', value: 'Garage Pro Local CA' },
    { name: 'organizationName', value: 'Garage Pro' },
    { name: 'countryName', value: 'VN' }
  ];
  cert.setSubject(attrs); cert.setIssuer(attrs); // tự ký
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' }
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { keyPem: forge.pki.privateKeyToPem(keys.privateKey), certPem: forge.pki.certificateToPem(cert) };
}

function _taoLeaf(forge, caCertPem, caKeyPem, ips, dnsNames) {
  const caCert = forge.pki.certificateFromPem(caCertPem);
  const caKey = forge.pki.privateKeyFromPem(caKeyPem);
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = _serial();
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(cert.validity.notBefore.getTime());
  cert.validity.notAfter.setDate(cert.validity.notAfter.getDate() + 825); // ~2.25 năm
  cert.setSubject([
    { name: 'commonName', value: dnsNames[0] || 'garage.local' },
    { name: 'organizationName', value: 'Garage Pro' }
  ]);
  cert.setIssuer(caCert.subject.attributes); // do CA ký
  const altNames = dnsNames.map(d => ({ type: 2, value: d }))
    .concat(ips.map(ip => ({ type: 7, ip: ip })));
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: altNames }
  ]);
  cert.sign(caKey, forge.md.sha256.create()); // KÝ bằng khóa CA
  return { keyPem: forge.pki.privateKeyToPem(keys.privateKey), certPem: forge.pki.certificateToPem(cert) };
}

/**
 * Chuẩn bị TLS. Trả về { key, cert, caCert, ips } hoặc null nếu thiếu node-forge.
 * - CA gốc: tạo một lần, giữ nguyên (đừng xóa ca-*.pem, nếu không phải cài lại CA).
 * - Leaf: tự tạo lại khi đổi IP mạng hoặc sắp hết hạn.
 */
function chuanBiTLS(dir) {
  let forge; try { forge = require('node-forge'); } catch (e) { return null; }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const caKeyF = path.join(dir, 'ca-key.pem'), caCrtF = path.join(dir, 'ca-cert.pem');
  const keyF = path.join(dir, 'key.pem'), crtF = path.join(dir, 'cert.pem'), ipF = path.join(dir, '.ips');

  // 1) CA gốc
  let caKeyPem, caCertPem, caMoi = false;
  if (fs.existsSync(caKeyF) && fs.existsSync(caCrtF)) {
    caKeyPem = fs.readFileSync(caKeyF, 'utf8'); caCertPem = fs.readFileSync(caCrtF, 'utf8');
  } else {
    const ca = _taoCA(forge);
    caKeyPem = ca.keyPem; caCertPem = ca.certPem; caMoi = true;
    fs.writeFileSync(caKeyF, caKeyPem); fs.writeFileSync(caCrtF, caCertPem);
    try { fs.chmodSync(caKeyF, 0o600); } catch (e) {}
  }

  // 2) Leaf do CA ký
  const ips = layIPs();
  const dnsNames = ['localhost', 'garage.local', (os.hostname() || 'garage').toLowerCase()];
  const ipKey = ips.slice().sort().join(',');
  let leafKeyPem, leafCertPem, canTao = true;
  if (!caMoi && fs.existsSync(keyF) && fs.existsSync(crtF)) {
    let cu = ''; try { cu = fs.readFileSync(ipF, 'utf8'); } catch (e) {}
    if (cu === ipKey) {
      try {
        const c = forge.pki.certificateFromPem(fs.readFileSync(crtF, 'utf8'));
        if (c.validity.notAfter.getTime() - Date.now() > 30 * 24 * 3600 * 1000) {
          leafKeyPem = fs.readFileSync(keyF, 'utf8'); leafCertPem = fs.readFileSync(crtF, 'utf8'); canTao = false;
        }
      } catch (e) {}
    }
  }
  if (canTao) {
    const leaf = _taoLeaf(forge, caCertPem, caKeyPem, ips, dnsNames);
    leafKeyPem = leaf.keyPem; leafCertPem = leaf.certPem;
    fs.writeFileSync(keyF, leafKeyPem); fs.writeFileSync(crtF, leafCertPem);
    try { fs.writeFileSync(ipF, ipKey); } catch (e) {}
  }

  return {
    key: leafKeyPem,
    cert: leafCertPem + '\n' + caCertPem, // gửi kèm CA trong chuỗi
    caCert: caCertPem,
    ips: ips
  };
}

module.exports = { chuanBiTLS, layIPs };
