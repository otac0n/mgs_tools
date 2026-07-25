// ═══════════════════════════════════════════════════════════════════════════
// FILE: 38_attribute_changer.js
// ═══════════════════════════════════════════════════════════════════════════
// 38_attribute_changer.js — Attribute Changer (PSX .gcx + EXE)
// ═══════════════════════════════════════════════════════════════════════════
// Edits entity attributes directly inside compiled PSX stage .gcx files —
// enemy health, routes, FOV, speeds, item counts, door params... every
// numeric option of every CHARA command, patched IN PLACE (same-size), so
// nothing in the proc table or offsets ever shifts.
//
// Uses the suite's own GCX disassembler (20_gcx_disassemble.js) and chara
// name table (24_gcx_charalst.js). Friendly parameter labels come from
// ENTITY_CATALOG (04_textures.js) where known; unknown options are still
// shown and editable by their raw "-x" char.
//
// Value encodings (big-endian, from the GCX format):
//   SHORT  tag 0x01 + i16 BE     — editable
//   BYTE   tag 0x02 + u8         — editable
//   CHAR             + u8 (ASCII)— editable
//   BOOL             + u8        — editable
//   INT    tag + u32 BE          — editable
//   STRID/PROCID + u16 BE        — shown read-only (hashes; edit at your own
//                                   risk via advanced mode later)
//
// Also hosts a launcher for the Melee Hitbox Editor (EXE-side attributes).
// ═══════════════════════════════════════════════════════════════════════════

var ATTR_state = {
  panelEl: null,
  filename: '',
  data: null,          // Uint8Array of the loaded .gcx
  entities: [],        // [{type, typeHash, nameHash, opts:[{ch, vals:[{v(alue obj), abs}]}]}]
  selected: -1,
  edits: {},           // "entIdx:optIdx:valIdx" -> origValue
};

// ─── GCX walk (validated nested-offset logic) ────────────────────────────────
function ATTR_scanEntities(){
  ATTR_state.entities = [];
  var buf = ATTR_state.data;
  var gcx = gcxParseGCX(buf);
  var charas = [];
  function walkBlocks(blocks, base){
    for(var bi = 0; bi < blocks.length; bi++){
      var b = blocks[bi];
      var abs = base + b.fileOffset;
      if(b.tag === GCL_COMMAND && b.payload){
        if(b.payload.cmdId === 0x9906){   // 'chara'
          charas.push({cmd: b, valBase: abs + b.headerSize});
        }
        var vals = b.payload.values || [];
        for(var vi = 0; vi < vals.length; vi++){
          var v = vals[vi];
          if(v && v.payload && v.payload.innerBlocks){
            walkBlocks(v.payload.innerBlocks, abs + b.headerSize + v.fileOffset + 3);
          }
        }
      }
      if(b.tag === GCL_ARG && b.payload && b.payload.innerBlocks){
        walkBlocks(b.payload.innerBlocks, abs + b.headerSize);
      }
    }
  }
  for(var p = 0; p < gcx.procs.length; p++) walkBlocks(gcx.procs[p].blocks, gcx.procs[p].fileOffset);
  walkBlocks(gcx.scriptBody.blocks, gcx.scriptBody.fileOffset);

  for(var ci = 0; ci < charas.length; ci++){
    var c = charas[ci];
    var vals = c.cmd.payload.values;
    if(vals.length < 2 || vals[0].tag !== GCL_STRID) continue;
    var typeHash = vals[0].payload;
    var typeName = (typeof gcxCharaTable !== 'undefined' && gcxCharaTable[typeHash]) ||
                   ('UNK_0x' + typeHash.toString(16).padStart(4,'0'));
    var nameHash = vals[1].tag === GCL_STRID ? vals[1].payload : -1;
    var cur = null; var opts = [];
    for(var i = 2; i < vals.length; i++){
      var v = vals[i];
      if(v.tag === GCL_OPTION){
        cur = { ch: String.fromCharCode(v.payload.optChar), vals: [] };
        opts.push(cur);
      } else if(v.kind === 'end'){
        break;
      } else if(cur){
        cur.vals.push({ v: v, abs: c.valBase + v.fileOffset });
      }
    }
    ATTR_state.entities.push({ type: typeName, typeHash: typeHash, nameHash: nameHash, opts: opts });
  }
}

// ─── Value read/write (in place, same size) ──────────────────────────────────
function ATTR_isEditable(v){
  return v.kind === 'short' || v.kind === 'byte' || v.kind === 'char' ||
         v.kind === 'bool' || v.kind === 'int';
}
function ATTR_readVal(rec){
  var d = ATTR_state.data, p = rec.abs, v = rec.v;
  if(v.kind === 'short'){ var s = (d[p+1] << 8) | d[p+2]; return (s & 0x8000) ? s - 0x10000 : s; }
  if(v.kind === 'int'){ return ((d[p+1]<<24)|(d[p+2]<<16)|(d[p+3]<<8)|d[p+4]) >>> 0; }
  if(v.kind === 'byte' || v.kind === 'bool' || v.kind === 'char'){ return d[p+1]; }
  if(v.kind === 'strid' || v.kind === 'procid'){ return (d[p+1]<<8)|d[p+2]; }
  return null;
}
function ATTR_writeVal(rec, n){
  var d = ATTR_state.data, p = rec.abs, v = rec.v;
  if(v.kind === 'short'){ var s = n & 0xFFFF; d[p+1] = (s>>8)&0xFF; d[p+2] = s&0xFF; }
  else if(v.kind === 'int'){ var w = n>>>0; d[p+1]=(w>>>24)&0xFF; d[p+2]=(w>>>16)&0xFF; d[p+3]=(w>>>8)&0xFF; d[p+4]=w&0xFF; }
  else if(v.kind === 'byte' || v.kind === 'bool' || v.kind === 'char'){ d[p+1] = n & 0xFF; }
}

// Friendly label for option char of an entity type, from ENTITY_CATALOG.
function ATTR_optLabel(type, ch){
  try{
    if(typeof ENTITY_CATALOG !== 'undefined' && ENTITY_CATALOG[type] &&
       ENTITY_CATALOG[type].params && ENTITY_CATALOG[type].params[ch]){
      var pdef = ENTITY_CATALOG[type].params[ch];
      return { lbl: pdef.lbl || ('-'+ch), desc: pdef.desc || '', def: pdef.def };
    }
  }catch(e){}
  return { lbl: '-'+ch, desc: '', def: undefined };
}
function ATTR_typeLabel(type){
  try{
    if(typeof ENTITY_CATALOG !== 'undefined' && ENTITY_CATALOG[type] && ENTITY_CATALOG[type].label)
      return ENTITY_CATALOG[type].label;
  }catch(e){}
  return null;
}

// ─── UI ──────────────────────────────────────────────────────────────────────
function openAttributeChanger(){
  if(ATTR_state.panelEl) closeAttributeChanger();
  var ov = document.createElement('div');
  ov.id = 'attrOverlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0a0e14;display:flex;flex-direction:column;font-family:system-ui,sans-serif';
  ov.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#0d1219;border-bottom:1px solid #1a2535">'+
      '<span style="color:#8fd48f;font-size:13px;font-weight:bold">⚙ Attribute Changer</span>'+
      '<span style="color:#666;font-size:10px">edit entity attributes inside compiled PSX stage .gcx files — in place, same size</span>'+
      '<span style="flex:1"></span>'+
      '<button id="attrMeleeBtn" class="btn" style="background:#3a2416;color:#ff9a66;padding:3px 10px;font-size:10px;border:1px solid #5c3a24" title="EXE-side attributes: melee hit placement/size/damage + hit frames">🥋 Melee Hitboxes (EXE)</button>'+
      '<button id="attrClose" class="btn" style="background:#1a2a3a;color:#7cf;padding:3px 12px;font-size:10px">× Close</button>'+
    '</div>'+
    '<div style="padding:6px 12px;background:#0d1219;border-bottom:1px solid #1a2535;display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:10px">'+
      '<label style="color:#8fd48f;display:flex;align-items:center;gap:4px">GCX: <input id="attrFile" type="file" accept=".gcx" style="font-size:10px"></label>'+
      '<span id="attrInfo" style="color:#666"></span>'+
      '<span style="flex:1"></span>'+
      '<span id="attrEditCount" style="color:#888;font-size:9px"></span>'+
      '<button id="attrExport" class="btn" style="background:#1a3a25;color:#8fd48f;padding:3px 12px;font-size:10px" disabled>Export patched GCX</button>'+
    '</div>'+
    // Bulk apply row
    '<div style="padding:6px 12px;background:#0a0e14;border-bottom:1px solid #1a2535;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:10px">'+
      '<span style="color:#889">Bulk:</span>'+
      '<select id="attrBulkType" style="font-size:10px;background:#111826;border:1px solid #223;color:#cde;padding:2px 4px"></select>'+
      '<span style="color:#889">set option</span>'+
      '<select id="attrBulkOpt" style="font-size:10px;background:#111826;border:1px solid #223;color:#cde;padding:2px 4px"></select>'+
      '<span style="color:#889">to</span>'+
      '<input id="attrBulkVal" type="number" style="width:70px;font-size:10px;background:#111826;border:1px solid #223;color:#cde;padding:2px 4px">'+
      '<button id="attrBulkApply" class="btn" style="background:#1f3050;color:#8be;padding:3px 10px;font-size:10px">Apply to all</button>'+
      '<span id="attrBulkInfo" style="color:#667;font-size:9px"></span>'+
    '</div>'+
    '<div style="display:flex;flex:1;min-height:0">'+
      '<div style="width:300px;background:#0d1219;border-right:1px solid #1a2535;overflow-y:auto" id="attrList">'+
        '<div style="padding:10px;color:#666;font-style:italic">Load a stage .gcx to list its entities.</div>'+
      '</div>'+
      '<div style="flex:1;background:#06080d;overflow:auto;padding:12px" id="attrDetail">'+
        '<div style="color:#666;font-style:italic;font-size:11px">Select an entity to edit its attributes.</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(ov);
  ATTR_state.panelEl = ov;
  document.getElementById('attrClose').onclick = closeAttributeChanger;
  document.getElementById('attrMeleeBtn').onclick = function(){
    if(typeof openMeleeEditor === 'function') openMeleeEditor();
    else alert('Melee Hitbox Editor module not loaded in this build.');
  };
  document.getElementById('attrFile').onchange = function(e){
    if(e.target.files[0]) ATTR_loadFile(e.target.files[0]);
  };
  document.getElementById('attrExport').onclick = ATTR_export;
  document.getElementById('attrBulkType').onchange = ATTR_refreshBulkOpts;
  document.getElementById('attrBulkApply').onclick = ATTR_bulkApply;
}

function closeAttributeChanger(){
  if(ATTR_state.panelEl){ ATTR_state.panelEl.remove(); ATTR_state.panelEl = null; }
}

function ATTR_loadFile(file){
  ATTR_state.filename = file.name;
  var info = document.getElementById('attrInfo');
  info.textContent = 'parsing...'; info.style.color = '#888';
  var r = new FileReader();
  r.onload = function(e){
    try {
      ATTR_state.data = new Uint8Array(e.target.result);
      ATTR_state.edits = {};
      ATTR_state.selected = -1;
      ATTR_scanEntities();
      info.style.color = '#7c7';
      info.textContent = file.name + ' — ' + ATTR_state.entities.length + ' entities, ' +
                         ATTR_state.data.length.toLocaleString() + ' bytes';
      document.getElementById('attrExport').disabled = false;
      ATTR_renderList();
      ATTR_refreshBulkTypes();
      document.getElementById('attrDetail').innerHTML =
        '<div style="color:#666;font-style:italic;font-size:11px">Select an entity to edit its attributes.</div>';
      ATTR_updateEditCount();
    } catch(err){
      info.style.color = '#f88';
      info.textContent = 'Failed: ' + err.message;
    }
  };
  r.readAsArrayBuffer(file);
}

function ATTR_renderList(){
  var list = document.getElementById('attrList');
  // group by type
  var groups = {};
  for(var i = 0; i < ATTR_state.entities.length; i++){
    var t = ATTR_state.entities[i].type;
    (groups[t] = groups[t] || []).push(i);
  }
  var types = Object.keys(groups).sort(function(a,b){ return groups[b].length - groups[a].length; });
  var html = '';
  for(var ti = 0; ti < types.length; ti++){
    var t = types[ti];
    var friendly = ATTR_typeLabel(t);
    html += '<div style="padding:5px 10px;background:#101724;border-bottom:1px solid #16202e;color:#8fd48f;font-size:10px;font-weight:bold">'+
            t + (friendly ? ' <span style="color:#667;font-weight:normal">— '+friendly+'</span>' : '') +
            ' <span style="color:#556">×'+groups[t].length+'</span></div>';
    for(var gi = 0; gi < groups[t].length; gi++){
      var ei = groups[t][gi];
      var ent = ATTR_state.entities[ei];
      var isSel = ei === ATTR_state.selected;
      var hasEdit = false;
      for(var k in ATTR_state.edits){ if(k.indexOf(ei+':') === 0){ hasEdit = true; break; } }
      html += '<div onclick="ATTR_select('+ei+')" style="padding:4px 10px 4px 18px;cursor:pointer;border-bottom:1px solid #10161f;font-size:10px;font-family:monospace;background:'+(isSel?'#1a3a55':'transparent')+';color:'+(hasEdit?'#fc8':'#9ab')+'">'+
        (hasEdit?'● ':'')+'0x'+ent.nameHash.toString(16).padStart(4,'0')+
        ' <span style="color:#556">'+ent.opts.map(function(o){return '-'+o.ch;}).join(' ')+'</span></div>';
    }
  }
  list.innerHTML = html || '<div style="padding:10px;color:#666">No CHARA entities found.</div>';
}

function ATTR_select(ei){
  ATTR_state.selected = ei;
  ATTR_renderList();
  ATTR_renderDetail();
}

function ATTR_renderDetail(){
  var ent = ATTR_state.entities[ATTR_state.selected];
  var det = document.getElementById('attrDetail');
  if(!ent){ det.innerHTML = ''; return; }
  var friendly = ATTR_typeLabel(ent.type);
  var html = '<div style="font-size:13px;color:#8fd48f;font-weight:bold;margin-bottom:2px">'+ent.type+
             (friendly ? ' <span style="color:#889;font-weight:normal;font-size:11px">— '+friendly+'</span>' : '')+'</div>';
  html += '<div style="font-size:10px;color:#667;font-family:monospace;margin-bottom:10px">name 0x'+ent.nameHash.toString(16).padStart(4,'0')+'</div>';
  html += '<table style="border-collapse:collapse;font-size:10px;color:#cde">';
  for(var oi = 0; oi < ent.opts.length; oi++){
    var opt = ent.opts[oi];
    var meta = ATTR_optLabel(ent.type, opt.ch);
    html += '<tr style="border-top:1px solid #16202e">'+
      '<td style="padding:5px 10px 5px 0;white-space:nowrap;vertical-align:top">'+
        '<span style="color:#fda;font-family:monospace">-'+opt.ch+'</span> '+
        '<span style="color:#9ab">'+(meta.lbl !== '-'+opt.ch ? meta.lbl : '')+'</span>'+
        (meta.def !== undefined ? ' <span style="color:#556;font-size:9px">(default '+meta.def+')</span>' : '')+
        (meta.desc ? '<br><span style="color:#556;font-size:9px">'+meta.desc+'</span>' : '')+
      '</td><td style="padding:4px 0;vertical-align:top">';
    if(opt.vals.length === 0){
      html += '<span style="color:#556;font-style:italic">flag (no value)</span>';
    }
    for(var vi = 0; vi < opt.vals.length; vi++){
      var rec = opt.vals[vi];
      var key = ATTR_state.selected+':'+oi+':'+vi;
      var edited = ATTR_state.edits[key] !== undefined;
      var kind = rec.v.kind;
      if(ATTR_isEditable(rec.v)){
        var val = ATTR_readVal(rec);
        var disp = (kind === 'char') ? String.fromCharCode(val) : val;
        var style = 'width:'+(kind==='char'?'34':'70')+'px;background:'+(edited?'#3a2a10':'#111826')+';border:1px solid '+(edited?'#c86':'#223')+';color:'+(edited?'#fc8':'#cde')+';padding:2px 4px;font-size:10px;font-family:monospace;text-align:right;margin-right:4px';
        if(kind === 'char'){
          html += '<input id="attr_'+key.replace(/:/g,'_')+'" type="text" maxlength="1" value="'+String(disp).replace(/"/g,'&quot;')+'" style="'+style+';text-align:center" onchange="ATTR_onEdit('+ATTR_state.selected+','+oi+','+vi+')">';
        } else {
          html += '<input id="attr_'+key.replace(/:/g,'_')+'" type="number" value="'+val+'" style="'+style+'" onchange="ATTR_onEdit('+ATTR_state.selected+','+oi+','+vi+')">';
        }
        html += '<span style="color:#445;font-size:8px;margin-right:8px">'+kind+'</span>';
      } else {
        var ro = ATTR_readVal(rec);
        var roDisp = (kind==='strid'||kind==='procid') ? kind+':0x'+ro.toString(16) : '<'+kind+'>';
        html += '<span style="color:#667;font-family:monospace;margin-right:8px" title="not editable in-place">'+roDisp+'</span>';
      }
    }
    html += '</td></tr>';
  }
  html += '</table>';
  html += '<div style="color:#556;font-size:9px;margin-top:12px;max-width:640px;line-height:1.5">'+
    'All edits are IN PLACE (same byte size) — safe for the proc table and every offset in the file. '+
    'Labels come from the entity catalog and are best-effort; the raw -char is always authoritative. '+
    'STRID/PROCID hashes are shown read-only. Values apply on change; use Export to save the patched .gcx.</div>';
  det.innerHTML = html;
}

function ATTR_onEdit(ei, oi, vi){
  var rec = ATTR_state.entities[ei].opts[oi].vals[vi];
  var key = ei+':'+oi+':'+vi;
  var inp = document.getElementById('attr_'+key.replace(/:/g,'_'));
  var kind = rec.v.kind;
  var n;
  if(kind === 'char'){
    var s = inp.value || ' ';
    n = s.charCodeAt(0) & 0xFF;
  } else {
    n = parseInt(inp.value, 10);
    if(isNaN(n)) n = 0;
    if(kind === 'short'){ if(n > 32767) n = 32767; if(n < -32768) n = -32768; }
    if(kind === 'byte' || kind === 'bool'){ if(n > 255) n = 255; if(n < 0) n = 0; }
  }
  var before = ATTR_readVal(rec);
  if(ATTR_state.edits[key] === undefined && n !== before){
    ATTR_state.edits[key] = before;                 // remember original
  }
  ATTR_writeVal(rec, n);
  if(ATTR_state.edits[key] !== undefined && ATTR_readVal(rec) === ATTR_state.edits[key]){
    delete ATTR_state.edits[key];                   // back to original
  }
  ATTR_renderList();
  ATTR_renderDetail();
  ATTR_updateEditCount();
}

function ATTR_updateEditCount(){
  var n = Object.keys(ATTR_state.edits).length;
  var el = document.getElementById('attrEditCount');
  if(el) el.textContent = n ? (n + ' value(s) edited') : '';
}

// ─── Bulk apply ──────────────────────────────────────────────────────────────
function ATTR_refreshBulkTypes(){
  var sel = document.getElementById('attrBulkType');
  var types = {};
  for(var i = 0; i < ATTR_state.entities.length; i++) types[ATTR_state.entities[i].type] = 1;
  var names = Object.keys(types).sort();
  sel.innerHTML = names.map(function(t){ return '<option value="'+t+'">'+t+'</option>'; }).join('');
  ATTR_refreshBulkOpts();
}
function ATTR_refreshBulkOpts(){
  var t = document.getElementById('attrBulkType').value;
  var optSel = document.getElementById('attrBulkOpt');
  var chars = {};
  for(var i = 0; i < ATTR_state.entities.length; i++){
    var ent = ATTR_state.entities[i];
    if(ent.type !== t) continue;
    for(var oi = 0; oi < ent.opts.length; oi++){
      var opt = ent.opts[oi];
      if(opt.vals.length === 1 && ATTR_isEditable(opt.vals[0].v) && opt.vals[0].v.kind !== 'char'){
        chars[opt.ch] = 1;
      }
    }
  }
  var list = Object.keys(chars).sort();
  optSel.innerHTML = list.map(function(c){
    var meta = ATTR_optLabel(t, c);
    return '<option value="'+c+'">-'+c+(meta.lbl!=='-'+c?' ('+meta.lbl+')':'')+'</option>';
  }).join('');
}
function ATTR_bulkApply(){
  var t = document.getElementById('attrBulkType').value;
  var ch = document.getElementById('attrBulkOpt').value;
  var n = parseInt(document.getElementById('attrBulkVal').value, 10);
  if(!t || !ch || isNaN(n)){ alert('Pick a type, an option, and a value.'); return; }
  var applied = 0;
  for(var ei = 0; ei < ATTR_state.entities.length; ei++){
    var ent = ATTR_state.entities[ei];
    if(ent.type !== t) continue;
    for(var oi = 0; oi < ent.opts.length; oi++){
      var opt = ent.opts[oi];
      if(opt.ch !== ch || opt.vals.length !== 1 || !ATTR_isEditable(opt.vals[0].v)) continue;
      var rec = opt.vals[0];
      var key = ei+':'+oi+':0';
      var before = ATTR_readVal(rec);
      if(ATTR_state.edits[key] === undefined && before !== n) ATTR_state.edits[key] = before;
      ATTR_writeVal(rec, n);
      if(ATTR_state.edits[key] !== undefined && ATTR_readVal(rec) === ATTR_state.edits[key]) delete ATTR_state.edits[key];
      applied++;
    }
  }
  document.getElementById('attrBulkInfo').textContent = '✓ set -'+ch+' = '+n+' on '+applied+' '+t+'(s)';
  ATTR_renderList();
  if(ATTR_state.selected >= 0) ATTR_renderDetail();
  ATTR_updateEditCount();
}

function ATTR_export(){
  if(!ATTR_state.data) return;
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ATTR_state.data]));
  a.download = ATTR_state.filename.replace(/\.gcx$/i,'') + '_patched.gcx';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); }, 200);
}
