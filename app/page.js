'use client';

import { useState, useRef } from 'react';

export default function Home() {
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.aup3')) {
      setStatus('Veuillez sélectionner un fichier .aup3');
      return;
    }

    setStatus('Chargement de sql.js...');
    setProgress(5);
    setDownloadUrl(null);
    setFileName(file.name.replace(/\.aup3$/i, '.mp3'));

    try {
      const SQL = await loadSqlJs();
      setStatus('Lecture du projet Audacity...');
      setProgress(15);

      const buffer = await file.arrayBuffer();
      const db = new SQL.Database(new Uint8Array(buffer));

      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      if (!tables.length || !tables[0].values.some(r => r[0] === 'sampleblocks')) {
        throw new Error('Fichier .aup3 invalide (table sampleblocks manquante)');
      }

      setStatus('Extraction des échantillons audio...');
      setProgress(30);

      const result = db.exec('SELECT samples FROM sampleblocks ORDER BY blockid');
      if (!result.length || !result[0].values.length) {
        throw new Error('Aucun échantillon trouvé dans le projet');
      }

      let totalLength = 0;
      const blocks = result[0].values.map(row => {
        const blob = row[0];
        totalLength += blob.byteLength / 4;
        return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
      });

      const samples = new Float32Array(totalLength);
      let offset = 0;
      for (const block of blocks) {
        samples.set(block, offset);
        offset += block.length;
      }

      setStatus('Préparation audio (mono 44.1 kHz)...');
      setProgress(50);

      // Always mono for simplicity and reliability (podcast use-case)
      // If original was stereo interleaved, we average L+R
      let mono;
      if (samples.length % 2 === 0) {
        mono = new Float32Array(samples.length / 2);
        for (let i = 0; i < mono.length; i++) {
          mono[i] = (samples[i * 2] + samples[i * 2 + 1]) / 2;
        }
      } else {
        mono = samples;
      }

      const sampleRate = 44100;
      const channels = 1;

      setStatus('Encodage WAV intermédiaire...');
      setProgress(60);

      const wavBlob = encodeWAV(mono, sampleRate, channels);

      setStatus('Encodage MP3 192 kbps...');
      setProgress(75);

      const mp3Blob = await encodeMP3(wavBlob, sampleRate, channels);

      const url = URL.createObjectURL(mp3Blob);
      setDownloadUrl(url);
      setStatus('Conversion terminée !');
      setProgress(100);
    } catch (err) {
      console.error(err);
      setStatus('Erreur : ' + (err.message || String(err)));
      setProgress(0);
    }
  }

  function loadSqlJs() {
    return new Promise((resolve, reject) => {
      if (window.SQL) return resolve(window.SQL);
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/sql-wasm.js';
      script.onload = async () => {
        try {
          const SQL = await window.initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/${file}`
          });
          window.SQL = SQL;
          resolve(SQL);
        } catch (e) {
          reject(e);
        }
      };
      script.onerror = () => reject(new Error('Impossible de charger sql.js'));
      document.head.appendChild(script);
    });
  }

  function encodeWAV(samples, sampleRate, numChannels) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  async function encodeMP3(wavBlob, sampleRate, channels) {
    if (!window.lamejs) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Impossible de charger lamejs'));
        document.head.appendChild(s);
      });
    }

    const arrayBuffer = await wavBlob.arrayBuffer();
    const samples = new Int16Array(arrayBuffer, 44);

    const mp3encoder = new window.lamejs.Mp3Encoder(channels, sampleRate, 192);
    const sampleBlockSize = 1152;
    const mp3Data = [];

    for (let i = 0; i < samples.length; i += sampleBlockSize) {
      const sampleChunk = samples.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(new Int8Array(mp3buf));
      }
    }
    const end = mp3encoder.flush();
    if (end.length > 0) {
      mp3Data.push(new Int8Array(end));
    }

    return new Blob(mp3Data, { type: 'audio/mpeg' });
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>
        🎵 AUP3 → MP3 Converter
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
        Convertisseur gratuit et 100 % privé. Votre fichier .aup3 (projet Audacity)
        ne quitte jamais votre navigateur.
      </p>

      <div
        style={{
          border: '2px dashed #334155',
          borderRadius: 12,
          padding: '2.5rem',
          textAlign: 'center',
          background: '#1e293b',
          cursor: 'pointer',
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".aup3"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📁</div>
        <div style={{ fontWeight: 600 }}>Cliquez pour choisir un fichier .aup3</div>
        <div style={{ color: '#64748b', fontSize: '0.9rem', marginTop: 8 }}>
          Traitement local · Aucun serveur · Gratuit
        </div>
      </div>

      {status && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ marginBottom: 8, color: '#94a3b8' }}>{status}</div>
          <div style={{ height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}

      {downloadUrl && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <a
            href={downloadUrl}
            download={fileName}
            style={{
              display: 'inline-block',
              padding: '0.85rem 1.75rem',
              background: '#22c55e',
              color: '#052e16',
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            ↓ Télécharger le MP3
          </a>
        </div>
      )}

      <div style={{ marginTop: '2.5rem', padding: '1rem', background: '#1e293b', borderRadius: 8, fontSize: '0.9rem', color: '#94a3b8' }}>
        <strong style={{ color: '#e2e8f0' }}>Comment ça marche ?</strong>
        <ul style={{ margin: '0.5rem 0 0 1.2rem', padding: 0 }}>
          <li>Le fichier .aup3 est une base SQLite contenant les blocs audio float32</li>
          <li>Tout le traitement se fait dans votre navigateur (sql.js + lamejs)</li>
          <li>Sortie : MP3 mono 192 kbps @ 44.1 kHz (idéal podcast)</li>
        </ul>
      </div>

      <footer style={{ marginTop: '3rem', fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
        Open source · Fait pour les podcasteurs ·{' '}
        <a href="https://github.com/spectrus-corp/aup3-to-mp3" style={{ color: '#94a3b8' }}>
          Voir le code sur GitHub
        </a>
      </footer>
    </main>
  );
}
