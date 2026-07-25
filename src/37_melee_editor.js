// ═══════════════════════════════════════════════════════════════════════════
// FILE: 37_melee_editor.js
// ═══════════════════════════════════════════════════════════════════════════
// 37_melee_editor.js — Melee Hitbox Editor (compiled EXE)
// ═══════════════════════════════════════════════════════════════════════════
// Edits the player melee attack-info (PUNCH) structs directly inside a
// compiled PS-X EXE — no source rebuild needed. The structs live as plain
// static data in .data:
//
//   typedef struct _PUNCH {           // 32 bytes
//     SVECTOR offset;   // +0  hit-sphere placement relative to player (i16 x/y/z + pad)
//     SVECTOR size;     // +8  hitbox half-extents (i16 x/y/z + pad)
//     SVECTOR knockback;// +16 knockback vector (i16 x/y/z + pad)
//     int     life;     // +24 HP damage
//     int     faint;    // +28 faint counter / hitstun
//   } PUNCH;
//
// All the ninja + vanilla-punch PUNCH structs are emitted contiguously by
// the compiler (declaration order in sna_init.c), so the whole table can be
// anchored from ANY single struct whose values are still recognizable. That
// makes detection resilient: even after most values have been edited, one
// untouched struct locates everything. Failing that, a saved profile or a
// manual base offset gets you back in.
//
// PS-X EXE mapping: file offset = 0x800 + (vaddr - text_start).
// ═══════════════════════════════════════════════════════════════════════════

var MELEE_state = {
  panelEl: null,
  filename: '',
  data: null,        // Uint8Array of the loaded EXE
  base: -1,          // file offset of the table (ninja_standing_combo_info)
  textVaddr: 0,      // PS-X EXE t_addr for vaddr display
  edits: {},         // "slotIdx-field" -> true (fields differing from load-time values)
  orig: null,        // Uint8Array copy of the table region at load (for revert/highlight)
};

// ─── Move table ──────────────────────────────────────────────────────────────
// off = byte offset of each PUNCH inside the table. sig = the struct's byte
// pattern as of the current sna_init.c (used only for anchoring — a null sig
// means "can't anchor on this one", e.g. the all-zero bullet_block).
function MELEE_punchSig(o, s, k, life, faint){
  var b = [];
  var vals16 = [o[0],o[1],o[2],0, s[0],s[1],s[2],0, k[0],k[1],k[2],0];
  for(var i=0;i<vals16.length;i++){ var v=vals16[i]&0xFFFF; b.push(v&0xFF, v>>8); }
  var vals32 = [life, faint];
  for(var j=0;j<2;j++){ var w=vals32[j]>>>0; b.push(w&0xFF,(w>>8)&0xFF,(w>>16)&0xFF,(w>>24)&0xFF); }
  return b;
}

var MELEE_MOVES = [
  {off:0x000, label:'Standing Combo',      hint:'Circle (no motion) — 3 hits, frames 4/11/22',
   sig: MELEE_punchSig([0,0,600],[900,800,900],[0,0,90],50,2)},
  {off:0x020, label:'Sword Slash / Dash',  hint:'motion + Circle, sword stance (WP_None)',
   sig: MELEE_punchSig([0,0,700],[1200,1000,1200],[0,0,100],192,30)},
  {off:0x040, label:'Pounce',              hint:'R3-forward aerial pounce',
   sig: MELEE_punchSig([0,0,0],[900,900,900],[0,0,50],50,30)},
  {off:0x060, label:'Aerial Strike',       hint:'R3-down slam — fires at frame 52 landing',
   sig: MELEE_punchSig([0,0,400],[800,800,800],[0,0,100],500,30)},
  {off:0x080, label:'Electric AOE',        hint:'R3 held + L3 — wide stun, radial knockback uses X',
   sig: MELEE_punchSig([0,0,0],[2000,2000,2000],[120,0,0],60,60)},
  {off:0x0a0, label:'Teleport Strike',     hint:'teleport strike',
   sig: MELEE_punchSig([0,0,600],[1000,1000,1000],[0,0,200],100,30)},
  {off:0x0c0, label:'Armed Kick',          hint:'motion + Circle, weapon stance — fires at frame 23',
   sig: MELEE_punchSig([0,100,500],[700,500,700],[0,0,180],120,3)},
  {off:0x0e0, label:'Bullet Block',        hint:'all-zero placeholder (no hit)', sig: null},
  {off:0x100, label:'Vanilla Punch 1',     hint:'combo hit 1 (left)',
   sig: MELEE_punchSig([-200,200,600],[400,200,400],[5,0,50],0,1)},
  {off:0x120, label:'Vanilla Punch 2',     hint:'combo hit 2 (right)',
   sig: MELEE_punchSig([200,200,600],[400,200,400],[-5,0,50],0,1)},
  {off:0x140, label:'Vanilla Kick',        hint:'combo hit 3',
   sig: MELEE_punchSig([0,200,600],[500,250,500],[0,0,100],0,3)},
];
var MELEE_TABLE_SIZE = 0x160;

// Field descriptors within one 32-byte PUNCH.
var MELEE_FIELDS = [
  {key:'ox', label:'Off X',  at:0,  w:2}, {key:'oy', label:'Off Y',  at:2,  w:2}, {key:'oz', label:'Off Z',  at:4,  w:2},
  {key:'sx', label:'Size X', at:8,  w:2}, {key:'sy', label:'Size Y', at:10, w:2}, {key:'sz', label:'Size Z', at:12, w:2},
  {key:'kx', label:'KB X',   at:16, w:2}, {key:'ky', label:'KB Y',   at:18, w:2}, {key:'kz', label:'KB Z',   at:20, w:2},
  {key:'dmg',   label:'Damage', at:24, w:4},
  {key:'faint', label:'Faint',  at:28, w:4},
];

// ─── EXE / table access ──────────────────────────────────────────────────────
function MELEE_readField(slotOff, f){
  var p = MELEE_state.base + slotOff + f.at;
  var d = MELEE_state.data;
  if(f.w === 2){
    var v = d[p] | (d[p+1] << 8);
    return (v & 0x8000) ? v - 0x10000 : v;   // signed i16
  }
  var w = (d[p] | (d[p+1]<<8) | (d[p+2]<<16) | (d[p+3]<<24)) | 0;  // signed i32
  return w;
}

function MELEE_writeField(slotOff, f, val){
  var p = MELEE_state.base + slotOff + f.at;
  var d = MELEE_state.data;
  if(f.w === 2){
    var v = val & 0xFFFF;
    d[p] = v & 0xFF; d[p+1] = (v >> 8) & 0xFF;
  } else {
    var w = val >>> 0;
    d[p] = w & 0xFF; d[p+1] = (w>>8) & 0xFF; d[p+2] = (w>>16) & 0xFF; d[p+3] = (w>>24) & 0xFF;
  }
}

// Sanity check a candidate table base: every slot's SVECTOR pad words must be
// zero and life/faint must be small-magnitude ints. This filters false anchors.
function MELEE_validateBase(base){
  var d = MELEE_state.data;
  if(base < 0 || base + MELEE_TABLE_SIZE > d.length) return false;
  for(var m = 0; m < MELEE_MOVES.length; m++){
    var p = base + MELEE_MOVES[m].off;
    // pads at +6, +14, +22
    if(d[p+6]|d[p+7]|d[p+14]|d[p+15]|d[p+22]|d[p+23]) return false;
    var life  = (d[p+24]|(d[p+25]<<8)|(d[p+26]<<16)|(d[p+27]<<24))|0;
    var faint = (d[p+28]|(d[p+29]<<8)|(d[p+30]<<16)|(d[p+31]<<24))|0;
    if(life < -100000 || life > 100000 || faint < -100000 || faint > 100000) return false;
  }
  return true;
}

// Anchor scan: search the EXE for each known struct signature; any unique hit
// implies a base (hit - move.off). Return the first base that validates.
function MELEE_scanForTable(){
  var d = MELEE_state.data;
  for(var m = 0; m < MELEE_MOVES.length; m++){
    var mv = MELEE_MOVES[m];
    if(!mv.sig) continue;
    var sig = mv.sig;
    outer:
    for(var i = 0; i + sig.length <= d.length; i++){
      for(var k = 0; k < sig.length; k++){
        if(d[i+k] !== sig[k]) continue outer;
      }
      var base = i - mv.off;
      if(MELEE_validateBase(base)) return {base: base, anchor: mv.label};
    }
  }
  return null;
}

// ─── UI ──────────────────────────────────────────────────────────────────────
function openMeleeEditor(){
  if(MELEE_state.panelEl) closeMeleeEditor();
  var ov = document.createElement('div');
  ov.id = 'meleeOverlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0a0e14;display:flex;flex-direction:column;font-family:system-ui,sans-serif';
  ov.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#0d1219;border-bottom:1px solid #1a2535">'+
      '<span style="color:#ff9a66;font-size:13px;font-weight:bold">🥋 Melee Hitbox Editor</span>'+
      '<span style="color:#666;font-size:10px">edit PUNCH attack structs directly in a compiled PS-X EXE</span>'+
      '<span style="flex:1"></span>'+
      '<button id="meleeClose" class="btn" style="background:#1a2a3a;color:#7cf;padding:3px 12px;font-size:10px">× Close</button>'+
    '</div>'+
    '<div style="padding:6px 12px;background:#0d1219;border-bottom:1px solid #1a2535;display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:10px">'+
      '<label style="color:#ff9a66;display:flex;align-items:center;gap:4px">EXE: <input id="meleeFile" type="file" accept=".exe,.bin" style="font-size:10px"></label>'+
      '<span id="meleeInfo" style="color:#666"></span>'+
      '<span style="flex:1"></span>'+
      '<button id="meleeProfileSave" class="btn" style="background:#1a2a3a;color:#7cf;padding:3px 10px;font-size:10px" disabled>Save profile</button>'+
      '<label class="btn" style="background:#1a2a3a;color:#7cf;padding:3px 10px;font-size:10px;cursor:pointer">Load profile<input id="meleeProfileLoad" type="file" accept=".json" style="display:none"></label>'+
      '<label style="color:#889;display:flex;align-items:center;gap:4px">Manual base (hex): <input id="meleeManualBase" type="text" placeholder="0xB8A88" style="width:80px;font-size:10px;font-family:monospace;background:#111826;border:1px solid #223;color:#cde;padding:2px 4px"><button id="meleeManualGo" class="btn" style="padding:2px 8px;font-size:10px">Go</button></label>'+
    '</div>'+
    '<div style="padding:6px 12px;background:#0a0e14;border-bottom:1px solid #1a2535;display:flex;align-items:center;gap:10px;font-size:10px">'+
      '<span id="meleeEditCount" style="color:#888;font-size:9px"></span>'+
      '<span style="flex:1"></span>'+
      '<button id="meleeExport" class="btn" style="background:#3a2a1a;color:#fa8;padding:3px 12px;font-size:10px" disabled>Export patched EXE</button>'+
    '</div>'+
    '<div id="meleeBody" style="flex:1;overflow:auto;padding:12px">'+
      '<div style="color:#666;font-style:italic;font-size:11px">Load a compiled PS-X EXE (e.g. mgsi.exe / _mgsi.exe). The editor signature-scans for the melee PUNCH table and lists every move\'s hitbox fields for direct editing.</div>'+
    '</div>';
  document.body.appendChild(ov);
  MELEE_state.panelEl = ov;
  document.getElementById('meleeClose').onclick = closeMeleeEditor;
  document.getElementById('meleeFile').onchange = function(e){
    if(e.target.files[0]) MELEE_loadExe(e.target.files[0]);
  };
  document.getElementById('meleeExport').onclick = MELEE_exportExe;
  document.getElementById('meleeProfileSave').onclick = MELEE_saveProfile;
  document.getElementById('meleeProfileLoad').onchange = function(e){
    if(e.target.files[0]) MELEE_loadProfile(e.target.files[0]);
    e.target.value = '';
  };
  document.getElementById('meleeManualGo').onclick = function(){
    var t = document.getElementById('meleeManualBase').value.trim();
    if(!t) return;
    var v = parseInt(t, 16);
    if(isNaN(v)){ alert('Not a hex number: '+t); return; }
    if(!MELEE_state.data){ alert('Load an EXE first.'); return; }
    if(!MELEE_validateBase(v)){
      if(!confirm('Offset 0x'+v.toString(16)+' fails the table sanity check (pad bytes / value ranges). Use anyway?')) return;
    }
    MELEE_setBase(v, 'manual offset');
  };
}

function closeMeleeEditor(){
  if(MELEE_state.panelEl){ MELEE_state.panelEl.remove(); MELEE_state.panelEl = null; }
}

function MELEE_loadExe(file){
  MELEE_state.filename = file.name;
  var info = document.getElementById('meleeInfo');
  info.textContent = 'scanning...'; info.style.color = '#888';
  var r = new FileReader();
  r.onload = function(e){
    MELEE_state.data = new Uint8Array(e.target.result);
    MELEE_state.base = -1; MELEE_state.edits = {}; MELEE_state.orig = null;
    // PS-X EXE header: text vaddr at +0x18 (for display only — scan is content-based)
    MELEE_state.textVaddr = 0;
    var d = MELEE_state.data;
    var isPsx = d.length > 0x800 && String.fromCharCode.apply(null, d.subarray(0,8)) === 'PS-X EXE';
    if(isPsx) MELEE_state.textVaddr = d[0x18] | (d[0x19]<<8) | (d[0x1a]<<16) | (d[0x1b]<<24);
    var found = MELEE_scanForTable();
    if(found){
      MELEE_setBase(found.base, 'anchored on "'+found.anchor+'"');
    } else {
      info.style.color = '#f88';
      info.textContent = file.name + ' — table not found by signature scan (all structs edited?). Load a profile or enter the base offset manually.';
      document.getElementById('meleeBody').innerHTML =
        '<div style="color:#c86;font-size:11px;padding:8px">No PUNCH-table anchor matched. Options:<br>'+
        '· Load a previously saved profile (it stores the base offset)<br>'+
        '· Enter the base offset manually (the file offset of the Standing Combo struct)<br>'+
        '· Re-scan against an unedited build of the same source and save a profile from it</div>';
      document.getElementById('meleeExport').disabled = true;
      document.getElementById('meleeProfileSave').disabled = true;
    }
  };
  r.readAsArrayBuffer(file);
}

function MELEE_setBase(base, how){
  MELEE_state.base = base;
  MELEE_state.orig = new Uint8Array(MELEE_state.data.subarray(base, base + MELEE_TABLE_SIZE));
  MELEE_state.edits = {};
  MELEE_scanFrames();
  for(var fi = 0; fi < (MELEE_state.frames || []).length; fi++){
    MELEE_state.frames[fi].orig = MELEE_readFrame(MELEE_state.frames[fi]);
  }
  var info = document.getElementById('meleeInfo');
  var va = MELEE_state.textVaddr ? ' (vaddr 0x'+(MELEE_state.textVaddr + (base - 0x800)).toString(16) + ')' : '';
  info.style.color = '#7c7';
  info.textContent = MELEE_state.filename + ' — table @ file 0x' + base.toString(16) + va + ' — ' + how;
  document.getElementById('meleeExport').disabled = false;
  document.getElementById('meleeProfileSave').disabled = false;
  MELEE_renderTable();
}

function MELEE_renderTable(){
  var body = document.getElementById('meleeBody');
  var html = '<table style="border-collapse:collapse;font-size:10px;font-family:monospace;color:#cde">';
  html += '<tr style="color:#889;text-align:right"><th style="text-align:left;padding:4px 8px">Move</th>';
  for(var f=0; f<MELEE_FIELDS.length; f++){
    html += '<th style="padding:4px 6px">'+MELEE_FIELDS[f].label+'</th>';
  }
  html += '<th></th></tr>';
  for(var m=0; m<MELEE_MOVES.length; m++){
    var mv = MELEE_MOVES[m];
    html += '<tr style="border-top:1px solid #16202e">';
    html += '<td style="padding:4px 8px;white-space:nowrap"><span style="color:#ff9a66">'+mv.label+'</span><br><span style="color:#667;font-size:8px;font-family:system-ui">'+mv.hint+'</span></td>';
    for(var fi=0; fi<MELEE_FIELDS.length; fi++){
      var fld = MELEE_FIELDS[fi];
      var val = MELEE_readField(mv.off, fld);
      var edited = MELEE_state.edits[m+'-'+fld.key];
      var style = 'width:56px;background:'+(edited?'#3a2a10':'#111826')+';border:1px solid '+(edited?'#c86':'#223')+';color:'+(edited?'#fc8':'#cde')+';padding:2px 3px;font-size:10px;font-family:monospace;text-align:right';
      html += '<td style="padding:2px 3px"><input id="melee_'+m+'_'+fld.key+'" type="number" value="'+val+'" style="'+style+'" '+
        'onchange="MELEE_onEdit('+m+',\''+fld.key+'\')"></td>';
    }
    html += '<td style="padding:2px 6px"><button class="btn" style="padding:1px 6px;font-size:9px;background:#1a2a3a;color:#7cf" onclick="MELEE_revertRow('+m+')">revert</button></td>';
    html += '</tr>';
  }
  html += '</table>';

  // ─ Hit Frames section ─
  var frames = MELEE_state.frames || [];
  html += '<div style="color:#ff9a66;font-size:11px;font-weight:bold;margin-top:16px;font-family:system-ui">Hit Frames <span style="color:#667;font-weight:normal;font-size:9px">— WHEN each hit fires (patches the compare immediate in code)</span></div>';
  if(frames.length === 0){
    html += '<div style="color:#c86;font-size:10px;font-family:system-ui;margin-top:4px">No frame guards found (non-PS-X EXE, or code shape changed). Hitbox fields above still work.</div>';
  } else {
    html += '<table style="border-collapse:collapse;font-size:10px;font-family:monospace;color:#cde;margin-top:4px">';
    for(var fi = 0; fi < frames.length; fi++){
      var fr = frames[fi];
      var fv = MELEE_readFrame(fr);
      var fEdited = MELEE_state.edits['frame-'+fi];
      var fStyle = 'width:52px;background:'+(fEdited?'#3a2a10':'#111826')+';border:1px solid '+(fEdited?'#c86':'#223')+';color:'+(fEdited?'#fc8':'#cde')+';padding:2px 3px;font-size:10px;font-family:monospace;text-align:right';
      html += '<tr style="border-top:1px solid #16202e">'+
        '<td style="padding:3px 8px;color:'+(fr.known?'#fda':'#9ab')+';font-family:system-ui">'+fr.label+'</td>'+
        '<td style="padding:2px 3px"><input id="meleeFrame_'+fi+'" type="number" min="1" max="200" value="'+fv+'" style="'+fStyle+'" onchange="MELEE_onFrameEdit('+fi+')"></td>'+
        '<td style="padding:3px 8px;color:#556;font-size:9px">@file 0x'+fr.fileOff.toString(16)+'</td>'+
        '</tr>';
    }
    html += '</table>';
    html += '<div style="color:#556;font-size:9px;margin-top:6px;font-family:system-ui;max-width:760px;line-height:1.5">'+
      'Frames count from the move animation\'s start at 60fps (30 in PAL contexts). The animation must still be playing at the chosen frame — a hit set past the anim\'s is_end never fires. '+
      'The two Vanilla Kick guards belong to one if/else pair: keep them equal.</div>';
  }
  html += '<div style="color:#556;font-size:9px;margin-top:10px;font-family:system-ui;max-width:760px;line-height:1.5">'+
    'Offsets are relative to the player, facing-forward = +Z. Sizes are half-extents of the hit box. '+
    'Damage is HP removed per hit; Faint feeds the enemy faint counter (default enemy threshold 10 — values ≥ 10 per hit can KO instead of damage). '+
    'Vector fields are signed 16-bit (−32768..32767); Damage/Faint are 32-bit. '+
    'Frame timings (WHEN a hit fires) are code, not data — they are not editable here.</div>';
  body.innerHTML = html;
  MELEE_updateEditCount();
}

function MELEE_onEdit(m, key){
  var mv = MELEE_MOVES[m];
  var fld = null;
  for(var i=0;i<MELEE_FIELDS.length;i++) if(MELEE_FIELDS[i].key===key){ fld=MELEE_FIELDS[i]; break; }
  var inp = document.getElementById('melee_'+m+'_'+key);
  var v = parseInt(inp.value, 10);
  if(isNaN(v)) v = 0;
  if(fld.w===2){ if(v>32767)v=32767; if(v<-32768)v=-32768; }
  MELEE_writeField(mv.off, fld, v);
  // edited = differs from load-time original
  var origVal = MELEE_readOrig(mv.off, fld);
  if(v !== origVal) MELEE_state.edits[m+'-'+key] = true;
  else delete MELEE_state.edits[m+'-'+key];
  MELEE_renderTable();
}

function MELEE_readOrig(slotOff, f){
  var d = MELEE_state.orig;
  var p = slotOff + f.at;
  if(f.w === 2){
    var v = d[p] | (d[p+1] << 8);
    return (v & 0x8000) ? v - 0x10000 : v;
  }
  return (d[p] | (d[p+1]<<8) | (d[p+2]<<16) | (d[p+3]<<24)) | 0;
}

function MELEE_revertRow(m){
  var mv = MELEE_MOVES[m];
  for(var i=0;i<MELEE_FIELDS.length;i++){
    var fld = MELEE_FIELDS[i];
    MELEE_writeField(mv.off, fld, MELEE_readOrig(mv.off, fld));
    delete MELEE_state.edits[m+'-'+fld.key];
  }
  MELEE_renderTable();
}

function MELEE_updateEditCount(){
  var n = Object.keys(MELEE_state.edits).length;
  var el = document.getElementById('meleeEditCount');
  if(el) el.textContent = n ? (n + ' field(s) edited') : '';
}

function MELEE_exportExe(){
  if(!MELEE_state.data || MELEE_state.base < 0) return;
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([MELEE_state.data]));
  a.download = MELEE_state.filename.replace(/\.exe$/i,'') + '_hitbox.exe';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); }, 200);
}

function MELEE_saveProfile(){
  var profile = {
    kind: 'melee-hitbox-profile', version: 1,
    exeName: MELEE_state.filename,
    exeSize: MELEE_state.data ? MELEE_state.data.length : 0,
    tableFileOffset: MELEE_state.base,
  };
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], {type:'application/json'}));
  a.download = MELEE_state.filename.replace(/\.exe$/i,'') + '_hitbox_profile.json';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); }, 200);
}

function MELEE_loadProfile(file){
  var r = new FileReader();
  r.onload = function(e){
    try {
      var p = JSON.parse(e.target.result);
      if(p.kind !== 'melee-hitbox-profile') throw new Error('not a melee hitbox profile');
      if(!MELEE_state.data){ alert('Load an EXE first, then the profile.'); return; }
      if(p.exeSize && p.exeSize !== MELEE_state.data.length &&
         !confirm('Profile was saved for a '+p.exeSize+'-byte EXE; this one is '+MELEE_state.data.length+' bytes. The offset may be stale. Continue?')) return;
      if(!MELEE_validateBase(p.tableFileOffset) &&
         !confirm('Profile offset 0x'+p.tableFileOffset.toString(16)+' fails the sanity check on this EXE. Use anyway?')) return;
      MELEE_setBase(p.tableFileOffset, 'profile "'+file.name+'"');
    } catch(err){
      alert('Profile load failed: '+err.message);
    }
  };
  r.readAsText(file);
}

// ─── Frame-timing guards ─────────────────────────────────────────────────────
// The WHEN of each hit is a MIPS compare immediate in code:
//     addiu $rX, $zero, FRAME
//     bne/beq $time, $rX, skip      ; skip lands past the PUNCH-struct reference
// Detection is value-independent and derived from the struct table:
//   1. table file offset -> each struct's vaddr (PS-X: vaddr = t_addr + off - 0x800)
//   2. find lui/addiu pairs in code loading that vaddr (the hit-call sites)
//   3. scan back from each site for addiu-$zero/branch pairs whose branch
//      target lands PAST the site — those are the frame guards.
// Identification is by (move, refIndex, guardIndex) order, never by the frame
// VALUE, so guards stay editable after they've been changed.
//
// Labels below assume the current sna_init.c code shape. If the code around a
// call site is restructured in source, re-check labels after a rebuild.
var MELEE_FRAME_LABELS = {
  'standing_combo:0:0': 'Standing Combo — hit 2 frame',
  'standing_combo:1:0': 'Standing Combo — hit 3 (final) frame',
  'slash:3:0':          'Sword Slash — hit frame (sword stance)',
  'slash:3:1':          'Slash/Kick — early-hit window cutoff (≤ frame)',
  'pounce:0:0':         'Pounce — hit frame',
  'aerial_strike:0:0':  'Aerial Strike — landing hit frame',
  'electric:0:0':       'Electric AOE — pulse frame',
  'teleport:0:0':       'Teleport Strike — hit frame',
  'punch_ko:0:0':       'Armed Kick — hit frame',
  'punch_info[2]:0:0':  'Vanilla Kick — frame guard A',
  'punch_info[2]:0:1':  'Vanilla Kick — frame guard B (keep equal to A)',
};
var MELEE_FRAME_KEYS = ['standing_combo','slash','pounce','aerial_strike','electric','teleport','punch_ko','punch_info[0]','punch_info[1]','punch_info[2]'];
var MELEE_FRAME_TABLE_OFF = {
  'standing_combo':0x000,'slash':0x020,'pounce':0x040,'aerial_strike':0x060,
  'electric':0x080,'teleport':0x0a0,'punch_ko':0x0c0,
  'punch_info[0]':0x100,'punch_info[1]':0x120,'punch_info[2]':0x140,
};

function MELEE_scanFrames(){
  MELEE_state.frames = [];
  var d = MELEE_state.data;
  if(!MELEE_state.textVaddr || MELEE_state.base < 0) return;
  var tableV = MELEE_state.textVaddr + (MELEE_state.base - 0x800);
  var nWords = (d.length - 0x800) >> 2;
  function word(i){ var p = 0x800 + i*4; return d[p] | (d[p+1]<<8) | (d[p+2]<<16) | (d[p+3]<<24); }

  for(var mi = 0; mi < MELEE_FRAME_KEYS.length; mi++){
    var key = MELEE_FRAME_KEYS[mi];
    var va = (tableV + MELEE_FRAME_TABLE_OFF[key]) >>> 0;
    var lo = va & 0xFFFF, hi = (va >>> 16) & 0xFFFF;
    if(lo >= 0x8000) hi = (hi + 1) & 0xFFFF;
    var refIdx = 0;
    for(var i = 0; i < nWords; i++){
      var w = word(i);
      if(((w >>> 26) & 0x3F) !== 0x0F || (w & 0xFFFF) !== hi) continue;  // lui
      var rt = (w >>> 16) & 31;
      var isRef = false;
      for(var j = i+1; j < Math.min(i+9, nWords); j++){
        var w2 = word(j);
        if(((w2 >>> 26) & 0x3F) === 0x09 && ((w2 >>> 21) & 31) === rt && (w2 & 0xFFFF) === lo){ isRef = true; break; }
      }
      if(!isRef) continue;
      // guard scan behind this ref
      var guardIdx = 0;
      for(var g = Math.max(0, i-48); g < i; g++){
        var gw = word(g);
        if(((gw >>> 26) & 0x3F) !== 0x09 || ((gw >>> 21) & 31) !== 0) continue;  // addiu rX,$zero,K
        var K = gw & 0xFFFF;
        if(K === 0 || K > 200) continue;
        var rX = (gw >>> 16) & 31;
        for(var b = g+1; b < Math.min(g+5, i); b++){
          var bw = word(b);
          var op = (bw >>> 26) & 0x3F;
          if(op === 4 || op === 5){  // beq / bne
            var rs = (bw >>> 21) & 31, rt2 = (bw >>> 16) & 31;
            if(rs === rX || rt2 === rX){
              var boff = bw & 0xFFFF; if(boff >= 0x8000) boff -= 0x10000;
              if(b + 1 + boff > i){
                var lkey = key+':'+refIdx+':'+guardIdx;
                MELEE_state.frames.push({
                  id: lkey,
                  label: MELEE_FRAME_LABELS[lkey] || (key+' — guard '+(guardIdx+1)+' (ref '+(refIdx+1)+')'),
                  fileOff: 0x800 + g*4,
                  known: !!MELEE_FRAME_LABELS[lkey],
                });
                guardIdx++;
              }
              break;
            }
          }
        }
      }
      refIdx++;
    }
  }
}

function MELEE_readFrame(fr){
  var d = MELEE_state.data;
  return d[fr.fileOff] | (d[fr.fileOff+1] << 8);
}
function MELEE_writeFrame(fr, v){
  var d = MELEE_state.data;
  v = v & 0xFFFF;
  d[fr.fileOff] = v & 0xFF; d[fr.fileOff+1] = (v >> 8) & 0xFF;
}
function MELEE_onFrameEdit(idx){
  var fr = MELEE_state.frames[idx];
  var inp = document.getElementById('meleeFrame_'+idx);
  var v = parseInt(inp.value, 10);
  if(isNaN(v) || v < 1) v = 1;
  if(v > 200) v = 200;
  MELEE_writeFrame(fr, v);
  var origV = fr.orig;
  if(v !== origV) MELEE_state.edits['frame-'+idx] = true;
  else delete MELEE_state.edits['frame-'+idx];
  MELEE_renderTable();
}
