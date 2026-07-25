// ═══════════════════════════════════════════════════════════════════════════
// FILE: 18_sound_tools.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ═══════════════════════════════════════════════════════════════════════════
// 18_sound_tools.js  —  MGS1 Sound Swapper (efx.mgz / efx.zip archive editor)
// ═══════════════════════════════════════════════════════════════════════════
// Self-contained module. Hooks into Extras ▾ dropdown.
//
// Workflow:
//   1. Load efx.mgz (or efx.zip — same format, just different extension)
//   2. Browse WAV files in a filterable list with format info per file
//   3. Click any file to preview it in-browser via HTML5 audio
//   4. Pick a target → choose local WAV replacement → preview both → swap
//   5. Modified WAVs marked in the list; export modified archive when ready
//
// Engine constraint: filenames must remain unchanged. Game references sounds
// by ID (e.g. "efx/0x03.wav"). We only swap blob content, never rename.
// ═══════════════════════════════════════════════════════════════════════════

var ST_state = {
  zip: null,           // JSZip instance (live, mutated as user swaps)
  origArchiveName: '', // file name user uploaded ("efx.mgz" or "efx.zip")
  entries: [],         // [{path, dir, size, format:{...}, modified:bool, replacement:Uint8Array?}]
  filterText: '',
  formatFilter: 'all',
  selectedIdx: -1,        // currently SELECTED (target) entry index
  replacementIdx: -1,     // currently REPLACEMENT entry index (-1 if external/none)
  previewBlobUrl: null,
  replacementBlobUrl: null,
  pendingReplacement: null,  // {name, data: Uint8Array, format:{...}, source:'archive'|'external'}
  panelEl: null,
  pickMode: 'target',  // 'target' or 'replacement' — which box a list click fills
  autoplay: true,      // arrow-key navigation autoplays
  annotations: {},     // path → annotation string (loaded from localStorage)
  dupGroupsByte: {},   // by full byteHash+size
  dupGroupsPcm: {},    // by pcmHash+pcmSize — same audio data, different headers OK
  dupGroupsFp: {},     // by perceptual fingerprint key — same RMS envelope
  dupGroups: {},       // alias for the currently-active mode's groups
  matchMode: 'pcm',    // 'byte' | 'pcm' | 'waveform'
  similarBox: null,    // current "find similar" expansion state
  keyHandler: null
};

// ─── Annotations: persistent across sessions ────────────────────────────────
var ST_ANNOTATIONS_KEY = 'mgs_sound_annotations_v1';
function ST_loadAnnotations(){
  try {
    var raw = localStorage.getItem(ST_ANNOTATIONS_KEY);
    if(raw) ST_state.annotations = JSON.parse(raw);
  } catch(e) {}
}
function ST_saveAnnotations(){
  try { localStorage.setItem(ST_ANNOTATIONS_KEY, JSON.stringify(ST_state.annotations)); } catch(e){}
}
function ST_setAnnotation(path, text){
  if(!text || !text.trim()) delete ST_state.annotations[path];
  else ST_state.annotations[path] = text.trim();
  ST_saveAnnotations();
}

function openSoundSwapper(){
  if(typeof JSZip === 'undefined'){
    alert('JSZip library not loaded. The editor build may be incomplete.');
    return;
  }
  ST_loadAnnotations();
  if(ST_state.panelEl){
    ST_state.panelEl.style.display='flex';
    if(!ST_state.keyHandler){
      ST_state.keyHandler=ST_makeKeyHandler();
      window.addEventListener('keydown', ST_state.keyHandler);
    }
    return;
  }
  var ov = document.createElement('div');
  ov.id = 'soundSwapperPanel';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,18,0.97);z-index:9999;display:flex;flex-direction:column;font-family:system-ui,sans-serif;font-size:11px;color:#cde';
  ov.innerHTML =
    '<div style="padding:8px 12px;border-bottom:1px solid #1a2535;display:flex;align-items:center;justify-content:space-between;background:#0d1219">'+
      '<div style="font-size:13px;font-weight:bold;color:#7cf">🔊 Sound Swapper <span id="stArchiveInfo" style="color:#888;font-weight:normal;font-size:11px;margin-left:8px"></span></div>'+
      '<button id="stClose" class="btn" style="font-size:11px;padding:4px 10px">✕ Close</button>'+
    '</div>'+
    '<div style="padding:6px 12px;background:#0d1219;border-bottom:1px solid #1a2535;display:flex;align-items:center;gap:8px;font-size:10px">'+
      '<label style="color:#888">Load archive:</label>'+
      '<input type="file" id="stArchiveInput" accept=".mgz,.zip" style="font-size:10px">'+
      '<button id="stOpenWvx" class="btn" style="font-size:10px;padding:3px 10px;background:#11202e;color:#7cf;margin-left:6px">🎵 PSX WVX bank…</button>'+
      '<button id="stOpenSe" class="btn" style="font-size:10px;padding:3px 10px;background:#1d1228;color:#c9f;margin-left:4px">🎛 SE Sequence Editor…</button>'+
      '<button id="stOpenEfx" class="btn" style="font-size:10px;padding:3px 10px;background:#0f201c;color:#7fe;margin-left:4px">🎚 EFX (stage SE)…</button>'+
      '<span style="flex:1"></span>'+
      '<label style="color:#aac;cursor:pointer"><input type="checkbox" id="stAutoplay" checked style="vertical-align:middle"> autoplay on arrow-key nav (space toggles)</label>'+
      '<button id="stExport" class="btn" style="background:#1a2a3a;color:#7cf;padding:4px 12px" disabled>💾 Export modified archive</button>'+
    '</div>'+
    '<div id="stProgress" style="display:none;padding:6px 12px;background:#0a0e14;color:#aac;font-size:10px;border-bottom:1px solid #1a2535">Loading…</div>'+
    '<div style="display:flex;flex:1;min-height:0">'+
      // LEFT: file list + filter
      '<div style="flex:1;display:flex;flex-direction:column;border-right:1px solid #1a2535">'+
        '<div style="padding:6px 8px;background:#0d1219;border-bottom:1px solid #1a2535;display:flex;align-items:center;gap:6px">'+
          '<input id="stFilter" type="text" placeholder="filter by filename or annotation (e.g. \'gunshot\', \'sample40\')" style="flex:1;background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:3px 6px;font-family:monospace;font-size:10px">'+
          '<select id="stFormatFilter" style="font-size:10px;padding:2px">'+
            '<option value="all">all formats</option>'+
            '<option value="11025">11025 Hz only</option>'+
            '<option value="22050">22050 Hz only</option>'+
            '<option value="44100">44100 Hz only</option>'+
            '<option value="modified">modified only</option>'+
            '<option value="annotated">with annotations</option>'+
            '<option value="duplicates">duplicates only</option>'+
          '</select>'+
          '<select id="stMatchMode" title="How to detect duplicates" style="font-size:10px;padding:2px">'+
            '<option value="byte">match: byte-identical (strict)</option>'+
            '<option value="pcm" selected>match: same audio data</option>'+
            '<option value="waveform">match: similar waveform</option>'+
          '</select>'+
          '<span id="stCountInfo" style="color:#666;min-width:120px;text-align:right;font-size:10px"></span>'+
        '</div>'+
        '<div id="stPickModeBanner" style="display:none;padding:4px 8px;background:#3a2a1a;color:#fa7;font-size:10px;border-bottom:1px solid #5a3a2a;text-align:center">click any file in the list → fills REPLACEMENT slot · <a href="#" id="stCancelPick" style="color:#fa7;text-decoration:underline">cancel</a></div>'+
        '<div id="stFileList" style="flex:1;overflow-y:auto;background:#080c12;font-family:monospace;font-size:10px"></div>'+
      '</div>'+
      // RIGHT: dual-clickable boxes + swap
      '<div style="width:400px;display:flex;flex-direction:column;background:#0d1219">'+
        // SELECTED box (clickable to switch pick mode → target)
        '<div id="stSelBox" style="padding:8px 10px;border-bottom:1px solid #1a2535;cursor:pointer;border-left:3px solid transparent">'+
          '<div style="color:#7c7;font-size:10px;margin-bottom:6px;display:flex;justify-content:space-between">'+
            '<span>● SELECTED (click anywhere on this box to pick from list)</span>'+
            '<span id="stSelBadge" style="font-size:9px;color:#666"></span>'+
          '</div>'+
          '<div id="stSelInfo" style="font-family:monospace;color:#888;font-size:11px">No selection</div>'+
          '<audio id="stPreviewAudio" controls style="width:100%;margin-top:8px;display:none;height:32px"></audio>'+
          '<div style="display:flex;gap:4px;margin-top:6px;align-items:center">'+
            '<input id="stAnnotInput" type="text" placeholder="annotation (e.g. \'snake hurt grunt\')" style="flex:1;background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:3px 6px;font-family:monospace;font-size:10px" disabled>'+
            '<button id="stSaveAnnot" class="btn" style="font-size:9px;padding:3px 8px" disabled>save</button>'+
          '</div>'+
        '</div>'+
        // REPLACEMENT box (clickable to switch pick mode → replacement)
        '<div id="stRepBox" style="padding:8px 10px;border-bottom:1px solid #1a2535;cursor:pointer;border-left:3px solid transparent">'+
          '<div style="color:#fa7;font-size:10px;margin-bottom:6px;display:flex;justify-content:space-between">'+
            '<span>● REPLACEMENT (click box to pick from list, or load external WAV)</span>'+
            '<span id="stRepBadge" style="font-size:9px;color:#666"></span>'+
          '</div>'+
          '<div id="stRepInfo" style="font-family:monospace;color:#888;font-size:11px">No replacement chosen</div>'+
          '<audio id="stReplacementAudio" controls style="width:100%;margin-top:8px;display:none;height:32px"></audio>'+
          '<div style="margin-top:6px;display:flex;align-items:center;gap:4px">'+
            '<label style="color:#888;font-size:9px">or external:</label>'+
            '<input type="file" id="stReplacementInput" accept=".wav" style="font-size:9px;flex:1">'+
          '</div>'+
          '<div id="stCompatWarn" style="font-size:10px;color:#fa6;margin-top:6px;display:none"></div>'+
        '</div>'+
        '<div style="padding:8px 10px;border-bottom:1px solid #1a2535;display:flex;flex-direction:column;gap:6px">'+
          '<button id="stSwapBtn" class="btn" style="background:#3a2a1a;color:#fa7;padding:8px;font-size:11px" disabled>⇆ Replace SELECTED with REPLACEMENT</button>'+
          '<button id="stSwapAllDupsBtn" class="btn" style="background:#3a1a2a;color:#fa6;padding:6px;font-size:10px;display:none" disabled>⇆⇆ Replace SELECTED + all duplicates</button>'+
          '<button id="stRevertBtn" class="btn" style="background:#2a1a1a;color:#f88;padding:4px;font-size:10px" disabled>↺ Revert selected to original</button>'+
        '</div>'+
        '<div style="flex:1;padding:8px 10px;overflow-y:auto">'+
          '<div style="color:#888;font-size:10px;margin-bottom:6px">SWAP HISTORY</div>'+
          '<div id="stHistory" style="color:#666;font-size:10px;font-family:monospace">No swaps yet.</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(ov);
  ST_state.panelEl = ov;

  // Wire up
  document.getElementById('stClose').onclick = closeSoundSwapper;
  document.getElementById('stArchiveInput').onchange = function(e){ if(e.target.files[0]) ST_loadArchive(e.target.files[0]); };
  document.getElementById('stOpenWvx').onclick = function(){ openWvxViewer(); };
  document.getElementById('stOpenSe').onclick = function(){ openSeEditor(); };
  document.getElementById('stOpenEfx').onclick = function(){ openEfxEditor(); };
  document.getElementById('stFilter').oninput = function(e){ ST_state.filterText = e.target.value.toLowerCase(); ST_renderList(); };
  document.getElementById('stFormatFilter').onchange = function(e){ ST_state.formatFilter = e.target.value; ST_renderList(); };
  document.getElementById('stMatchMode').onchange = function(e){ ST_setMatchMode(e.target.value); };
  document.getElementById('stReplacementInput').onchange = function(e){ if(e.target.files[0]) ST_loadExternalReplacement(e.target.files[0]); };
  document.getElementById('stSwapBtn').onclick = ST_performSwap;
  document.getElementById('stSwapAllDupsBtn').onclick = ST_performSwapAllDups;
  document.getElementById('stRevertBtn').onclick = ST_revertSelected;
  document.getElementById('stExport').onclick = ST_exportArchive;
  document.getElementById('stAutoplay').onchange = function(e){ ST_state.autoplay=e.target.checked; };
  document.getElementById('stSelBox').onclick = function(e){
    // Don't trigger if user clicked an input or audio control
    var t=(e.target.tagName||'').toLowerCase();
    if(t==='input'||t==='audio'||t==='button') return;
    ST_setPickMode('target');
  };
  document.getElementById('stRepBox').onclick = function(e){
    var t=(e.target.tagName||'').toLowerCase();
    if(t==='input'||t==='audio'||t==='button') return;
    ST_setPickMode('replacement');
  };
  document.getElementById('stCancelPick').onclick = function(e){ e.preventDefault(); ST_setPickMode('target'); };
  document.getElementById('stAnnotInput').onkeydown = function(e){
    if(e.key==='Enter'){ e.preventDefault(); ST_saveCurrentAnnotation(); }
  };
  document.getElementById('stSaveAnnot').onclick = ST_saveCurrentAnnotation;

  // Visual pick-mode marker
  ST_setPickMode('target');

  // Keyboard nav
  ST_state.keyHandler=ST_makeKeyHandler();
  window.addEventListener('keydown', ST_state.keyHandler);
}

function ST_makeKeyHandler(){
  return function(e){
    if(!ST_state.panelEl || ST_state.panelEl.style.display==='none') return;
    var tag=(e.target.tagName||'').toLowerCase();
    if(tag==='input'||tag==='textarea'||tag==='select') return;
    if(e.key==='ArrowUp' || e.key==='ArrowDown'){
      e.preventDefault();
      ST_navList(e.key==='ArrowDown' ? 1 : -1);
    } else if(e.key===' '){
      e.preventDefault();
      ST_state.autoplay=!ST_state.autoplay;
      var cb=document.getElementById('stAutoplay');
      if(cb) cb.checked=ST_state.autoplay;
    }
  };
}

function ST_navList(delta){
  // Build visible-index list using current filter
  var visible=ST_getVisibleEntryIndices();
  if(visible.length===0) return;
  // Find current position
  var curBaseIdx = (ST_state.pickMode==='target') ? ST_state.selectedIdx : ST_state.replacementIdx;
  var pos=visible.indexOf(curBaseIdx);
  if(pos<0) pos=0;
  else pos=Math.max(0, Math.min(visible.length-1, pos+delta));
  var nextIdx=visible[pos];
  if(ST_state.pickMode==='target') ST_selectFromList(nextIdx);
  else ST_pickReplacementFromList(nextIdx);
  // Scroll into view
  var row=document.querySelector('.st-row[data-idx="'+nextIdx+'"]');
  if(row) row.scrollIntoView({block:'nearest'});
}

function ST_getDuplicatesOf(entryIdx){
  // Returns the array of entry indices that share this entry's grouping key in the
  // currently-active match mode, EXCLUDING entryIdx itself.
  var entry = ST_state.entries[entryIdx];
  if(!entry || !ST_state.dupGroups) return [];
  var key;
  if(ST_state.matchMode === 'waveform'){
    if(!entry.fpKey) return [];
    key = entry.fpKey;
  } else if(ST_state.matchMode === 'pcm'){
    if(entry.pcmHash === undefined) return [];
    key = entry.pcmHash + '_' + (entry.pcmSize || 0);
  } else {
    key = entry.hash + '_' + entry.size;
  }
  var group = ST_state.dupGroups[key] || [];
  if(group.length < 2) return [];
  return group.filter(function(i){ return i !== entryIdx; });
}

function ST_getVisibleEntryIndices(){
  var out=[];
  var filter=ST_state.filterText, fmtF=ST_state.formatFilter;
  for(var i=0;i<ST_state.entries.length;i++){
    var e=ST_state.entries[i];
    var annot=ST_state.annotations[e.path]||'';
    if(filter && e.path.toLowerCase().indexOf(filter)===-1 && annot.toLowerCase().indexOf(filter)===-1) continue;
    if(fmtF==='modified' && !e.modified) continue;
    if(fmtF==='annotated' && !annot) continue;
    if(fmtF==='duplicates'){
      var dKey;
      if(ST_state.matchMode === 'waveform'){
        if(!e.fpKey){ continue; }
        dKey = e.fpKey;
      } else if(ST_state.matchMode === 'pcm'){
        if(e.pcmHash === undefined){ continue; }
        dKey = e.pcmHash + '_' + (e.pcmSize || 0);
      } else {
        dKey = e.hash + '_' + e.size;
      }
      var dGroup = ST_state.dupGroups[dKey];
      if(!dGroup || dGroup.length < 2) continue;
    }
    if(fmtF!=='all' && fmtF!=='modified' && fmtF!=='annotated' && fmtF!=='duplicates' && e.format && String(e.format.sampleRate)!==fmtF) continue;
    out.push(i);
  }
  return out;
}

function ST_setPickMode(mode){
  ST_state.pickMode=mode;
  var selBox=document.getElementById('stSelBox');
  var repBox=document.getElementById('stRepBox');
  var banner=document.getElementById('stPickModeBanner');
  if(selBox) selBox.style.borderLeftColor = (mode==='target')?'#7c7':'transparent';
  if(repBox) repBox.style.borderLeftColor = (mode==='replacement')?'#fa7':'transparent';
  if(banner) banner.style.display=(mode==='replacement')?'block':'none';
}

function closeSoundSwapper(){
  if(ST_state.previewBlobUrl){ URL.revokeObjectURL(ST_state.previewBlobUrl); ST_state.previewBlobUrl=null; }
  if(ST_state.replacementBlobUrl){ URL.revokeObjectURL(ST_state.replacementBlobUrl); ST_state.replacementBlobUrl=null; }
  if(ST_state.keyHandler){ window.removeEventListener('keydown', ST_state.keyHandler); ST_state.keyHandler=null; }
  if(ST_state.panelEl) ST_state.panelEl.style.display='none';
}

// ─── WAV format parser ───────────────────────────────────────────────────────
function ST_parseWavHeader(u8){
  if(u8.length < 44) return null;
  if(u8[0]!==0x52 || u8[1]!==0x49 || u8[2]!==0x46 || u8[3]!==0x46) return null; // 'RIFF'
  if(u8[8]!==0x57 || u8[9]!==0x41 || u8[10]!==0x56 || u8[11]!==0x45) return null; // 'WAVE'
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // 'fmt ' chunk is usually at 12 — verify
  if(u8[12]!==0x66 || u8[13]!==0x6d || u8[14]!==0x74 || u8[15]!==0x20) return null;
  var fmtSize = dv.getUint32(16, true);
  var formatTag = dv.getUint16(20, true);
  var channels = dv.getUint16(22, true);
  var sampleRate = dv.getUint32(24, true);
  var bitsPerSample = dv.getUint16(34, true);
  // Find 'data' chunk (might not be at 36 if fmt extension)
  var dataOff = 20 + fmtSize;
  while(dataOff+8 <= u8.length){
    if(u8[dataOff]===0x64 && u8[dataOff+1]===0x61 && u8[dataOff+2]===0x74 && u8[dataOff+3]===0x61){
      var dataSize = dv.getUint32(dataOff+4, true);
      var durationSec = dataSize / (sampleRate * channels * (bitsPerSample/8));
      return {
        formatTag: formatTag,
        channels: channels,
        sampleRate: sampleRate,
        bitsPerSample: bitsPerSample,
        dataSize: dataSize,
        durationSec: durationSec
      };
    }
    var sz = dv.getUint32(dataOff+4, true);
    dataOff += 8 + sz;
  }
  return null;
}

// ─── Archive loading ─────────────────────────────────────────────────────────
// FNV-1a 32-bit hash. Fast, low-collision for byte arrays of varying sizes.
// We use this for exact-duplicate detection within the loaded archive.
function ST_fnvHash(u8){
  var h = 0x811c9dc5 >>> 0;
  for(var i = 0; i < u8.length; i++){
    h ^= u8[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Hash a slice of bytes without copying — same FNV-1a, range-bounded.
function ST_fnvHashRange(u8, start, end){
  var h = 0x811c9dc5 >>> 0;
  var lim = Math.min(end, u8.length);
  for(var i = start; i < lim; i++){
    h ^= u8[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Walk WAV chunks to find the "data" chunk. Returns {offset, size} or null.
function ST_findDataChunk(u8){
  if(u8.length < 44) return null;
  // RIFF header check
  if(u8[0] !== 0x52 || u8[1] !== 0x49 || u8[2] !== 0x46 || u8[3] !== 0x46) return null;
  if(u8[8] !== 0x57 || u8[9] !== 0x41 || u8[10] !== 0x56 || u8[11] !== 0x45) return null; // "WAVE"
  // Walk chunks from offset 12
  var off = 12;
  while(off + 8 <= u8.length){
    var size = u8[off+4] | (u8[off+5]<<8) | (u8[off+6]<<16) | ((u8[off+7]<<24) >>> 0);
    // Check for "data" chunk
    if(u8[off] === 0x64 && u8[off+1] === 0x61 && u8[off+2] === 0x74 && u8[off+3] === 0x61){
      return {offset: off + 8, size: size};
    }
    off += 8 + size;
    if(size & 1) off++; // chunk size padding to even
  }
  return null;
}

// Hash just the audio data chunk. Catches files with identical audio but
// different WAV headers (common in game archives where the same sound is
// referenced under multiple IDs with slightly different RIFF metadata).
function ST_pcmHashOf(u8){
  var chunk = ST_findDataChunk(u8);
  if(!chunk) return {hash: ST_fnvHash(u8), dataSize: u8.length}; // fallback for non-WAV
  return {hash: ST_fnvHashRange(u8, chunk.offset, chunk.offset + chunk.size), dataSize: chunk.size};
}

// Perceptual audio fingerprint: 32-window normalized-RMS envelope, 4 bits per window.
// Same sound at different volumes or with slight encoding differences hashes the same.
// Returns Uint8Array(32) with values 0-15, or null if file isn't a parseable WAV.
function ST_audioFingerprint(u8, format){
  if(!format) return null;
  var chunk = ST_findDataChunk(u8);
  if(!chunk) return null;
  var bps = format.bitsPerSample;
  if(bps !== 8 && bps !== 16) return null;
  // Count samples accounting for channel count
  var bytesPerSample = bps / 8 * format.channels;
  var avail = Math.min(chunk.size, u8.length - chunk.offset);
  var numSamples = Math.floor(avail / bytesPerSample);
  if(numSamples < 1) return null;
  // Sample reader: returns first-channel sample as signed int
  function get(i){
    var off = chunk.offset + i * bytesPerSample;
    if(bps === 8) return u8[off] - 128;
    var v = u8[off] | (u8[off+1] << 8);
    return v < 0x8000 ? v : v - 0x10000;
  }
  // Find peak amplitude for normalization
  var peak = 1;
  for(var i = 0; i < numSamples; i++){
    var v = Math.abs(get(i));
    if(v > peak) peak = v;
  }
  // 32 windows of RMS, normalized 0-1, quantized to 4 bits
  var numWindows = 32;
  var winSize = Math.max(1, Math.floor(numSamples / numWindows));
  var fp = new Uint8Array(numWindows);
  for(var w = 0; w < numWindows; w++){
    var start = w * winSize;
    var end = Math.min(numSamples, start + winSize);
    if(end <= start){ fp[w] = 0; continue; }
    var sumSq = 0;
    for(var k = start; k < end; k++){
      var s = get(k);
      sumSq += s * s;
    }
    var rms = Math.sqrt(sumSq / (end - start)) / peak;
    fp[w] = Math.min(15, Math.floor(rms * 16));
  }
  return fp;
}

// Convert a fingerprint Uint8Array to a hex string for use as a map key.
function ST_fingerprintKey(fp){
  if(!fp) return null;
  var s = '';
  for(var i = 0; i < fp.length; i++) s += fp[i].toString(16);
  return s;
}

// Hamming-style distance between two fingerprints (sum of absolute per-window differences).
// Lower = more similar. 0 = identical fingerprints. Max = 32 * 15 = 480.
function ST_fingerprintDistance(a, b){
  if(!a || !b || a.length !== b.length) return Infinity;
  var d = 0;
  for(var i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d;
}

// Rebuild dup groups for all match modes from current entries.
function ST_rebuildDupGroups(){
  ST_state.dupGroupsByte = {};
  ST_state.dupGroupsPcm = {};
  ST_state.dupGroupsFp = {};
  for(var i = 0; i < ST_state.entries.length; i++){
    var e = ST_state.entries[i];
    // Byte-identical: full hash + size
    var kB = e.hash + '_' + e.size;
    if(!ST_state.dupGroupsByte[kB]) ST_state.dupGroupsByte[kB] = [];
    ST_state.dupGroupsByte[kB].push(i);
    // PCM-identical: pcm hash + data size
    if(e.pcmHash !== undefined){
      var kP = e.pcmHash + '_' + (e.pcmSize || 0);
      if(!ST_state.dupGroupsPcm[kP]) ST_state.dupGroupsPcm[kP] = [];
      ST_state.dupGroupsPcm[kP].push(i);
    }
    // Waveform fingerprint
    if(e.fpKey){
      if(!ST_state.dupGroupsFp[e.fpKey]) ST_state.dupGroupsFp[e.fpKey] = [];
      ST_state.dupGroupsFp[e.fpKey].push(i);
    }
  }
  // Point .dupGroups at the active mode's groups (used by existing list/badge code)
  ST_state.dupGroups = ST_state['dupGroups' + ST_matchModeSuffix()];
}

function ST_matchModeSuffix(){
  if(ST_state.matchMode === 'byte') return 'Byte';
  if(ST_state.matchMode === 'waveform') return 'Fp';
  return 'Pcm'; // default
}

function ST_setMatchMode(mode){
  ST_state.matchMode = mode;
  ST_state.dupGroups = ST_state['dupGroups' + ST_matchModeSuffix()];
  ST_renderList();
  if(ST_state.selectedIdx >= 0) ST_selectFromList(ST_state.selectedIdx);
  ST_updateSwapBtn();
  ST_updateArchiveInfo();
}

// Refresh the top-bar archive info string with current dedup totals.
function ST_updateArchiveInfo(){
  var el = document.getElementById('stArchiveInfo');
  if(!el || !ST_state.entries.length) return;
  var totalSize = 0;
  for(var i = 0; i < ST_state.entries.length; i++) totalSize += ST_state.entries[i].size;
  var groups = ST_state.dupGroups || {};
  var dupGroupCount = 0, dupFileCount = 0;
  for(var k in groups){
    if(groups[k].length >= 2){
      dupGroupCount++;
      dupFileCount += groups[k].length;
    }
  }
  var modeLabel = ST_state.matchMode === 'byte' ? 'byte-identical'
                : ST_state.matchMode === 'waveform' ? 'waveform-similar'
                : 'audio-data-identical';
  var dupInfo = dupGroupCount > 0
    ? ' · <span style="color:#fa6">'+dupFileCount+' files in '+dupGroupCount+' '+modeLabel+' groups</span>'
    : '';
  el.innerHTML = ST_state.origArchiveName + ' · ' + ST_state.entries.length + ' files · ' + (totalSize/1048576).toFixed(1) + ' MB uncompressed' + dupInfo;
}

// On-demand: find N files most perceptually similar to entryIdx, sorted by distance.
// Returns array of {idx, distance} sorted ascending. Skips entries without fingerprints.
function ST_findSimilarWaveforms(entryIdx, maxResults){
  var target = ST_state.entries[entryIdx];
  if(!target || !target.fingerprint) return [];
  var results = [];
  for(var i = 0; i < ST_state.entries.length; i++){
    if(i === entryIdx) continue;
    var e = ST_state.entries[i];
    if(!e.fingerprint) continue;
    var d = ST_fingerprintDistance(target.fingerprint, e.fingerprint);
    results.push({idx: i, distance: d});
  }
  results.sort(function(a,b){ return a.distance - b.distance; });
  return results.slice(0, maxResults || 20);
}


function ST_loadArchive(file){
  ST_state.origArchiveName = file.name;
  var prog = document.getElementById('stProgress');
  prog.style.display='block';
  prog.textContent='Reading file...';
  var r = new FileReader();
  r.onload = function(e){
    prog.textContent='Parsing archive (this may take a moment)...';
    JSZip.loadAsync(e.target.result).then(function(zip){
      prog.textContent='Indexing entries, parsing WAV headers, hashing + fingerprinting for duplicate detection...';
      ST_state.zip = zip;
      ST_state.entries = [];
      var entryPromises = [];
      zip.forEach(function(path, entry){
        if(entry.dir) return;
        entryPromises.push(entry.async('uint8array').then(function(u8){
          var fmt = ST_parseWavHeader(u8);
          var byteHash = ST_fnvHash(u8);
          var pcm = ST_pcmHashOf(u8);
          var fp = ST_audioFingerprint(u8, fmt);
          return {
            path: path,
            size: u8.length,
            format: fmt,
            hash: byteHash,
            pcmHash: pcm.hash,
            pcmSize: pcm.dataSize,
            fingerprint: fp,
            fpKey: ST_fingerprintKey(fp),
            modified: false,
            replacement: null
          };
        }));
      });
      Promise.all(entryPromises).then(function(results){
        ST_state.entries = results.sort(function(a,b){ return a.path < b.path ? -1 : 1; });
        // Build all three dup-group maps and point ST_state.dupGroups at the active mode
        ST_rebuildDupGroups();
        prog.style.display='none';
        ST_updateArchiveInfo();
        ST_renderList();
        ST_updateExportBtn();
      });
    }).catch(function(err){
      prog.textContent='Error: ' + err.message;
      setTimeout(function(){ prog.style.display='none'; }, 5000);
    });
  };
  r.onerror = function(){ prog.textContent='File read error.'; };
  r.readAsArrayBuffer(file);
}

// ─── List rendering ──────────────────────────────────────────────────────────
function ST_renderList(){
  var listEl = document.getElementById('stFileList');
  if(!listEl) return;
  if(ST_state.entries.length === 0){
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#444">No archive loaded.</div>';
    document.getElementById('stCountInfo').textContent='';
    return;
  }
  var visible=ST_getVisibleEntryIndices();
  var rows = [];
  for(var k=0;k<visible.length;k++){
    var i=visible[k];
    var e=ST_state.entries[i];
    var annot=ST_state.annotations[e.path]||'';
    var fmtStr = e.format ?
      (e.format.bitsPerSample+'bit '+e.format.sampleRate+'Hz '+e.format.channels+'ch · '+e.format.durationSec.toFixed(2)+'s')
      : 'not a WAV';
    var sizeStr = (e.size < 1024) ? e.size+'B' : (e.size/1024).toFixed(1)+'K';
    var modMark = e.modified ? '<span style="color:#fa6">●</span>' : '<span style="color:#333">○</span>';
    var nameColor = e.modified ? '#fa7' : '#aac';
    var roleBadge = '';
    if(i===ST_state.selectedIdx) roleBadge += '<span style="background:#0a4a0a;color:#7c7;font-size:8px;padding:1px 4px;border-radius:2px;margin-right:3px">T</span>';
    if(i===ST_state.replacementIdx) roleBadge += '<span style="background:#4a2a0a;color:#fa7;font-size:8px;padding:1px 4px;border-radius:2px;margin-right:3px">R</span>';
    // Dup badge: shows when this entry is in a duplicate group (in current match mode)
    var dupBadgeKey;
    if(ST_state.matchMode === 'waveform'){
      dupBadgeKey = e.fpKey || null;
    } else if(ST_state.matchMode === 'pcm'){
      dupBadgeKey = (e.pcmHash !== undefined) ? (e.pcmHash + '_' + (e.pcmSize || 0)) : null;
    } else {
      dupBadgeKey = e.hash + '_' + e.size;
    }
    var dupGroup = dupBadgeKey ? ST_state.dupGroups[dupBadgeKey] : null;
    if(dupGroup && dupGroup.length >= 2){
      roleBadge += '<span style="background:#4a2030;color:#fa6;font-size:8px;padding:1px 4px;border-radius:2px;margin-right:3px" title="This file has '+(dupGroup.length-1)+' near-duplicate(s) by '+ST_state.matchMode+' match">DUP×'+dupGroup.length+'</span>';
    }
    var annotHtml = annot ? '<div style="color:#5a8;font-size:9px;font-style:italic;font-family:system-ui,sans-serif;margin-top:1px;margin-left:22px">'+ST_escapeHtml(annot)+'</div>' : '';
    rows.push('<div class="st-row" data-idx="'+i+'" style="padding:3px 8px;cursor:pointer;border-bottom:1px solid #0d1219">'+
              '<div style="display:flex;align-items:center;gap:6px">'+
                '<span style="width:14px;text-align:center">'+modMark+'</span>'+
                roleBadge+
                '<span style="flex:1;color:'+nameColor+';font-family:monospace">'+e.path+'</span>'+
                '<span style="color:#566;font-size:9px;width:70px;text-align:right">'+sizeStr+'</span>'+
                '<span style="color:#566;font-size:9px;width:180px;text-align:right">'+fmtStr+'</span>'+
              '</div>'+
              annotHtml+
              '</div>');
  }
  listEl.innerHTML = rows.join('');
  listEl.onclick = function(e){
    var row = e.target.closest('.st-row');
    if(!row) return;
    var idx=parseInt(row.dataset.idx);
    if(ST_state.pickMode==='replacement') ST_pickReplacementFromList(idx);
    else ST_selectFromList(idx);
  };
  // Selection highlight
  if(ST_state.selectedIdx >= 0){
    var s=listEl.querySelector('.st-row[data-idx="'+ST_state.selectedIdx+'"]');
    if(s) s.style.background = '#15252e';
  }
  if(ST_state.replacementIdx >= 0){
    var r=listEl.querySelector('.st-row[data-idx="'+ST_state.replacementIdx+'"]');
    if(r) r.style.background = (ST_state.replacementIdx===ST_state.selectedIdx)?'#252418':'#252015';
  }
  document.getElementById('stCountInfo').textContent = visible.length + ' of ' + ST_state.entries.length + ' shown';
}

function ST_escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Click a list row while pickMode='target' (default): set the SELECTED slot
function ST_selectFromList(idx){
  ST_state.selectedIdx = idx;
  ST_renderList();
  var entry = ST_state.entries[idx];
  if(!entry) return;
  var info = document.getElementById('stSelInfo');
  var annot = ST_state.annotations[entry.path]||'';
  var dups = ST_getDuplicatesOf(idx);
  var dupHtml = '';
  var modeDesc = ST_state.matchMode === 'byte' ? 'byte-identical bytes — same audio, same WAV header'
              : ST_state.matchMode === 'waveform' ? 'matching RMS envelope — perceptually identical'
              : 'identical audio data — same PCM samples, possibly differing headers';
  if(dups.length > 0){
    var dupListHtml = dups.slice(0, 12).map(function(i){
      var p = ST_state.entries[i].path;
      return '<a href="#" class="st-dup-link" data-idx="'+i+'" style="color:#fa6;text-decoration:underline;font-family:monospace">'+p+'</a>';
    }).join(', ');
    if(dups.length > 12) dupListHtml += ', <span style="color:#666">… and '+(dups.length-12)+' more</span>';
    dupHtml = '<div style="color:#fa6;font-size:10px;margin-top:4px;line-height:1.4">'+
              '⚠ '+(dups.length+1)+' files in this duplicate group:<br>'+
              '<span style="color:#888;font-size:9px">('+modeDesc+')</span><br>'+
              '<div style="margin-top:3px;max-height:60px;overflow-y:auto">'+dupListHtml+'</div>'+
              '</div>';
  }
  // "Find similar" button (only if this entry has a fingerprint)
  var similarBtnHtml = '';
  if(entry.fingerprint){
    similarBtnHtml = '<div style="margin-top:6px">'+
      '<button id="stFindSimilarBtn" class="btn" style="background:#152a3a;color:#7cf;padding:3px 8px;font-size:10px;width:100%">🔍 Find perceptually similar sounds (waveform search)</button>'+
      '<div id="stSimilarList" style="display:none;margin-top:4px;font-size:10px;max-height:160px;overflow-y:auto"></div>'+
      '</div>';
  }
  info.innerHTML =
    '<div style="color:#cde">'+entry.path+'</div>'+
    '<div style="color:#888;font-size:10px;margin-top:3px">'+
      (entry.format ? entry.format.bitsPerSample+'-bit · '+entry.format.sampleRate+' Hz · '+entry.format.channels+' ch · '+entry.format.durationSec.toFixed(3)+'s · '+entry.size+' bytes' : 'Not a WAV file')+
    '</div>'+
    (entry.modified ? '<div style="color:#fa6;margin-top:3px">● Modified (will be exported)</div>' : '')+
    dupHtml +
    similarBtnHtml;
  // Wire dup-link clicks: navigate to that entry
  var links = info.querySelectorAll('.st-dup-link');
  for(var l = 0; l < links.length; l++){
    (function(a){
      a.onclick = function(e){
        e.preventDefault();
        ST_selectFromList(parseInt(a.dataset.idx));
        var row = document.querySelector('.st-row[data-idx="'+a.dataset.idx+'"]');
        if(row) row.scrollIntoView({block:'nearest'});
      };
    })(links[l]);
  }
  // Wire "find similar" button
  var simBtn = document.getElementById('stFindSimilarBtn');
  if(simBtn){
    simBtn.onclick = function(){ ST_renderSimilarList(idx); };
  }
  // Populate annotation input
  var annotInput=document.getElementById('stAnnotInput');
  annotInput.value=annot;
  annotInput.disabled=false;
  document.getElementById('stSaveAnnot').disabled=false;
  document.getElementById('stSelBadge').textContent=entry.path;
  // Load audio preview
  ST_state.zip.file(entry.path).async('blob').then(function(blob){
    if(ST_state.previewBlobUrl){ URL.revokeObjectURL(ST_state.previewBlobUrl); }
    ST_state.previewBlobUrl = URL.createObjectURL(blob);
    var au = document.getElementById('stPreviewAudio');
    au.src = ST_state.previewBlobUrl;
    au.style.display='block';
    if(ST_state.autoplay){ au.play().catch(function(){}); }
  });
  ST_updateSwapBtn();
  ST_checkCompat();
}

// Click a list row while pickMode='replacement': set REPLACEMENT slot from same archive
function ST_pickReplacementFromList(idx){
  ST_state.replacementIdx = idx;
  var entry = ST_state.entries[idx];
  if(!entry) return;
  ST_state.zip.file(entry.path).async('uint8array').then(function(u8){
    ST_state.pendingReplacement = {
      name: entry.path+' (from archive)',
      data: u8,
      format: entry.format,
      source: 'archive'
    };
    var info = document.getElementById('stRepInfo');
    info.innerHTML =
      '<div style="color:#cde">'+entry.path+'</div>'+
      '<div style="color:#888;font-size:10px;margin-top:3px">'+
        (entry.format ? entry.format.bitsPerSample+'-bit · '+entry.format.sampleRate+' Hz · '+entry.format.channels+' ch · '+entry.format.durationSec.toFixed(3)+'s · '+u8.length+' bytes (from archive)' : 'Not a WAV')+
      '</div>';
    document.getElementById('stRepBadge').textContent=entry.path;
    if(ST_state.replacementBlobUrl){ URL.revokeObjectURL(ST_state.replacementBlobUrl); }
    var blob=new Blob([u8],{type:'audio/wav'});
    ST_state.replacementBlobUrl=URL.createObjectURL(blob);
    var au=document.getElementById('stReplacementAudio');
    au.src=ST_state.replacementBlobUrl;
    au.style.display='block';
    if(ST_state.autoplay){ au.play().catch(function(){}); }
    ST_renderList();
    ST_checkCompat();
    ST_updateSwapBtn();
  });
}

function ST_saveCurrentAnnotation(){
  if(ST_state.selectedIdx<0) return;
  var entry=ST_state.entries[ST_state.selectedIdx];
  var input=document.getElementById('stAnnotInput');
  ST_setAnnotation(entry.path, input.value);
  ST_renderList();
}

// ─── Replacement loading ────────────────────────────────────────────────────
function ST_loadExternalReplacement(file){
  var r = new FileReader();
  r.onload = function(e){
    var u8 = new Uint8Array(e.target.result);
    var fmt = ST_parseWavHeader(u8);
    ST_state.pendingReplacement = {name:file.name, data:u8, format:fmt, source:'external'};
    ST_state.replacementIdx = -1; // clear archive-based replacement marker
    var info = document.getElementById('stRepInfo');
    info.innerHTML =
      '<div style="color:#cde">'+file.name+' <span style="color:#888;font-size:9px">(external)</span></div>'+
      '<div style="color:#888;font-size:10px;margin-top:3px">'+
        (fmt ? fmt.bitsPerSample+'-bit · '+fmt.sampleRate+' Hz · '+fmt.channels+' ch · '+fmt.durationSec.toFixed(3)+'s · '+u8.length+' bytes' : '⚠ Not a valid WAV — engine may reject this file')+
      '</div>';
    document.getElementById('stRepBadge').textContent='external';
    if(ST_state.replacementBlobUrl){ URL.revokeObjectURL(ST_state.replacementBlobUrl); }
    var blob = new Blob([u8], {type:'audio/wav'});
    ST_state.replacementBlobUrl = URL.createObjectURL(blob);
    var au = document.getElementById('stReplacementAudio');
    au.src = ST_state.replacementBlobUrl;
    au.style.display='block';
    ST_renderList();
    ST_checkCompat();
    ST_updateSwapBtn();
  };
  r.readAsArrayBuffer(file);
}

function ST_checkCompat(){
  var warn = document.getElementById('stCompatWarn');
  if(!warn) return;
  warn.style.display='none';
  warn.textContent='';
  if(ST_state.selectedIdx < 0 || !ST_state.pendingReplacement) return;
  var entry = ST_state.entries[ST_state.selectedIdx];
  var src = entry.format, rep = ST_state.pendingReplacement.format;
  if(!src || !rep) return;
  var warnings = [];
  if(src.sampleRate !== rep.sampleRate) warnings.push('Sample rate '+rep.sampleRate+'Hz ≠ original '+src.sampleRate+'Hz');
  if(src.bitsPerSample !== rep.bitsPerSample) warnings.push('Bit depth '+rep.bitsPerSample+' ≠ original '+src.bitsPerSample);
  if(src.channels !== rep.channels) warnings.push('Channels '+rep.channels+' ≠ original '+src.channels);
  if(warnings.length){
    warn.innerHTML = '⚠ Format mismatch: ' + warnings.join(', ') + '. Game may play at wrong pitch/speed or refuse to load.';
    warn.style.display='block';
  }
}

function ST_updateSwapBtn(){
  var btn = document.getElementById('stSwapBtn');
  if(!btn) return;
  var canSwap = ST_state.selectedIdx >= 0 && ST_state.pendingReplacement;
  btn.disabled = !canSwap;
  if(canSwap){
    var targetPath = ST_state.entries[ST_state.selectedIdx].path;
    var srcLabel = ST_state.pendingReplacement.source==='archive'
                   ? ST_state.entries[ST_state.replacementIdx].path
                   : ST_state.pendingReplacement.name;
    btn.textContent = '⇆ Replace ' + targetPath + ' ← ' + srcLabel;
  } else if(ST_state.selectedIdx < 0){
    btn.textContent = '⇆ Select a target first';
  } else {
    btn.textContent = '⇆ Pick a replacement (from list or external)';
  }
  // Dup button: shown when selected file has duplicates
  var dupBtn = document.getElementById('stSwapAllDupsBtn');
  if(dupBtn){
    if(ST_state.selectedIdx >= 0){
      var dups = ST_getDuplicatesOf(ST_state.selectedIdx);
      if(dups.length > 0){
        dupBtn.style.display = 'block';
        dupBtn.disabled = !canSwap;
        dupBtn.textContent = '⇆⇆ Replace SELECTED + '+dups.length+' duplicate'+(dups.length===1?'':'s')+' ('+(dups.length+1)+' files total)';
      } else {
        dupBtn.style.display = 'none';
      }
    } else {
      dupBtn.style.display = 'none';
    }
  }
  var revBtn = document.getElementById('stRevertBtn');
  revBtn.disabled = !(ST_state.selectedIdx >= 0 && ST_state.entries[ST_state.selectedIdx].modified);
}

// ─── Swap + Revert + Export ─────────────────────────────────────────────────
function ST_performSwap(){
  if(ST_state.selectedIdx < 0 || !ST_state.pendingReplacement) return;
  var entry = ST_state.entries[ST_state.selectedIdx];
  if(!entry.modified){
    ST_state.zip.file(entry.path).async('uint8array').then(function(origData){
      entry.originalData = origData;
      ST_doSwap(entry);
    });
  } else {
    ST_doSwap(entry);
  }
}

// Replace selected AND every duplicate of it in the archive with the pending replacement.
function ST_performSwapAllDups(){
  if(ST_state.selectedIdx < 0 || !ST_state.pendingReplacement) return;
  var dups = ST_getDuplicatesOf(ST_state.selectedIdx);
  if(dups.length === 0){ ST_performSwap(); return; }
  if(!confirm('Replace '+(dups.length+1)+' files (selected + '+dups.length+' duplicates) with the same replacement?\\n\\nThis is useful when the game stores the same sound at multiple IDs and references all of them at different times. Replacing all ensures the new sound plays in every situation.')) return;
  // Build list of all indices to swap: selected + dups
  var allIdx = [ST_state.selectedIdx].concat(dups);
  var rep = ST_state.pendingReplacement;
  // Snapshot originals (sequential async) then swap all
  var idx = 0;
  function doNext(){
    if(idx >= allIdx.length){
      // All done
      ST_renderList();
      ST_renderHistory();
      ST_selectFromList(ST_state.selectedIdx);
      ST_updateSwapBtn();
      ST_updateExportBtn();
      return;
    }
    var entry = ST_state.entries[allIdx[idx]];
    if(!entry.modified){
      ST_state.zip.file(entry.path).async('uint8array').then(function(origData){
        entry.originalData = origData;
        ST_state.zip.file(entry.path, rep.data);
        entry.modified = true;
        entry.size = rep.data.length;
        entry.format = rep.format;
        entry.replacementName = rep.name + ' (group of '+allIdx.length+')';
        idx++;
        doNext();
      });
    } else {
      ST_state.zip.file(entry.path, rep.data);
      entry.size = rep.data.length;
      entry.format = rep.format;
      entry.replacementName = rep.name + ' (group of '+allIdx.length+')';
      idx++;
      doNext();
    }
  }
  doNext();
}
function ST_doSwap(entry){
  var rep = ST_state.pendingReplacement;
  ST_state.zip.file(entry.path, rep.data);
  entry.modified = true;
  entry.size = rep.data.length;
  entry.format = rep.format;
  entry.replacementName = rep.name;
  ST_renderList();
  ST_renderHistory();
  // Refresh selection info (also refreshes audio preview)
  ST_selectFromList(ST_state.selectedIdx);
  ST_updateSwapBtn();
  ST_updateExportBtn();
}

// Render the perceptually-similar files panel inline below the selection info.
// Toggles open/closed on subsequent clicks. The list is sorted by fingerprint distance.
function ST_renderSimilarList(entryIdx){
  var listEl = document.getElementById('stSimilarList');
  if(!listEl) return;
  // Toggle: if already open, close
  if(listEl.style.display !== 'none'){ listEl.style.display = 'none'; return; }
  listEl.style.display = 'block';
  var results = ST_findSimilarWaveforms(entryIdx, 30);
  if(results.length === 0){
    listEl.innerHTML = '<div style="color:#666;font-style:italic;padding:4px">No comparable files (target has no fingerprint or all others lack one).</div>';
    return;
  }
  // Distance interpretation:
  //   0       = identical fingerprint (perceptually same)
  //   1-5     = very similar (likely same sound with small differences)
  //   6-15    = somewhat similar
  //   16+     = probably different sounds
  // Show colored badges by distance bucket
  function distColor(d){
    if(d === 0) return '#f8c';
    if(d <= 5) return '#f8a';
    if(d <= 15) return '#fa6';
    if(d <= 30) return '#aac';
    return '#666';
  }
  function distLabel(d){
    if(d === 0) return 'identical fp';
    if(d <= 5) return 'very similar';
    if(d <= 15) return 'similar';
    if(d <= 30) return 'somewhat similar';
    return 'distant';
  }
  var html = '<div style="color:#888;font-size:9px;margin-bottom:4px;padding:2px 4px">Top '+results.length+' nearest by perceptual fingerprint (lower distance = more similar). Click any to navigate.</div>';
  for(var i = 0; i < results.length; i++){
    var r = results[i];
    var p = ST_state.entries[r.idx].path;
    var col = distColor(r.distance);
    var lbl = distLabel(r.distance);
    html += '<div style="display:flex;align-items:center;gap:4px;padding:2px 4px;border-bottom:1px solid #1a2535">'+
              '<span style="min-width:18px;color:'+col+';font-weight:bold;text-align:right">'+r.distance+'</span>'+
              '<span style="min-width:90px;color:'+col+';font-size:9px;font-style:italic">'+lbl+'</span>'+
              '<a href="#" class="st-similar-link" data-idx="'+r.idx+'" style="flex:1;color:#cde;font-family:monospace;text-decoration:none">'+p+'</a>'+
            '</div>';
  }
  // Bulk-replace button
  html += '<div style="margin-top:4px;display:flex;gap:4px">'+
            '<span style="flex:1;color:#888;font-size:9px;align-self:center">Bulk action:</span>'+
            '<button id="stReplaceSimilarBtn" class="btn" style="background:#3a1a2a;color:#fa6;padding:3px 8px;font-size:9px">⇆ Replace top N with REPLACEMENT…</button>'+
          '</div>';
  listEl.innerHTML = html;
  // Wire navigation links
  var links = listEl.querySelectorAll('.st-similar-link');
  for(var l = 0; l < links.length; l++){
    (function(a){
      a.onclick = function(e){
        e.preventDefault();
        ST_selectFromList(parseInt(a.dataset.idx));
        var row = document.querySelector('.st-row[data-idx="'+a.dataset.idx+'"]');
        if(row) row.scrollIntoView({block:'nearest'});
      };
    })(links[l]);
  }
  // Wire bulk replace
  var bulkBtn = document.getElementById('stReplaceSimilarBtn');
  if(bulkBtn){
    bulkBtn.onclick = function(){ ST_promptReplaceSimilar(entryIdx, results); };
  }
}

// Prompt user for a distance threshold, then replace all files within that threshold
// of the selected entry with the current pending replacement.
function ST_promptReplaceSimilar(entryIdx, results){
  if(!ST_state.pendingReplacement){
    alert('No replacement loaded. Pick a replacement file first (from the list or external).');
    return;
  }
  var thresh = prompt('Replace SELECTED and all files with perceptual distance ≤ N.\\n\\nDistance interpretation:\\n  0 = identical fingerprint\\n  1-5 = very similar (recommended for "same sound" replacement)\\n  6-15 = similar\\n  16+ = probably different\\n\\nEnter max distance:', '5');
  if(thresh === null) return;
  var t = parseInt(thresh);
  if(!isFinite(t) || t < 0){ alert('Invalid number'); return; }
  var matched = results.filter(function(r){ return r.distance <= t; });
  if(matched.length === 0){
    alert('No files within distance '+t+'. Try a higher threshold.');
    return;
  }
  if(!confirm('Replace SELECTED + '+matched.length+' similar files (distance ≤ '+t+') with the loaded replacement?\\n\\nTotal files affected: '+(matched.length+1))) return;
  var allIdx = [entryIdx].concat(matched.map(function(r){ return r.idx; }));
  var rep = ST_state.pendingReplacement;
  var idx = 0;
  function doNext(){
    if(idx >= allIdx.length){
      ST_renderList();
      ST_renderHistory();
      ST_selectFromList(ST_state.selectedIdx);
      ST_updateSwapBtn();
      ST_updateExportBtn();
      return;
    }
    var entry = ST_state.entries[allIdx[idx]];
    if(!entry.modified){
      ST_state.zip.file(entry.path).async('uint8array').then(function(origData){
        entry.originalData = origData;
        ST_state.zip.file(entry.path, rep.data);
        entry.modified = true;
        entry.size = rep.data.length;
        entry.format = rep.format;
        entry.replacementName = rep.name + ' (similar batch of '+allIdx.length+')';
        idx++;
        doNext();
      });
    } else {
      ST_state.zip.file(entry.path, rep.data);
      entry.size = rep.data.length;
      entry.format = rep.format;
      entry.replacementName = rep.name + ' (similar batch of '+allIdx.length+')';
      idx++;
      doNext();
    }
  }
  doNext();
}
function ST_revertSelected(){
  if(ST_state.selectedIdx < 0) return;
  var entry = ST_state.entries[ST_state.selectedIdx];
  if(!entry.modified || !entry.originalData) return;
  ST_state.zip.file(entry.path, entry.originalData);
  entry.modified = false;
  entry.size = entry.originalData.length;
  entry.format = ST_parseWavHeader(entry.originalData);
  delete entry.replacementName;
  ST_renderList();
  ST_renderHistory();
  ST_selectFromList(ST_state.selectedIdx);
  ST_updateSwapBtn();
  ST_updateExportBtn();
}
function ST_renderHistory(){
  var el = document.getElementById('stHistory');
  if(!el) return;
  var mods = ST_state.entries.filter(function(e){ return e.modified; });
  if(mods.length === 0){ el.innerHTML='No swaps yet.'; return; }
  var html = '<div style="color:#aaa;margin-bottom:4px">'+mods.length+' modified:</div>';
  for(var i=0; i<mods.length; i++){
    html += '<div style="margin-bottom:2px;font-size:10px"><span style="color:#fa7">●</span> '+mods[i].path+(mods[i].replacementName?' ← '+mods[i].replacementName:'')+'</div>';
  }
  el.innerHTML = html;
}
function ST_updateExportBtn(){
  var btn = document.getElementById('stExport');
  if(!btn) return;
  var modCount = ST_state.entries.filter(function(e){ return e.modified; }).length;
  btn.disabled = !(ST_state.zip && modCount > 0);
  btn.textContent = modCount > 0 ? ('💾 Export modified archive ('+modCount+' swap'+(modCount===1?'':'s')+')') : '💾 Export modified archive';
}
function ST_exportArchive(){
  if(!ST_state.zip) return;
  var prog = document.getElementById('stProgress');
  prog.style.display='block';
  prog.textContent='Re-compressing archive... (may take a few seconds for 12 MB)';
  ST_state.zip.generateAsync({type:'blob', compression:'DEFLATE'}, function(meta){
    prog.textContent = 'Re-compressing archive... ' + (meta.percent|0) + '%';
  }).then(function(blob){
    prog.style.display='none';
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    // Output name: original_name → original_name_modified.ext
    var base = ST_state.origArchiveName.replace(/\.(mgz|zip)$/i, '');
    var ext = ST_state.origArchiveName.match(/\.(mgz|zip)$/i);
    var extStr = ext ? ext[0] : '.mgz';
    a.download = base + '_modified' + extStr;
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 200);
  }).catch(function(err){
    prog.textContent='Export error: ' + err.message;
  });
}

// ============================================================
