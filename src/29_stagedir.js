// ═══════════════════════════════════════════════════════════════════════════
// FILE: 29_stagedir.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ─────────────────────────────────────────────────────────────────────────
// STAGE.DIR full-container support (Phase A)
//
// Lets the user load the game's whole STAGE.DIR file, browse stages,
// extract individual files, load them into the existing editor, and save
// the modified STAGE.DIR back out. Replaces the older byte-search "Patch
// STAGE.DIR" flow for cases where the user wants to edit multiple files
// at once.
//
// Format (reverse-engineered from the PSX disc; see PSX_VRAM_FORMAT.md
// for the texture side, and CHANGES.md in the latest checkpoint for the
// STAGE.DIR side):
//   Outer:  u32 dir_body_size  +  N × { 8-byte ASCII name, u32 sector }
//           + pad to 2048-byte sector + per-stage blobs at sector boundaries.
//   Inner:  u16 magic=1, u16 size_sectors, u16 hdr_hash, 2-byte hdr_type
//           + entries 8 bytes each { u32 offset, u16 hash, 2-byte type }
//           + terminator { u32 last_file_end, 0, 0, 0, 0 }
//           + zero pad + file blobs at their offsets + final sector padding.
//
// Phase A limitations (caller is told in the save dialog):
//   * Same-size in-place edits only — a file's repacked size must be ≤ its
//     original size. The repacker zero-pads when smaller, refuses when bigger.
//   * Mystery data (sector-aligned relocation tables, etc.) is preserved
//     byte-for-byte from the original stage blob.
//
// Phase B (next session) will handle size-changing edits by relocating
// files within a stage. Phase C handles the relocation tables themselves.
// ─────────────────────────────────────────────────────────────────────────

// State for the currently-loaded STAGE.DIR. Null until the user picks a file.
var stageDir = null;
//   {
//     data: Uint8Array (the original bytes — never mutated),
//     stages: [{name, sector, byteOff, size}, ...],
//     // Pending modifications, keyed by absolute byte offset in STAGE.DIR.
//     // Each entry: { bytes: Uint8Array, origSize: number, label: string }
//     mods: {},
//   }

// Parse the outer directory of a STAGE.DIR buffer. Returns array of stages.
function sdirParseOuter(u8) {
  var dirSize = u8[0] | (u8[1] << 8) | (u8[2] << 16) | (u8[3] << 24);
  var nstages = (dirSize / 12) | 0;
  var stages = [];
  for (var i = 0; i < nstages; i++) {
    var p = 4 + i * 12;
    // Name: up to 8 bytes ASCII, null-padded
    var nameBytes = u8.subarray(p, p + 8);
    var nameEnd = 0;
    while (nameEnd < 8 && nameBytes[nameEnd] !== 0) nameEnd++;
    var name = String.fromCharCode.apply(null, Array.from(nameBytes.subarray(0, nameEnd)));
    var sector = u8[p+8] | (u8[p+9] << 8) | (u8[p+10] << 16) | (u8[p+11] << 24);
    var byteOff = sector * 2048;
    // size is recorded inside each stage's own header (u16 at offset 2)
    var sizeSec = u8[byteOff+2] | (u8[byteOff+3] << 8);
    stages.push({name: name, sector: sector, byteOff: byteOff, size: sizeSec * 2048});
  }
  return stages;
}

// Parse a single stage. Returns { field0, field1, sizeSec, entries[] }.
// Each entry: { hash, mode, ext, sizeField, size, type (2 bytes for legacy
// display), data (Uint8Array|null), stageDataOff }.
//
// Format (verified against MetalMintSolid source, Stg/*.cs):
//   StgHeader (4 bytes):
//     u8  Field0
//     u8  Field1
//     i16 Size (in 2048-byte sectors, including the header sector)
//   StgConfig list (8 bytes each, terminated by entry with Mode == 0):
//     u16 Hash
//     u8  Mode      ('c' = cached/packed, 'n'/'s' = sector-aligned regular)
//     u8  Extension (byte → file extension, see SDIR_EXT_BY_BYTE)
//     u32 Size      (for regular files: actual byte size;
//                    for cached entries: cumulative offset into the cached
//                    section, real size = configs[i+1].Size - configs[i].Size;
//                    for the end-of-cached marker (ext == 0xFF): cumulative
//                    end of cached section)
//   File data starts at stage byte offset 2048, packed in config order.
//   After each regular (non-'c') entry, the stream is padded to the next
//   2048-byte sector. Cached entries are packed tightly until an Extension
//   == 0xFF marker, after which the stream is also padded to the next sector.
function sdirParseStage(stageBytes) {
  var field0 = stageBytes[0];
  var field1 = stageBytes[1];
  var sizeSec = (stageBytes[2] | (stageBytes[3] << 8));
  // Sign-extend i16
  if (sizeSec & 0x8000) sizeSec -= 0x10000;

  var configs = [];
  var p = 4;
  while (p + 8 <= stageBytes.length) {
    var hash = stageBytes[p] | (stageBytes[p+1] << 8);
    var mode = stageBytes[p+2];
    var ext  = stageBytes[p+3];
    var size = stageBytes[p+4] | (stageBytes[p+5] << 8) |
               (stageBytes[p+6] << 16) | (stageBytes[p+7] << 24);
    p += 8;
    if (mode === 0) break;  // terminator (Mode == 0)
    configs.push({hash: hash, mode: mode, ext: ext, sizeField: size});
  }

  // Walk the data area to compute actual sizes and stage offsets per entry.
  var dataPos = 2048;
  var entries = [];
  for (var i = 0; i < configs.length; i++) {
    var c = configs[i];
    var actualSize = 0;
    var hasData = true;
    if (c.ext === 0xFF) {
      // End-of-cached marker — not a real file, just a stream alignment hint.
      var pad = (2048 - (dataPos & 0x7ff)) & 0x7ff;
      dataPos += pad;
      hasData = false;
    } else if (c.mode === 0x63 /* 'c' */) {
      // Cached entry: real size from next config's cumulative offset.
      // The next config is guaranteed to exist for any 'c' entry in practice
      // (a cached section always ends with a 0xFF marker).
      if (i + 1 < configs.length) {
        actualSize = configs[i+1].sizeField - c.sizeField;
      } else {
        actualSize = 0;
      }
    } else {
      // Regular sector-aligned entry.
      actualSize = c.sizeField;
    }

    var entry = {
      hash: c.hash,
      mode: c.mode,
      ext: c.ext,
      sizeField: c.sizeField,  // raw u32 from the config, for save/round-trip
      size: actualSize,
      // Legacy 'type' field as a 2-byte view (mode, ext) for any code paths
      // that still want to display the old MMS-style "ck", "ch", "nd" code.
      type: new Uint8Array([c.mode, c.ext]),
      stageDataOff: hasData ? dataPos : -1,
      data: hasData ? stageBytes.subarray(dataPos, dataPos + actualSize) : null,
    };
    entries.push(entry);

    if (hasData) {
      dataPos += actualSize;
      if (c.mode !== 0x63 /* not 'c' */) {
        // Regular files are sector-aligned; pad to next 2048-byte boundary.
        var pad2 = (2048 - (dataPos & 0x7ff)) & 0x7ff;
        dataPos += pad2;
      }
    }
  }

  return {
    field0: field0,
    field1: field1,
    sizeSec: sizeSec,
    entries: entries,
    // Legacy aliases for code that still expects the old shape
    magic: field0,
    hdrHash: 0,
    hdrType: new Uint8Array([0, 0]),
    terminatorOff: null,
  };
}

// File type → extension mapping. The MGS engine uses 2-byte type codes in the
// stage directory. The SECOND byte determines the file extension; the first
// is a category nibble the engine uses internally (e.g. 'c' = stage content,
// 's' = sound/script, 'n' = nodata). Mapping is from the MGS Dev Wiki and
// confirmed against MetalMintSolid output.
var SDIR_EXT_BY_BYTE = {
  0x61: "azm",  // archive
  0x62: "bin",  // relocation/header
  0x63: "con",  // configuration
  0x64: "dar",  // data archive (textures, models, etc.)
  0x65: "efx",  // effects/sound effects
  0x67: "gcx",  // compiled game script
  0x68: "hzm",  // collision / horizontal zone map
  0x69: "img",  // image
  0x6b: "kmd",  // 3D model
  0x6c: "lit",  // lighting data
  0x6d: "mt3",  // multi-track sound
  0x6f: "oar",  // collision/object array (also animation)
  0x70: "pcc",  // ?
  0x72: "rar",  // ?
  0x73: "sgt",  // sound (SGT MIDI-like)
  0x77: "wvx",  // wave audio
  0x7a: "zmd",  // ?
  0xff: "dar",  // special-case DAR
};

// MMS-style filename for a directory entry: "{idx}_{hash_decimal}.{ext}".
// MMS uses the entry's position in the config list as its index, with index 0
// being the first real entry (typically the bin file). Same as we use here.
// For PC .mgz entries we already have the real filename — use that instead.
function sdirFilename(entry, idx) {
  if (entry._pcName) return entry._pcName;
  var extByte = (entry.ext !== undefined) ? entry.ext : entry.type[1];
  var ext = SDIR_EXT_BY_BYTE[extByte];
  if (!ext) {
    ext = "x" + extByte.toString(16).padStart(2, "0");
  }
  return idx + "_" + entry.hash + "." + ext;
}

// Small color hint by cnf flag — resident files (essential) get a warm gold,
// nocache (textures/bin) a cyan, cache (everything else) muted gray, sound
// purple. Mirrors how the engine treats each category.
function cnfFlagColor(flag) {
  if (!flag) return "#666";
  switch (flag.toLowerCase()) {
    case "resident": return "#ffcc66";
    case "nocache":  return "#66ccdd";
    case "sound":    return "#cc99dd";
    case "cache":    return "#888";
    default:         return "#aaa";
  }
}

// Sniff a file's content to decide if we can auto-load it AND what kind of
// loader to use. The TYPE-CODE extension is the primary signal — the engine
// already encodes the file kind in the directory entry, so trust it. Content
// sniffing only serves as a fallback for unknown type codes.
function sdirSniffFile(typeBytes, hash, data) {
  var t1 = typeBytes[1];
  var ext = SDIR_EXT_BY_BYTE[t1] || null;

  if (!data || data.length < 4) {
    return {ext: ext, label: (ext || "?") + " (external/small)", canLoad: false};
  }

  if (ext === "kmd") {
    return {
      ext: "kmd",
      label: "KMD model",
      canLoad: true,
      loader: function(bytes, name) {
        var ab = new ArrayBuffer(bytes.length);
        new Uint8Array(ab).set(bytes);
        kmdBufs.push(ab);
        kmdFileNames.push(name);
        kmdVisible.push(true);
        if (typeof rebuildKMD === "function") rebuildKMD();
        if (typeof updateKMDList === "function") updateKMDList();
      }
    };
  }
  if (ext === "hzm") {
    // Always offer load — parseHZM will tell us if the bytes aren't a valid
    // HZM. STAGE.DIR contains HZMs of wildly varying sizes (small per-KMD
    // collision attachments at ~180 bytes alongside the main stage HZM at 13KB+).
    // Multi-floor stages (s11a, s14b etc) have MULTIPLE substantial HZMs;
    // each one is a separate floor/zone of the stage. We merge them at load
    // time so the editor renders the full stage in one view.
    return {
      ext: "hzm",
      label: "HZM collision",
      canLoad: true,
      loader: function(bytes, name) {
        try {
          var ab = new ArrayBuffer(bytes.length);
          new Uint8Array(ab).set(bytes);
          var newHzm = parseHZM(ab);

          // Detect: is a primary HZM already loaded that we should merge into?
          var hasPrimary = (typeof hzm !== 'undefined' && hzm && hzm.areas && hzm.areas.length > 0);
          // Tiny HZMs (<500 B) are per-KMD collision attachments, not floors.
          // Even if a primary is loaded, treat these as standalone replacement
          // candidates (the user is debugging an attachment in isolation).
          var isAttachment = bytes.length < 500;

          if (hasPrimary && !isAttachment) {
            // MERGE: append the new HZM's areas to the existing hzm.areas[],
            // renumbering each area's per-element `ai` indices to keep them
            // consistent. navZones are flat and just concatenate. Routes stay
            // with the primary HZM only (route remapping across files would
            // need its own merge logic, which the user has in hzm_merger.py
            // for export).
            var prevAreaCount = hzm.areas.length;
            for (var ai = 0; ai < newHzm.areas.length; ai++) {
              var a = newHzm.areas[ai];
              var newAi = prevAreaCount + ai;
              for (var ni = 0; ni < a.navfaces.length; ni++) a.navfaces[ni].ai = newAi;
              for (var fi = 0; fi < a.floors.length; fi++) a.floors[fi].ai = newAi;
              for (var zi = 0; zi < a.zones.length; zi++) a.zones[zi].ai = newAi;
              a._sourceFile = name;       // origin tracking
              a._appended = true;          // editing-disabled flag for the UI
              hzm.areas.push(a);
            }
            hzm.ac = hzm.areas.length;
            for (var nz = 0; nz < newHzm.navZones.length; nz++) {
              hzm.navZones.push(newHzm.navZones[nz]);
            }
            hzm.nzCount = hzm.navZones.length;
            console.log('HZM merge: ' + name + ' added ' + newHzm.areas.length +
                        ' area(s), ' + newHzm.navZones.length + ' navZone(s) ' +
                        '(primary HZM stays editable; secondary loaded for view)');
            if (typeof showEd === "function") showEd();
            if (typeof takeSnapshot === "function") takeSnapshot("Merged " + name);
          } else {
            // PRIMARY load — replace, fresh selection state
            hzm = newHzm;
            selW = {}; colW = {}; newW = [];
            selF = {}; colF = {}; newF = [];
            selZ = {}; colZ = {}; newZ = [];
            newNavZones = []; undoHist = []; clipboard = [];
            selRoute = -1; selWP = -1; selNavZone = -1; selGCL = -1;
            if (typeof showEd === "function") showEd();
            if (typeof takeSnapshot === "function") takeSnapshot("Loaded " + name + " from STAGE.DIR");
          }
        } catch (e) {
          alert("HZM " + name + " parse failed: " + e.message +
                "\n\nThis HZM is " + bytes.length + " bytes — small HZMs " +
                "(under ~500 B) are usually per-KMD collision attachments rather " +
                "than full stage collision and may not load standalone. " +
                "The main stage HZM is usually the largest one in the list.");
        }
      }
    };
  }
  if (ext === "gcx") {
    return {
      ext: "gcx",
      label: "GCX script",
      canLoad: true,
      loader: function(bytes, name) {
        try {
          var blob = new Blob([bytes]);
          blob.name = name;
          loadGcxFile(blob);
        } catch (e) {
          sdirDownloadBytes(bytes, name);
          alert("Saved " + name + " to downloads — click 'Load .gcx' to apply it manually.");
        }
      }
    };
  }
  if (ext === "dar") {
    // Three subcases for DAR archives:
    //   1. PSX stage texture DARs — PCX-signature bytes 0x0a 0x05 0x01 at byte 8
    //   2. PC stg_mdl*.dar — model archive of KMDs (PC format: u32 filecount + entries)
    //   3. PC stg_tex*.dar — texture archive of PCX files (same PC format, KMD vs PCX
    //      determined by entry filename extension)
    var looksLikeTextureDarPsx =
        data.length >= 16 &&
        data[8] === 0x0a && data[9] === 0x05 && data[10] === 0x01;
    if (looksLikeTextureDarPsx) {
      return {
        ext: "dar",
        label: "DAR (PSX textures)",
        canLoad: true,
        loader: function(bytes, name) {
          if (typeof handlePsxTexDAR !== "function") {
            sdirDownloadBytes(bytes, name);
            return;
          }
          handlePsxTexDAR(bytes, name);
          if (typeof darLoaded !== "undefined") darLoaded = true;
          var info = document.getElementById("dar-info");
          if (info && typeof darTextures !== "undefined") {
            info.textContent = Object.keys(darTextures).length + " textures";
          }
          if (typeof kmdBufs !== "undefined" && kmdBufs.length > 0 &&
              typeof rebuildKMD === "function") rebuildKMD();
          if (typeof updateTexPalette === "function") updateTexPalette();
          if (typeof rebuildGCLVis === "function") rebuildGCLVis();
        }
      };
    }

    // PC DAR detection — first u32 is the file count. Sanity: must be a
    // reasonable value (1..2000) and the first filename byte (at offset 4)
    // must be printable ASCII. parseDar() is the canonical PC DAR parser
    // already used by handleDARFiles and handleImportDAR.
    if (data.length >= 8 && typeof parseDar === "function") {
      var fileCount = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
      var firstNameByte = data[4];
      var nameLooksPlausible = (firstNameByte >= 0x20 && firstNameByte < 0x7F) ||
                               firstNameByte === 0x40 /* @ */;
      if (fileCount > 0 && fileCount < 2000 && nameLooksPlausible) {
        // Decide route by parent filename pattern. stg_mdl* = models, stg_tex*
        // = textures. Other DARs (rare on PC) default to texture decode since
        // that's the more common case.
        var isModelArchive = /stg_mdl/i.test(name) || /mdl\d*\.dar/i.test(name);
        return {
          ext: "dar",
          label: isModelArchive ? "DAR (PC models)" : "DAR (PC textures)",
          canLoad: true,
          loader: function(bytes, fname) {
            // parseDar wants an ArrayBuffer, not Uint8Array. Slice to a fresh
            // ArrayBuffer so the parser's DataView works on the right region
            // regardless of where the Uint8Array came from.
            var ab = bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength
            );
            var darEntries;
            try {
              darEntries = parseDar(ab);
            } catch (err) {
              console.warn("PC DAR parse failed for " + fname + ": " + err.message);
              return;
            }
            // Split entries by filename extension and route appropriately
            var kmdLoaded = 0, pcxLoaded = 0;
            for (var di = 0; di < darEntries.length; di++) {
              var de = darEntries[di];
              if (/\.kmd$/i.test(de.name)) {
                // Same path as the regular KMD file picker (line ~1825 in 04_textures.js):
                // copy bytes into a standalone ArrayBuffer and push to kmdBufs.
                var kmdAb = new ArrayBuffer(de.data.length);
                new Uint8Array(kmdAb).set(de.data);
                if (typeof kmdBufs !== "undefined") {
                  kmdBufs.push(kmdAb);
                  kmdFileNames.push(de.name);
                  kmdVisible.push(true);
                  kmdLoaded++;
                }
              } else if (/\.pcx$/i.test(de.name)) {
                // Same path as handleDARFiles does after parseDar:
                // decode PCX → CanvasTexture → darTextures[hash].
                if (typeof decodePcx !== "function" ||
                    typeof mgsHash !== "function" ||
                    typeof darTextures === "undefined") continue;
                var nameNoExt = de.name.replace(/\.pcx$/i, "");
                var hash = mgsHash(nameNoExt);
                if (typeof darRawFiles !== "undefined") {
                  darRawFiles.push({
                    name: de.name, data: de.data, darSource: fname
                  });
                }
                try {
                  var canvas = decodePcx(de.data);
                  darTextures[hash] = {
                    name: nameNoExt, canvas: canvas,
                    tex: new THREE.CanvasTexture(canvas)
                  };
                  darTextures[hash].tex.flipY = false;
                  darTextures[hash].tex.magFilter = THREE.NearestFilter;
                  darTextures[hash].tex.minFilter = THREE.NearestFilter;
                  pcxLoaded++;
                } catch (err) {
                  console.warn("PCX decode failed for " + de.name + ": " + err.message);
                }
              }
              // Other extensions (rare in stg_mdl/stg_tex) are silently skipped
            }
            // Refresh views for whichever pipeline got data
            if (kmdLoaded > 0) {
              if (typeof rebuildKMD === "function") rebuildKMD();
              if (typeof updateKMDList === "function") updateKMDList();
            }
            if (pcxLoaded > 0) {
              if (typeof darLoaded !== "undefined") darLoaded = true;
              var info = document.getElementById("dar-info");
              if (info && typeof darTextures !== "undefined") {
                info.textContent = Object.keys(darTextures).length + " textures";
              }
              if (typeof kmdBufs !== "undefined" && kmdBufs.length > 0 &&
                  typeof rebuildKMD === "function") rebuildKMD();
              if (typeof updateTexPalette === "function") updateTexPalette();
              if (typeof rebuildGCLVis === "function") rebuildGCLVis();
            }
            console.log("Loaded " + fname + ": " + kmdLoaded + " KMDs, " +
                        pcxLoaded + " PCX textures");
          }
        };
      }
    }

    // Unrecognized DAR variant — leave as downloadable but not auto-loadable
    return {ext: "dar", label: "DAR (in-stage data)", canLoad: false};
  }
  if (ext === "oar") {
    return {ext: "oar", label: "OAR (collision/anim)", canLoad: false};
  }
  if (ext === "sgt") {
    return {ext: "sgt", label: "SGT (music)", canLoad: false};
  }
  if (ext === "lit") {
    return {ext: "lit", label: "LIT (lighting)", canLoad: false};
  }
  if (ext === "con") {
    return {ext: "con", label: "CON (config)", canLoad: false};
  }
  if (ext === "wvx" || ext === "efx" || ext === "mt3") {
    return {ext: ext, label: ext.toUpperCase() + " (audio)", canLoad: false};
  }
  if (ext === "bin") {
    return {ext: "bin", label: "BIN (relocation)", canLoad: false};
  }
  if (ext) {
    return {ext: ext, label: ext.toUpperCase(), canLoad: false};
  }
  return {ext: null, label: "(unknown)", canLoad: false};
}

// Trigger a browser download for a Uint8Array blob.
function sdirDownloadBytes(bytes, filename) {
  var blob = new Blob([bytes]);
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ document.body.removeChild(a); }, 200);
}

// ─── UI ──────────────────────────────────────────────────────────────────

// Build the top-level modal: list of stages.
function sdirOpenBrowser() {
  if (!stageDir) { alert("Load a STAGE.DIR first"); return; }
  // Tear down any existing modal first
  var old = document.getElementById("sdirModal"); if (old) old.remove();
  var modal = document.createElement("div");
  modal.id = "sdirModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center";
  modal.innerHTML =
    '<div style="background:#0a0e14;border:2px solid #ff8800;border-radius:6px;width:80%;max-width:900px;max-height:85%;display:flex;flex-direction:column;color:#cde;font-family:monospace">' +
      '<div style="padding:10px 14px;border-bottom:1px solid #1a2535;display:flex;justify-content:space-between;align-items:center">' +
        '<b style="color:#ff8800">' + (stageDir.isPC ? (stageDir.pcFilename || 'stage.mgz') + ' Browser (PC)' : 'STAGE.DIR Browser (PSX)') + '</b>' +
        '<span style="color:#556">' + stageDir.stages.length + ' stages, ' + stageDir.data.length.toLocaleString() + ' bytes</span>' +
        '<button class="btn" onclick="sdirCloseModal()" style="color:#cc4444">Close</button>' +
      '</div>' +
      '<div id="sdirBody" style="overflow-y:auto;padding:8px"></div>' +
      '<div style="padding:8px 14px;border-top:1px solid #1a2535;display:flex;gap:8px;align-items:center">' +
        '<span style="color:#556;font-size:10px;flex:1">Pick a stage to browse its files</span>' +
        '<button class="btn export" onclick="sdirSave()" title="Save modifications. ' +
        (stageDir.isPC ? 'Rebuilds the .mgz ZIP with your changes.' : 'Rebuilds STAGE.DIR with size-aware repack.') + '">' +
        (stageDir.isPC ? 'Save .mgz' : 'Save STAGE.DIR') + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  sdirRenderStageList();
}

function sdirCloseModal() {
  var m = document.getElementById("sdirModal");
  if (m) m.remove();
}

function sdirRenderStageList() {
  var body = document.getElementById("sdirBody");
  if (!body) return;
  // Group by prefix letter for readability (s, d, etc.)
  var groups = {};
  for (var i = 0; i < stageDir.stages.length; i++) {
    var s = stageDir.stages[i];
    var key = s.name[0] || "?";
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  var html = '<div style="font-size:11px;color:#888;margin-bottom:6px">' +
             Object.keys(stageDir.mods).length + ' pending modification(s)</div>';
  var letters = Object.keys(groups).sort();
  for (var li = 0; li < letters.length; li++) {
    var letter = letters[li];
    html += '<div style="margin:8px 0 4px 0;color:#ff8800;font-size:10px;text-transform:uppercase">' + letter + '-stages</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:4px">';
    for (var gi = 0; gi < groups[letter].length; gi++) {
      var st = groups[letter][gi];
      // Highlight stages that have modifications
      var hasMods = false;
      var modsList = Object.keys(stageDir.mods);
      for (var mki = 0; mki < modsList.length; mki++) {
        var mo = parseInt(modsList[mki], 10);
        if (mo >= st.byteOff && mo < st.byteOff + st.size) { hasMods = true; break; }
      }
      var bg = hasMods ? "#332211" : "#101820";
      var bd = hasMods ? "#cc8833" : "#1a2535";
      // PC stages have no concept of disc sectors. Show file count instead,
      // which is more useful when browsing the MGZ layout.
      var subline = stageDir.isPC
        ? ((st._parsed.entries.length) + ' files · ' + (st.size/1024).toFixed(0) + ' KB')
        : ((st.size/1024).toFixed(0) + ' KB · sector ' + st.sector);
      html += '<div onclick="sdirOpenStage(\'' + st.name + '\')" ' +
              'style="padding:6px 8px;background:' + bg + ';border:1px solid ' + bd + ';border-radius:3px;cursor:pointer;font-size:11px" ' +
              'onmouseover="this.style.background=\'#1a2535\'" onmouseout="this.style.background=\'' + bg + '\'">' +
              '<div style="color:#cde">' + st.name + (hasMods ? ' *' : '') + '</div>' +
              '<div style="color:#556;font-size:9px">' + subline + '</div>' +
              '</div>';
    }
    html += '</div>';
  }
  body.innerHTML = html;
}

function sdirOpenStage(name) {
  var stage = null;
  for (var i = 0; i < stageDir.stages.length; i++) {
    if (stageDir.stages[i].name === name) { stage = stageDir.stages[i]; break; }
  }
  if (!stage) return;
  // Parse its inner directory on demand (cached on the stage object)
  if (!stage._parsed) {
    var stageBytes = stageDir.data.subarray(stage.byteOff, stage.byteOff + stage.size);
    stage._parsed = sdirParseStage(stageBytes);
    stage._bytes = stageBytes;
  }
  var body = document.getElementById("sdirBody");
  if (!body) return;
  var html = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">' +
             '<button class="btn" onclick="sdirRenderStageList()">← All stages</button>' +
             '<b style="color:#ff8800">' + stage.name + '</b>' +
             '<span style="color:#556">' + stage._parsed.entries.length + ' files · ' +
                stage._parsed.sizeSec + ' sectors</span>' +
             '<span style="flex:1"></span>' +
             '<button class="btn" style="color:#88ddff" ' +
                'onclick="sdirSelectStageDefault(\'' + stage.name + '\')" ' +
                'title="Check the main HZM (largest) + all KMDs + texture DARs + main GCX. Multi-floor stages (e.g. s11a) have extra HZMs you can manually check to merge additional floors on top.">★ Select stage essentials</button>' +
             '<button class="btn" onclick="sdirSelectAllLoadable(\'' + stage.name + '\', true)">all loadable</button>' +
             '<button class="btn" onclick="sdirSelectAllLoadable(\'' + stage.name + '\', false)">none</button>' +
             '<button class="btn export" onclick="sdirLoadSelected(\'' + stage.name + '\')" ' +
                'title="Load every checked file into the editor in the right order (HZM → KMDs → DARs → GCX)">' +
                '▶ Load selected</button>' +
             '</div>' +
             '<div style="color:#888;font-size:10px;margin-bottom:6px">' +
                'Filenames match what MetalMintSolid produces. ' +
                'Check files and click <b style="color:#ffcc66">Load selected</b> to load them all into the editor. ' +
                '<b>↓</b> downloads raw bytes; <b style="color:#ccaa44">↑ replace</b> swaps in a file from disk (any size — STAGE.DIR is repacked on save).' +
             '</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  html += '<thead><tr style="color:#ff8800;border-bottom:1px solid #1a2535">' +
          '<th style="text-align:center;padding:4px;width:24px">' +
            '<input type="checkbox" id="sdirSelAll" onclick="sdirSelectAllLoadable(\'' + stage.name + '\', this.checked)" ' +
              'title="Select all loadable">' +
          '</th>' +
          '<th style="text-align:left;padding:4px">filename</th>' +
          '<th style="text-align:left;padding:4px">kind</th>' +
          '<th style="text-align:right;padding:4px">size</th>' +
          '<th style="text-align:left;padding:4px">type</th>' +
          '<th style="text-align:right;padding:4px">offset</th>' +
          '<th style="text-align:left;padding:4px">actions</th>' +
          '</tr></thead><tbody>';
  for (var ei = 0; ei < stage._parsed.entries.length; ei++) {
    var e = stage._parsed.entries[ei];
    // Skip end-of-cached-section markers (ext == 0xFF). These are stream
    // alignment hints, not real files. They're preserved in entries[] for
    // accurate round-trip on save but don't appear in the UI.
    if (e.ext === 0xFF) continue;

    var sniff = sdirSniffFile(e.type, e.hash, e.data);
    var fname = sdirFilename(e, ei);
    var modeChar = (e.mode >= 32 && e.mode <= 126) ? String.fromCharCode(e.mode) : '?';
    var extChar = (e.ext >= 32 && e.ext <= 126) ? String.fromCharCode(e.ext) : '?';
    var typeStr = modeChar + extChar;
    var hasData = (stageDir.isPC ? !!e.data : e.stageDataOff >= 0);
    var sizeStr = hasData ? e.size.toLocaleString() : "—";
    var offStr = stageDir.isPC ? "—" : (hasData ? "0x" + e.stageDataOff.toString(16) : "—");
    var modKey = stageDir.isPC ? ("pc:" + stage.name + ":" + ei) : (hasData ? (stage.byteOff + e.stageDataOff) : -1);
    var isMod = hasData && !!stageDir.mods[modKey];
    var bg = isMod ? "background:#332211;" : "";
    var fnameColor = sniff.canLoad ? "#88ddff" : "#aac";
    var checkboxCell = '';
    if (sniff.canLoad && hasData) {
      checkboxCell = '<input type="checkbox" class="sdir-pick" data-eidx="' + ei + '" ' +
                     'data-ext="' + sniff.ext + '">';
    } else {
      checkboxCell = '';
    }
    var actions = '';
    if (hasData) {
      actions += '<button class="btn" style="font-size:9px;padding:1px 5px" ' +
                 'onclick="sdirDownloadFile(\'' + stage.name + '\',' + ei + ')" ' +
                 'title="Download as ' + fname + '">↓</button> ';
      if (sniff.canLoad) {
        actions += '<button class="btn" style="font-size:9px;padding:1px 5px;color:#88ccff" ' +
                   'onclick="sdirLoadFile(\'' + stage.name + '\',' + ei + ')" ' +
                   'title="Load ' + fname + ' into editor">load</button> ';
      }
      actions += '<button class="btn" style="font-size:9px;padding:1px 5px;color:#ccaa44" ' +
                 'onclick="sdirReplaceFile(\'' + stage.name + '\',' + ei + ')" ' +
                 'title="Replace ' + fname + ' with a file from disk (any size — repacked on save)">↑ replace</button>';
      if (isMod) {
        actions += ' <button class="btn" style="font-size:9px;padding:1px 5px;color:#cc4444" ' +
                   'onclick="sdirRevertFile(\'' + stage.name + '\',' + ei + ')" ' +
                   'title="Revert to original">revert</button>';
      }
    }
    html += '<tr style="' + bg + 'border-bottom:1px solid #111">' +
            '<td style="padding:3px;text-align:center">' + checkboxCell + '</td>' +
            '<td style="padding:3px;color:' + fnameColor + ';font-weight:bold">' + fname +
              (e._pcCnfFlag ? ' <span style="color:' + cnfFlagColor(e._pcCnfFlag) +
                              ';font-weight:normal;font-size:9px">[' + e._pcCnfFlag + ']</span>' : '') +
              (isMod ? ' <span style="color:#cc8833">[modified]</span>' : '') + '</td>' +
            '<td style="padding:3px;color:#cde">' + sniff.label + '</td>' +
            '<td style="padding:3px;color:#aaa;text-align:right">' + sizeStr + '</td>' +
            '<td style="padding:3px;color:#778">' + typeStr + '</td>' +
            '<td style="padding:3px;color:#778;text-align:right">' + offStr + '</td>' +
            '<td style="padding:3px">' + actions + '</td>' +
            '</tr>';
  }
  html += '</tbody></table>';
  body.innerHTML = html;
}

// Per-file actions ────────────────────────────────────────────────────────

function sdirGetEntry(stageName, entryIdx) {
  for (var i = 0; i < stageDir.stages.length; i++) {
    if (stageDir.stages[i].name === stageName) {
      var s = stageDir.stages[i];
      if (!s._parsed) return null;
      return {stage: s, entry: s._parsed.entries[entryIdx]};
    }
  }
  return null;
}

function sdirDownloadFile(stageName, entryIdx) {
  var r = sdirGetEntry(stageName, entryIdx);
  if (!r || !r.entry.data) return;
  var modKey = stageDir.isPC ? ("pc:" + stageName + ":" + entryIdx) : (r.stage.byteOff + r.entry.stageDataOff);
  var bytes = stageDir.mods[modKey] ? stageDir.mods[modKey].bytes : r.entry.data;
  var fname = sdirFilename(r.entry, entryIdx);
  sdirDownloadBytes(bytes, fname);
}

function sdirLoadFile(stageName, entryIdx) {
  var r = sdirGetEntry(stageName, entryIdx);
  if (!r || !r.entry.data) return;
  var sniff = sdirSniffFile(r.entry.type, r.entry.hash, r.entry.data);
  if (!sniff.canLoad || !sniff.loader) { alert("This file type can't be auto-loaded yet. Use ↓ to download instead."); return; }
  var name = sdirFilename(r.entry, entryIdx);
  // Prefer modified bytes if a replacement is pending
  var modKey = stageDir.isPC ? ("pc:" + stageName + ":" + entryIdx) : (r.stage.byteOff + r.entry.stageDataOff);
  var bytes = stageDir.mods[modKey] ? stageDir.mods[modKey].bytes : r.entry.data;
  try {
    sniff.loader(bytes, name);
  } catch (err) {
    alert("Load failed: " + err.message);
  }
}

// Toggle all loadable-file checkboxes in the current view.
function sdirSelectAllLoadable(stageName, on) {
  var picks = document.querySelectorAll('input.sdir-pick');
  for (var i = 0; i < picks.length; i++) picks[i].checked = !!on;
  var selAll = document.getElementById('sdirSelAll');
  if (selAll) selAll.checked = !!on;
}

// "Select stage essentials": main HZM (largest), all KMDs, all texture DARs,
// and the largest GCX. This is the load set someone would normally hand-pick
// when bringing a stage into the editor for editing.
function sdirSelectStageDefault(stageName) {
  var stage = null;
  for (var i = 0; i < stageDir.stages.length; i++) {
    if (stageDir.stages[i].name === stageName) { stage = stageDir.stages[i]; break; }
  }
  if (!stage || !stage._parsed) return;

  // Find largest HZM and largest GCX. We default to the LARGEST HZM only —
  // even multi-floor stages like s11a render best with one HZM at a time.
  // The HZM loader supports merging additional HZMs (see 29_stagedir.js
  // sdirSniffFile's hzm branch), so power users can MANUALLY check extra
  // HZMs in the file list to load them on top. The merge tags appended areas
  // with `_appended: true` so future edit tooling can route saves correctly.
  //
  // We also identify "floor groups" — groups of hashes sharing their upper
  // 12 bits (hash & 0xFFF0). Empirically, sibling files in MGS data come in
  // 16-entry hash groups: a floor's data lives at 0x9b3?, accessories at
  // 0x9b3c/0x9b3d/0x9b3e all share that group. Different floors have parallel
  // groups (0x9b3?, 0x973?, 0x933? for s14e's three floors). The accessory
  // KMDs across groups have IDENTICAL geometry (we verified bbox equality) —
  // loading all three groups stacks duplicate accessories at world origin.
  // The rule: a KMD's group is "the floor group containing its paired HZM"
  // if any. Load only the KMDs whose group matches the picked HZM's group.
  // KMDs in groups that don't contain any HZM (standalone groups like tank
  // siblings 0x6d6x in s02a) always load.
  var biggestHzmIdx = -1, biggestHzmSize = 0;
  var biggestGcxIdx = -1, biggestGcxSize = 0;
  var floorGroups = {};     // (hash & 0xFFF0) → true for any group containing an HZM
  for (var i = 0; i < stage._parsed.entries.length; i++) {
    var e = stage._parsed.entries[i];
    if (e.ext === 0xFF) continue;
    if (e.ext === 0x68 /* hzm */) {
      floorGroups[e.hash & 0xFFF0] = true;
      if (e.size > biggestHzmSize) { biggestHzmSize = e.size; biggestHzmIdx = i; }
    }
    if (e.ext === 0x67 /* gcx */ && e.size > biggestGcxSize) {
      biggestGcxSize = e.size; biggestGcxIdx = i;
    }
  }
  var pickedHzmHash = (biggestHzmIdx >= 0) ? stage._parsed.entries[biggestHzmIdx].hash : -1;
  var pickedGroup = (pickedHzmHash & 0xFFF0);

  // Parse the GCX once to find which KMD hashes are entity-referenced. An
  // entity-referenced KMD is always loaded, even if it's in a floor group we
  // wouldn't otherwise pick — the entity places it explicitly at world coords.
  // This is what KMD7 (0xcae4) in s14e is: paired-with-HZM but also referenced
  // by WALL entities, so loading is required regardless of floor selection.
  var entityRefedHashes = {};
  if (biggestGcxIdx >= 0) {
    try {
      var gcxBytes = stage._parsed.entries[biggestGcxIdx].data;
      if (typeof gcxParseGCX === 'function' && typeof gcxBuildEntities === 'function') {
        var gcx = gcxParseGCX(new Uint8Array(gcxBytes));
        var ents = gcxBuildEntities(gcx);
        for (var ei = 0; ei < ents.length; ei++) {
          if (typeof ents[ei].modelHash === 'number') {
            entityRefedHashes[ents[ei].modelHash] = true;
          }
        }
      }
    } catch (e) {
      console.warn('sdirSelectStageDefault: GCX parse failed (' + e.message + '), falling back to load-all KMDs');
      entityRefedHashes = null;
    }
  }

  var picks = document.querySelectorAll('input.sdir-pick');
  for (var i = 0; i < picks.length; i++) {
    var ei = parseInt(picks[i].getAttribute('data-eidx'), 10);
    var ext = picks[i].getAttribute('data-ext');
    var entry = stage._parsed.entries[ei];
    var pick = false;
    if (ext === 'kmd') {
      // GROUP-based filtering:
      //   - If KMD's group has no HZM → standalone group → always load (tanks,
      //     doors, props that don't belong to any specific floor)
      //   - If KMD's group has an HZM but isn't the picked group → it's a
      //     non-loaded floor's data → SKIP unless entity-referenced
      //   - If KMD's group IS the picked group → load (current floor's data)
      var kmdGroup = entry ? (entry.hash & 0xFFF0) : -1;
      var isInFloorGroup = entry && floorGroups[kmdGroup];
      var isEntityRefed = entry && entityRefedHashes && entityRefedHashes[entry.hash];
      if (isInFloorGroup && kmdGroup !== pickedGroup) {
        pick = isEntityRefed;  // skip non-picked floor's data unless entity needs it
      } else {
        pick = true;
      }
    } else if (ext === 'dar') {
      pick = true;
    } else if (ext === 'hzm' && ei === biggestHzmIdx) {
      pick = true;
    } else if (ext === 'gcx' && ei === biggestGcxIdx) {
      pick = true;
    }
    picks[i].checked = pick;
  }
}

// Run all checked loaders in the right order so the editor ends up with the
// stage looking complete. Order:
//   1. HZM   — establishes the collision (resets selection state)
//   2. KMDs  — added to the model list, will be re-textured later
//   3. DARs  — texture archives; KMDs are rebuilt to apply textures
//   4. GCX   — script, replaces gclEntities
function sdirLoadSelected(stageName) {
  var picks = document.querySelectorAll('input.sdir-pick:checked');
  if (picks.length === 0) { alert("No files selected"); return; }

  // Group by extension category for ordered loading
  var groups = {hzm: [], kmd: [], dar: [], gcx: [], other: []};
  for (var i = 0; i < picks.length; i++) {
    var ei = parseInt(picks[i].getAttribute('data-eidx'), 10);
    var ext = picks[i].getAttribute('data-ext');
    var bucket = groups[ext] || groups.other;
    bucket.push(ei);
  }

  var loadOrder = []
    .concat(groups.hzm)
    .concat(groups.kmd)
    .concat(groups.dar)
    .concat(groups.gcx)
    .concat(groups.other);

  // If we're loading an HZM as part of this batch, treat it as "fresh stage
  // load" and clear KMDs from any previous stage first. Also reset hzm to null
  // so the first HZM in the batch becomes the new primary; subsequent HZMs
  // merge into it for multi-floor stages (s11a, s14b etc).
  if (groups.hzm.length > 0 && typeof kmdBufs !== "undefined") {
    kmdBufs.length = 0;
    if (typeof kmdFileNames !== "undefined") kmdFileNames.length = 0;
    if (typeof kmdVisible !== "undefined") kmdVisible.length = 0;
    if (typeof hzm !== "undefined") hzm = null;
  }

  var loaded = 0, failed = 0;
  var errors = [];
  for (var i = 0; i < loadOrder.length; i++) {
    var r = sdirGetEntry(stageName, loadOrder[i]);
    if (!r || !r.entry.data) continue;
    var sniff = sdirSniffFile(r.entry.type, r.entry.hash, r.entry.data);
    if (!sniff.canLoad || !sniff.loader) { failed++; continue; }
    var name = sdirFilename(r.entry, loadOrder[i]);
    try {
      sniff.loader(r.entry.data, name);
      loaded++;
    } catch (err) {
      failed++;
      errors.push(name + ": " + err.message);
    }
  }

  var msg = "Loaded " + loaded + " file" + (loaded === 1 ? "" : "s") + " from " + stageName + ".";
  if (failed > 0) {
    msg += "\n\n" + failed + " failed:\n" + errors.slice(0, 8).join("\n");
    if (errors.length > 8) msg += "\n(and " + (errors.length - 8) + " more)";
  }
  // Close so the editor's main viewport is visible with the new content
  sdirCloseModal();
  if (failed > 0 || loaded > 0) {
    // Use setTimeout so the modal teardown happens first
    setTimeout(function(){ alert(msg); }, 100);
  }
}

function sdirReplaceFile(stageName, entryIdx) {
  var r = sdirGetEntry(stageName, entryIdx);
  if (!r || !r.entry.data) return;
  var picker = document.createElement("input");
  picker.type = "file";
  picker.onchange = function(e) {
    var f = e.target.files[0];
    if (!f) return;
    var rdr = new FileReader();
    rdr.onload = function(ev) {
      var bytes = new Uint8Array(ev.target.result);
      // PC .mgz path: no size constraint (we repack the ZIP at save). Key mods
      // by "pc:<stageName>:<entryIdx>" so multiple stages don't collide and
      // they're distinguishable from PSX byte-offset keys.
      if (stageDir.isPC) {
        stageDir.mods["pc:" + stageName + ":" + entryIdx] = {
          bytes: bytes,
          origSize: r.entry.size,
          label: stageName + " " + sdirFilename(r.entry, entryIdx),
          stageName: stageName,
          entryIdx: entryIdx,
        };
        sdirOpenStage(stageName);
        return;
      }
      // PSX path: size-aware repack handles any replacement size (the save
      // rebuilds the stage's config Size fields, cached-section offsets, and
      // the outer directory sector pointers).
      var absOff = r.stage.byteOff + r.entry.stageDataOff;
      stageDir.mods[absOff] = {
        bytes: bytes,
        origSize: r.entry.size,
        label: stageName + " " + sdirFilename(r.entry, entryIdx),
        stageName: stageName,
        entryIdx: entryIdx,
      };
      sdirOpenStage(stageName);
    };
    rdr.readAsArrayBuffer(f);
  };
  picker.click();
}

function sdirRevertFile(stageName, entryIdx) {
  var r = sdirGetEntry(stageName, entryIdx);
  if (!r) return;
  // PC path keys by "pc:<stageName>:<entryIdx>"
  if (stageDir.isPC) {
    var key = "pc:" + stageName + ":" + entryIdx;
    if (stageDir.mods[key]) {
      delete stageDir.mods[key];
      sdirOpenStage(stageName);
    }
    return;
  }
  var absOff = r.stage.byteOff + r.entry.stageDataOff;
  if (stageDir.mods[absOff]) {
    delete stageDir.mods[absOff];
    sdirOpenStage(stageName);
  }
}

// ─── Size-aware repack ─────────────────────────────────────────────────────
//
// Rebuilds one PSX stage (.stg) from its parsed structure, substituting any
// modified members (which may differ in size from the original). Returns a new
// Uint8Array whose length is a whole number of 2048-byte sectors.
//
// Layout rules (verified against MetalMintSolid + a byte-identical round-trip
// on real stages):
//   - Header (0..2048) is preserved as-is, then the StgConfig Size u32 fields
//     are patched: regular ('s'/'n') = actual byte size; cached ('c') = the
//     running cumulative START offset within the cached section; the 0xFF
//     end-of-cached marker = the cumulative END of the cached section.
//   - Data starts at offset 2048, members in config order. Regular members are
//     sector-aligned (padded to the next 2048 after each). Cached members are
//     packed tight; the 0xFF marker pads the stream to the next sector.
//   - The stage's sector count (i16 at header offset 2) is recomputed.
//
// `repl` maps entry index → replacement Uint8Array.
function sdirRebuildStage(orig, parsed, repl) {
  repl = repl || {};
  var ents = parsed.entries, n = ents.length;
  var sizes = ents.map(function (e, i) {
    return (repl[i] !== undefined) ? repl[i].length : e.size;
  });
  // Recompute the Size field for every config entry.
  var sf = new Array(n), cum = 0;
  for (var i = 0; i < n; i++) {
    var e = ents[i];
    if (e.ext === 0xff) { sf[i] = cum; }            // marker: cumulative end
    else if (e.mode === 0x63) { sf[i] = cum; cum += sizes[i]; } // cached: start
    else { sf[i] = sizes[i]; }                       // regular: actual size
  }
  // Preserve the header/config region; patch the Size u32 (LE) at 4 + i*8 + 4.
  var header = orig.slice(0, 2048);
  for (var i = 0; i < n; i++) {
    var o = 4 + i * 8 + 4, v = sf[i] >>> 0;
    header[o] = v & 0xff; header[o + 1] = (v >>> 8) & 0xff;
    header[o + 2] = (v >>> 16) & 0xff; header[o + 3] = (v >>> 24) & 0xff;
  }
  // Build the data area.
  var chunks = [], pos = 2048;
  function padToSector() {
    var pad = (2048 - (pos & 0x7ff)) & 0x7ff;
    if (pad) { chunks.push(new Uint8Array(pad)); pos += pad; }
  }
  for (var i = 0; i < n; i++) {
    var e = ents[i];
    if (e.ext === 0xff) { padToSector(); continue; }
    var bytes = (repl[i] !== undefined)
      ? repl[i]
      : orig.subarray(e.stageDataOff, e.stageDataOff + e.size);
    chunks.push(bytes); pos += bytes.length;
    if (e.mode !== 0x63) padToSector();              // regular: sector-align
  }
  // Assemble: header + data, padded to a sector boundary.
  var dataLen = chunks.reduce(function (s, c) { return s + c.length; }, 0);
  var total = 2048 + dataLen;
  var finalPad = (2048 - (total & 0x7ff)) & 0x7ff; total += finalPad;
  var out = new Uint8Array(total);
  out.set(header, 0);
  var p = 2048;
  for (var k = 0; k < chunks.length; k++) { out.set(chunks[k], p); p += chunks[k].length; }
  // Patch sector count (i16 LE @ offset 2).
  var sec = total / 2048;
  out[2] = sec & 0xff; out[3] = (sec >>> 8) & 0xff;
  return out;
}

// Rebuilds the entire PSX STAGE.DIR with a *minimal splice*: unmodified stages
// are copied byte-for-byte from the original (so the file can never bloat), and
// only the stages that were actually edited are repacked in place. Each stage's
// on-disk extent is taken from the gap to the next stage's sector (the real
// stored size), NOT from the header-declared sizeSec — those can differ, and
// re-deriving every stage from the declared size is what previously inflated
// the output. After splicing, every outer directory sector pointer that sits
// after an edited stage is shifted by that stage's size delta (in sectors).
// Unmodified input rebuilds byte-identically.
function sdirRebuildStageDirPSX() {
  var stages = stageDir.stages;
  var fileSec = (stageDir.data.length / 2048) | 0;

  // Distinct sector starts, ascending — used to find each stage's real extent.
  var secs = stages.map(function (s) { return s.sector; })
                   .slice().sort(function (a, b) { return a - b; });
  function extentSectors(sec) {
    for (var i = 0; i < secs.length; i++) if (secs[i] > sec) return secs[i] - sec;
    return fileSec - sec; // last stage runs to EOF
  }

  // Group mods by stage → { entryIdx: bytes }.
  var byStage = {};
  for (var k in stageDir.mods) {
    if (!stageDir.mods.hasOwnProperty(k)) continue;
    var m = stageDir.mods[k];
    if (m.stageName == null || m.entryIdx == null) continue;
    (byStage[m.stageName] = byStage[m.stageName] || {})[m.entryIdx] = m.bytes;
  }

  // Build a splice plan for each edited stage, sorted by file position.
  var patches = [];
  for (var i = 0; i < stages.length; i++) {
    var s = stages[i];
    if (!byStage[s.name]) continue;
    var origExtent = extentSectors(s.sector) * 2048;
    var stageBytes = stageDir.data.subarray(s.byteOff, s.byteOff + origExtent);
    if (!s._parsed) s._parsed = sdirParseStage(stageBytes);
    var newBytes = sdirRebuildStage(stageBytes, s._parsed, byStage[s.name]);
    patches.push({ sector: s.sector, byteOff: s.byteOff, origExtent: origExtent, newBytes: newBytes });
  }
  patches.sort(function (a, b) { return a.byteOff - b.byteOff; });

  // Assemble: verbatim original between patches, replaced bytes at each patch.
  var pieces = [], cursor = 0;
  for (var i = 0; i < patches.length; i++) {
    var p = patches[i];
    if (p.byteOff > cursor) pieces.push(stageDir.data.subarray(cursor, p.byteOff));
    pieces.push(p.newBytes);
    cursor = p.byteOff + p.origExtent;
  }
  pieces.push(stageDir.data.subarray(cursor));
  var total = pieces.reduce(function (a, c) { return a + c.length; }, 0);
  var out = new Uint8Array(total);
  var pp = 0;
  for (var i = 0; i < pieces.length; i++) { out.set(pieces[i], pp); pp += pieces[i].length; }

  // Shift directory sector pointers: each entry gains the summed sector delta of
  // every patch that starts strictly before it.
  for (var i = 0; i < stages.length; i++) {
    var s = stages[i], add = 0;
    for (var d = 0; d < patches.length; d++) {
      if (patches[d].sector < s.sector) {
        add += (patches[d].newBytes.length - patches[d].origExtent) / 2048;
      }
    }
    var newSec = s.sector + add;
    var eo = 4 + i * 12 + 8;
    out[eo] = newSec & 0xff; out[eo + 1] = (newSec >>> 8) & 0xff;
    out[eo + 2] = (newSec >>> 16) & 0xff; out[eo + 3] = (newSec >>> 24) & 0xff;
  }
  return out;
}

// ─── Save ────────────────────────────────────────────────────────────────
//
// PSX: full size-aware repack (handles size-changing edits, cached-section
// shifts, and stage growth). PC: repack the .mgz ZIP.

function sdirSave() {
  if (!stageDir) return;
  var modKeys = Object.keys(stageDir.mods);
  if (modKeys.length === 0) { alert("No modifications to save"); return; }

  // Branch for PC .mgz: repack a new ZIP using JSZip
  if (stageDir.isPC) {
    return mgzSave();
  }

  var out = sdirRebuildStageDirPSX();
  var summary = [];
  for (var i = 0; i < modKeys.length; i++) {
    var mod = stageDir.mods[modKeys[i]];
    var grew = mod.bytes.length !== mod.origSize
      ? " (" + mod.bytes.length + " bytes, was " + mod.origSize + ")"
      : " (" + mod.bytes.length + " bytes)";
    summary.push("  " + mod.label + grew);
  }
  sdirDownloadBytes(out, "STAGE.DIR");
  alert("Saved STAGE.DIR (size-aware repack) with " + modKeys.length + " modification(s):\n\n" +
        summary.join("\n") +
        "\n\nReplace the original STAGE.DIR in your ISO and rebuild with mkpsxiso.");
}

// Save a modified MGZ back out. Unlike PSX STAGE.DIR which uses absolute byte
// offsets for mods, the MGZ save path needs to look up each mod by its entry
// reference (filename) and replace that file in the zip. We rebuild the ZIP
// from scratch since JSZip doesn't have an in-place modify-and-save API for
// loaded archives — but this works for any modification size, no padding
// limit like the PSX flow has.
function mgzSave() {
  if (typeof JSZip === "undefined") {
    alert("JSZip not available — can't save .mgz files in this build.");
    return;
  }
  if (!stageDir.stages || stageDir.stages.length === 0) {
    alert("No stages loaded"); return;
  }

  var zip = new JSZip();
  var summary = [];
  // Walk every stage and every entry. Use entry._pcPath (the full path inside
  // the original ZIP) as the new ZIP path so the output preserves layout.
  for (var si = 0; si < stageDir.stages.length; si++) {
    var stage = stageDir.stages[si];
    var entries = stage._parsed.entries;
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var modKey = "pc:" + stage.name + ":" + i;
      var bytes = entry.data;
      if (stageDir.mods[modKey]) {
        bytes = stageDir.mods[modKey].bytes;
        summary.push("  " + stage.name + "/" + entry._pcName + " (" +
                     bytes.length + " bytes, was " +
                     stageDir.mods[modKey].origSize + ")");
      }
      // Use the original full ZIP path so directory structure is preserved
      var zipPath = entry._pcPath || (stage.name + "/" + entry._pcName);
      zip.file(zipPath, bytes);
    }
  }
  if (summary.length === 0) { alert("No modifications to save"); return; }

  zip.generateAsync({type: "uint8array", compression: "DEFLATE"}).then(function(u8) {
    var outName = stageDir.pcFilename || "stage.mgz";
    sdirDownloadBytes(u8, outName);
    alert("Saved " + outName + " with " + summary.length + " modification(s):\n\n" +
          summary.join("\n") + "\n\nReplace the original .mgz in your PC install's stage folder.");
  }).catch(function(err) {
    alert("MGZ save failed: " + (err && err.message || err));
  });
}

// ─── Entry point: file picker + parse ────────────────────────────────────
//
// Auto-detects format by sniffing the first bytes:
//   - PK\x03\x04           → ZIP archive (PC's .mgz, which is just a renamed ZIP)
//   - anything else        → raw PSX STAGE.DIR
//
// For .mgz we use JSZip (already bundled for the texture and sound tools)
// to extract the files and synthesize a stageDir object that the existing
// browser UI can render.

function sdirLoadFromFile(file) {
  var rdr = new FileReader();
  rdr.onload = function(e) {
    var u8 = new Uint8Array(e.target.result);
    // Sniff ZIP magic ("PK\x03\x04")
    var isZip = (u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4B &&
                 u8[2] === 0x03 && u8[3] === 0x04);
    if (isZip) {
      mgzLoadFromBytes(u8, file.name);
    } else {
      try {
        var stages = sdirParseOuter(u8);
        stageDir = {data: u8, stages: stages, mods: {}, isPC: false};
        sdirOpenBrowser();
      } catch (err) {
        alert("STAGE.DIR parse failed: " + err.message);
      }
    }
  };
  rdr.readAsArrayBuffer(file);
}

// ─── PC .mgz (ZIP archive) support ─────────────────────────────────────────
// MGZ is just a renamed ZIP. Inside it are this stage's loose files using
// their real PC-version filenames (e.g. snake.kmd, s02a.hzm, stg_tex4.dar).
// We unzip and synthesize a stageDir with one "stage" so the existing browser
// UI works unchanged.
//
// Differences from PSX STAGE.DIR that the entry rendering needs to handle:
//   - No hash field (MGZ files have real names instead of hash codes)
//   - No mode byte (no "cached" vs "regular" distinction in PC layout)
//   - No sector alignment
//   - No back-out save flow (Phase A.PC limitation — we'd need to repack
//     a ZIP to save changes back; punted to a later phase).

// ─── PC .mgz loader — groups files by stage subdirectory ─────────────────
//
// PC's stage.mgz is a ZIP archive containing the same stages as PSX's
// STAGE.DIR, but organized as subdirectories rather than packed binary
// regions. The canonical layout (per KCEJ wiki):
//
//   stage.mgz (ZIP)
//   └── stage/
//       ├── init/
//       │   └── data.cnf, ...
//       ├── s00a/
//       │   ├── data.cnf       ← stage's file manifest (essential vs cached)
//       │   ├── s00a.bin       ← scripts
//       │   ├── s00a.hzd       ← collision data
//       │   ├── stg_mdl0.dar   ← model archive (.resident)
//       │   ├── stg_tex0.dar   ← textures (.nocache)
//       │   └── ...
//       ├── s01a/
//       └── ... (all stages)
//
// Our job: parse the ZIP, group entries by their parent directory, present
// one "stage" per subdir. Each entry remembers its full ZIP path for save.
//
// data.cnf parsing: each cnf line is either a flag (".resident", ".cache",
// ".nocache", ".sound") or a filename belonging to the current flag. We
// store the flag on each entry so the UI can display "essential" vs cached.

function mgzLoadFromBytes(u8, filename) {
  if (typeof JSZip === "undefined") {
    alert("JSZip library not loaded — can't open .mgz files in this build.\n\n" +
          "The editor build may be incomplete; rebuild the standalone with JSZip bundled.");
    return;
  }
  JSZip.loadAsync(u8).then(function(zip) {
    // ── Pass 1: enumerate, bucket by stage subdir, collect file promises ──
    // Stage subdirs are detected as the second-to-last path component for
    // entries with depth >= 2, e.g. "stage/s01a/snake.kmd" → stage "s01a".
    // We also accept the depth-1 layout "s01a/snake.kmd" in case the ZIP
    // was created without a top-level "stage/" wrapper.
    var stageBuckets = {};   // stageName → array of { path, basename, dataPromise }
    var stageOrder = [];     // preserve discovery order for stable display
    zip.forEach(function(path, zEntry) {
      if (zEntry.dir) return;
      // Normalize path separators just in case
      var norm = path.replace(/\\/g, '/');
      var parts = norm.split('/').filter(function(p){ return p.length > 0; });
      if (parts.length < 2) return;  // loose root files have no stage — skip
      // Stage name = the parent directory of the file
      var stageName = parts[parts.length - 2];
      var basename = parts[parts.length - 1];
      // If the path has a deeper structure (stage/<name>/.../file), keep only
      // files DIRECTLY inside the stage dir. Subdirectories within a stage
      // are extremely rare in MGS1 PC but we'd lose nothing by skipping them.
      if (parts.length > 3) {
        // Check whether this is the typical "stage/<name>/<file>" pattern. If
        // so, accept. If there's more nesting (stage/<name>/sub/.../file), skip.
        var expectedPrefix = (parts[0] === 'stage') ? 3 : 2;
        if (parts.length !== expectedPrefix) return;
      }
      if (!stageBuckets[stageName]) {
        stageBuckets[stageName] = [];
        stageOrder.push(stageName);
      }
      stageBuckets[stageName].push({
        path: norm,
        basename: basename,
        zipEntry: zEntry,
      });
    });

    if (stageOrder.length === 0) {
      alert("No stages found inside the MGZ.\n\nExpected structure: stage/<stagename>/<files>.\nThe ZIP may be empty or use an unrecognized layout.");
      return;
    }

    // ── Pass 2: load all file data, parse data.cnf where present ──
    var loadPromises = [];
    var stages = [];
    stageOrder.sort();  // alphabetical stage list, like PSX flow

    stageOrder.forEach(function(stageName) {
      var bucket = stageBuckets[stageName];
      var stageEntries = [];

      // Kick off async reads for every file in this stage
      bucket.forEach(function(fileRef, fileIdx) {
        loadPromises.push(fileRef.zipEntry.async("uint8array").then(function(data) {
          var ext = (fileRef.basename.match(/\.([^.]+)$/) || [, ""])[1].toLowerCase();
          var extByte = pcExtToByte(ext);
          stageEntries.push({
            hash: 0,
            mode: 0x73,           // 's' fallback — overridden by cnf flag if present
            ext: extByte,
            sizeField: data.length,
            size: data.length,
            type: new Uint8Array([0x73, extByte]),
            stageDataOff: -1,
            data: data,
            _pcName: fileRef.basename,    // display name in the UI
            _pcPath: fileRef.path,        // full path in the ZIP, used at save time
            _pcStage: stageName,
            _pcCnfFlag: null,             // filled in below from data.cnf, if any
            _pcOrigIdx: fileIdx,
          });
        }));
      });

      stages.push({
        name: stageName,
        sector: 0,                        // PC has no concept of sectors
        byteOff: 0,                       // PC mods key by string, not byte offset
        size: 0,                          // we'll sum entry sizes after loads complete
        _parsed: {
          field0: 0, field1: 0, sizeSec: 0,
          entries: stageEntries,          // populated by promise resolutions above
          magic: 0, hdrHash: 0, hdrType: new Uint8Array([0, 0]),
          terminatorOff: null,
        },
        _isMGZ: true,
      });
    });

    Promise.all(loadPromises).then(function() {
      // Sort each stage's entries by original ZIP order (the async resolution
      // order is unpredictable, so use _pcOrigIdx to restore deterministic order).
      stages.forEach(function(stage) {
        stage._parsed.entries.sort(function(a, b){ return a._pcOrigIdx - b._pcOrigIdx; });
        // Compute total stage size (sum of entry sizes — approximates archive bytes)
        var total = 0;
        stage._parsed.entries.forEach(function(e){ total += e.size; });
        stage.size = total;
        // Parse data.cnf if present and tag each entry with its flag
        mgzParseDataCnf(stage);
      });
      stageDir = {
        data: u8,            // original ZIP bytes (kept for re-save)
        stages: stages,
        mods: {},
        isPC: true,
        pcFilename: filename,
      };
      // Show the stage-list view — same flow as PSX STAGE.DIR
      sdirOpenBrowser();
    }).catch(function(err) {
      alert("MGZ extraction failed: " + (err && err.message || err));
    });
  }).catch(function(err) {
    alert("MGZ parse failed (not a valid ZIP?): " + (err && err.message || err));
  });
}

// Parse a stage's data.cnf (if present) and stamp each entry with its flag.
// data.cnf format (per KCEJ wiki):
//   .resident
//   res_mdl1.dar
//   res_mdl2.dar
//   .nocache
//   s01a.bin
//   stg_tex0.dar
//   .sound
//   se.mdx
//   .cache
//   ...
// Flags persist until the next flag line; filenames are case-insensitive
// matches against entries' basenames.
function mgzParseDataCnf(stage) {
  var entries = stage._parsed.entries;
  // Find the cnf entry, if any
  var cnfEntry = null;
  for (var i = 0; i < entries.length; i++) {
    var nm = entries[i]._pcName.toLowerCase();
    if (nm === 'data.cnf') { cnfEntry = entries[i]; break; }
  }
  if (!cnfEntry) return;

  // Decode bytes as ASCII (cnf files are plain text)
  var text;
  try {
    text = new TextDecoder('ascii').decode(cnfEntry.data);
  } catch(e) {
    // Fall back to char-by-char if TextDecoder isn't available
    text = '';
    for (var k = 0; k < cnfEntry.data.length; k++) {
      text += String.fromCharCode(cnfEntry.data[k]);
    }
  }
  // Build a basename → flag map by walking the cnf line by line
  var lines = text.split(/\r?\n/);
  var currentFlag = null;
  var fileFlags = {};
  for (var l = 0; l < lines.length; l++) {
    var raw = lines[l].trim();
    if (!raw) continue;
    if (raw.charAt(0) === '#' || raw.charAt(0) === ';') continue;  // comments
    if (raw.charAt(0) === '.') {
      // Flag line — strip leading dot and lowercase
      currentFlag = raw.substring(1).toLowerCase().split(/\s+/)[0];
      continue;
    }
    if (currentFlag) {
      // File reference — could have leading "@" for texture archives, strip it
      var fname = raw.replace(/^@/, '').toLowerCase();
      // Some cnfs have inline comments after the filename; strip them
      fname = fname.split(/\s+/)[0];
      fileFlags[fname] = currentFlag;
    }
  }
  // Stamp each entry with its flag
  for (var j = 0; j < entries.length; j++) {
    var bn = entries[j]._pcName.toLowerCase();
    if (fileFlags[bn]) {
      entries[j]._pcCnfFlag = fileFlags[bn];
    }
  }
}

// Map a PC filename extension (lowercase, no dot) to the type-byte the
// renderer's SDIR_EXT_BY_BYTE map expects. This lets the existing UI display
// the right "file kind" label without modification.
function pcExtToByte(ext) {
  var rev = {
    azm: 0x61, bin: 0x62, con: 0x63, dar: 0x64, efx: 0x65,
    gcx: 0x67, hzm: 0x68, img: 0x69, kmd: 0x6b, lit: 0x6c,
    mt3: 0x6d, oar: 0x6f, pcc: 0x70, rar: 0x72, sgt: 0x73,
    wvx: 0x77, zmd: 0x7a,
  };
  return rev[ext] !== undefined ? rev[ext] : 0x00;
}

// Mount a "STAGE.DIR" button into the PSX bar that the psx_pipeline module
// builds. We piggyback on its DOM via a small mutation observer so we don't
// have to modify 26_gcx_psx_pipeline.js. The button appears next to "Patch STAGE.DIR".
(function mountStageDirButton() {
  function tryMount() {
    var bar = document.getElementById("psxButtonBar");
    if (!bar) return false;
    if (document.getElementById("sdirOpenBtn")) return true;  // already mounted
    // Build the button + hidden file picker
    var inp = document.createElement("input");
    inp.type = "file"; inp.id = "sdirFileIn"; inp.style.display = "none";
    inp.accept = ".dir,.DIR,.bin,.BIN,.mgz,.MGZ,.zip,.ZIP";
    inp.onchange = function(e) { if (e.target.files[0]) sdirLoadFromFile(e.target.files[0]); };
    bar.appendChild(inp);
    var btn = document.createElement("button");
    btn.id = "sdirOpenBtn"; btn.className = "btn";
    btn.style.color = "#ffcc66";
    btn.title = "Load a stage container: PSX STAGE.DIR or PC .mgz (zipped per-stage archive). Auto-detected by file content.";
    btn.textContent = "Open STAGE.DIR / .mgz";
    btn.onclick = function() {
      if (stageDir) { sdirOpenBrowser(); }
      else { inp.click(); }
    };
    bar.appendChild(btn);
    return true;
  }
  if (tryMount()) return;
  // Toolbar might not exist yet; retry on DOMContentLoaded and via a brief poll
  document.addEventListener("DOMContentLoaded", tryMount);
  var tries = 0;
  var iv = setInterval(function() {
    if (tryMount() || ++tries > 40) clearInterval(iv);
  }, 250);
})();
