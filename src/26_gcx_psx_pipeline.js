// ═══════════════════════════════════════════════════════════════════════════
// FILE: 26_gcx_psx_pipeline.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCX PSX PIPELINE — Load/Save UI integration
// ============================================================
// Adds the editor's PSX track:
//   * Load .gcx (PSX)       — parses .gcx, builds entities, populates gclEntities[]
//   * Save .gcx (PSX)       — writes entity edits back to AST, encodes, downloads
//   * Patch STAGE.DIR       — uploads STAGE.DIR, replaces the loaded .gcx's bytes
//                             at its found offset, downloads modified STAGE.DIR
//
// PC pipeline (loading .gcl, exporting .gcl) is left completely untouched.
// Buttons are floating, so no toolbar code is modified.
//
// State machine:
//   editorMode = 'pc'  — PC .gcl flow (default; existing behavior)
//   editorMode = 'psx' — PSX .gcx flow (after Load .gcx pressed)

var editorMode = (typeof editorMode === 'undefined') ? 'pc' : editorMode;
var PSX_BUILD = 'PSX_52'; // build stamp — surfaced in patch dialogs so the active build is unambiguous
try { console.log('%cMGS Stage Editor build ' + PSX_BUILD, 'font-weight:bold'); } catch (e) {}
var psxGcx = null;        // currently loaded .gcx AST
var psxGcxName = '';      // original filename
var psxGcxOriginal = null; // original Uint8Array (for offset re-search in STAGE.DIR)
var psxGcxBytes = null;    // size-cached bytes (== psxGcxOriginal length)

function loadGcxFile(file, onDone) {
  var rd = new FileReader();
  rd.onload = function(ev) {
    try {
      var bytes = new Uint8Array(ev.target.result);
      psxGcx = gcxParseGCX(bytes);
      psxGcxName = file.name;
      psxGcxOriginal = bytes;
      psxGcxBytes = bytes.length;

      // Build entities from the AST and replace the editor's gclEntities[]
      var built = gcxBuildEntities(psxGcx);
      if (typeof gclEntities !== 'undefined') {
        gclEntities.length = 0;
        for (var i = 0; i < built.length; i++) gclEntities.push(built[i]);
        if (typeof selGCL !== 'undefined') selGCL = -1;
      }

      // Switch mode
      editorMode = 'psx';
      psxUpdateModeUI();

      // Refresh the editor's 3D and panels
      if (typeof rebuildGCLVis === 'function') rebuildGCLVis();
      if (typeof updateGCLPanel === 'function') updateGCLPanel();
      if (typeof showGCLProps === 'function') showGCLProps();
      // CRITICAL: GCX-defined OBSTACLE/PUT_OBJECT entries position the
      // tank/door/object submodels at their world coordinates. Without this,
      // every submodel renders at (0,0,0). Same fix as GCL's handleGCLFile.
      //
      // On PSX, STAGE.DIR loads ALL KMDs into kmdBufs (since they're all
      // separate files in the dir). The ones referenced by an OBSTACLE/
      // PUT_OBJECT entry are actually submodels meant to be positioned, not
      // static stage geometry. Reclassify them: pull from kmdBufs into
      // mdlSubModels so rebuildSubModels can place them correctly.
      reclassifyPsxKmdsAsSubmodels();
      if (typeof rebuildKMD === 'function') rebuildKMD();
      if (typeof rebuildSubModels === 'function') rebuildSubModels();

      console.log('PSX .gcx loaded: ' + built.length + ' entities from ' + file.name);
      if (onDone) onDone(null, built.length);
    } catch (err) {
      console.error('Error parsing .gcx:', err);
      alert('Error parsing .gcx: ' + err.message);
      if (onDone) onDone(err);
    }
  };
  rd.readAsArrayBuffer(file);
}

// After GCX is loaded, look at every kmdBufs entry that came from STAGE.DIR
// (filename pattern "{idx}_{hash}.kmd"). If its hash matches an OBSTACLE or
// PUT_OBJECT entity's -m model hash, that KMD is a submodel — pull it from
// kmdBufs into mdlSubModels so rebuildSubModels places it at the entity's
// world coordinates instead of leaving it at the origin.
//
// KMDs in kmdBufs whose hash is NOT referenced stay where they are (treated
// as static stage geometry).
function reclassifyPsxKmdsAsSubmodels() {
  if (typeof gclEntities === 'undefined' || typeof kmdBufs === 'undefined') return;
  if (typeof mdlSubModels === 'undefined') return;

  // Collect referenced model hashes. Any entity with a modelHash counts, no
  // matter the type. modelHash is set by the entity builder whenever a -m
  // option carries a STRID — so WALL, DOOR, OBSTACLE, PUT_OBJECT, BREAK_OBJECT,
  // DRUMCAN2 and any future type all qualify. Entities whose -m is non-STRID
  // (FADEIO -m 0, MGREX -m <stats>) have modelHash undefined and are skipped.
  var referenced = {};  // hash → true
  for (var i = 0; i < gclEntities.length; i++) {
    var e = gclEntities[i];
    if (typeof e.modelHash === 'number') referenced[e.modelHash & 0xFFFF] = true;
  }
  if (Object.keys(referenced).length === 0) return;

  var moved = 0;
  // Walk kmdBufs in reverse so removals don't disturb earlier indices.
  for (var k = kmdBufs.length - 1; k >= 0; k--) {
    var name = (typeof kmdFileNames !== 'undefined') ? kmdFileNames[k] : null;
    if (!name) continue;
    // Match the MMS naming "{idx}_{hash}.kmd"
    var m = /^(\d+)_(\d+)\.kmd$/i.exec(name);
    if (!m) continue;
    var hash = parseInt(m[2], 10) & 0xFFFF;
    if (!referenced[hash]) continue;

    // Move this KMD into mdlSubModels under the same name.
    mdlSubModels[name] = { buf: kmdBufs[k], name: name };

    // CRITICAL: set ent.model on every entity referencing this hash. The
    // STAGE.DIR-synthetic filename (e.g. "13_28005.kmd") doesn't hash back to
    // the original model hash via mgsHash, so rebuildSubModels' existing
    // hash-to-name fallback can't resolve it. We bind by name directly here.
    var basename = name.replace(/\.kmd$/i, '');
    for (var ei = 0; ei < gclEntities.length; ei++) {
      var ent = gclEntities[ei];
      if (typeof ent.modelHash !== 'number') continue;
      if ((ent.modelHash & 0xFFFF) === hash) ent.model = basename;
    }

    // Remove from kmdBufs so it doesn't render at origin
    kmdBufs.splice(k, 1);
    if (typeof kmdFileNames !== 'undefined') kmdFileNames.splice(k, 1);
    if (typeof kmdVisible !== 'undefined') kmdVisible.splice(k, 1);
    moved++;
  }

  if (moved > 0) {
    console.log('PSX GCX: moved ' + moved + ' KMD(s) from main stage list into submodel placements');
    // Keep the model-DAR info line in sync if it's visible
    var info = document.getElementById('mdl-info');
    if (info) info.textContent = Object.keys(mdlSubModels).length + ' models';
  }
}

// Re-encode the current AST with entity-edits applied, return Uint8Array.
function buildPsxGcxBytes() {
  if (!psxGcx) throw new Error('No PSX .gcx loaded');
  var n = gcxWriteEntitiesBack(gclEntities);
  console.log('  wrote back ' + n + ' value(s) to AST');
  var out = gcxEncodeGCX(psxGcx);
  return out;
}

// Trigger a download of arbitrary bytes with a given filename.
function psxDownloadBytes(bytes, filename) {
  var blob = new Blob([bytes], { type: 'application/octet-stream' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function savePsxGcx() {
  if (!psxGcx) {
    alert('No PSX .gcx loaded. Click "Load .gcx" first.');
    return;
  }
  try {
    var out = buildPsxGcxBytes();
    if (psxGcxBytes !== null && out.length !== psxGcxBytes) {
      var ok = confirm('WARNING: output size (' + out.length + ' bytes) differs from original (' +
                       psxGcxBytes + ' bytes). This will likely break the paired .bin relocation table. ' +
                       'Save anyway?');
      if (!ok) return;
    }
    var outName = psxGcxName.replace(/\.gcx$/i, '') + '_modified.gcx';
    psxDownloadBytes(out, outName);
    console.log('Saved ' + outName + ' (' + out.length + ' bytes)');
  } catch (err) {
    console.error('savePsxGcx error:', err);
    alert('Error saving .gcx: ' + err.message);
  }
}

// Patch the loaded .gcx back into a STAGE.DIR.
// - Same size  -> fast in-place byte replace (patches every match).
// - Size change -> structured repack: find the containing stage + member,
//   splice the larger .gcx, and shift downstream stages (minimal-splice).
// Returns { ok, offset, count, output (Uint8Array), sizeDelta } or { ok:false, error }.
function patchStageDirBytes(stageBytes) {
  if (!psxGcx || !psxGcxOriginal) {
    return { ok: false, error: 'No PSX .gcx loaded' };
  }
  var newBytes = buildPsxGcxBytes();
  var orig = psxGcxOriginal;
  var stage = stageBytes;

  // --- Diagnostic: did the edits actually reach the GCX? ---
  // The #1 cause of "my edits didn't save" is the rebuilt .gcx coming out
  // identical to the original — meaning the change went to the on-screen entity
  // list (or the GCL text, which is inspection-only on PSX) but never mutated the
  // GCX AST that gets encoded. Detect that explicitly rather than exporting an
  // unchanged file and leaving the user to discover it in-game.
  var entitiesBefore = -1, entitiesAfter = -1;
  try { entitiesBefore = gcxBuildEntities(gcxParseGCX(orig)).length; } catch (e) {}
  try { entitiesAfter = gcxBuildEntities(psxGcx).length; } catch (e) {}

  // Round-trip stability: re-encoding the UNMODIFIED loaded .gcx must reproduce it
  // byte-for-byte. If it doesn't, the editor's encoder doesn't faithfully round-trip
  // THIS particular .gcx, and any edit will overwrite the slot with bytes the stage
  // doesn't expect — a load crash. This is the single most useful thing to know.
  var rtStable = true, rtDelta = 0;
  try {
    var rt = gcxEncodeGCX(gcxParseGCX(orig));
    rtDelta = rt.length - orig.length;
    rtStable = (rtDelta === 0);
    if (rtStable) { for (var q = 0; q < rt.length; q++) { if (rt[q] !== orig[q]) { rtStable = false; break; } } }
  } catch (e) { rtStable = false; }
  if (!rtStable) {
    return { ok: false, error: '[' + PSX_BUILD + '] The loaded .gcx does NOT round-trip cleanly through the editor ' +
      '(re-encoding the UNMODIFIED original differs' + (rtDelta ? ' by ' + rtDelta + ' bytes' : ' in content') + ').\n\n' +
      'That means saving ANY edit would write bytes the stage doesn\u2019t expect \u2014 the crash you saw. This usually means the .gcx ' +
      'was produced by another tool, or carries a structure the encoder normalizes differently. Please send me this exact .gcx ' +
      '(click "Save .gcx" on this stage and share the file) so I can fix the encoder to preserve it.' };
  }

  var identical = (newBytes.length === orig.length);
  if (identical) { for (var z = 0; z < orig.length; z++) { if (newBytes[z] !== orig[z]) { identical = false; break; } } }
  if (identical) {
    return { ok: false, error: '[' + PSX_BUILD + '] The rebuilt .gcx is byte-identical to the original — your edits did NOT reach the GCX ' +
      '(entities: ' + entitiesBefore + ', unchanged).\n\n' +
      'That means the change only touched the on-screen list, not the script. On PSX, editing the GCL text is inspection-only, and ' +
      'older builds\u2019 +Enemy/SpawnWiz didn\u2019t write to the GCX. Use Duplicate or +Enemy on PSX_50+ (they clone into the GCX), ' +
      'set the Route in Properties and click Apply, then patch. If you ARE on PSX_50+ and see this, tell me — it means the edit path is broken.' };
  }

  // Locate the original .gcx bytes inside STAGE.DIR.
  var positions = [];
  var searchEnd = stage.length - orig.length;
  outer: for (var i = 0; i <= searchEnd; i++) {
    for (var j = 0; j < orig.length; j++) {
      if (stage[i + j] !== orig[j]) continue outer;
    }
    positions.push(i);
    i += orig.length - 1;
  }
  if (positions.length === 0) {
    return { ok: false, error: 'Could not find original .gcx bytes inside STAGE.DIR. ' +
             'Was this STAGE.DIR extracted from the same ISO version as the .gcx?' };
  }

  // ---- Same-size: keep the fast in-place overwrite (all matches) ----
  if (newBytes.length === orig.length) {
    if (positions.length > 1) console.warn('Found ' + positions.length + ' matches; patching all of them');
    var out0 = new Uint8Array(stage.length);
    out0.set(stage);
    for (var k = 0; k < positions.length; k++) out0.set(newBytes, positions[k]);
    return { ok: true, offset: positions[0], count: positions.length, output: out0, sizeDelta: 0,
             entitiesBefore: entitiesBefore, entitiesAfter: entitiesAfter,
             verified: _gcxBytesPresent(out0, newBytes) };
  }

  // ---- Size change: structured, size-aware repack via module 29 ----
  if (typeof sdirParseOuter !== 'function' || typeof sdirParseStage !== 'function' ||
      typeof sdirRebuildStageDirPSX !== 'function') {
    return { ok: false, error: 'New .gcx size (' + newBytes.length + ') differs from original (' +
             orig.length + '), and the size-aware repacker is unavailable in this build.' };
  }

  var stages = sdirParseOuter(stage);
  // Which stage contains the matched .gcx offset?
  var hitPos = positions[0], si = -1;
  for (var s = 0; s < stages.length; s++) {
    var nextOff = (s + 1 < stages.length) ? stages[s + 1].byteOff : stage.length;
    if (hitPos >= stages[s].byteOff && hitPos < nextOff) { si = s; break; }
  }
  if (si < 0) return { ok: false, error: 'Matched .gcx is not inside any stage region.' };
  var st = stages[si];

  // Which member of that stage is the .gcx? Match by bytes.
  var parsed = sdirParseStage(stage.subarray(st.byteOff, st.byteOff + st.size));
  var mi = -1;
  for (var e = 0; e < parsed.entries.length; e++) {
    var en = parsed.entries[e];
    if (en.data && en.data.length === orig.length) {
      var eq = true;
      for (var b = 0; b < orig.length; b++) { if (en.data[b] !== orig[b]) { eq = false; break; } }
      if (eq) { mi = e; break; }
    }
  }
  if (mi < 0) return { ok: false, error: 'Found the .gcx in stage "' + st.name +
                       '" but could not match it to a member entry for repacking.' };

  // Drive the validated minimal-splice repacker.
  window.stageDir = { data: stage, stages: stages, mods: {}, isPC: false };
  stageDir.mods['gcxpatch'] = { bytes: newBytes, origSize: orig.length,
                                stageName: st.name, entryIdx: mi, label: st.name + ' .gcx' };
  var out = sdirRebuildStageDirPSX();
  return { ok: true, offset: hitPos, count: 1, output: out, sizeDelta: out.length - stage.length,
           stageName: st.name, entitiesBefore: entitiesBefore, entitiesAfter: entitiesAfter,
           verified: _gcxBytesPresent(out, newBytes) };
}

// True if the exact byte sequence `needle` appears anywhere in `hay`.
// Used as a post-patch self-check: the edited .gcx must be physically present
// in the output, or the patch silently did nothing.
function _gcxBytesPresent(hay, needle) {
  var end = hay.length - needle.length;
  outer2: for (var i = 0; i <= end; i++) {
    for (var j = 0; j < needle.length; j++) { if (hay[i + j] !== needle[j]) continue outer2; }
    return true;
  }
  return false;
}

// "Save & patch STAGE.DIR" — prompts user to upload STAGE.DIR, patches, downloads.
function savePsxPatchStageDir() {
  if (!psxGcx) {
    alert('No PSX .gcx loaded. Click "Load .gcx" first.');
    return;
  }
  var fileInput = document.getElementById('psxStageDirIn');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'psxStageDirIn';
    fileInput.accept = '.dir,.DIR';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }
  fileInput.onchange = function(e) {
    var f = e.target.files[0];
    if (!f) return;
    if (!confirm('Patch ' + f.name + ' (' + (f.size / 1024 / 1024).toFixed(1) +
                 ' MB) with the modified .gcx? The output will be downloaded as ' +
                 f.name + ' (with edits applied).')) return;
    var rd = new FileReader();
    rd.onload = function(ev) {
      var stageBytes = new Uint8Array(ev.target.result);
      var result = patchStageDirBytes(stageBytes);
      if (!result.ok) {
        alert('Could not patch STAGE.DIR: ' + result.error);
        return;
      }
      console.log('Patched STAGE.DIR at offset 0x' + result.offset.toString(16) +
                  ' (' + result.count + ' match' + (result.count > 1 ? 'es' : '') + ')');
      psxDownloadBytes(result.output, f.name);
      var deltaMsg;
      if (result.sizeDelta === 0) {
        deltaMsg = 'Same-size patch (' + result.count + ' location' + (result.count > 1 ? 's' : '') + ').';
      } else {
        var dSec = Math.round(result.sizeDelta / 2048);
        deltaMsg = 'Size-aware repack of stage "' + (result.stageName || '?') + '": .gcx grew ' +
                   (result.sizeDelta > 0 ? '+' : '') + result.sizeDelta + ' bytes (' +
                   (dSec > 0 ? '+' : '') + dSec + ' sector' + (Math.abs(dSec) === 1 ? '' : 's') +
                   '); downstream stages shifted automatically.';
      }
      var entMsg = (result.entitiesBefore >= 0 && result.entitiesAfter >= 0)
        ? '\nEntities: ' + result.entitiesBefore + ' \u2192 ' + result.entitiesAfter +
          (result.entitiesAfter === result.entitiesBefore ? ' (no count change \u2014 a route/position edit, not an add)' : '')
        : '';
      var verMsg = result.verified
        ? '\nVERIFIED \u2713 the edited .gcx is physically present in the exported STAGE.DIR.'
        : '\n\u26A0 WARNING: could not find the edited .gcx in the output \u2014 the patch may not have applied. Tell me if you see this.';
      alert('[' + PSX_BUILD + '] Done. ' + deltaMsg + entMsg + verMsg +
            '\n\nModified STAGE.DIR downloaded. Build the ISO with mkpsxiso to test in-game.');
    };
    rd.readAsArrayBuffer(f);
  };
  // Reset so re-selecting the same file fires change
  fileInput.value = '';
  fileInput.click();
}

// Switch back to PC mode (resets PSX state, clears entities).
function exitPsxMode() {
  editorMode = 'pc';
  psxGcx = null;
  psxGcxName = '';
  psxGcxOriginal = null;
  psxGcxBytes = null;
  // Optionally clear gclEntities — only if user confirms
  if (gclEntities.length > 0) {
    if (confirm('Clear ' + gclEntities.length + ' currently loaded entities? ' +
                '(Pick Cancel to keep them and switch mode only.)')) {
      gclEntities.length = 0;
      if (typeof selGCL !== 'undefined') selGCL = -1;
      if (typeof rebuildGCLVis === 'function') rebuildGCLVis();
      if (typeof showGCLProps === 'function') showGCLProps();
    }
  }
  psxUpdateModeUI();
}

// ---------- UI ----------

function psxUpdateModeUI() {
  var bar = document.getElementById('psxButtonBar');
  if (!bar) return;
  var modeLabel = bar.querySelector('#psxModeLabel');
  if (modeLabel) {
    modeLabel.textContent = (editorMode === 'psx') ? 'GCX' : 'OFF';
    modeLabel.style.color = (editorMode === 'psx') ? '#00ccff' : '#446688';
  }
  var saveBtn  = bar.querySelector('#psxSaveBtn');
  var patchBtn = bar.querySelector('#psxPatchBtn');
  var exitBtn  = bar.querySelector('#psxExitBtn');
  if (saveBtn)  saveBtn.disabled  = (editorMode !== 'psx');
  if (patchBtn) patchBtn.disabled = (editorMode !== 'psx');
  if (exitBtn)  exitBtn.style.display = (editorMode === 'psx') ? '' : 'none';
}

// Build the floating PSX button bar (bottom-right corner).
(function installPsxButtonBar(){
  function build() {
    if (document.getElementById('psxButtonBar')) return;
    var bar = document.createElement('div');
    bar.id = 'psxButtonBar';
    bar.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:200;' +
      'display:flex;gap:4px;align-items:center;background:#0d1219;' +
      'border:1px solid #1a2535;padding:4px 6px;border-radius:4px;' +
      'font-family:monospace;font-size:10px;';

    bar.innerHTML =
      '<span style="color:#446688">mode:</span>' +
      '<span id="psxModeLabel" style="color:#446688;font-weight:bold;min-width:24px;">PC</span>' +
      '<span style="color:#1a2535;margin:0 2px">|</span>' +
      '<input type="file" id="psxGcxIn" accept=".gcx,.GCX" style="display:none">' +
      '<button id="psxLoadBtn" class="btn" style="color:#00ccff" ' +
        'title="Load any .gcx (PC or PSX). PC users: edit + Save .gcx, drop into stage folder. PSX: also Patch STAGE.DIR.">Load .gcx</button>' +
      '<button id="psxSaveBtn" class="btn export" ' +
        'title="Write entity edits back to AST, encode, and download new .gcx">Save .gcx</button>' +
      '<button id="psxPatchBtn" class="btn export" ' +
        'title="Patch the current .gcx changes into a STAGE.DIR you upload, ' +
        'then download the modified container.">Patch STAGE.DIR</button>' +
      '<button id="psxExitBtn" class="btn danger" style="display:none" ' +
        'title="Exit PSX mode and return to PC pipeline.">✕</button>';

    document.body.appendChild(bar);

    document.getElementById('psxLoadBtn').onclick = function() {
      document.getElementById('psxGcxIn').click();
    };
    document.getElementById('psxGcxIn').onchange = function(e) {
      var f = e.target.files[0];
      if (f) loadGcxFile(f);
    };
    document.getElementById('psxSaveBtn').onclick = savePsxGcx;
    document.getElementById('psxPatchBtn').onclick = savePsxPatchStageDir;
    document.getElementById('psxExitBtn').onclick = exitPsxMode;

    psxUpdateModeUI();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();

// ============================================================
