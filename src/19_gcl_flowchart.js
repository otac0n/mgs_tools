// ═══════════════════════════════════════════════════════════════════════════
// FILE: 19_gcl_flowchart.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ═══════════════════════════════════════════════════════════════════════════
// 19_gcl_flowchart.js — Mission Flowchart, Graph View
// ═══════════════════════════════════════════════════════════════════════════
// Blueprints-style visual scripting view of a GCL mission script. The script
// is parsed into nodes (triggers / procs / entities) wired together by typed
// edges (mesg / call / ref). Nodes are laid out in three columns; bezier
// curves connect output pins on the right of one node to input pins on the
// left of another.
//
// HZM file is optional (used only to annotate trigger nodes with zone metadata
// like "this is a CAMERA zone"). All logic comes from the GCL.
// ═══════════════════════════════════════════════════════════════════════════

var FC_state = {
  panelEl: null,
  gclFileName: '', hzmFileName: '',
  entities: [],
  trapZones: [],
  hzdZones: [],
  hzdZonesByName: {},
  procs: [],
  edges: [],
  nodes: [],
  nodeByKey: {},
  canvas: null, ctx: null,
  view: {x:0, y:0, scale:1},
  hover: null, selected: null,
  dragging: false, dragStart: null,
  focusMode: false,
  searchTerm: '',
  ro: null,
};

// ─── Launcher ───────────────────────────────────────────────────────────────
function openMissionFlowchart(){
  if(FC_state.panelEl){ closeMissionFlowchart(); }
  FC_buildPanel();
}

function closeMissionFlowchart(){
  if(FC_state.ro){ try{ FC_state.ro.disconnect(); }catch(e){} FC_state.ro=null; }
  if(FC_state.panelEl){
    try{ FC_state.panelEl.remove(); }catch(e){}
    FC_state.panelEl=null;
  }
  FC_state.canvas=null; FC_state.ctx=null;
}

// ─── DOM construction ───────────────────────────────────────────────────────
function FC_buildPanel(){
  var ov=document.createElement('div');
  ov.id='fcOverlay';
  ov.style.cssText='position:fixed;inset:0;z-index:10000;background:#080c12;display:flex;flex-direction:column;font-family:system-ui,sans-serif';
  ov.innerHTML =
    // Toolbar
    '<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#0d1219;border-bottom:1px solid #1a2535">'+
      '<span style="color:#fa8;font-size:13px;font-weight:bold">🗺 Mission Flowchart</span>'+
      '<span style="color:#666;font-size:10px">graph view — Blueprints-style visual scripting</span>'+
      '<span style="flex:1"></span>'+
      '<button id="fcClear" class="btn" style="background:#3a1f1f;color:#f88;padding:3px 10px;font-size:10px">↻ Clear</button>'+
      '<button id="fcClose" class="btn" style="background:#1a2a3a;color:#7cf;padding:3px 12px;font-size:10px">× Close</button>'+
    '</div>'+
    // File pickers
    '<div style="padding:6px 12px;background:#0d1219;border-bottom:1px solid #1a2535;display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:10px">'+
      '<label style="color:#fa8;display:flex;align-items:center;gap:4px">GCL: <input id="fcGcl" type="file" accept=".gcl,.txt" style="font-size:10px"></label>'+
      '<span id="fcGclInfo" style="color:#666"></span>'+
      '<label style="color:#7c7;display:flex;align-items:center;gap:4px">HZM (optional): <input id="fcHzm" type="file" accept=".hzm" style="font-size:10px"></label>'+
      '<span id="fcHzmInfo" style="color:#666"></span>'+
    '</div>'+
    // Search + focus + legend row
    '<div style="padding:6px 12px;background:#0a0e14;border-bottom:1px solid #1a2535;display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:10px">'+
      '<label style="color:#cde;display:flex;align-items:center;gap:4px">🔍 <input id="fcSearch" type="text" placeholder="search name..." style="background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:2px 6px;font-size:10px;width:180px;font-family:monospace"></label>'+
      '<span id="fcSearchResults" style="color:#666;font-size:9px"></span>'+
      '<span style="flex:1"></span>'+
      '<button id="fcFocusBtn" class="btn" style="background:#1a1530;color:#caa3ff;padding:3px 10px;font-size:10px" title="When ON, only the selected node and its connected neighbors stay full opacity">🎯 Focus mode (off)</button>'+
      '<button id="fcRecenter" class="btn" style="background:#1a2535;color:#aac;padding:3px 10px;font-size:10px" title="Re-fit the graph to the canvas (key: 0)">⊕ Recenter</button>'+
      '<span style="color:#666;margin-left:12px">Wires:</span>'+
      '<span style="color:#fa8">━▶ mesg</span>'+
      '<span style="color:#caa3ff">━▶ call</span>'+
    '</div>'+
    // Main area
    '<div style="display:flex;flex:1;min-height:0">'+
      '<div style="flex:1;position:relative;background:#06080d">'+
        '<canvas id="fcCanvas" style="display:block;width:100%;height:100%"></canvas>'+
        '<div style="position:absolute;top:8px;left:8px;color:#666;font-size:9px;font-family:monospace;pointer-events:none">L-drag pan · wheel zoom · click node to select · 0 recenter · F focus · Esc deselect</div>'+
        '<div id="fcStatus" style="position:absolute;bottom:8px;left:8px;color:#888;font-size:10px;font-family:monospace;pointer-events:none"></div>'+
        '<div id="fcTooltip" style="position:absolute;display:none;background:rgba(15,20,30,0.95);border:1px solid #2a3a5a;border-radius:3px;padding:4px 8px;font-size:10px;color:#cde;font-family:monospace;pointer-events:none;z-index:10;max-width:380px;white-space:nowrap"></div>'+
      '</div>'+
      '<div style="width:340px;background:#0d1219;border-left:1px solid #1a2535;display:flex;flex-direction:column;min-height:0">'+
        '<div style="padding:8px 12px;border-bottom:1px solid #1a2535;color:#fa8;font-size:11px;font-weight:bold">Details</div>'+
        '<div id="fcDetails" style="flex:1;overflow-y:auto;padding:8px 12px;font-size:10px;color:#aac;font-family:monospace;line-height:1.5">'+
          '<div style="color:#666;font-style:italic;font-family:system-ui">Load a .gcl file to see the mission graph. HZM is optional — it just adds zone metadata to trigger nodes.</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(ov);
  FC_state.panelEl=ov;
  document.getElementById('fcClose').onclick=closeMissionFlowchart;
  document.getElementById('fcClear').onclick=FC_clearAll;
  document.getElementById('fcGcl').onchange=function(e){ if(e.target.files[0]) FC_loadGCL(e.target.files[0]); };
  document.getElementById('fcHzm').onchange=function(e){ if(e.target.files[0]) FC_loadHZM(e.target.files[0]); };
  document.getElementById('fcSearch').oninput=function(e){
    FC_state.searchTerm=e.target.value.trim();
    FC_updateSearchResultCount();
    FC_render();
  };
  document.getElementById('fcFocusBtn').onclick=function(){
    FC_state.focusMode=!FC_state.focusMode;
    var btn=document.getElementById('fcFocusBtn');
    btn.textContent=FC_state.focusMode ? '🎯 Focus mode (ON)' : '🎯 Focus mode (off)';
    btn.style.background=FC_state.focusMode ? '#3a2a5a' : '#1a1530';
    FC_render();
  };
  document.getElementById('fcRecenter').onclick=function(){ FC_recenterIfReady(); FC_render(); };
  FC_state.canvas=document.getElementById('fcCanvas');
  FC_state.ctx=FC_state.canvas.getContext('2d');
  FC_wireCanvas();
  FC_resizeCanvas();
  try {
    FC_state.ro=new ResizeObserver(FC_resizeCanvas);
    FC_state.ro.observe(FC_state.canvas);
  } catch(e) { window.addEventListener('resize', FC_resizeCanvas); }
  FC_render();
}

function FC_clearAll(){
  FC_state.entities=[]; FC_state.trapZones=[]; FC_state.hzdZones=[]; FC_state.hzdZonesByName={};
  FC_state.procs=[]; FC_state.edges=[]; FC_state.nodes=[]; FC_state.nodeByKey={};
  FC_state.gclFileName=''; FC_state.hzmFileName='';
  FC_state.selected=null; FC_state.hover=null;
  FC_state.searchTerm='';
  var s=document.getElementById('fcSearch'); if(s) s.value='';
  var r=document.getElementById('fcSearchResults'); if(r) r.textContent='';
  document.getElementById('fcGclInfo').textContent='';
  document.getElementById('fcHzmInfo').textContent='';
  document.getElementById('fcDetails').innerHTML='<div style="color:#666;font-style:italic;font-family:system-ui">Load a .gcl file to see the mission graph.</div>';
  FC_render();
}

function FC_resizeCanvas(){
  if(!FC_state.canvas) return;
  var dpr=window.devicePixelRatio||1;
  var r=FC_state.canvas.getBoundingClientRect();
  FC_state.canvas.width=Math.max(100, Math.floor(r.width*dpr));
  FC_state.canvas.height=Math.max(100, Math.floor(r.height*dpr));
  FC_state.ctx.setTransform(dpr,0,0,dpr,0,0);
  FC_render();
}

// ─── File loaders ───────────────────────────────────────────────────────────
function FC_loadGCL(file){
  FC_state.gclFileName=file.name;
  var info=document.getElementById('fcGclInfo');
  info.textContent='loading...';
  info.style.color='#888';
  var r=new FileReader();
  r.onload=function(e){
    try {
      var text=new TextDecoder('utf-8',{fatal:false}).decode(new Uint8Array(e.target.result));
      var parsed=FC_parseGCL(text);
      FC_state.entities=parsed.entities;
      FC_state.trapZones=parsed.trapZones;
      FC_state.procs=parsed.procs;
      FC_buildEdges();
      FC_buildGraph();
      info.style.color='#7c7';
      info.textContent=file.name+' — '+parsed.entities.length+' entities, '+parsed.trapZones.length+' triggers, '+parsed.procs.length+' procs';
      FC_recenterIfReady();
      FC_updateSearchResultCount();
      FC_render();
    } catch(err) {
      info.style.color='#f88'; info.textContent='Parse error: '+err.message;
    }
  };
  r.readAsArrayBuffer(file);
}

function FC_loadHZM(file){
  FC_state.hzmFileName=file.name;
  var info=document.getElementById('fcHzmInfo');
  info.textContent='loading...';
  info.style.color='#888';
  var r=new FileReader();
  r.onload=function(e){
    try {
      var parsed=FC_parseHZM(new Uint8Array(e.target.result));
      FC_state.hzdZones=parsed.zones;
      FC_state.hzdZonesByName={};
      for(var i=0;i<parsed.zones.length;i++){
        if(parsed.zones[i].name) FC_state.hzdZonesByName[parsed.zones[i].name]=parsed.zones[i];
      }
      FC_buildGraph();
      info.style.color='#7c7';
      info.textContent=file.name+' — '+parsed.zones.length+' zones';
      FC_render();
    } catch(err) {
      info.style.color='#f88'; info.textContent='Parse error: '+err.message;
    }
  };
  r.readAsArrayBuffer(file);
}

// ─── GCL parsing ────────────────────────────────────────────────────────────
function FC_parseGCL(text){
  var fullText=text.replace(/\r/g,'');
  var entities=[];
  // chara INSTANCE_NAME TYPE_ID -opts...
  var charaRe=/chara\s+(\w+)\s+(\S+)\s*((?:\\\n|[^}])*?)(?=\n\s*(?:chara|mesg|eval|map|trap|ntrap|if|else|}|radio|func|delay|call|hzd|proc|#|$))/g;
  var m;
  while((m=charaRe.exec(fullText))!==null){
    var name=m[1], type=m[2], params=m[3].replace(/\\\n/g,' ');
    var ent={kind:'chara', type:type, name:name, raw:params.trim()};
    var pm=params.match(/-pos\s+(-?\d+),(-?\d+),(-?\d+)/);
    if(pm) ent.pos={x:+pm[1], y:+pm[2], z:+pm[3]};
    var nm=params.match(/-n\s+(-?\d+),(-?\d+),(-?\d+)/);
    if(nm && !ent.pos) ent.pos={x:+nm[1], y:+nm[2], z:+nm[3]};
    var dm=params.match(/-dir\s+(-?\d+),(-?\d+),(-?\d+)/);
    if(dm) ent.dir={x:+dm[1], y:+dm[2], z:+dm[3]};
    var rm=params.match(/-route\s+(\d+)/);
    if(rm) ent.route=+rm[1];
    var em=params.match(/-exec\s+(\w+)|-e\s+(\w+)(?!\w)/);
    if(em) ent.exec=em[1]||em[2];
    var hm=params.match(/-h\s+(\d+)/);
    if(hm) ent.height=+hm[1];
    entities.push(ent);
  }
  var snakeRe=/snake\s+(?:-pos|-n)\s+(-?\d+),(-?\d+),(-?\d+)(?:\s+-(?:pos|n|dir)\s+(-?\d+),(-?\d+),(-?\d+))?/;
  var sm=fullText.match(snakeRe);
  if(sm){
    var snake={kind:'snake', type:'SNAKE', name:'SNAKE', pos:{x:+sm[1], y:+sm[2], z:+sm[3]}};
    if(sm[4]) snake.dir={x:+sm[4], y:+sm[5], z:+sm[6]};
    entities.push(snake);
  }
  var trapZones=[];
  var trapRe=/(n?trap)\s+(\w+)\s+(\S+)(?:\s+(\w+))?\s*([\{\\])/g;
  var t;
  while((t=trapRe.exec(fullText))!==null){
    var tkind=t[1], tzone=t[2], ttarget=t[3], tcond=t[4]||'', bodyStart=t.index+t[0].length, tBody='';
    if(t[5]==='{'){
      var depth=1, p=bodyStart;
      while(p<fullText.length && depth>0){
        if(fullText[p]==='{') depth++;
        else if(fullText[p]==='}') depth--;
        if(depth>0) p++;
      }
      tBody=fullText.slice(bodyStart, p);
    } else {
      var p2=bodyStart, lineEnd;
      while(p2<fullText.length){
        lineEnd=fullText.indexOf('\n', p2);
        if(lineEnd<0) lineEnd=fullText.length;
        var line=fullText.slice(p2, lineEnd);
        tBody+=line+'\n';
        if(!line.trimEnd().endsWith('\\')) break;
        p2=lineEnd+1;
      }
    }
    var bodyInfo = FC_parseBody(tBody);
    if(ttarget && bodyInfo.referencedNames.indexOf(ttarget) < 0) bodyInfo.referencedNames.push(ttarget);
    trapZones.push({
      kind:tkind, zoneName:tzone, target:ttarget, cond:tcond,
      body:tBody.trim(),
      operations:bodyInfo.operations,
      calledProcs:bodyInfo.calledProcs,
      sentMessages:bodyInfo.sentMessages,
      referencedNames:bodyInfo.referencedNames
    });
  }
  var procs=[];
  var procRe=/proc\s+(\w+)\s*\{/g;
  var pm2;
  while((pm2=procRe.exec(fullText))!==null){
    var procName=pm2[1], procStart=pm2.index+pm2[0].length, depth2=1, q=procStart;
    while(q<fullText.length && depth2>0){
      if(fullText[q]==='{') depth2++;
      else if(fullText[q]==='}') depth2--;
      if(depth2>0) q++;
    }
    var pBody=fullText.slice(procStart, q);
    var procBodyInfo=FC_parseBody(pBody);
    procs.push({
      name:procName, body:pBody.trim(),
      operations:procBodyInfo.operations,
      calledProcs:procBodyInfo.calledProcs,
      sentMessages:procBodyInfo.sentMessages,
      referencedNames:procBodyInfo.referencedNames
    });
  }
  return {entities:entities, trapZones:trapZones, procs:procs};
}

// Shared body parser: extracts the things any block of script can do, as an
// ORDERED list of operations (call/exec/mesg). Order matters for pin layout —
// the first mesg in a trap body is the first output pin on its node.
function FC_parseBody(body){
  var operations=[];
  var calledProcs=[];
  var sentMessages=[];
  var opsRe=/(call|exec|mesg)[ \t]+(\S+)(?:[ \t]+(\S+))?/g;
  var op;
  while((op=opsRe.exec(body))!==null){
    var kw=op[1], a=op[2], b=op[3]||'';
    a=a.replace(/[},;{]+$/, '');
    b=b.replace(/[},;{]+$/, '');
    if(kw==='call' || kw==='exec'){
      if(a){
        operations.push({type:'call', target:a});
        calledProcs.push(a);
      }
    } else if(kw==='mesg'){
      if(a && b){
        operations.push({type:'mesg', target:a, message:b});
        sentMessages.push({target:a, message:b});
      }
    }
  }
  var nameRe=/\b([A-Za-z_][A-Za-z0-9_]{1,20})\b/g;
  var seen={};
  var referencedNames=[];
  var nm2;
  while((nm2=nameRe.exec(body))!==null){
    if(!seen[nm2[1]]){ seen[nm2[1]]=1; referencedNames.push(nm2[1]); }
  }
  for(var s=0;s<sentMessages.length;s++){
    if(!seen[sentMessages[s].target]){
      seen[sentMessages[s].target]=1;
      referencedNames.push(sentMessages[s].target);
    }
  }
  return {operations:operations, calledProcs:calledProcs, sentMessages:sentMessages, referencedNames:referencedNames};
}

// ─── HZM parsing (slim — used only for trigger node metadata) ───────────────
function FC_parseHZM(u8){
  var v=new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var areaCount=v.getInt16(0x0a, true);
  var zones=[];
  for(var i=0;i<areaCount;i++){
    var ao=0x1c + i*24;
    if(ao+24 > u8.length) break;
    var zc=v.getUint16(ao+4,true);
    var zo=v.getUint32(ao+16,true);
    for(var z=0;z<zc;z++){
      var zp=zo + z*32;
      if(zp+32 > u8.length) break;
      var nm='';
      for(var bi=0;bi<14;bi++){
        var ch=u8[zp+16+bi];
        if(ch>=32 && ch<127) nm+=String.fromCharCode(ch);
      }
      zones.push({
        areaIdx:i, idx:z, name:nm,
        x1:v.getInt16(zp,true),   z1:v.getInt16(zp+2,true),
        y1:v.getInt16(zp+4,true),
        x2:v.getInt16(zp+8,true), z2:v.getInt16(zp+10,true),
        y2:v.getInt16(zp+12,true),
        id1:u8[zp+28], id2:u8[zp+29],
        isCamera: u8[zp+29]===0xff
      });
    }
  }
  return {zones:zones};
}

// ─── Message ID label table ─────────────────────────────────────────────────
// Best-guess human-readable names for known message IDs. Empty means
// "not in our table" — those will show the raw hex only.
var FC_messageLabels = {
  '0xbf4c': 'toggle route',     // user's Heliport build uses this for route changes on kill
  '0xb000': 'init',             // ?
  '0xb001': 'spawn',            // ?
  '0xb002': 'despawn',          // ?
  '0xb100': 'alert',            // ?
  '0xb200': 'kill',             // ?
  '0xb300': 'state change',     // ?
  '0xb400': 'camera switch',    // ?
};

function FC_labelMessage(msg){
  if(!msg) return '';
  var lower=msg.toLowerCase();
  if(FC_messageLabels[lower]) return FC_messageLabels[lower]+' ('+msg+')';
  return msg;
}

// ─── Edge construction ──────────────────────────────────────────────────────
function FC_buildEdges(){
  FC_state.edges=[];
  var entByName={}, procByName={};
  for(var i=0;i<FC_state.entities.length;i++) entByName[FC_state.entities[i].name]=i;
  for(var p=0;p<FC_state.procs.length;p++) procByName[FC_state.procs[p].name]=p;
  // Trap operations → edges
  for(var t=0;t<FC_state.trapZones.length;t++){
    var trap=FC_state.trapZones[t];
    var from={kind:'trap', idx:t};
    for(var k=0;k<trap.operations.length;k++){
      var op=trap.operations[k];
      var to=FC_resolveTarget(op.target, op.type, entByName, procByName);
      if(!to) continue;
      FC_state.edges.push({from:from, fromPin:k, to:to, type:op.type, label:op.message||''});
    }
  }
  // Proc operations → edges
  for(var pi=0;pi<FC_state.procs.length;pi++){
    var pr=FC_state.procs[pi];
    var pfrom={kind:'proc', idx:pi};
    for(var pk=0;pk<pr.operations.length;pk++){
      var pop=pr.operations[pk];
      var pto=FC_resolveTarget(pop.target, pop.type, entByName, procByName);
      if(!pto) continue;
      if(pto.kind==='proc' && pto.idx===pi) continue; // skip self-loops
      FC_state.edges.push({from:pfrom, fromPin:pk, to:pto, type:pop.type, label:pop.message||''});
    }
  }
}

function FC_resolveTarget(name, opType, entByName, procByName){
  if(opType==='call'){
    if(procByName[name] !== undefined) return {kind:'proc', idx:procByName[name]};
    return null;
  }
  if(entByName[name] !== undefined) return {kind:'entity', idx:entByName[name]};
  if(procByName[name] !== undefined) return {kind:'proc', idx:procByName[name]};
  return null;
}

// ─── Graph layout ───────────────────────────────────────────────────────────
var FC_LAYOUT = {
  colX: [60, 460, 860],
  colW: [340, 340, 280],
  headerH: 38,
  pinRowH: 18,
  padBottom: 8,
  nodeGap: 16,
  startY: 40,
  pinR: 4,
};

function FC_buildGraph(){
  FC_state.nodes=[];
  FC_state.nodeByKey={};
  var L=FC_LAYOUT;
  // Deterministic ordering by name for stability across loads
  var trapOrder=FC_state.trapZones.map(function(_,i){return i;})
    .sort(function(a,b){
      return FC_state.trapZones[a].zoneName.localeCompare(FC_state.trapZones[b].zoneName);
    });
  var procOrder=FC_state.procs.map(function(_,i){return i;})
    .sort(function(a,b){return FC_state.procs[a].name.localeCompare(FC_state.procs[b].name);});
  var entOrder=FC_state.entities.map(function(_,i){return i;})
    .sort(function(a,b){return FC_state.entities[a].name.localeCompare(FC_state.entities[b].name);});

  // Column 0: triggers
  var y=L.startY;
  for(var i=0;i<trapOrder.length;i++){
    var ti=trapOrder[i];
    var trap=FC_state.trapZones[ti];
    var nPins=trap.operations.length;
    var h=L.headerH + Math.max(1, nPins)*L.pinRowH + L.padBottom;
    var node={
      kind:'trap', idx:ti, x:L.colX[0], y:y, w:L.colW[0], h:h,
      title:trap.zoneName,
      subtitle:(trap.kind==='ntrap'?'ntrap':'trap')+' · target: '+trap.target+(trap.cond?' · '+trap.cond:''),
      headerColor:trap.kind==='ntrap' ? '#5588cc' : '#cc7733',
      pins:[]
    };
    if(nPins===0){
      node.pins.push({idx:0, label:'(empty body)', placeholder:true});
    } else {
      for(var k=0;k<nPins;k++){
        var op=trap.operations[k];
        var label=op.type==='call'
          ? '→ call '+op.target
          : '→ '+op.target+' « '+FC_labelMessage(op.message);
        node.pins.push({idx:k, label:label, op:op});
      }
    }
    FC_state.nodes.push(node);
    FC_state.nodeByKey['trap:'+ti]=node;
    y+=h+L.nodeGap;
  }

  // Column 1: procs
  y=L.startY;
  for(var i2=0;i2<procOrder.length;i2++){
    var pi=procOrder[i2];
    var pr=FC_state.procs[pi];
    var nPins2=pr.operations.length;
    var h2=L.headerH + Math.max(1, nPins2)*L.pinRowH + L.padBottom;
    var pnode={
      kind:'proc', idx:pi, x:L.colX[1], y:y, w:L.colW[1], h:h2,
      title:pr.name,
      subtitle:'proc · '+nPins2+' operation'+(nPins2===1?'':'s'),
      headerColor:'#9966cc',
      pins:[],
      hasInputPin:true
    };
    if(nPins2===0){
      pnode.pins.push({idx:0, label:'(empty body)', placeholder:true});
    } else {
      for(var k2=0;k2<nPins2;k2++){
        var op2=pr.operations[k2];
        var label2=op2.type==='call'
          ? '→ call '+op2.target
          : '→ '+op2.target+' « '+FC_labelMessage(op2.message);
        pnode.pins.push({idx:k2, label:label2, op:op2});
      }
    }
    FC_state.nodes.push(pnode);
    FC_state.nodeByKey['proc:'+pi]=pnode;
    y+=h2+L.nodeGap;
  }

  // Column 2: entities
  y=L.startY;
  for(var i3=0;i3<entOrder.length;i3++){
    var ei=entOrder[i3];
    var e=FC_state.entities[ei];
    var meta=[];
    if(e.route !== undefined) meta.push('route '+e.route);
    if(e.exec) meta.push('exec '+e.exec);
    if(e.pos) meta.push('('+e.pos.x+', '+e.pos.z+')');
    var nMetaRows=Math.max(1, meta.length);
    var h3=L.headerH + nMetaRows*L.pinRowH + L.padBottom;
    var enode={
      kind:'entity', idx:ei, x:L.colX[2], y:y, w:L.colW[2], h:h3,
      title:e.name,
      subtitle:e.kind==='snake' ? 'SNAKE spawn' : 'type: '+e.type,
      headerColor:FC_entityColor(e),
      meta:meta,
      hasInputPin:true,
      pins:[]
    };
    FC_state.nodes.push(enode);
    FC_state.nodeByKey['entity:'+ei]=enode;
    y+=h3+L.nodeGap;
  }
}

function FC_entityColor(e){
  var t=(e.type||'').toLowerCase();
  if(e.kind==='snake') return '#3399cc';
  if(t.indexOf('camera')>=0 || t==='cam') return '#669933';
  if(t.indexOf('light')>=0 || t==='sl') return '#cc9933';
  if(t.indexOf('item')>=0 || t==='it') return '#cc6699';
  if(t.indexOf('door')>=0 || t==='dr') return '#996666';
  if(t.indexOf('mine')>=0) return '#cc4444';
  if(t.indexOf('gun')>=0) return '#aa6666';
  return '#cc7744';
}

// Pin position in WORLD coords (before view transform).
function FC_pinPos(node, pinIdx, isOutput){
  var L=FC_LAYOUT;
  if(isOutput){
    var rowY=node.y + L.headerH + pinIdx*L.pinRowH + L.pinRowH/2;
    return {x:node.x + node.w, y:rowY};
  } else {
    return {x:node.x, y:node.y + L.headerH/2};
  }
}

// ─── Neighborhood + search ──────────────────────────────────────────────────
function FC_isInNeighborhood(kind, idx){
  var sel=FC_state.selected;
  if(!sel) return true;
  if(sel.kind===kind && sel.idx===idx) return true;
  for(var i=0;i<FC_state.edges.length;i++){
    var e=FC_state.edges[i];
    var fromIsSel=(e.from.kind===sel.kind && e.from.idx===sel.idx);
    var toIsSel=(e.to.kind===sel.kind && e.to.idx===sel.idx);
    var fromIsThis=(e.from.kind===kind && e.from.idx===idx);
    var toIsThis=(e.to.kind===kind && e.to.idx===idx);
    if((fromIsSel && toIsThis) || (toIsSel && fromIsThis)) return true;
  }
  return false;
}

function FC_matchesSearch(name){
  if(!FC_state.searchTerm || !name) return false;
  return name.toLowerCase().indexOf(FC_state.searchTerm.toLowerCase()) >= 0;
}

function FC_updateSearchResultCount(){
  var el=document.getElementById('fcSearchResults');
  if(!el) return;
  if(!FC_state.searchTerm){ el.textContent=''; return; }
  var count=0;
  for(var i=0;i<FC_state.nodes.length;i++) if(FC_matchesSearch(FC_state.nodes[i].title)) count++;
  el.textContent=count+' match'+(count===1?'':'es');
  el.style.color = count > 0 ? '#7c7' : '#f88';
}

// ─── Recenter ───────────────────────────────────────────────────────────────
function FC_recenterIfReady(){
  if(FC_state.nodes.length===0) return;
  var minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for(var i=0;i<FC_state.nodes.length;i++){
    var n=FC_state.nodes[i];
    if(n.x < minX) minX=n.x;
    if(n.x+n.w > maxX) maxX=n.x+n.w;
    if(n.y < minY) minY=n.y;
    if(n.y+n.h > maxY) maxY=n.y+n.h;
  }
  var cw=FC_state.canvas.clientWidth, ch=FC_state.canvas.clientHeight;
  var w=maxX-minX, h=maxY-minY;
  if(w<1) w=1; if(h<1) h=1;
  var sx=(cw-80)/w, sy=(ch-80)/h;
  FC_state.view.scale=Math.min(sx, sy, 1.5);
  var midX=(minX+maxX)/2, midY=(minY+maxY)/2;
  FC_state.view.x=cw/2 - midX*FC_state.view.scale;
  FC_state.view.y=ch/2 - midY*FC_state.view.scale;
}

// ─── Coordinate transform ───────────────────────────────────────────────────
function FC_w2c(x, y){
  return {x: x*FC_state.view.scale + FC_state.view.x, y: y*FC_state.view.scale + FC_state.view.y};
}
function FC_c2w(cx, cy){
  return {x: (cx - FC_state.view.x)/FC_state.view.scale, y: (cy - FC_state.view.y)/FC_state.view.scale};
}

// ─── Render ─────────────────────────────────────────────────────────────────
function FC_render(){
  if(!FC_state.ctx) return;
  var ctx=FC_state.ctx, canvas=FC_state.canvas;
  var w=canvas.clientWidth, h=canvas.clientHeight;
  ctx.fillStyle='#06080d';
  ctx.fillRect(0,0,w,h);
  // Subtle column shading
  var L=FC_LAYOUT;
  for(var c=0;c<3;c++){
    var topL=FC_w2c(L.colX[c]-12, 0);
    var botR=FC_w2c(L.colX[c]+L.colW[c]+12, 0);
    ctx.fillStyle = c===0 ? 'rgba(204,119,51,0.03)'
                  : c===1 ? 'rgba(153,102,204,0.03)'
                  : 'rgba(204,119,68,0.03)';
    ctx.fillRect(topL.x, 0, botR.x-topL.x, h);
  }
  // Column labels
  if(FC_state.view.scale > 0.3){
    ctx.font='bold 11px monospace';
    ctx.textAlign='left';
    var labels=['◆ TRIGGERS','◆ PROCS','◆ ENTITIES'];
    var labelColors=['#cc7733','#9966cc','#cc7744'];
    for(var lc=0;lc<3;lc++){
      var p=FC_w2c(L.colX[lc], L.startY-22);
      ctx.fillStyle=labelColors[lc];
      ctx.fillText(labels[lc], p.x, p.y);
    }
  }
  // Wires under nodes
  FC_renderWires(ctx);
  // Nodes
  for(var n=0;n<FC_state.nodes.length;n++) FC_renderNode(ctx, FC_state.nodes[n]);
  // Search highlights on top
  if(FC_state.searchTerm) FC_renderSearchHighlights(ctx);
  // Status
  var status=[];
  status.push(FC_state.nodes.length+' nodes');
  status.push(FC_state.edges.length+' edges');
  if(FC_state.focusMode) status.push('FOCUS');
  status.push('zoom '+FC_state.view.scale.toFixed(2));
  document.getElementById('fcStatus').textContent=status.join(' · ');
}

function FC_renderNode(ctx, node){
  var L=FC_LAYOUT;
  var p=FC_w2c(node.x, node.y);
  var pw=node.w*FC_state.view.scale;
  var ph=node.h*FC_state.view.scale;
  var isSel=FC_state.selected && FC_state.selected.kind===node.kind && FC_state.selected.idx===node.idx;
  var isHover=FC_state.hover && FC_state.hover.kind===node.kind && FC_state.hover.idx===node.idx;
  var dim=FC_state.focusMode && !FC_isInNeighborhood(node.kind, node.idx);
  ctx.save();
  if(dim) ctx.globalAlpha=0.2;
  ctx.fillStyle='#0d1219';
  ctx.fillRect(p.x, p.y, pw, ph);
  ctx.strokeStyle = isSel ? '#ff0' : (isHover ? '#fff' : '#1a2535');
  ctx.lineWidth = isSel ? 2 : 1;
  ctx.strokeRect(p.x, p.y, pw, ph);
  var headerH=L.headerH*FC_state.view.scale;
  ctx.fillStyle=node.headerColor;
  ctx.fillRect(p.x, p.y, pw, headerH);
  if(FC_state.view.scale > 0.4){
    ctx.fillStyle='#0a0e14';
    ctx.font='bold '+(13*FC_state.view.scale)+'px monospace';
    ctx.textAlign='left';
    ctx.fillText(node.title, p.x + 8*FC_state.view.scale, p.y + 16*FC_state.view.scale);
    ctx.fillStyle='rgba(10,14,20,0.7)';
    ctx.font=(10*FC_state.view.scale)+'px monospace';
    ctx.fillText(node.subtitle, p.x + 8*FC_state.view.scale, p.y + 30*FC_state.view.scale);
  }
  // Input pin on left edge of header
  if(node.hasInputPin){
    var ipp=FC_pinPos(node, 0, false);
    var ipPx=FC_w2c(ipp.x, ipp.y);
    ctx.fillStyle='#cde';
    ctx.strokeStyle='#1a2535';
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.arc(ipPx.x, ipPx.y, L.pinR*FC_state.view.scale, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();
  }
  // Output pin rows
  if(FC_state.view.scale > 0.4){
    for(var i=0;i<node.pins.length;i++){
      var pin=node.pins[i];
      var rowY = node.y + L.headerH + i*L.pinRowH;
      var rowPx=FC_w2c(node.x, rowY);
      ctx.fillStyle = pin.placeholder ? '#444' : '#cde';
      ctx.font=(10*FC_state.view.scale)+'px monospace';
      ctx.textAlign='left';
      var txt=pin.label;
      var maxChars=Math.floor((node.w - 28) / 6);
      if(txt.length > maxChars) txt=txt.slice(0, maxChars-1)+'…';
      ctx.fillText(txt, rowPx.x + 8*FC_state.view.scale, rowPx.y + 13*FC_state.view.scale);
      if(!pin.placeholder){
        var opp=FC_pinPos(node, i, true);
        var oPx=FC_w2c(opp.x, opp.y);
        var anyEdge=null;
        for(var ei=0;ei<FC_state.edges.length;ei++){
          var ed=FC_state.edges[ei];
          if(ed.from.kind===node.kind && ed.from.idx===node.idx && ed.fromPin===i){
            anyEdge=ed; break;
          }
        }
        ctx.fillStyle = anyEdge ? (anyEdge.type==='call'?'#caa3ff':'#fa8') : '#555';
        ctx.strokeStyle='#1a2535';
        ctx.beginPath();
        ctx.arc(oPx.x, oPx.y, L.pinR*FC_state.view.scale, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  // Entity meta rows
  if(node.kind==='entity' && FC_state.view.scale > 0.4 && node.meta){
    for(var mi=0;mi<node.meta.length;mi++){
      var mrowY = node.y + L.headerH + mi*L.pinRowH;
      var mrowPx=FC_w2c(node.x, mrowY);
      ctx.fillStyle='#8aa';
      ctx.font=(10*FC_state.view.scale)+'px monospace';
      ctx.fillText(node.meta[mi], mrowPx.x + 12*FC_state.view.scale, mrowPx.y + 13*FC_state.view.scale);
    }
  }
  ctx.restore();
}

function FC_renderWires(ctx){
  for(var i=0;i<FC_state.edges.length;i++){
    var edge=FC_state.edges[i];
    var srcKey=edge.from.kind+':'+edge.from.idx;
    var dstKey=edge.to.kind+':'+edge.to.idx;
    var srcNode=FC_state.nodeByKey[srcKey];
    var dstNode=FC_state.nodeByKey[dstKey];
    if(!srcNode || !dstNode) continue;
    var sP=FC_pinPos(srcNode, edge.fromPin, true);
    var tP=FC_pinPos(dstNode, 0, false);
    var sPx=FC_w2c(sP.x, sP.y);
    var tPx=FC_w2c(tP.x, tP.y);
    var connectedToSel=true;
    if(FC_state.focusMode && FC_state.selected){
      var sel=FC_state.selected;
      connectedToSel = (edge.from.kind===sel.kind && edge.from.idx===sel.idx) ||
                       (edge.to.kind===sel.kind && edge.to.idx===sel.idx);
    }
    var alpha=connectedToSel ? 0.85 : 0.1;
    var color, width=1.5;
    if(edge.type==='mesg'){ color='rgba(250,166,102,'+alpha+')'; }
    else if(edge.type==='call'){ color='rgba(200,140,255,'+alpha+')'; }
    else { color='rgba(140,140,160,'+(alpha*0.7)+')'; }
    ctx.strokeStyle=color;
    ctx.fillStyle=color;
    ctx.lineWidth=width;
    ctx.setLineDash([]);
    var dx=tPx.x - sPx.x;
    var handle=Math.max(30, Math.abs(dx)*0.4);
    if(dx < 0) handle=Math.max(80, Math.abs(dx)*0.6);
    ctx.beginPath();
    ctx.moveTo(sPx.x, sPx.y);
    ctx.bezierCurveTo(sPx.x+handle, sPx.y, tPx.x-handle, tPx.y, tPx.x, tPx.y);
    ctx.stroke();
    var ah=8, aw=5;
    var tipX=tPx.x-2, tipY=tPx.y;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX-ah, tipY-aw);
    ctx.lineTo(tipX-ah, tipY+aw);
    ctx.closePath();
    ctx.fill();
  }
}

function FC_renderSearchHighlights(ctx){
  ctx.strokeStyle='#ff0';
  ctx.lineWidth=2;
  for(var i=0;i<FC_state.nodes.length;i++){
    var n=FC_state.nodes[i];
    if(!FC_matchesSearch(n.title)) continue;
    var p=FC_w2c(n.x-3, n.y-3);
    ctx.strokeRect(p.x, p.y, (n.w+6)*FC_state.view.scale, (n.h+6)*FC_state.view.scale);
  }
}

// ─── Interaction ────────────────────────────────────────────────────────────
function FC_wireCanvas(){
  var cv=FC_state.canvas;
  cv.addEventListener('mousedown', function(e){
    var r=cv.getBoundingClientRect();
    var cx=e.clientX-r.left, cy=e.clientY-r.top;
    if(e.button===0){
      var hit=FC_hitTest(cx, cy);
      FC_state.selected=hit;
      FC_renderDetails();
      FC_render();
      FC_state.dragging=true;
      FC_state.dragStart={x:e.clientX, y:e.clientY, vx:FC_state.view.x, vy:FC_state.view.y};
    }
    e.preventDefault();
  });
  cv.addEventListener('mousemove', function(e){
    var r=cv.getBoundingClientRect();
    var cx=e.clientX-r.left, cy=e.clientY-r.top;
    if(FC_state.dragging){
      FC_state.view.x = FC_state.dragStart.vx + (e.clientX - FC_state.dragStart.x);
      FC_state.view.y = FC_state.dragStart.vy + (e.clientY - FC_state.dragStart.y);
      FC_render();
    } else {
      var newHover=FC_hitTest(cx, cy);
      var changed=(FC_state.hover === null) !== (newHover === null);
      if(!changed && FC_state.hover && newHover){
        changed = FC_state.hover.kind !== newHover.kind || FC_state.hover.idx !== newHover.idx;
      }
      FC_state.hover=newHover;
      if(changed) FC_render();
      cv.style.cursor = newHover ? 'pointer' : 'default';
      FC_updatePinTooltip(cx, cy);
    }
  });
  cv.addEventListener('mouseup', function(){ FC_state.dragging=false; });
  cv.addEventListener('mouseleave', function(){
    FC_state.dragging=false;
    if(FC_state.hover){ FC_state.hover=null; FC_render(); }
    var tip=document.getElementById('fcTooltip'); if(tip) tip.style.display='none';
  });
  cv.addEventListener('wheel', function(e){
    var r=cv.getBoundingClientRect();
    var cx=e.clientX-r.left, cy=e.clientY-r.top;
    var before=FC_c2w(cx, cy);
    var factor = e.deltaY < 0 ? 1.15 : 1/1.15;
    FC_state.view.scale *= factor;
    FC_state.view.scale = Math.max(0.1, Math.min(3, FC_state.view.scale));
    var after=FC_c2w(cx, cy);
    FC_state.view.x += (after.x - before.x) * FC_state.view.scale;
    FC_state.view.y += (after.y - before.y) * FC_state.view.scale;
    FC_render();
    e.preventDefault();
  }, {passive:false});
  window.addEventListener('keydown', FC_handleKey);
}

function FC_handleKey(e){
  if(!FC_state.panelEl) return;
  if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;
  if(e.key==='0'){ FC_recenterIfReady(); FC_render(); }
  else if(e.key==='f' || e.key==='F'){
    document.getElementById('fcFocusBtn').click();
  }
  else if(e.key==='Escape'){
    FC_state.selected=null;
    FC_renderDetails();
    FC_render();
  }
}

function FC_hitTest(cx, cy){
  var w=FC_c2w(cx, cy);
  for(var i=0;i<FC_state.nodes.length;i++){
    var n=FC_state.nodes[i];
    if(w.x >= n.x && w.x <= n.x+n.w && w.y >= n.y && w.y <= n.y+n.h){
      return {kind:n.kind, idx:n.idx};
    }
  }
  return null;
}

// Tooltip: full pin label text when hovering a pin row
function FC_updatePinTooltip(cx, cy){
  var tip=document.getElementById('fcTooltip');
  if(!tip) return;
  var w=FC_c2w(cx, cy);
  for(var i=0;i<FC_state.nodes.length;i++){
    var n=FC_state.nodes[i];
    if(w.x < n.x || w.x > n.x+n.w) continue;
    if(w.y < n.y+FC_LAYOUT.headerH || w.y > n.y+n.h) continue;
    var row=Math.floor((w.y - n.y - FC_LAYOUT.headerH) / FC_LAYOUT.pinRowH);
    if(row < 0 || row >= n.pins.length) continue;
    var pin=n.pins[row];
    if(pin.placeholder){ tip.style.display='none'; return; }
    tip.textContent=pin.label;
    tip.style.left=(cx+12)+'px';
    tip.style.top=(cy+12)+'px';
    tip.style.display='block';
    return;
  }
  tip.style.display='none';
}

// ─── Details panel ──────────────────────────────────────────────────────────
function FC_renderDetails(){
  var el=document.getElementById('fcDetails');
  if(!el) return;
  if(!FC_state.selected){
    el.innerHTML='<div style="color:#666;font-style:italic;font-family:system-ui">Click any node to inspect it.</div>';
    return;
  }
  var s=FC_state.selected;
  var html='';
  if(s.kind==='trap'){
    var trap=FC_state.trapZones[s.idx];
    var headerColor=trap.kind==='ntrap'?'#5588cc':'#cc7733';
    html='<div style="color:'+headerColor+';font-weight:bold;font-size:12px;margin-bottom:6px">'+
         trap.kind+' · <span style="color:#cde">'+FC_escapeHtml(trap.zoneName)+'</span></div>';
    html+='<table style="width:100%;font-size:10px;margin-bottom:8px">';
    html+='<tr><td style="color:#888;padding-right:8px;vertical-align:top">target</td><td>'+FC_escapeHtml(trap.target)+'</td></tr>';
    if(trap.cond) html+='<tr><td style="color:#888">cond</td><td>'+FC_escapeHtml(trap.cond)+'</td></tr>';
    var hzdZone=FC_state.hzdZonesByName[trap.zoneName];
    if(hzdZone){
      html+='<tr><td style="color:#888">zone bbox</td><td>('+hzdZone.x1+','+hzdZone.z1+') → ('+hzdZone.x2+','+hzdZone.z2+')</td></tr>';
      if(hzdZone.isCamera) html+='<tr><td style="color:#888">flag</td><td style="color:#7cf">CAMERA zone (id2=0xff)</td></tr>';
    } else if(FC_state.hzdZones.length > 0){
      html+='<tr><td style="color:#888">zone</td><td style="color:#f88">⚠ "'+FC_escapeHtml(trap.zoneName)+'" not in HZM</td></tr>';
    }
    html+='</table>';
    if(trap.operations.length){
      html+='<div style="color:#666;margin-top:8px;font-size:9px">OUTGOING OPERATIONS:</div>';
      for(var oi=0;oi<trap.operations.length;oi++){
        var op=trap.operations[oi];
        if(op.type==='mesg'){
          html+='<div style="padding:3px 6px;margin:2px 0;background:#1a1208;border-left:3px solid #fa8;font-size:10px">'+
                '<span style="color:#fa8">[pin '+oi+'] mesg</span> → <span style="color:#cde">'+FC_escapeHtml(op.target)+'</span> '+
                '<span style="color:#888">«</span> <span style="color:#fc7">'+FC_escapeHtml(FC_labelMessage(op.message))+'</span></div>';
        } else {
          html+='<div style="padding:3px 6px;margin:2px 0;background:#1a0f20;border-left:3px solid #caa3ff;font-size:10px">'+
                '<span style="color:#caa3ff">[pin '+oi+'] call</span> → <span style="color:#cde">'+FC_escapeHtml(op.target)+'</span></div>';
        }
      }
    }
    html+='<div style="color:#666;margin-top:10px;font-size:9px">RAW BODY:</div>'+
          '<pre style="background:#0a0e14;border:1px solid #1a2535;padding:6px;font-size:9px;color:#aac;white-space:pre-wrap;word-break:break-all;max-height:240px;overflow-y:auto;margin-top:2px">'+FC_escapeHtml(trap.body)+'</pre>';
  } else if(s.kind==='proc'){
    var pr=FC_state.procs[s.idx];
    html='<div style="color:#caa3ff;font-weight:bold;font-size:12px;margin-bottom:6px">proc · <span style="color:#cde">'+FC_escapeHtml(pr.name)+'</span></div>';
    var callers=[];
    for(var ti=0;ti<FC_state.edges.length;ti++){
      var te=FC_state.edges[ti];
      if(te.to.kind==='proc' && te.to.idx===s.idx){
        var src=te.from.kind==='trap'?FC_state.trapZones[te.from.idx].zoneName:FC_state.procs[te.from.idx].name;
        callers.push({src:src, kind:te.from.kind, type:te.type});
      }
    }
    if(callers.length){
      html+='<div style="color:#666;font-size:9px;margin-top:6px">CALLED BY:</div>';
      for(var ci=0;ci<callers.length;ci++){
        var c=callers[ci];
        var col=c.kind==='trap'?'#fa8':'#caa3ff';
        html+='<div style="padding:2px 0;color:'+col+'">▸ '+c.kind+' '+FC_escapeHtml(c.src)+' ('+c.type+')</div>';
      }
    } else {
      html+='<div style="color:#f88;margin-top:6px;font-size:10px">⚠ This proc is never called from any trap or other proc. It may be invoked from C code, OR it could be dead script.</div>';
    }
    if(pr.operations.length){
      html+='<div style="color:#666;margin-top:8px;font-size:9px">OUTGOING OPERATIONS:</div>';
      for(var oi2=0;oi2<pr.operations.length;oi2++){
        var op2=pr.operations[oi2];
        if(op2.type==='mesg'){
          html+='<div style="padding:3px 6px;margin:2px 0;background:#1a1208;border-left:3px solid #fa8;font-size:10px">'+
                '<span style="color:#fa8">[pin '+oi2+'] mesg</span> → <span style="color:#cde">'+FC_escapeHtml(op2.target)+'</span> '+
                '<span style="color:#888">«</span> <span style="color:#fc7">'+FC_escapeHtml(FC_labelMessage(op2.message))+'</span></div>';
        } else {
          html+='<div style="padding:3px 6px;margin:2px 0;background:#1a0f20;border-left:3px solid #caa3ff;font-size:10px">'+
                '<span style="color:#caa3ff">[pin '+oi2+'] call</span> → <span style="color:#cde">'+FC_escapeHtml(op2.target)+'</span></div>';
        }
      }
    }
    html+='<div style="color:#666;margin-top:10px;font-size:9px">RAW BODY:</div>'+
          '<pre style="background:#0a0e14;border:1px solid #1a2535;padding:6px;font-size:9px;color:#aac;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;margin-top:2px">'+FC_escapeHtml(pr.body)+'</pre>';
  } else if(s.kind==='entity'){
    var e=FC_state.entities[s.idx];
    html='<div style="color:'+FC_entityColor(e)+';font-weight:bold;font-size:12px;margin-bottom:6px">'+
         (e.kind==='snake'?'SNAKE':'entity')+' · <span style="color:#cde">'+FC_escapeHtml(e.name)+'</span></div>';
    html+='<table style="width:100%;font-size:10px;margin-bottom:8px">';
    html+='<tr><td style="color:#888;padding-right:8px">type</td><td>'+FC_escapeHtml(e.type)+'</td></tr>';
    if(e.pos) html+='<tr><td style="color:#888">pos</td><td>'+e.pos.x+', '+e.pos.y+', '+e.pos.z+'</td></tr>';
    if(e.dir) html+='<tr><td style="color:#888">dir</td><td>'+e.dir.x+', '+e.dir.y+', '+e.dir.z+'</td></tr>';
    if(e.route !== undefined) html+='<tr><td style="color:#888">route</td><td style="color:#fa8">'+e.route+'</td></tr>';
    if(e.exec) html+='<tr><td style="color:#888">exec</td><td>'+FC_escapeHtml(e.exec)+'</td></tr>';
    if(e.height !== undefined) html+='<tr><td style="color:#888">height</td><td>'+e.height+'</td></tr>';
    html+='</table>';
    var senders=[];
    for(var ei2=0;ei2<FC_state.edges.length;ei2++){
      var ee=FC_state.edges[ei2];
      if(ee.to.kind==='entity' && ee.to.idx===s.idx){
        var src2=ee.from.kind==='trap'?FC_state.trapZones[ee.from.idx].zoneName:FC_state.procs[ee.from.idx].name;
        senders.push({src:src2, kind:ee.from.kind, type:ee.type, label:ee.label});
      }
    }
    if(senders.length){
      html+='<div style="color:#666;font-size:9px;margin-top:6px">MESSAGES IN:</div>';
      for(var si=0;si<senders.length;si++){
        var sn=senders[si];
        var col2=sn.kind==='trap'?'#fa8':'#caa3ff';
        html+='<div style="padding:2px 0"><span style="color:'+col2+'">▸ '+sn.kind+' '+FC_escapeHtml(sn.src)+'</span>'+
              (sn.label?' « <span style="color:#fc7">'+FC_escapeHtml(FC_labelMessage(sn.label))+'</span>':'')+'</div>';
      }
    } else {
      html+='<div style="color:#888;margin-top:6px;font-size:10px;font-style:italic">No messages sent to this entity from any trap or proc.</div>';
    }
    if(e.raw){
      html+='<div style="color:#666;margin-top:8px;font-size:9px">RAW PARAMS:</div>'+
            '<pre style="background:#0a0e14;border:1px solid #1a2535;padding:4px;font-size:9px;color:#aac;white-space:pre-wrap;word-break:break-all;margin-top:2px;max-height:160px;overflow-y:auto">'+FC_escapeHtml(e.raw)+'</pre>';
    }
  }
  el.innerHTML=html;
}

function FC_escapeHtml(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
