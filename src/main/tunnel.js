/**
 * tunnel.js — Cloudflare Quick Tunnel
 * Expõe o servidor de impressão local via URL pública HTTPS.
 * Não requer conta Cloudflare — gera URL automática gratuita.
 */

const { spawn } = require('child_process');
const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const Store  = require('electron-store');
const store  = new Store();

let tunnelProcess = null;
let tunnelUrl     = null;
let statusCallback = null;

function getBinaryPath() {
  // Em produção: dentro do pacote asar unpack; em dev: raiz do projeto
  try {
    const { app } = require('electron');
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'cloudflared.exe');
    }
  } catch {}
  return path.join(__dirname, '../../cloudflared.exe');
}

function downloadBinary(dest) {
  return new Promise((resolve, reject) => {
    const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
    const file = fs.createWriteStream(dest + '.tmp');
    const request = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          request(res.headers.location);
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(dest + '.tmp', dest);
            resolve(dest);
          });
        });
      }).on('error', (e) => { fs.unlink(dest + '.tmp', () => {}); reject(e); });
    };
    request(url);
  });
}

async function ensureBinary() {
  const dest = getBinaryPath();
  if (fs.existsSync(dest)) return dest;
  if (statusCallback) statusCallback({ estado: 'baixando', mensagem: 'Baixando cloudflared.exe (~30MB)...' });
  await downloadBinary(dest);
  return dest;
}

async function start(porta = 3001, onStatus) {
  if (tunnelProcess) return { url: tunnelUrl };
  statusCallback = onStatus;

  if (onStatus) onStatus({ estado: 'iniciando', mensagem: 'Preparando tunnel...' });

  let bin;
  try {
    bin = await ensureBinary();
  } catch (err) {
    if (onStatus) onStatus({ estado: 'erro', mensagem: 'Falha ao baixar cloudflared: ' + err.message });
    throw err;
  }

  return new Promise((resolve, reject) => {
    tunnelUrl = null;
    tunnelProcess = spawn(bin, ['tunnel', '--url', `http://localhost:${porta}`], {
      windowsHide: true,
    });

    const timeout = setTimeout(() => {
      if (!tunnelUrl) {
        stop();
        const err = new Error('Timeout: URL não gerada em 30s');
        if (onStatus) onStatus({ estado: 'erro', mensagem: err.message });
        reject(err);
      }
    }, 30000);

    // cloudflared imprime a URL no stderr
    tunnelProcess.stderr.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !tunnelUrl) {
        tunnelUrl = match[0];
        clearTimeout(timeout);
        store.set('config.tunnel_url', tunnelUrl);
        if (onStatus) onStatus({ estado: 'ativo', url: tunnelUrl, mensagem: `Tunnel ativo: ${tunnelUrl}` });
        resolve({ url: tunnelUrl });
      }
    });

    tunnelProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !tunnelUrl) {
        tunnelUrl = match[0];
        clearTimeout(timeout);
        store.set('config.tunnel_url', tunnelUrl);
        if (onStatus) onStatus({ estado: 'ativo', url: tunnelUrl, mensagem: `Tunnel ativo: ${tunnelUrl}` });
        resolve({ url: tunnelUrl });
      }
    });

    tunnelProcess.on('close', (code) => {
      const wasActive = !!tunnelUrl;
      tunnelProcess = null;
      tunnelUrl = null;
      if (onStatus) onStatus({ estado: 'parado', mensagem: wasActive ? 'Tunnel encerrado' : `cloudflared saiu (código ${code})` });
    });

    tunnelProcess.on('error', (err) => {
      clearTimeout(timeout);
      tunnelProcess = null;
      if (onStatus) onStatus({ estado: 'erro', mensagem: err.message });
      reject(err);
    });

    if (onStatus) onStatus({ estado: 'aguardando', mensagem: 'Conectando ao Cloudflare...' });
  });
}

function stop() {
  if (tunnelProcess) {
    tunnelProcess.kill();
    tunnelProcess = null;
    tunnelUrl = null;
  }
}

function getStatus() {
  return {
    ativo: !!tunnelProcess,
    url: tunnelUrl || store.get('config.tunnel_url') || null,
  };
}

module.exports = { start, stop, getStatus, getBinaryPath };
