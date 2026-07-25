// ═══════════════════════════════════════════════════════════════════════════
// FILE: 03_ui.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ==================== PROPERTIES PANEL ====================
function flagHTML(id,val,bit){
var on=!!(val&bit);
var descs={
1:{on:'Players CAN walk through this wall',off:'Players CANNOT walk through (solid)'},
2:{on:'Enemies CAN pathfind through this wall',off:'Enemies CANNOT pathfind through (barrier)'},
4:{on:'Player collision DISABLED (player passes)',off:'Player collision ENABLED (player blocked)'},
8:{on:'Missiles/rockets pass through',off:'Missiles/rockets blocked by wall'},
16:{on:'Cannot press against wall (no wall hug)',off:'Can press against wall (wall hug enabled)'},
32:{on:'Bullets pass through wall',off:'Bullets blocked by wall'},
64:{on:'No behind-wall detection',off:'Behind-wall detection active'},
128:{on:'Wall HIDDEN from radar/map',off:'Wall VISIBLE on radar/map'}};
var d=descs[bit]||{on:'Flag '+bit+' ON',off:'Flag '+bit+' OFF'};
var color=on?'#ff6644':'#44cc88';
return '<label style="display:block;margin:2px 0;color:'+color+'"><input type="checkbox" id="'+id+'" '+(on?'checked':'')+' onchange="updateFlagDesc(this)"> '+(on?d.on:d.off)+'</label>'}
function updateFlagDesc(el){var panel=document.getElementById("propPanel");
// Find the button whose visible text starts with "Apply" — not the first button (which may be Paint, Clear, etc.)
var btns=panel.querySelectorAll("button");
for(var bi=0;bi<btns.length;bi++){if(btns[bi].textContent.trim().indexOf("Apply")===0){btns[bi].click();return}}}
function showProps(){
var panel=document.getElementById("propPanel");if(!panel)return;
var wKeys=Object.keys(selW),fKeys=Object.keys(selF),zKeys=Object.keys(selZ);
var html="";var pstyle='style="width:58px;background:#0a0e14;color:#00ccff;border:1px solid #1a2535;border-radius:2px;font-size:11px;font-family:monospace;padding:1px 3px;margin:1px"';
// Wall properties
if(wKeys.length===1){var k=wKeys[0];
if(k.indexOf("nw-")===0){var idx=parseInt(k.substr(3)),w=newW[idx];if(w){var wf=w.flags||0;
html='<div style="padding:6px"><b style="color:#ffaa00">New Wall '+idx+'</b><br>'+
'X1:<input type="number" id="px1" value="'+w.x1+'" '+pstyle+'> Z1:<input type="number" id="pz1" value="'+w.z1+'" '+pstyle+'><br>'+
'X2:<input type="number" id="px2" value="'+w.x2+'" '+pstyle+'> Z2:<input type="number" id="pz2" value="'+w.z2+'" '+pstyle+'><br>'+
'Y:<input type="number" id="py1" value="'+w.y1+'" '+pstyle+'> H:<input type="number" id="ph1" value="'+(w.h||2000)+'" '+pstyle+'><br>'+
'<b>Flags 0x'+wf.toString(16)+' <span style="opacity:0.5">(checked=DISABLED)</span></b><br>'+
flagHTML("fCOL",wf,1)+
flagHTML("fNAV",wf,2)+
flagHTML("fPLR",wf,4)+
flagHTML("fMIS",wf,8)+
flagHTML("fHAR",wf,16)+
flagHTML("fBUL",wf,32)+
flagHTML("fBEH",wf,64)+
flagHTML("fRAD",wf,128)+
'<div style="margin-top:4px;border-top:1px solid #1a2535;padding-top:4px"><b style="color:#44cc88">Texture:</b> '+
(w.texHash>=0&&darTextures[w.texHash]?'<span style="color:#ff0">'+darTextures[w.texHash].name+'</span>':'<span style="opacity:0.4">none</span>')+
'<br><button onclick="applyTexToWall('+idx+')" class="btn" style="margin-top:2px;color:#44cc88">'+(activeTexHash>=0?'Paint: '+(darTextures[activeTexHash]?darTextures[activeTexHash].name:'?'):'Select texture first')+'</button>'+
'<button onclick="setT(\'eyedrop\')" class="btn" style="margin-top:2px;margin-left:4px;color:#44cc88" title="Pick texture from a KMD face">🎨</button>'+
'<button onclick="clearTexFromWall('+idx+')" class="btn" style="margin-top:2px;margin-left:4px;color:#ff8844">Remove Texture</button>'+
'<br><label style="font-size:10px;display:inline-block;margin-top:2px"><input type="checkbox" id="wSingle" '+(w.singleSide?'checked':'')+' onchange="newW['+idx+'].singleSide=this.checked;rebuild()"> Single side only</label>'+
'<br>UV: <select onchange="setWallUV('+idx+',this.value)" style="background:#0a0e14;color:#44cc88;border:1px solid #1a2535;font-size:9px"><option value="fit"'+(w.uvMode!=="repeat"?' selected':'')+'>Fit</option><option value="repeat"'+(w.uvMode==="repeat"?' selected':'')+'>Repeat</option></select></div>'+
'<button onclick="applyNewWallProps('+idx+')" class="btn" style="margin-top:4px">Apply</button> <button onclick="setYFromSurface('+w.y1+')" class="btn" style="margin-top:4px;color:#44aaff" title="Set place Y to this wall\'s Y">↑Y='+w.y1+'</button></div>'}}
else{var ps=k.split("-"),pai=parseInt(ps[0]),pni=parseInt(ps[1]);
var nf=hzm.areas[pai]&&hzm.areas[pai].navfaces[pni];if(nf){var wf2=hzm.areas[pai].wFlags[pni]||0;
html='<div style="padding:6px"><b style="color:#22cc66">Wall '+pni+'</b><br>'+
'X1:<input type="number" id="px1" value="'+nf.x1+'" '+pstyle+'> Z1:<input type="number" id="pz1" value="'+nf.z1+'" '+pstyle+'><br>'+
'X2:<input type="number" id="px2" value="'+nf.x2+'" '+pstyle+'> Z2:<input type="number" id="pz2" value="'+nf.z2+'" '+pstyle+'><br>'+
'Y1:<input type="number" id="py1" value="'+nf.y1+'" '+pstyle+'> Y2:<input type="number" id="py2" value="'+nf.y2+'" '+pstyle+'><br>'+
'H1:<input type="number" id="ph1" value="'+nf.h1+'" '+pstyle+'> H2:<input type="number" id="ph2" value="'+nf.h2+'" '+pstyle+'><br>'+
'<b>Flags 0x'+wf2.toString(16)+' <span style="opacity:0.5">(checked=DISABLED)</span></b><br>'+
flagHTML("fCOL",wf2,1)+
flagHTML("fNAV",wf2,2)+
flagHTML("fPLR",wf2,4)+
flagHTML("fMIS",wf2,8)+
flagHTML("fHAR",wf2,16)+
flagHTML("fBUL",wf2,32)+
flagHTML("fBEH",wf2,64)+
flagHTML("fRAD",wf2,128)+
'<div style="margin-top:4px;border-top:1px solid #1a2535;padding-top:4px"><b style="color:#44cc88">KMD Texture:</b> '+
'<br><button onclick="paintHZMWall('+pai+','+pni+')" class="btn" style="margin-top:2px;color:#44cc88">'+(activeTexHash>=0?'Paint: '+(darTextures[activeTexHash]?darTextures[activeTexHash].name:'?'):'Select texture first')+'</button>'+
'<button onclick="setT(\'eyedrop\')" class="btn" style="margin-top:2px;margin-left:4px;color:#44cc88" title="Pick texture from a KMD face">🎨</button>'+
'<button onclick="removeHZMWallTex('+pai+','+pni+')" class="btn" style="margin-top:2px;margin-left:4px;color:#ff8844">Remove Texture</button></div>'+
'<button onclick="applyWallProps('+pai+','+pni+')" class="btn" style="margin-top:4px">Apply</button> <button onclick="setYFromSurface('+nf.y1+')" class="btn" style="margin-top:4px;color:#44aaff" title="Set place Y to this wall\'s Y">↑Y='+nf.y1+'</button></div>'}}}
// Zone properties
if(zKeys.length===1){var zk=zKeys[0];
if(zk.indexOf("nz-")===0){var nzIdx=parseInt(zk.substr(3));var nzn=newZ[nzIdx];if(nzn){
html+='<div style="padding:6px;border-top:1px solid #1a2535"><b style="color:#ff8800">New Zone: '+nzn.name+'</b><br>'+
'Name:<input type="text" id="zname" value="'+nzn.name+'" style="width:120px;background:#0a0e14;color:#ff8800;border:1px solid #1a2535;border-radius:2px;font-size:11px;font-family:monospace;padding:1px 3px"><br>'+
'X1:<input type="number" id="zx1" value="'+nzn.x1+'" '+pstyle+'> Z1:<input type="number" id="zz1" value="'+nzn.z1+'" '+pstyle+'><br>'+
'X2:<input type="number" id="zx2" value="'+nzn.x2+'" '+pstyle+'> Z2:<input type="number" id="zz2" value="'+nzn.z2+'" '+pstyle+'><br>'+
'Y1:<input type="number" id="zy1" value="'+nzn.y1+'" '+pstyle+'> Y2:<input type="number" id="zy2" value="'+(nzn.y2||0)+'" '+pstyle+'><br>'+
'<span style="font-size:9px;color:#778">Y2 must be > Y1 by at least 1000 or trap never fires.</span><br>'+
'<button onclick="applyNewZoneProps('+nzIdx+')" class="btn" style="margin-top:4px">Apply</button> '+
'<button onclick="deleteNewZone('+nzIdx+')" class="btn" style="margin-top:4px;background:#3a0a0a;color:#ff6666;border:1px solid #6a1a1a">Delete</button><br>'+
'<span style="font-size:9px;color:#778;margin-top:3px;display:inline-block">Tip: Resize tool also drags zone corners.</span></div>'}}
else{var zps=zk.split("-"),zai=parseInt(zps[0]),zni=parseInt(zps[1]);
var zn=hzm.areas[zai]&&hzm.areas[zai].zones[zni];if(zn){
html+='<div style="padding:6px;border-top:1px solid #1a2535"><b style="color:#cc8822">Zone '+zni+': '+zn.name+'</b><br>'+
'Name:<input type="text" id="zname" value="'+zn.name+'" style="width:120px;background:#0a0e14;color:#cc8822;border:1px solid #1a2535;border-radius:2px;font-size:11px;font-family:monospace;padding:1px 3px"><br>'+
'X1:<input type="number" id="zx1" value="'+zn.x1+'" '+pstyle+'> Z1:<input type="number" id="zz1" value="'+zn.z1+'" '+pstyle+'><br>'+
'X2:<input type="number" id="zx2" value="'+zn.x2+'" '+pstyle+'> Z2:<input type="number" id="zz2" value="'+zn.z2+'" '+pstyle+'><br>'+
'Y1:<input type="number" id="zy1" value="'+zn.y1+'" '+pstyle+'> Y2:<input type="number" id="zy2" value="'+zn.y2+'" '+pstyle+'><br>'+
'<span style="font-size:9px;color:#778">Y2 must be > Y1 by at least 1000 or trap never fires.</span><br>'+
'<button onclick="applyZoneProps('+zai+','+zni+')" class="btn" style="margin-top:4px">Apply</button> '+
'<button onclick="deleteVanillaZone('+zai+','+zni+')" class="btn" style="margin-top:4px;background:#3a0a0a;color:#ff6666;border:1px solid #6a1a1a">Delete</button></div>'}}}
// Route waypoint properties
if(selRoute>=0&&selWP>=0){var rwp=hzm.routes[selRoute];if(rwp&&rwp.waypoints[selWP]){var wp=rwp.waypoints[selWP];
// The "dir" field stored in our waypoint is actually a 16-bit packed COMMAND word.
// Bit layout (from FoxDie decomp source/enemy/think.c around line 845):
//   bits 0-4   act    (5 bits) — action code, 0=walk-and-look
//   bits 5-7   time   (3 bits) — pause-duration index, 0-7
//   bits 8-9   dir    (2 bits) — facing direction, 0=N 1=E 2=S 3=W
//   bits 10-12 con    (3 bits) — condition code
//   bits 13-15 unused
// Extract subfields for display:
var cmd=wp.dir|0;
var cAct =(cmd     )&0x1F;
var cTime=(cmd>> 5 )&0x07;
var cDir =(cmd>> 8 )&0x03;
var cCon =(cmd>>10 )&0x07;
// Pause time labels — index into the engine's field_BB0 array (actual durations unknown
// without dumping the table from a binary, but the relative ordering matches in-game
// observation: low values = short pauses, high values = long. 6 is special: engine code
// `if (time != 6)` skips the pause logic entirely, so 6 = "transit through, no pause".
var pauseLabels=["0 — Instant (no pause)","1 — Very short","2 — Short","3 — Medium",
"4 — Long","5 — Very long","6 — TRANSIT (walk through, don't stop)","7 — Longest"];
var dirLabels=["N (0°)","E (90°)","S (180°)","W (270°)"];
html+='<div style="padding:6px;border-top:1px solid #1a2535"><b style="color:#00ff88">Route '+selRoute+' WP '+(selWP+1)+'/'+rwp.waypoints.length+'</b><br>'+
'X:<input type="number" id="wpx" value="'+wp.x+'" '+pstyle+'> Z:<input type="number" id="wpz" value="'+wp.z+'" '+pstyle+'><br>'+
'Y:<input type="number" id="wpy" value="'+wp.y+'" '+pstyle+'> <button onclick="snapWPToFloor()" class="btn" style="font-size:9px;color:#ccaa88" title="Snap Y to floor directly below">↓Y</button><br>';
html+='<div style="margin-top:4px;padding:4px;background:#0a1820;border-radius:2px">';
html+='<b style="color:#88ddff;font-size:9px">BEHAVIOR (packed into command field)</b><br>';
// Direction: 4-option dropdown
html+='Facing: <select id="wpDir" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:90px">';
for(var di=0;di<4;di++)html+='<option value="'+di+'"'+(cDir===di?" selected":"")+'>'+dirLabels[di]+'</option>';
html+='</select><br>';
// Pause time: 8-option dropdown (the "duration" feature you asked for)
html+='Pause: <select id="wpTime" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:230px">';
for(var ti=0;ti<8;ti++)html+='<option value="'+ti+'"'+(cTime===ti?" selected":"")+'>'+pauseLabels[ti]+'</option>';
html+='</select><br>';
// Action and Condition: numbers (rarely changed by hand; defaults are usually 0)
html+='<span style="font-size:9px;color:#778">Advanced:</span> ';
html+='Action: <input type="number" id="wpAct" value="'+cAct+'" min="0" max="31" style="width:38px;background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px"> ';
html+='Condition: <input type="number" id="wpCon" value="'+cCon+'" min="0" max="7" style="width:30px;background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px"><br>';
html+='<span style="font-size:8px;color:#556">Raw command word: 0x'+cmd.toString(16).padStart(4,"0")+' ('+cmd+')</span>';
html+='</div>';
html+='<button onclick="applyWPProps()" class="btn" style="margin-top:4px">Apply</button> '+
'<button onclick="insertWPBefore()" class="btn" style="margin-top:4px" title="Insert new waypoint before this one">+Before</button> '+
'<button onclick="addWPAfter()" class="btn" style="margin-top:4px">+After</button> '+
'<button onclick="delWP()" class="btn danger" style="margin-top:4px">Del WP</button><br>'+
'<span style="font-size:9px;color:#667">Right-click in viewport = add WP at cursor · N/P = next/prev WP</span></div>'}}
// Floor properties
if(fKeys.length===1){html+=showFloorProps(fKeys[0])}
if(html){panel.innerHTML=html;panel.style.display="block"}else if(selGCL>=0){showGCLProps()}else{panel.style.display="none"}}

function readFlags(){var f=0;
if(document.getElementById("fCOL")&&document.getElementById("fCOL").checked)f|=1;
if(document.getElementById("fNAV")&&document.getElementById("fNAV").checked)f|=2;
if(document.getElementById("fPLR")&&document.getElementById("fPLR").checked)f|=4;
if(document.getElementById("fMIS")&&document.getElementById("fMIS").checked)f|=8;
if(document.getElementById("fHAR")&&document.getElementById("fHAR").checked)f|=0x10;
if(document.getElementById("fBUL")&&document.getElementById("fBUL").checked)f|=0x20;
if(document.getElementById("fBEH")&&document.getElementById("fBEH").checked)f|=0x40;
if(document.getElementById("fRAD")&&document.getElementById("fRAD").checked)f|=0x80;
return f}

function applyWallProps(ai,ni){
var nf=hzm.areas[ai].navfaces[ni];
nf.x1=parseInt(document.getElementById("px1").value)||0;nf.z1=parseInt(document.getElementById("pz1").value)||0;
nf.x2=parseInt(document.getElementById("px2").value)||0;nf.z2=parseInt(document.getElementById("pz2").value)||0;
nf.y1=parseInt(document.getElementById("py1").value)||0;nf.y2=parseInt(document.getElementById("py2").value)||0;
nf.h1=parseInt(document.getElementById("ph1").value)||2000;nf.h2=parseInt(document.getElementById("ph2").value)||2000;
hzm.areas[ai].wFlags[ni]=readFlags();rebuild();showProps()}

function applyNewWallProps(idx){var w=newW[idx];
w.x1=parseInt(document.getElementById("px1").value)||0;w.z1=parseInt(document.getElementById("pz1").value)||0;
w.x2=parseInt(document.getElementById("px2").value)||0;w.z2=parseInt(document.getElementById("pz2").value)||0;
w.y1=parseInt(document.getElementById("py1").value)||0;w.y2=w.y1;w.h=parseInt(document.getElementById("ph1").value)||2000;
w.flags=readFlags();rebuild();showProps()}

function applyZoneProps(ai,zi){var zn=hzm.areas[ai].zones[zi];
var newName=document.getElementById("zname").value||"";
if(newName!==zn.name){zn.name=newName;zn.nameRaw=[];for(var nb=0;nb<14;nb++)zn.nameRaw.push(nb<newName.length?newName.charCodeAt(nb):0)}
zn.x1=parseInt(document.getElementById("zx1").value)||0;zn.z1=parseInt(document.getElementById("zz1").value)||0;
zn.x2=parseInt(document.getElementById("zx2").value)||0;zn.z2=parseInt(document.getElementById("zz2").value)||0;
zn.y1=parseInt(document.getElementById("zy1").value)||0;zn.y2=parseInt(document.getElementById("zy2").value)||0;
rebuild();showProps();updateZoneList()}

function applyNewZoneProps(idx){var zn=newZ[idx];
zn.name=document.getElementById("zname").value||"";
zn.x1=parseInt(document.getElementById("zx1").value)||0;zn.z1=parseInt(document.getElementById("zz1").value)||0;
zn.x2=parseInt(document.getElementById("zx2").value)||0;zn.z2=parseInt(document.getElementById("zz2").value)||0;
zn.y1=parseInt(document.getElementById("zy1").value)||0;zn.y2=parseInt(document.getElementById("zy2").value)||0;
rebuild();showProps();updateZoneList()}

// Delete a new zone by index. Equivalent to selecting it and pressing Del,
// but discoverable from the properties panel. Reindexes selZ so indices
// stay valid after removal.
function deleteNewZone(idx){
if(idx<0||idx>=newZ.length)return;
var zName=newZ[idx].name||"(unnamed)";
newZ.splice(idx,1);
// Clear any selection keys that referenced the deleted zone or later zones
// (since splicing shifts indices). Easiest: drop all nz-* selections —
// user can re-select if needed.
var newSelZ={};
for(var k in selZ){if(selZ[k]&&k.indexOf("nz-")!==0)newSelZ[k]=true;}
selZ=newSelZ;
rebuild();showProps();updateZoneList();
if(typeof logUndo==="function")logUndo("del","Delete zone "+zName);}

// Delete a vanilla (parsed-from-HZM) zone. These live inside hzm.areas[ai].zones[]
// so we splice the array directly. Confirms first since deleting a zone may break
// trap/ntrap statements in the GCL that reference it by name (engine treats those
// references as dangling — they still parse but never fire).
function deleteVanillaZone(ai,zi){
if(!hzm||!hzm.areas[ai]||!hzm.areas[ai].zones[zi])return;
var zn=hzm.areas[ai].zones[zi];
var zName=zn.name||"(unnamed)";
if(!confirm("Delete vanilla zone \""+zName+"\"?\n\nAny trap/ntrap statements in the GCL that reference this zone will become orphans (no-op but won't crash). Proceed?"))return;
hzm.areas[ai].zones.splice(zi,1);
// Drop any selection of that exact zone (or zones after it whose indices shifted)
var newSelZ={};
for(var k in selZ){if(selZ[k]&&k!==(ai+"-"+zi))newSelZ[k]=true;}
selZ=newSelZ;
rebuild();showProps();updateZoneList();
if(typeof logUndo==="function")logUndo("del","Delete vanilla zone "+zName);}

function applyWPProps(){if(selRoute<0||selWP<0)return;var wp=hzm.routes[selRoute].waypoints[selWP];
wp.x=parseInt(document.getElementById("wpx").value)||0;wp.z=parseInt(document.getElementById("wpz").value)||0;
wp.y=parseInt(document.getElementById("wpy").value)||0;
// Pack the 4 subfields back into the 16-bit command word stored in wp.dir
// Layout: con(13-10) | dir(9-8) | time(7-5) | act(4-0)
var pAct =(parseInt(document.getElementById("wpAct" ).value)||0)&0x1F;
var pTime=(parseInt(document.getElementById("wpTime").value)||0)&0x07;
var pDir =(parseInt(document.getElementById("wpDir" ).value)||0)&0x03;
var pCon =(parseInt(document.getElementById("wpCon" ).value)||0)&0x07;
wp.dir=pAct|(pTime<<5)|(pDir<<8)|(pCon<<10);
rebuild();showProps();logUndo("edit","Edit WP")}

function addWPAfter(){if(selRoute<0||selWP<0)return;var rt=hzm.routes[selRoute];var wp=rt.waypoints[selWP];
var nwp={x:wp.x+500,z:wp.z,y:wp.y,dir:wp.dir};
rt.waypoints.splice(selWP+1,0,nwp);rt.count=rt.waypoints.length;
selWP=selWP+1;rebuild();showProps();uUI()}

function delWP(){if(selRoute<0||selWP<0)return;var rt=hzm.routes[selRoute];
if(rt.waypoints.length<=1)return;
rt.waypoints.splice(selWP,1);rt.count=rt.waypoints.length;
if(selWP>=rt.waypoints.length)selWP=rt.waypoints.length-1;
rebuild();showProps();uUI()}

// ==================== ACTIONS ====================
function doDel(){
var nwDel=[],nfDel=[],nzDel=[];
for(var k in selW){if(!selW[k])continue;if(k.indexOf("nw-")===0)nwDel.push(parseInt(k.substr(3)));else colW[k]=true}
for(k in selF){if(!selF[k])continue;if(k.indexOf("nf-")===0)nfDel.push(parseInt(k.substr(3)));else colF[k]=true}
for(k in selZ){if(!selZ[k])continue;if(k.indexOf("nz-")===0)nzDel.push(parseInt(k.substr(3)));else colZ[k]=true}
nwDel.sort(function(a,b){return b-a});nfDel.sort(function(a,b){return b-a});nzDel.sort(function(a,b){return b-a});
for(var i=0;i<nwDel.length;i++)newW.splice(nwDel[i],1);
for(i=0;i<nfDel.length;i++)newF.splice(nfDel[i],1);
for(i=0;i<nzDel.length;i++)newZ.splice(nzDel[i],1);
selW={};selF={};selZ={};rebuild();uUI();showProps();updateZoneList();logUndo("del","Delete "+nwDel.length+"w "+nfDel.length+"f "+nzDel.length+"z")}

function undoLast(){undoAction()}
function rstAll(){colW={};selW={};newW=[];colF={};selF={};newF=[];selZ={};colZ={};newZ=[];newNavZones=[];undoHist=[];clipboard=[];selRoute=-1;selWP=-1;selNavZone=-1;rebuild();rebuildNavZones();uUI();showProps();updateZoneList();updateNavPanel()}

function doCopy(){clipboard=[];
for(var k in selW){if(!selW[k])continue;
if(k.indexOf("nw-")===0){var idx=parseInt(k.substr(3)),w=newW[idx];if(w)clipboard.push({t:"w",x1:w.x1,z1:w.z1,y1:w.y1,x2:w.x2,z2:w.z2,y2:w.y2,h:w.h||2000,flags:w.flags||0,texHash:w.texHash||-1,uvMode:w.uvMode||"fit"})}
else{var ps=k.split("-"),ai=parseInt(ps[0]),ni=parseInt(ps[1]);var nf=hzm.areas[ai]&&hzm.areas[ai].navfaces[ni];
if(nf)clipboard.push({t:"w",x1:nf.x1,z1:nf.z1,y1:nf.y1,x2:nf.x2,z2:nf.z2,y2:nf.y2,h:nf.h1,flags:hzm.areas[ai].wFlags[ni]||0})}}
uUI()}
function doPaste(){if(clipboard.length===0)return;
for(var i=0;i<clipboard.length;i++){var c=clipboard[i];
if(c.t==="w"){newW.push({x1:c.x1+500,z1:c.z1+500,y1:c.y1,x2:c.x2+500,z2:c.z2+500,y2:c.y2,h:c.h,flags:c.flags,texHash:c.texHash!==undefined?c.texHash:-1,uvMode:c.uvMode||"fit"});undoHist.push("w")}}
rebuild();uUI()}

function doExp(){if(!hzm)return;var buf=rebuildHZM();var a=document.createElement("a");
a.href=URL.createObjectURL(new Blob([buf],{type:"application/octet-stream"}));a.download=hzmFN||"modified.hzm";
document.body.appendChild(a);a.click();setTimeout(function(){document.body.removeChild(a)},200)}

function doVerify(){if(!hzm)return;
var buf=rebuildHZM();var vb=new Uint8Array(buf);var ob=new Uint8Array(hzm.buf);
var diffs=0,diffList=[];
var minLen=Math.min(vb.length,ob.length);
for(var i=0;i<minLen;i++){if(vb[i]!==ob[i]){diffs++;if(diffList.length<30)diffList.push("0x"+i.toString(16)+": orig=0x"+ob[i].toString(16)+" new=0x"+vb[i].toString(16))}}
if(vb.length!==ob.length){diffList.push("SIZE: orig="+ob.length+" new="+vb.length)}
var hasChanges=Object.keys(colW).length>0||newW.length>0||Object.keys(colF).length>0||newF.length>0||Object.keys(colZ).length>0||newZ.length>0;
var panel=document.getElementById("propPanel");
var html='<div style="padding:6px"><b style="color:#00ccff">VERIFY EXPORT</b><br><br>';
html+='Original: '+ob.length+' bytes<br>Rebuilt: '+vb.length+' bytes<br>Byte diffs: '+diffs+'<br><br>';
if(!hasChanges&&diffs>0){html+='<b style="color:#ff3355">*** '+diffs+' diffs with NO edits! CORRUPTED ***</b><br>'}
else if(!hasChanges&&diffs===0){html+='<b style="color:#22cc66">PERFECT round-trip!</b><br>'}
else{html+=diffs+' diffs (expected with edits)<br>'}
if(diffList.length>0){html+='<br>Diffs:<br>';for(var d2=0;d2<diffList.length;d2++)html+='<span style="font-size:9px">'+diffList[d2]+'</span><br>'}
html+='</div>';panel.innerHTML=html;panel.style.display="block"}

function saveSession(){if(!hzm)return;
var sess={fn:hzmFN,colW:Object.keys(colW),newW:newW,colF:Object.keys(colF),newF:newF,colZ:Object.keys(colZ),newZ:newZ,
bookmarks:camBookmarks,gclMarkers:gclMarkers,navZones:hzm.navZones,
routes:hzm.routes.map(function(r){return{waypoints:r.waypoints}})};
var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(sess)],{type:"application/json"}));
a.download=(hzmFN||"session")+".json";document.body.appendChild(a);a.click();setTimeout(function(){document.body.removeChild(a)},200)}

function loadSession(file){if(!file||!hzm)return;var r=new FileReader();
r.onload=function(e){try{var sess=JSON.parse(e.target.result);
colW={};for(var i=0;i<sess.colW.length;i++)colW[sess.colW[i]]=true;
newW=sess.newW||[];colF={};for(i=0;i<(sess.colF||[]).length;i++)colF[sess.colF[i]]=true;
newF=sess.newF||[];colZ={};for(i=0;i<(sess.colZ||[]).length;i++)colZ[sess.colZ[i]]=true;newZ=sess.newZ||[];
if(sess.routes){for(i=0;i<sess.routes.length;i++){if(sess.routes[i].waypoints)hzm.routes[i].waypoints=sess.routes[i].waypoints}}
camBookmarks=sess.bookmarks||[];gclMarkers=sess.gclMarkers||[];
if(sess.navZones&&hzm.navZones){for(i=0;i<sess.navZones.length&&i<hzm.navZones.length;i++){hzm.navZones[i]=sess.navZones[i]}}
rebuild();rebuildGCL();uUI();updateZoneList();updateRouteList();updateBookmarkUI();updateKMDList();alert("Session loaded")}catch(err){alert("Load failed: "+err.message)}};r.readAsText(file)}

function toggleBoxSel(){boxSelMode=!boxSelMode;window._boxMode=boxSelMode;
var btn=document.getElementById("btnBoxSel");if(btn)btn.classList.toggle("active",boxSelMode);
document.getElementById("coordinfo").textContent=boxSelMode?"BOX SELECT: drag a rectangle over walls/floors/zones to select them":"";}
function setT(t){curTool=t;dPt1=null;movePt1=null;measurePt1=null;resizeDragging=false;resizeTarget=null;routeDragging=false;
navPaintActive=false;navPaintLastPt=null;navPaintChain=[];navPaintEraseTargets=new Set();
if(dPrev&&sc3){sc3.remove(dPrev);dPrev=null}
for(var mi=0;mi<movePrevObjs.length;mi++)sc3.remove(movePrevObjs[mi]);movePrevObjs=[];
var bs=document.querySelectorAll(".tb");for(var i=0;i<bs.length;i++)bs[i].classList.toggle("active",bs[i].getAttribute("data-t")===t);
if(t==="eyedrop"){
// Guard: explain what's needed if it can't work
var hasKmdTex=false;for(var ki=0;ki<kmdObjs.length;ki++){if(kmdObjs[ki].userData&&kmdObjs[ki].userData.type==="kmdtex"){hasKmdTex=true;break}}
var ci=document.getElementById("coordinfo");if(ci){
if(!hasKmdTex){ci.textContent="Eyedropper: no textured KMD faces visible. Enable 'Textured' KMD mode and load a stg_tex DAR (+TEX) first.";}
else{ci.textContent="Eyedropper active: click a textured KMD face to capture. Esc to cancel.";}}}}
function tgF(v){showFl=v;rebuild()}function tgZ(v){showZn=v;rebuild()}function tgR(v){showRt=v;rebuild()}
function tgNav(){navView=!navView;document.getElementById("btnNav").classList.toggle("active",navView);rebuild()}
function setSnap(v){snapSize=parseInt(v)||250}

// ==================== ZONE LIST PANEL ====================
function updateZoneList(){
var panel=document.getElementById("zoneListPanel");if(!panel||!hzm)return;
var filter=(document.getElementById("zoneFilter")||{}).value||"";filter=filter.toLowerCase();
var html='<div style="padding:4px"><input type="text" id="zoneFilter" placeholder="Filter zones..." value="'+filter+'" oninput="updateZoneList()" style="width:100%;background:#0a0e14;color:#cc8822;border:1px solid #1a2535;border-radius:2px;font-size:11px;font-family:monospace;padding:3px;margin-bottom:4px"></div>';
html+='<div style="max-height:calc(100vh - 200px);overflow-y:auto">';
for(var ai=0;ai<hzm.areas.length;ai++){var zns=hzm.areas[ai].zones;
for(var zi=0;zi<zns.length;zi++){var zn=zns[zi],zk=ai+"-"+zi;
if(colZ[zk])continue;
if(filter&&zn.name.toLowerCase().indexOf(filter)<0)continue;
var isSel=!!selZ[zk];
html+='<div onclick="selectZone(\''+zk+'\')" ondblclick="focusZone(\''+zk+'\')" style="padding:3px 6px;cursor:pointer;border-bottom:1px solid #1a2535;'+
(isSel?'background:#331122;color:#ff3355':'color:#cc8822')+'" title="Double-click to focus camera">';
html+='<b>'+zi+'</b> '+zn.name+'<br><span style="font-size:9px;opacity:0.5">('+zn.x1+','+zn.z1+')→('+zn.x2+','+zn.z2+') y='+zn.y1+'</span></div>'}}
// New zones
for(var nzi=0;nzi<newZ.length;nzi++){var nzn=newZ[nzi];
if(filter&&nzn.name.toLowerCase().indexOf(filter)<0)continue;
var isNZS=!!selZ["nz-"+nzi];
html+='<div onclick="selectZone(\'nz-'+nzi+'\')" style="padding:3px 6px;cursor:pointer;border-bottom:1px solid #1a2535;'+
(isNZS?'background:#331122;color:#ff3355':'color:#ff8800')+'">';
html+='<b>NEW</b> '+nzn.name+'<br><span style="font-size:9px;opacity:0.5">('+nzn.x1+','+nzn.z1+')→('+nzn.x2+','+nzn.z2+')</span></div>'}
html+='</div>';
panel.innerHTML=html}

function selectZone(k){
selW={};selF={};selZ={};selRoute=-1;selWP=-1;
selZ[k]=true;rebuild();uUI();updateZoneList()}

function focusZone(k){
selectZone(k);
var zn=null;
if(k.indexOf("nz-")===0){var idx=parseInt(k.substr(3));zn=newZ[idx]}
else{var ps=k.split("-"),ai=parseInt(ps[0]),zi=parseInt(ps[1]);zn=hzm.areas[ai]&&hzm.areas[ai].zones[zi]}
if(zn){cTgt.set(((zn.x1+zn.x2)/2)*S,zn.y1*S,((zn.z1+zn.z2)/2)*S);sph.radius=Math.max(5,Math.abs(zn.x2-zn.x1)*S*1.5);uCam()}}

function uUI(){var tw=0,tf=0;if(hzm)for(var i=0;i<hzm.areas.length;i++){tw+=hzm.areas[i].nc;tf+=hzm.areas[i].fc}
var sw=Object.keys(selW).length+Object.keys(selF).length+Object.keys(selZ).length;
document.getElementById("tbi").textContent="W:"+tw+"+"+newW.length+" F:"+tf+"+"+newF.length;
document.getElementById("tbs").textContent="Sel:"+sw;
var db=document.getElementById("bdel");db.textContent="Del("+sw+")";db.disabled=sw===0;db.className=sw>0?"btn danger":"btn";
document.getElementById("buw").disabled=undoPtr<=0;
// Context-sensitive panels
var routePanel=document.getElementById("routeListPanel");
var zonePanel=document.getElementById("zoneListPanel");
var navPanel=document.getElementById("navPanel");
var gclPanel2=document.getElementById("gclPanel");
if(routePanel)routePanel.style.display=(showRt||selRoute>=0)?"block":"none";
if(zonePanel)zonePanel.style.display=showZn?"block":"none";
if(navPanel)navPanel.style.display=showNavZones?"block":"none";
if(gclPanel2)gclPanel2.style.display=(gclEntities.length>0)?"block":"none";
showProps()}

// ==================== GIZMO SYSTEM (Blender-style) ====================
function getSelCenter(){
var cx=0,cz=0,cy=0,count=0;
for(var k in selW){if(!selW[k])continue;
if(k.indexOf("nw-")===0){var idx=parseInt(k.substr(3));var w=newW[idx];if(w){cx+=(w.x1+w.x2)/2;cz+=(w.z1+w.z2)/2;cy+=w.y1;count++}}
else{var ps=k.split("-"),ai=parseInt(ps[0]),ni=parseInt(ps[1]);var nf=hzm.areas[ai]&&hzm.areas[ai].navfaces[ni];
if(nf){cx+=(nf.x1+nf.x2)/2;cz+=(nf.z1+nf.z2)/2;cy+=nf.y1;count++}}}
for(k in selF){if(!selF[k])continue;
if(k.indexOf("nf-")===0){var fi=parseInt(k.substr(3));var fl=newF[fi];if(fl){cx+=(fl.x1+fl.x2)/2;cz+=(fl.z1+fl.z2)/2;cy+=fl.y1;count++}}
else{var fps=k.split("-"),fai=parseInt(fps[0]),ffi=parseInt(fps[1]);var ffl=hzm.areas[fai]&&hzm.areas[fai].floors[ffi];
if(ffl){cx+=(ffl.quads[0].x+ffl.quads[1].x)/2;cz+=(ffl.quads[0].z+ffl.quads[1].z)/2;cy+=ffl.quads[0].y;count++}}}
for(k in selZ){if(!selZ[k])continue;
if(k.indexOf("nz-")===0){var zi=parseInt(k.substr(3));var zn=newZ[zi];if(zn){cx+=(zn.x1+zn.x2)/2;cz+=(zn.z1+zn.z2)/2;cy+=zn.y1;count++}}
else{var zps=k.split("-"),zai=parseInt(zps[0]),zni=parseInt(zps[1]);var zzn=hzm.areas[zai]&&hzm.areas[zai].zones[zni];
if(zzn){cx+=(zzn.x1+zzn.x2)/2;cz+=(zzn.z1+zzn.z2)/2;cy+=zzn.y1;count++}}}
if(selNavZone>=0){var allNZ2=getAllNZ();var snz=allNZ2[selNavZone];if(snz){cx+=snz.x;cz+=snz.z;cy+=snz.y;count++}}
if(selRoute>=0&&selWP>=0){var rwp5=hzm.routes[selRoute];if(rwp5&&rwp5.waypoints[selWP]){
var wp5=rwp5.waypoints[selWP];cx+=wp5.x;cz+=wp5.z;cy+=wp5.y;count++}}
if(selGCL>=0&&selGCL<gclEntities.length){var ge=gclEntities[selGCL];
var gp=selGCLSpawn&&ge.spawnPos?ge.spawnPos:(ge.pos||ge.spawnPos);
// For INFRARED_CENSOR with endpoint B selected, gizmo edits the second beam endpoint
if(ge.type==="INFRARED_CENSOR"&&selGCLEndpoint===1&&ge.beamEnd){gp=ge.beamEnd;}
if(gp){cx+=gp.x;cz+=gp.z;cy+=gp.y;count++}}
if(count===0)return null;
return{x:cx/count*S,y:cy/count*S,z:cz/count*S}}

function rebuildGizmo(){
for(var i=0;i<gizmoObjs.length;i++)sc3.remove(gizmoObjs[i]);gizmoObjs=[];
var c=getSelCenter();
// In skew mode, position gizmo at the active corner
if(gizType==="skew"&&skewCorner>=0){
var skO=skewWallIdx>=0?newW[skewWallIdx]:skewFloorIdx>=0?newF[skewFloorIdx]:null;
if(skO&&skO.verts){var sv1=skO.verts[skewCorner];
if(skewCorner2>=0){var sv2=skO.verts[skewCorner2];c={x:(sv1.x+sv2.x)/2*S,y:(sv1.y+sv2.y)/2*S,z:(sv1.z+sv2.z)/2*S}}
else{c={x:sv1.x*S,y:sv1.y*S,z:sv1.z*S}}}}
if(gizType==="skew"&&skewCorner<0)return;// no corner selected, hide gizmo
if(!c)return;
var len=1.5,hs=0.18;
// Invisible oversized hit proxies — these are what the raycaster tests
// against, not the visible cubes. Lets the visible gizmo stay small &
// pretty while giving the user a forgiving click target. Especially
// important for Y, which can project close to X/Z in screen space at
// some camera angles.
var pickR=hs*4;// 4× the visible box's half-edge — generous pick radius
// X handle - red box at end of X axis line
var xg=new THREE.BoxGeometry(hs*2,hs*2,hs*2);
var xm=new THREE.Mesh(xg,new THREE.MeshBasicMaterial({color:0xff0000,depthTest:false}));
xm.position.set(c.x+len,c.y,c.z);xm.userData={gizmoAxis:"x"};xm.renderOrder=999;sc3.add(xm);gizmoObjs.push(xm);
// Y handle - green box (same size and offset as X/Z for visual consistency).
// Hit-testing is handled with screen-space preference in getGizmoHit so the
// Y handle is reliably clickable even when it overlaps X/Z in 3D space.
var yg=new THREE.BoxGeometry(hs*2,hs*2,hs*2);
var ym=new THREE.Mesh(yg,new THREE.MeshBasicMaterial({color:0x00ff00,depthTest:false}));
ym.position.set(c.x,c.y+len,c.z);ym.userData={gizmoAxis:"y"};ym.renderOrder=999;sc3.add(ym);gizmoObjs.push(ym);
// Z handle - blue box
var zg=new THREE.BoxGeometry(hs*2,hs*2,hs*2);
var zm=new THREE.Mesh(zg,new THREE.MeshBasicMaterial({color:0x0088ff,depthTest:false}));
zm.position.set(c.x,c.y,c.z+len);zm.userData={gizmoAxis:"z"};zm.renderOrder=999;sc3.add(zm);gizmoObjs.push(zm);
// === Invisible oversized hit proxies (sphere = same hit radius from any angle) ===
function _mkProxy(px,py,pz,axis){
var pg=new THREE.SphereGeometry(pickR,6,4);
var pm=new THREE.Mesh(pg,new THREE.MeshBasicMaterial({visible:false}));
pm.position.set(px,py,pz);pm.userData={gizmoAxis:axis,gizmoProxy:true};
pm.visible=true;// must be true for raycaster to even check it; material's visible:false hides it
pm.material.transparent=true;pm.material.opacity=0;pm.material.depthWrite=false;
sc3.add(pm);gizmoObjs.push(pm);}
_mkProxy(c.x+len,c.y,c.z,"x");
_mkProxy(c.x,c.y+len,c.z,"y");
_mkProxy(c.x,c.y,c.z+len,"z");
// Axis lines
var xlg=new THREE.BufferGeometry();xlg.setAttribute("position",new THREE.Float32BufferAttribute([c.x,c.y,c.z,c.x+len,c.y,c.z],3));
var xl=new THREE.Line(xlg,new THREE.LineBasicMaterial({color:0xff0000,depthTest:false}));xl.renderOrder=999;sc3.add(xl);gizmoObjs.push(xl);
var ylg=new THREE.BufferGeometry();ylg.setAttribute("position",new THREE.Float32BufferAttribute([c.x,c.y,c.z,c.x,c.y+len,c.z],3));
var yl=new THREE.Line(ylg,new THREE.LineBasicMaterial({color:0x00ff00,depthTest:false}));yl.renderOrder=999;sc3.add(yl);gizmoObjs.push(yl);
var zlg=new THREE.BufferGeometry();zlg.setAttribute("position",new THREE.Float32BufferAttribute([c.x,c.y,c.z,c.x,c.y,c.z+len],3));
var zl=new THREE.Line(zlg,new THREE.LineBasicMaterial({color:0x0088ff,depthTest:false}));zl.renderOrder=999;sc3.add(zl);gizmoObjs.push(zl)}

function getGizmoHit(e){
if(gizmoObjs.length===0)return null;
var vp=document.getElementById("viewport"),r=vp.getBoundingClientRect();
var ndcX=((e.clientX-r.left)/r.width)*2-1;
var ndcY=-((e.clientY-r.top)/r.height)*2+1;
// Test against everything in gizmoObjs that has a gizmoAxis (visible boxes
// AND invisible sphere proxies). The proxies are 4× the visible box's
// radius so the user gets a forgiving click target without enlarging the
// visible gizmo.
rc3.setFromCamera({x:ndcX,y:ndcY},cam3);
var candidates=[];
for(var gci=0;gci<gizmoObjs.length;gci++){
var g=gizmoObjs[gci];
if(g&&g.userData&&g.userData.gizmoAxis)candidates.push(g);}
var hits=rc3.intersectObjects(candidates,false);
if(hits.length===0)return null;
// Multiple hits possible (e.g. cursor over both Y's proxy AND X's proxy
// because their volumes overlap from this camera angle). Pick the handle
// whose CENTER is closest to the cursor in screen space — that's what the
// user is visually aiming at.
var bestAxis=null,bestD2=Infinity;
var seen={};
for(var hi=0;hi<hits.length;hi++){
var ax=hits[hi].object.userData.gizmoAxis;
if(seen[ax])continue;seen[ax]=true;
var wp=hits[hi].object.position.clone();
wp.project(cam3);
var dx=wp.x-ndcX,dy=wp.y-ndcY;
var d2=dx*dx+dy*dy;
if(d2<bestD2){bestD2=d2;bestAxis=ax;}}
return bestAxis;}

function saveGrabPositions(){
var items=[];
for(var k in selW){if(!selW[k])continue;
if(k.indexOf("nw-")===0){var idx=parseInt(k.substr(3));var w=newW[idx];if(w)items.push({ref:w,type:"nw",ox1:w.x1,oz1:w.z1,oy1:w.y1,ox2:w.x2,oz2:w.z2,oy2:w.y2})}
else{var ps=k.split("-"),ai=parseInt(ps[0]),ni=parseInt(ps[1]);var nf=hzm.areas[ai]&&hzm.areas[ai].navfaces[ni];
if(nf)items.push({ref:nf,type:"ew",ox1:nf.x1,oz1:nf.z1,oy1:nf.y1,ox2:nf.x2,oz2:nf.z2,oy2:nf.y2})}}
for(k in selF){if(!selF[k])continue;
if(k.indexOf("nf-")===0){var fi=parseInt(k.substr(3));var fl=newF[fi];if(fl)items.push({ref:fl,type:"nf",ox1:fl.x1,oz1:fl.z1,oy1:fl.y1,ox2:fl.x2,oz2:fl.z2})}
else{var fps=k.split("-"),fai=parseInt(fps[0]),ffi=parseInt(fps[1]);var ffl=hzm.areas[fai]&&hzm.areas[fai].floors[ffi];
if(ffl){var oq=[];for(var qi=0;qi<6;qi++)oq.push({x:ffl.quads[qi].x,z:ffl.quads[qi].z,y:ffl.quads[qi].y});
items.push({ref:ffl,type:"ef",oq:oq})}}}
for(k in selZ){if(!selZ[k])continue;
if(k.indexOf("nz-")===0){var zi=parseInt(k.substr(3));var zn=newZ[zi];if(zn)items.push({ref:zn,type:"nz2",ox1:zn.x1,oz1:zn.z1,oy1:zn.y1,ox2:zn.x2,oz2:zn.z2})}
else{var zps=k.split("-"),zai=parseInt(zps[0]),zni=parseInt(zps[1]);var zzn=hzm.areas[zai]&&hzm.areas[zai].zones[zni];
if(zzn)items.push({ref:zzn,type:"ez",ox1:zzn.x1,oz1:zzn.z1,oy1:zzn.y1,ox2:zzn.x2,oz2:zzn.z2})}}
if(selNavZone>=0){var allNZ2=getAllNZ();var snz=allNZ2[selNavZone];
if(snz)items.push({ref:snz,type:"navz",ox:snz.x,oz:snz.z,oy:snz.y})}
if(selRoute>=0&&selWP>=0){var rwp6=hzm.routes[selRoute];if(rwp6&&rwp6.waypoints[selWP]){
var wp6=rwp6.waypoints[selWP];items.push({ref:wp6,type:"wp",ox:wp6.x,oz:wp6.z,oy:wp6.y})}}
if(selGCL>=0&&selGCL<gclEntities.length){var ge2=gclEntities[selGCL];
var gp2=selGCLSpawn&&ge2.spawnPos?ge2.spawnPos:(ge2.pos||ge2.spawnPos);
// IR sensor endpoint B mode — drag affects beamEnd, not pos
if(ge2.type==="INFRARED_CENSOR"&&selGCLEndpoint===1&&ge2.beamEnd){gp2=ge2.beamEnd;}
if(gp2)items.push({ref:gp2,type:"gclpos",ox:gp2.x,oz:gp2.z,oy:gp2.y,ent:ge2})}
return items}

function applyGrabDelta(items,dx,dy,dz){
for(var i=0;i<items.length;i++){var it=items[i];
if(it.type==="nw"||it.type==="ew"){it.ref.x1=it.ox1+dx;it.ref.z1=it.oz1+dz;it.ref.y1=it.oy1+dy;
it.ref.x2=it.ox2+dx;it.ref.z2=it.oz2+dz;it.ref.y2=it.oy2+dy}
else if(it.type==="nf"){it.ref.x1=it.ox1+dx;it.ref.z1=it.oz1+dz;it.ref.x2=it.ox2+dx;it.ref.z2=it.oz2+dz;it.ref.y1=it.oy1+dy}
else if(it.type==="ef"){for(var qi=0;qi<6;qi++){it.ref.quads[qi].x=it.oq[qi].x+dx;it.ref.quads[qi].z=it.oq[qi].z+dz;it.ref.quads[qi].y=it.oq[qi].y+dy}}
else if(it.type==="nz2"||it.type==="ez"){it.ref.x1=it.ox1+dx;it.ref.z1=it.oz1+dz;it.ref.x2=it.ox2+dx;it.ref.z2=it.oz2+dz;it.ref.y1=it.oy1+dy;if(it.ref.y2!==undefined)it.ref.y2=it.oy1+dy}
else if(it.type==="navz"){it.ref.x=it.ox+dx;it.ref.z=it.oz+dz;it.ref.y=it.oy+dy}
else if(it.type==="wp"){it.ref.x=it.ox+dx;it.ref.z=it.oz+dz;it.ref.y=it.oy+dy}
else if(it.type==="gclpos"){it.ref.x=it.ox+dx;it.ref.z=it.oz+dz;it.ref.y=it.oy+dy;
}}}

function cancelGrab(){if(!grabMode)return;applyGrabDelta(grabOrigPositions,0,0,0);
grabMode=false;grabAxis=null;grabStart=null;grabOrigPositions=null;rebuild();rebuildGizmo();rebuildNavZones();rebuildGCLVis()}

function deleteNavZone(idx){
var allNZ2=getAllNZ();if(idx>=allNZ2.length)return;
// Remove all connections TO this zone
for(var i=0;i<allNZ2.length;i++){for(var j=0;j<6;j++){if(allNZ2[i].nears[j]===idx)allNZ2[i].nears[j]=255}}
// If it's a new zone, remove from array
if(idx>=hzm.navZones.length){var ni2=idx-hzm.navZones.length;newNavZones.splice(ni2,1);
// Reindex connections pointing to zones after the deleted one
for(i=0;i<allNZ2.length;i++){for(j=0;j<6;j++){if(allNZ2[i].nears[j]>idx&&allNZ2[i].nears[j]!==255)allNZ2[i].nears[j]--}}}
else{// Zero out existing zone
var z=hzm.navZones[idx];z.x=0;z.z=0;z.y=0;z.w=0;z.h=0;z.nears=[255,255,255,255,255,255];z.dists=[0,0,0,0,0,0]}
selNavZone=-1;logUndo("del","Delete NavZone "+idx);rebuildNavZones();updateNavPanel()}

// ==================== NAV ZONE VISUALIZATION ====================
function rebuildNavZones(){
if(!sc3||!hzm||!showNavZones)return;
for(var i=0;i<navZoneObjs.length;i++)sc3.remove(navZoneObjs[i]);navZoneObjs=[];
for(i=0;i<navConnObjs.length;i++)sc3.remove(navConnObjs[i]);navConnObjs=[];
var nz2=hzm.navZones;
var allNZFull=nz2.concat(newNavZones);
for(i=0;i<allNZFull.length;i++){var z=allNZFull[i];
var isSel=selNavZone===i;
var isNeighbor=false;
if(selNavZone>=0&&selNavZone<allNZFull.length){var selZ2=allNZFull[selNavZone];for(var ni=0;ni<6;ni++){if(selZ2.nears[ni]===i)isNeighbor=true}}
var isNewZ=i>=nz2.length;
var isEraseTgt=navPaintEraseTargets.has(i);
// Skip zeroed-out (deleted) zones entirely — don't render them
if(z.w===0&&z.h===0&&!isEraseTgt)continue;
var clr=isEraseTgt?0xff2222:isSel?0xffff00:isNeighbor?0x00ffaa:isNewZ?0xff8800:0x2266aa;
var op2=isEraseTgt?0.45:isSel?0.4:isNeighbor?0.3:isNewZ?0.2:0.15;
var zw=z.w*S*2,zh=z.h*S*2;if(zw<0.1)zw=0.5;if(zh<0.1)zh=0.5;
var zg=new THREE.PlaneGeometry(zw,zh);
var zm2=new THREE.Mesh(zg,new THREE.MeshBasicMaterial({color:clr,transparent:true,opacity:op2,side:THREE.DoubleSide}));
zm2.rotation.x=-Math.PI/2;zm2.position.set(z.x*S,z.y*S+0.15,z.z*S);
zm2.userData={type:"navzone",idx:i};sc3.add(zm2);navZoneObjs.push(zm2);
var lc=document.createElement("canvas");lc.width=96;lc.height=32;var lctx=lc.getContext("2d");
lctx.fillStyle=isSel?"#ffff00":isNeighbor?"#00ffaa":isNewZ?"#ff8800":"#4488cc";lctx.font="bold 14px monospace";
lctx.fillText(isNewZ?"NZ:"+i:""+i,4,16);
var ltex=new THREE.CanvasTexture(lc);var lsp=new THREE.Sprite(new THREE.SpriteMaterial({map:ltex,transparent:true,opacity:0.8}));
lsp.scale.set(0.6,0.2,1);lsp.position.set(z.x*S,z.y*S+0.35,z.z*S);sc3.add(lsp);navZoneObjs.push(lsp)}
// Draw connection lines
for(i=0;i<allNZFull.length;i++){var z2=allNZFull[i];
for(var ni2=0;ni2<6;ni2++){var nb3=z2.nears[ni2];if(nb3===255||nb3>=allNZFull.length)continue;
if(nb3<=i)continue;
var z3=allNZFull[nb3];
var isSel2=(selNavZone===i||selNavZone===nb3);
var lg=new THREE.BufferGeometry();lg.setAttribute("position",new THREE.Float32BufferAttribute([
z2.x*S,z2.y*S+0.2,z2.z*S, z3.x*S,z3.y*S+0.2,z3.z*S],3));
var lm=new THREE.Line(lg,new THREE.LineBasicMaterial({color:isSel2?0xffff00:0x334466,transparent:true,opacity:isSel2?0.8:0.3}));
sc3.add(lm);navConnObjs.push(lm)}}}

function toggleNavZones(){showNavZones=!showNavZones;
if(!showNavZones){for(var i=0;i<navZoneObjs.length;i++)sc3.remove(navZoneObjs[i]);navZoneObjs=[];
for(i=0;i<navConnObjs.length;i++)sc3.remove(navConnObjs[i]);navConnObjs=[];selNavZone=-1}
else{rebuildNavZones()}
var _nzBtn=document.getElementById("btnNZ");if(_nzBtn)_nzBtn.classList.toggle("active",showNavZones);
// Also sync the AI NavZones toggle button (the NZ button was folded into it)
var _aiBtn=document.getElementById("btnAINav");if(_aiBtn)_aiBtn.classList.toggle("active",showNavZones);
updateNavPanel()}

function selectNavZone(idx){selNavZone=idx;rebuildNavZones();updateNavPanel()}

function getAllNZ(){return hzm?hzm.navZones.concat(newNavZones):[]}

function disconnectNavZone(fromIdx,toIdx){
var allNZ2=getAllNZ();if(fromIdx>=allNZ2.length||toIdx>=allNZ2.length)return;
var z=allNZ2[fromIdx];
for(var i=0;i<6;i++){if(z.nears[i]===toIdx){z.nears[i]=255;z.dists[i]=0}}
var z2=allNZ2[toIdx];
for(i=0;i<6;i++){if(z2.nears[i]===fromIdx){z2.nears[i]=255;z2.dists[i]=0}}
logUndo("navcut","Cut zone "+fromIdx+"↔"+toIdx);
rebuildNavZones();updateNavPanel()}

function connectNavZone(fromIdx,toIdx){
if(fromIdx===toIdx||isNaN(toIdx))return;
var allNZ2=getAllNZ();
if(fromIdx>=allNZ2.length||toIdx>=allNZ2.length||toIdx<0){
var p=document.getElementById("navPanel");if(p)p.innerHTML+='<div style="color:#ff3355;padding:4px">Invalid zone # (max='+(allNZ2.length-1)+')</div>';return}
var z=allNZ2[fromIdx],z2=allNZ2[toIdx];
// Find empty slot in from
var slot1=-1;for(var i=0;i<6;i++){if(z.nears[i]===255){slot1=i;break}}
var slot2=-1;for(i=0;i<6;i++){if(z2.nears[i]===255){slot2=i;break}}
if(slot1<0||slot2<0){var p2=document.getElementById("navPanel");if(p2)p2.innerHTML+='<div style="color:#ff3355;padding:4px">No free slot (max 6 per zone)</div>';return}
// Check if already connected
for(i=0;i<6;i++){if(z.nears[i]===toIdx)return}
// Calculate distance
var dx=z2.x-z.x,dz=z2.z-z.z,dist=Math.round(Math.sqrt(dx*dx+dz*dz)/100);
if(dist>255)dist=255;if(dist<1)dist=1;
z.nears[slot1]=toIdx;z.dists[slot1]=dist;
z2.nears[slot2]=fromIdx;z2.dists[slot2]=dist;
logUndo("navconn","Connect zone "+fromIdx+"↔"+toIdx);
rebuildNavZones();updateNavPanel()}

function applyNavZoneProps(idx){
var allNZ2=getAllNZ();if(idx>=allNZ2.length)return;
var z=allNZ2[idx];
z.x=parseInt(document.getElementById("nzx").value)||0;
z.z=parseInt(document.getElementById("nzz").value)||0;
z.y=parseInt(document.getElementById("nzy").value)||0;
z.w=parseInt(document.getElementById("nzw").value)||100;
z.h=parseInt(document.getElementById("nzhh").value)||100;
logUndo("edit","Edit NavZone "+idx);
rebuildNavZones();updateNavPanel()}

function placeNavPaintZone(evtOrNull,pt){
// Get Y from floor raycast (or fall back to placeY)
var paintY=placeY;
if(evtOrNull){
var fHits=getHits(evtOrNull,["floor"]);
if(fHits.length>0){var fud=fHits[0].object.userData,fk2=fud.key||"";
if(fk2.indexOf("nf-")===0){var nfi9=parseInt(fk2.substr(3));if(newF[nfi9])paintY=newF[nfi9].y1}
else if(fk2.indexOf("-")>0){var fps9=fk2.split("-");var fla9=hzm&&hzm.areas[parseInt(fps9[0])];var flo9=fla9&&fla9.floors[parseInt(fps9[1])];if(flo9)paintY=flo9.quads[0].y}}}
var cx=Math.round(pt.x/S),cz=Math.round(pt.z/S);
// Check spacing from last placed point
if(navPaintLastPt){var ddx=cx-navPaintLastPt.x,ddz=cz-navPaintLastPt.z;
if(Math.sqrt(ddx*ddx+ddz*ddz)<navPaintSpacing)return}
// Check zone limit
var dNZp=hzm.navZones.filter(function(z){return z.w===0&&z.h===0}).length;
var effNZp=hzm.navZones.length+newNavZones.length-dNZp;
if(effNZp>=255){document.getElementById("coordinfo").textContent="NavPaint: zone limit reached (255). Use NavErase to free up space first.";return}
var sz=1000;// fixed 1000x1000 zones matching game's typical navzone size
var allNZnow=getAllNZ();
var newIdx=allNZnow.length;
var nz={x:cx,z:cz,y:paintY,w:sz,h:sz,nears:[255,255,255,255,255,255],dists:[0,0,0,0,0,0]};
// Chain to previous zone in stroke
if(navPaintChain.length>0){
var prevIdx=navPaintChain[navPaintChain.length-1];
var prevNZ=allNZnow[prevIdx];
if(prevNZ){
var s1=-1;for(var si=0;si<6;si++){if(nz.nears[si]===255){s1=si;break}}
var s2=-1;for(var si2=0;si2<6;si2++){if(prevNZ.nears[si2]===255){s2=si2;break}}
if(s1>=0&&s2>=0){var ddx2=cx-prevNZ.x,ddz2=cz-prevNZ.z;
var dist2=Math.round(Math.sqrt(ddx2*ddx2+ddz2*ddz2)/100);
if(dist2>255)dist2=255;if(dist2<1)dist2=1;
nz.nears[s1]=prevIdx;nz.dists[s1]=dist2;
prevNZ.nears[s2]=newIdx;prevNZ.dists[s2]=dist2;}}}
newNavZones.push(nz);
navPaintChain.push(newIdx);
navPaintLastPt={x:cx,z:cz};
rebuildNavZones();
document.getElementById("coordinfo").textContent="NavPaint: "+navPaintChain.length+" zone"+(navPaintChain.length!==1?"s":"")+" painted (Y="+paintY+")";}

function autoNavZoneFromFloors(){
if(!hzm){alert("Load a HZM first.");return}
var floorBounds=[];
for(var k in selF){if(!selF[k])continue;
var isNew=k.indexOf("nf-")===0;
if(isNew){var ni=parseInt(k.substr(3));var nfl=newF[ni];if(!nfl)continue;
floorBounds.push({x1:Math.min(nfl.x1,nfl.x2),z1:Math.min(nfl.z1,nfl.z2),x2:Math.max(nfl.x1,nfl.x2),z2:Math.max(nfl.z1,nfl.z2),y:nfl.y1});}
else{var ps=k.split("-");var fl2=hzm.areas[parseInt(ps[0])]&&hzm.areas[parseInt(ps[0])].floors[parseInt(ps[1])];if(!fl2)continue;
var qx1=Math.min(fl2.quads[0].x,fl2.quads[1].x),qz1=Math.min(fl2.quads[0].z,fl2.quads[1].z);
var qx2=Math.max(fl2.quads[0].x,fl2.quads[1].x),qz2=Math.max(fl2.quads[0].z,fl2.quads[1].z);
floorBounds.push({x1:qx1,z1:qz1,x2:qx2,z2:qz2,y:fl2.quads[0].y});}}
if(floorBounds.length===0){
document.getElementById("coordinfo").textContent="AutoNZ: select one or more FLOORS first (Sel tool), then click AutoNZ";
updateNavPanel();return}
var ZONE_HW=750,STEP=1000;
// --- PASS 1: calculate all grid positions without placing anything ---
var allGrids=[];var totalNeeded=0;
for(var fi=0;fi<floorBounds.length;fi++){
var fb=floorBounds[fi];if(fb.x2-fb.x1<100||fb.z2-fb.z1<100)continue;
var cols=[],cx2=fb.x1+ZONE_HW;
while(cx2<=fb.x2){cols.push(Math.round(cx2));cx2+=STEP}
if(cols.length===0)cols.push(Math.round((fb.x1+fb.x2)/2));
var rows=[],cz2=fb.z1+ZONE_HW;
while(cz2<=fb.z2){rows.push(Math.round(cz2));cz2+=STEP}
if(rows.length===0)rows.push(Math.round((fb.z1+fb.z2)/2));
totalNeeded+=cols.length*rows.length;
allGrids.push({fb:fb,cols:cols,rows:rows});}
if(totalNeeded===0){document.getElementById("coordinfo").textContent="AutoNZ: selected floor is too small";return}
// Check available slots
var dNZpre=hzm.navZones.filter(function(z){return z.w===0&&z.h===0}).length;
var freeSlots=255-(hzm.navZones.length+newNavZones.length-dNZpre);
if(freeSlots<totalNeeded){
// Show exactly what's needed and what to do — update nav panel info
document.getElementById("coordinfo").textContent=
"AutoNZ BLOCKED: need "+totalNeeded+" zone slots, only "+freeSlots+" free. "+
"Use NavErase to delete "+(totalNeeded-freeSlots)+" more zones (set Y="+
(allGrids[0]&&allGrids[0].fb.y||placeY)+" first to erase the right level), then try again.";
updateNavPanel();return;}
// --- PASS 2: place the full grid ---
var totalPlaced=0;
for(var gi=0;gi<allGrids.length;gi++){
var g=allGrids[gi];var grid=[];
var baseIdx=hzm.navZones.length+newNavZones.length;
for(var ri=0;ri<g.rows.length;ri++){grid[ri]=[];
for(var ci=0;ci<g.cols.length;ci++){
var nzIdx=hzm.navZones.length+newNavZones.length;
newNavZones.push({x:g.cols[ci],z:g.rows[ri],y:g.fb.y,w:ZONE_HW,h:ZONE_HW,
nears:[255,255,255,255,255,255],dists:[0,0,0,0,0,0]});
grid[ri][ci]=nzIdx;totalPlaced++;}}
// Wire grid: right and down neighbors
for(ri=0;ri<g.rows.length;ri++){
for(ci=0;ci<g.cols.length;ci++){
var idxA=grid[ri][ci];var zA=getAllNZ()[idxA];
if(ci+1<g.cols.length){var idxB=grid[ri][ci+1];var zB=getAllNZ()[idxB];
var dx2=zB.x-zA.x,dz2=zB.z-zA.z;
var dist2=Math.round(Math.sqrt(dx2*dx2+dz2*dz2)/100);if(dist2<1)dist2=1;if(dist2>255)dist2=255;
var s1=-1;for(var si=0;si<6;si++){if(zA.nears[si]===255){s1=si;break}}
var s2=-1;for(var si2=0;si2<6;si2++){if(zB.nears[si2]===255){s2=si2;break}}
if(s1>=0&&s2>=0){zA.nears[s1]=idxB;zA.dists[s1]=dist2;zB.nears[s2]=idxA;zB.dists[s2]=dist2;}}
if(ri+1<g.rows.length){var idxC=grid[ri+1][ci];var zC=getAllNZ()[idxC];
var dx3=zC.x-zA.x,dz3=zC.z-zA.z;
var dist3=Math.round(Math.sqrt(dx3*dx3+dz3*dz3)/100);if(dist3<1)dist3=1;if(dist3>255)dist3=255;
var s3=-1;for(var si3=0;si3<6;si3++){if(zA.nears[si3]===255){s3=si3;break}}
var s4=-1;for(var si4=0;si4<6;si4++){if(zC.nears[si4]===255){s4=si4;break}}
if(s3>=0&&s4>=0){zA.nears[s3]=idxC;zA.dists[s3]=dist3;zC.nears[s4]=idxA;zC.dists[s4]=dist3;}}}}}
autoConnectNavZones();
logUndo("add","AutoNZ grid +"+totalPlaced+" zones");
rebuildNavZones();updateNavPanel();
document.getElementById("coordinfo").textContent="AutoNZ: placed "+totalPlaced+" zones in "+
(allGrids[0]&&allGrids[0].cols.length||0)+" cols × "+(allGrids[0]&&allGrids[0].rows.length||0)+" rows — grid connected ✓";}
function autoConnectNavZones(){
if(!hzm)return;
var allNZ=getAllNZ();
var newStart=hzm.navZones.length;
var connected=0,noSlots=0;
function isActive(z){return z&&(z.w>0||z.h>0);}
function alreadyConn(nz,ei){for(var i=0;i<6;i++)if(nz.nears[i]===ei)return true;return false;}
function tryConn(ni,ei){
var nz=allNZ[ni],ez=allNZ[ei];
if(!isActive(nz)||!isActive(ez))return;
// Zones must overlap (or be within 500 units) on both axes
var tol=300;// require actual overlap (not just proximity) for small zones
if(Math.abs(nz.x-ez.x)>=(nz.w+ez.w+tol))return;
if(Math.abs(nz.z-ez.z)>=(nz.h+ez.h+tol))return;
// Y proximity: don't connect zones on different floor levels (>2500 units apart)
if(Math.abs(nz.y-ez.y)>2500)return;
if(alreadyConn(nz,ei)||alreadyConn(ez,ni))return;
var s1=-1;for(var i=0;i<6;i++){if(nz.nears[i]===255){s1=i;break}}
var s2=-1;for(var i=0;i<6;i++){if(ez.nears[i]===255){s2=i;break}}
if(s1<0||s2<0){noSlots++;return;}
var dx=ez.x-nz.x,dz=ez.z-nz.z;
var dist=Math.round(Math.sqrt(dx*dx+dz*dz)/100);
if(dist>255)dist=255;if(dist<1)dist=1;
nz.nears[s1]=ei;nz.dists[s1]=dist;
ez.nears[s2]=ni;ez.dists[s2]=dist;
connected++;}
// Connect each new zone to all other zones (existing and new)
for(var ni=newStart;ni<allNZ.length;ni++){
for(var ei=0;ei<allNZ.length;ei++){if(ei!==ni)tryConn(ni,ei)}}
if(connected===0&&newNavZones.length===0){
document.getElementById("coordinfo").textContent="No new zones to connect — place zones with +NZ tool first";
return;}
logUndo("navconn","Auto-connect navzones (+"+connected+")");
rebuildNavZones();updateNavPanel();
var msg="✓ Auto-connect: "+connected+" new connection"+(connected!==1?"s":"")+" made";
if(noSlots>0)msg+=" | "+noSlots+" skipped (zone at 6-connection limit)";
if(connected===0)msg="No overlapping zones found — make sure new zones overlap existing ones";
document.getElementById("coordinfo").textContent=msg;}

function getNavZoneHealth(){
// Returns array of {idx, zone, issues[]} for new zones
var allNZ=getAllNZ();var issues=[];
for(var i=hzm.navZones.length;i<allNZ.length;i++){
var z=allNZ[i];var zIssues=[];
var connCount=0;for(var j=0;j<6;j++)if(z.nears[j]!==255)connCount++;
if(connCount===0)zIssues.push("ISOLATED — no connections");
else{
// Check if any connection is to a non-deleted zone
var hasValidConn=false;
for(var j=0;j<6;j++){if(z.nears[j]!==255&&z.nears[j]<allNZ.length){var nz2=allNZ[z.nears[j]];if(nz2.w>0||nz2.h>0)hasValidConn=true}}
if(!hasValidConn)zIssues.push("All connections point to deleted zones")}
if(z.w<500||z.h<500)zIssues.push("Very small zone (may cause stuck enemies)");
if(z.w>8000||z.h>8000)zIssues.push("Very large zone (enemies may wander)");
if(connCount>0){}// ok
issues.push({idx:i,zone:z,connCount:connCount,issues:zIssues});}
return issues;}

function updateNavPanel(){
var p=document.getElementById("navPanel");if(!p)return;
if(!showNavZones||!hzm||!hzm.navZones){p.innerHTML="";return}
var dNZH=hzm.navZones.filter(function(z){return z.w===0&&z.h===0}).length;
var effNZ=hzm.navZones.length+newNavZones.length-dNZH;
var html='<div style="padding:4px;border-bottom:1px solid #1a2535">';
html+='<b style="color:#4488cc">NavMesh Zones</b> <span style="color:#446688;font-size:9px">'+effNZ+'/255</span>';
html+=' <button onclick="autoConnectNavZones()" class="btn" style="font-size:9px;padding:1px 5px;color:#00ffaa;float:right" title="Auto-connect new zones to overlapping existing zones">AutoConn</button>';
html+=' <button onclick="autoNavZoneFromFloors()" class="btn" style="font-size:9px;padding:1px 5px;color:#44aaff;float:right;margin-right:2px" title="Fill selected floor(s) with a nav zone grid. Select floors first with Sel tool.">AutoNZ</button>';
html+='</div>';
// New zone health display
if(newNavZones.length>0){
var health=getNavZoneHealth();
var isolated=health.filter(function(h){return h.connCount===0}).length;
var warnings=health.filter(function(h){return h.issues.length>0}).length;
html+='<div style="padding:3px 4px;font-size:9px;background:#0a1218;border-bottom:1px solid #1a2535">';
html+='<b style="color:#ff8800">New zones: '+newNavZones.length+'</b> ';
if(isolated>0)html+='<span style="color:#ff3355">⚠ '+isolated+' isolated</span> ';
else if(warnings>0)html+='<span style="color:#ffaa00">⚠ '+warnings+' warnings</span> ';
else html+='<span style="color:#44cc88">✓ all connected</span>';
html+='<br><span style="color:#446688">Tip: zones must OVERLAP adjacent ones by ≥500 units. AutoConn only links zones within 2500 Y of each other — set zone Y to match floor height.</span>';
html+='</div>';}
if(selNavZone>=0){
var allNZ3=getAllNZ();
if(selNavZone<allNZ3.length){
var z=allNZ3[selNavZone];
var isNewNZ=selNavZone>=hzm.navZones.length;
html+='<div style="padding:4px;background:#112233;border-bottom:1px solid #1a2535">';
html+='<b style="color:'+(isNewNZ?'#ff8800':'#ffff00')+'">'+(isNewNZ?'NEW ':'')+'Zone '+selNavZone+'</b>'+(isNewNZ?'<br><span style="font-size:9px;color:#889">Index <b style="color:#ff8800">'+selNavZone+'</b> (use in Connect field)</span>':'')+'<br>';
// Show issues for new zones
if(isNewNZ){var zHealth=getNavZoneHealth().filter(function(h){return h.idx===selNavZone});
if(zHealth.length>0&&zHealth[0].issues.length>0){
html+='<div style="background:#1a0a00;border:1px solid #ff4400;border-radius:2px;padding:2px 4px;margin:2px 0">';
for(var hi=0;hi<zHealth[0].issues.length;hi++)html+='<span style="color:#ff6644;font-size:9px">⚠ '+zHealth[0].issues[hi]+'</span><br>';
html+='</div>'}}
html+='Pos: ('+z.x+', '+z.z+') y='+z.y+'<br>';
html+='Size: '+z.w+'\u00d7'+z.h+'<br>';
var pstyle2='style="width:55px;background:#0a0e14;color:#ffff00;border:1px solid #1a2535;border-radius:2px;font-size:10px;font-family:monospace;padding:1px 3px;margin:1px"';
html+='<div style="margin:4px 0;padding:3px;background:#0a1520;border-radius:2px">';
html+='X:<input type="number" id="nzx" value="'+z.x+'" '+pstyle2+'> Z:<input type="number" id="nzz" value="'+z.z+'" '+pstyle2+'><br>';
html+='Y:<input type="number" id="nzy" value="'+z.y+'" '+pstyle2+'><br>';
html+='W:<input type="number" id="nzw" value="'+z.w+'" '+pstyle2+'> H:<input type="number" id="nzhh" value="'+z.h+'" '+pstyle2+'><br>';
html+='<button onclick="applyNavZoneProps('+selNavZone+')" class="btn" style="margin-top:2px">Apply</button>';
html+=' <button onclick="deleteNavZone('+selNavZone+')" class="btn danger" style="margin-top:2px">Delete Zone</button></div>';
html+='<br><b>Connections:</b><br>';
html+='<span style="font-size:9px;color:#889">Cut = enemies cannot cross.<br>Click zone # to focus on it.</span><br><br>';
var hasConn=false;
for(var i=0;i<6;i++){var nb=z.nears[i];if(nb===255)continue;hasConn=true;
var nzLabel=(nb<hzm.navZones.length)?"Zone "+nb:"NEW N"+(nb-hzm.navZones.length);
var nz3=nb<allNZ3.length?allNZ3[nb]:null;
html+='<div style="display:flex;align-items:center;gap:4px;padding:2px;margin:1px 0;background:#0a1520;border-radius:2px">';
html+='<span onclick="selectNavZone('+nb+')" style="cursor:pointer;color:#00ffaa;font-weight:bold;min-width:30px">→'+nb+'</span>';
html+='<span style="flex:1;font-size:9px;color:#667">'+(nz3?'('+nz3.x+','+nz3.z+')':'')+' d='+z.dists[i]+'</span>';
html+='<button onclick="disconnectNavZone('+selNavZone+','+nb+')" class="btn danger" style="font-size:9px;padding:1px 4px">Cut</button>';
html+='</div>'}
if(!hasConn)html+='<span style="color:#ff6644">No connections (isolated)</span><br>';
html+='<br><b>Add connection:</b><br>';
html+='<input type="number" id="navConnTarget" min="0" max="'+(allNZ3.length-1)+'" style="width:50px;background:#0a0e14;color:#00ffaa;border:1px solid #1a2535;border-radius:2px;font-size:11px;font-family:monospace;padding:2px">';
html+=' <button onclick="connectNavZone('+selNavZone+',parseInt(document.getElementById(\'navConnTarget\').value))" class="btn" style="font-size:9px">Connect</button>';
html+='</div>'}}
else{html+='<div style="padding:4px;font-size:10px;color:#667">Click a zone in the 3D view<br>or enter zone # below:<br>';
html+='<input type="number" id="navGoZone" min="0" max="'+(hzm.navZones.length-1)+'" style="width:50px;background:#0a0e14;color:#4488cc;border:1px solid #1a2535;border-radius:2px;font-size:11px;font-family:monospace;padding:2px">';
html+=' <button onclick="var v=parseInt(document.getElementById(\'navGoZone\').value);if(v>=0)selectNavZone(v)" class="btn" style="font-size:9px">Go</button>';
html+='<br><br><b>How it works:</b><br><span style="font-size:9px">Zones = areas enemies can walk in.<br>Lines = connections between zones.<br>Cut a connection = enemies blocked.<br><br><b>To block enemies:</b><br>1. Find zones on each side of wall<br>2. Cut their connection<br><br><b>To expand navigation:</b><br>Select a nearby zone, increase W and H to cover the gap. '+
(function(){var dNZ=hzm.navZones.filter(function(z){return z.w===0&&z.h===0}).length;var eff=hzm.navZones.length+newNavZones.length-dNZ;return eff>=255?'<br><br><span style="color:#ff3355">'+eff+'/255 zones used (MAX). Delete more to make room.</span>':'<br><br><span style="color:#446688">'+eff+'/255 zones used ('+dNZ+' deleted slots freed).</span>'})()+'</span></div>'}
p.innerHTML=html}

// ==================== UNDO LOG ====================
var undoSnapshots=[];var undoPtr=-1;
function takeSnapshot(desc){
var snap={desc:desc,time:new Date().toLocaleTimeString(),
newW:JSON.parse(JSON.stringify(newW)),newF:JSON.parse(JSON.stringify(newF)),
newZ:JSON.parse(JSON.stringify(newZ)),newNavZones:JSON.parse(JSON.stringify(newNavZones)),
colW:JSON.parse(JSON.stringify(colW)),colF:JSON.parse(JSON.stringify(colF)),colZ:JSON.parse(JSON.stringify(colZ)),
gclEntities:JSON.parse(JSON.stringify(gclEntities)),
camAngles:JSON.parse(JSON.stringify(camAngles)),
kmdDeletedFaces:JSON.parse(JSON.stringify(kmdDeletedFaces)),
// Store modified original data too
areas:hzm?JSON.parse(JSON.stringify(hzm.areas)):null,
navZones:hzm?JSON.parse(JSON.stringify(hzm.navZones)):null,
routes:hzm?JSON.parse(JSON.stringify(hzm.routes)):null};
// Truncate future history if we branched
if(undoPtr<undoSnapshots.length-1)undoSnapshots.length=undoPtr+1;
undoSnapshots.push(snap);undoPtr=undoSnapshots.length-1;
if(undoSnapshots.length>50){undoSnapshots.shift();undoPtr--}
updateUndoPanel()}
function restoreSnapshot(idx){
if(idx<0||idx>=undoSnapshots.length)return;
var snap=undoSnapshots[idx];undoPtr=idx;
newW=JSON.parse(JSON.stringify(snap.newW));
newF=JSON.parse(JSON.stringify(snap.newF));
newZ=JSON.parse(JSON.stringify(snap.newZ));
newNavZones=JSON.parse(JSON.stringify(snap.newNavZones));
colW=JSON.parse(JSON.stringify(snap.colW||{}));
colF=JSON.parse(JSON.stringify(snap.colF||{}));
colZ=JSON.parse(JSON.stringify(snap.colZ||{}));
gclEntities=JSON.parse(JSON.stringify(snap.gclEntities));
if(snap.camAngles)camAngles=JSON.parse(JSON.stringify(snap.camAngles));
kmdDeletedFaces=JSON.parse(JSON.stringify(snap.kmdDeletedFaces||{}));
if(snap.areas&&hzm)hzm.areas=JSON.parse(JSON.stringify(snap.areas));
if(snap.navZones&&hzm)hzm.navZones=JSON.parse(JSON.stringify(snap.navZones));
if(snap.routes&&hzm)hzm.routes=JSON.parse(JSON.stringify(snap.routes));
selW={};selF={};selZ={};selRoute=-1;selWP=-1;selNavZone=-1;selGCL=-1;
rebuild();rebuildGizmo();rebuildNavZones();rebuildGCLVis();rebuildKMD();rebuildSkewCorners();uUI();showProps();updateUndoPanel()}
function undoAction(){if(undoPtr>0)restoreSnapshot(undoPtr-1)}
function logUndo(action,desc){takeSnapshot(desc);updateUndoPanel()}
function updateUndoPanel(){var p=document.getElementById("undoPanel");if(!p)return;
var undoBtn=' <button onclick="event.stopPropagation();undoAction()" class="btn" style="font-size:9px;padding:1px 4px">Undo</button>';
var html=panelHeader("undo","History ("+undoSnapshots.length+")","#00ccff",undoBtn);
if(panelCollapsed.undo){p.innerHTML=html;return}
html+='<div style="max-height:200px;overflow-y:auto">';
for(var i=undoSnapshots.length-1;i>=0;i--){
var isCur=i===undoPtr;
html+='<div onclick="restoreSnapshot('+i+')" style="padding:2px 6px;font-size:9px;cursor:pointer;border-bottom:1px solid #111;'+
(isCur?'background:#112233;color:#00ccff;font-weight:bold':'color:#667')+'">'+
undoSnapshots[i].time+' '+undoSnapshots[i].desc+(isCur?' ◄':'')+'</div>'}
html+='</div>';p.innerHTML=html}

// ==================== MEASUREMENT TOOL ====================
function clearMeasure(){if(measureLine&&sc3)sc3.remove(measureLine);if(measureLabel&&sc3)sc3.remove(measureLabel);measureLine=null;measureLabel=null;measurePt1=null}
function showMeasure(p1x,p1z,p2x,p2z){
clearMeasure();
var dist=Math.round(Math.sqrt((p2x-p1x)**2+(p2z-p1z)**2)/S);
var mg=new THREE.BufferGeometry();mg.setAttribute("position",new THREE.Float32BufferAttribute([p1x,placeY*S+0.1,p1z,p2x,placeY*S+0.1,p2z],3));
measureLine=new THREE.Line(mg,new THREE.LineBasicMaterial({color:0xff00ff}));sc3.add(measureLine);
var mc=document.createElement("canvas");mc.width=128;mc.height=32;var mctx=mc.getContext("2d");
mctx.fillStyle="#ff00ff";mctx.font="16px monospace";mctx.fillText(dist+"u",4,20);
var mtex=new THREE.CanvasTexture(mc);measureLabel=new THREE.Sprite(new THREE.SpriteMaterial({map:mtex,transparent:true}));
measureLabel.scale.set(1,0.25,1);measureLabel.position.set((p1x+p2x)/2,placeY*S+0.3,(p1z+p2z)/2);sc3.add(measureLabel)}

// ==================== CAMERA BOOKMARKS ====================
function saveCamBookmark(){var name=prompt("Bookmark name:","Cam "+(camBookmarks.length+1));if(!name)return;
camBookmarks.push({name:name,theta:sph.theta,phi:sph.phi,radius:sph.radius,tx:cTgt.x,ty:cTgt.y,tz:cTgt.z});updateBookmarkUI()}
function loadCamBookmark(idx){var b=camBookmarks[idx];if(!b)return;sph.theta=b.theta;sph.phi=b.phi;sph.radius=b.radius;cTgt.set(b.tx,b.ty,b.tz);uCam()}
function delCamBookmark(idx){camBookmarks.splice(idx,1);updateBookmarkUI()}
// ==================== SURFACE Y SNAP ====================
// Find which HZM area a new wall/floor belongs to.
//
// STRATEGY: a wall placed inside a side-room KMD's geometry belongs to THAT room's HZD,
// which declares which HZM area is active when the player is in that room. So:
//   1. Find which loaded KMD has a block bbox containing the point (per-block, not loose outer bbox)
//   2. Look up that KMD in the GCL hzd declarations to find its HZM area
//
// This is way more reliable than nearest-wall, because HZM area 3 (main, 288 walls) dominates
// most of the stage's space — nearest-wall always picked area 3 even inside side rooms.
function findHzmAreaForPoint(x,y,z){
if(!hzm||!hzm.areas||hzm.areas.length===0)return 0;
// Step 1: find which loaded KMD contains this point in any of its block bboxes.
// PASS A: strict containment (no tolerance). If found, that's definitive — the wall is
// physically inside this KMD's geometry. Critical for distinguishing stacked rooms
// (e.g. room 3 directly above room 5 share X/Z range).
// PASS B: loose containment (with tolerance) — only used if strict failed.
if(kmdBufs.length>0){
var bestKmdIdx=-1,bestVol=Infinity;
function tryPass(tolXZ,tolY){
var ki,bki,kbuf,kdv,nt,bo,bx1,bx2,by1,by2,bz1,bz2,vol;
for(ki=0;ki<kmdBufs.length;ki++){
kbuf=kmdBufs[ki];kdv=new DataView(kbuf);
nt=kdv.getUint32(4,true);
for(bki=0;bki<nt;bki++){bo=0x20+bki*88;
bx1=kdv.getInt32(bo+8,true);
if(bx1===0x7FFFFFFF)continue;
bx2=kdv.getInt32(bo+20,true);
by1=kdv.getInt32(bo+12,true);by2=kdv.getInt32(bo+24,true);
bz1=kdv.getInt32(bo+16,true);bz2=kdv.getInt32(bo+28,true);
if(x>=bx1-tolXZ&&x<=bx2+tolXZ&&z>=bz1-tolXZ&&z<=bz2+tolXZ&&y>=by1-tolY&&y<=by2+tolY){
vol=Math.abs((bx2-bx1)*(by2-by1)*(bz2-bz1));
if(vol<bestVol){bestVol=vol;bestKmdIdx=ki}}}}}
tryPass(0,0);// strict
if(bestKmdIdx<0)tryPass(200,500);// fallback with tolerance
// Step 2: look up that KMD in GCL hzd map to find its HZM area
if(bestKmdIdx>=0&&kmdFileNames[bestKmdIdx]){
var kname=kmdFileNames[bestKmdIdx].replace(/\.kmd$/,"");
for(var zn in gclHzdZones){var z=gclHzdZones[zn];
if(z.kmds.indexOf(kname)>=0)return z.hzmArea;}}}
// Fallback: nearest-existing-wall if KMD/GCL lookup failed
var bestArea=0,bestDist=Infinity;
for(var ai=0;ai<hzm.areas.length;ai++){
var areaWalls=hzm.areas[ai]&&hzm.areas[ai].navfaces;
if(!areaWalls)continue;
for(var awi=0;awi<areaWalls.length;awi++){var w=areaWalls[awi];
var mx=(w.x1+w.x2)/2,my=(w.y1+w.y2)/2,mz=(w.z1+w.z2)/2;
var dx=x-mx,dy=y-my,dz=z-mz;
var dist=dx*dx+dy*dy+dz*dz;
if(dist<bestDist){bestDist=dist;bestArea=ai}}}
return bestArea;}

function setYFromSurface(y){placeY=y;lastSurfY=y;
var yi=document.getElementById("yinput");if(yi){yi.value=y;yi.style.borderColor="#44aaff";setTimeout(function(){yi.style.borderColor=""},800)}
var ab=document.getElementById("btnApplyY");if(ab)ab.title="Re-apply last captured Y ("+y+")";
document.getElementById("coordinfo").textContent="Y set to "+y}
function toggleSurfY(on){surfYMode=on;}

// ==================== GCL PROC VIEWER ====================
function parseProcList(text){
gclProcs=[];if(!text)return;
var clean=text.replace(/\r/g,"");
// Match proc blocks (greedy but bounded by balanced braces via simple scan)
var pos=0;
while(pos<clean.length){
var pi=clean.indexOf("proc ",pos);if(pi<0)break;
var nameStart=pi+5;while(nameStart<clean.length&&clean[nameStart]===" ")nameStart++;
var nameEnd=nameStart;while(nameEnd<clean.length&&/\w/.test(clean[nameEnd]))nameEnd++;
var procName=clean.substring(nameStart,nameEnd);
var braceOpen=clean.indexOf("{",nameEnd);if(braceOpen<0)break;
// Find matching close brace
var depth=1,bi=braceOpen+1;
while(bi<clean.length&&depth>0){if(clean[bi]==="{")depth++;else if(clean[bi]==="}") depth--;bi++;}
var body=clean.substring(braceOpen+1,bi-1).trim();
// Classify proc
var hasCam=body.indexOf("camera")>=0,hasTrap=body.indexOf("trap")>=0||body.indexOf("ntrap")>=0;
var hasMsg=body.indexOf("mesg")>=0||body.indexOf("radio")>=0,hasChara=body.indexOf("chara")>=0;
var type=hasCam?"camera":hasTrap?"trigger":hasMsg?"dialogue":hasChara?"entity":"logic";
gclProcs.push({name:procName,body:body,type:type,line:pi,expanded:false});
pos=bi}}

function highlightGCLBody(text){
return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
.replace(/(#[^\n]*)/g,'<span style="color:#3a4a3a">$1</span>')
.replace(/\b(camera)\b/g,'<span style="color:#00ccff">$1</span>')
.replace(/\b(trap|ntrap)\b/g,'<span style="color:#ff8800">$1</span>')
.replace(/\b(mesg|radio)\b/g,'<span style="color:#ffff44">$1</span>')
.replace(/\b(eval)\b/g,'<span style="color:#ff4488">$1</span>')
.replace(/\b(map)\b/g,'<span style="color:#44cc88">$1</span>')
.replace(/\b(delay)\b/g,'<span style="color:#667788">$1</span>')
.replace(/\b(chara)\b/g,'<span style="color:#ff8844">$1</span>')
.replace(/\b(if|else|call|return)\b/g,'<span style="color:#cc88ff">$1</span>')
.replace(/("[^"]*")/g,'<span style="color:#ffdd88">$1</span>')
.replace(/(\$[a-z]:[0-9a-f]+)/gi,'<span style="color:#88aaff">$1</span>')
.replace(/(0x[0-9a-f]+)/gi,'<span style="color:#88aaff">$1</span>')
.replace(/\n/g,"<br>").replace(/\s/g,"&nbsp;");
}

function updateProcPanel(){
var p=document.getElementById("procPanel");if(!p)return;
if(gclProcs.length===0){p.innerHTML="";return;}
var typeColors={camera:"#00aaff",trigger:"#ff8800",dialogue:"#ffff44",entity:"#ff8844",logic:"#667788"};
var typeIcons={camera:"📷",trigger:"⚡",dialogue:"💬",entity:"👤",logic:"⚙"};
var html='<div style="padding:4px;border-bottom:1px solid #1a2535;display:flex;align-items:center;justify-content:space-between">';
html+='<b style="color:#44cc88;font-size:10px">PROCS ('+gclProcs.length+')</b>';
html+='<button onclick="procPanelOpen=!procPanelOpen;updateProcPanel()" class="btn" style="font-size:9px;padding:0 4px">'+(procPanelOpen?"▲":"▼")+'</button></div>';
if(!procPanelOpen){p.innerHTML=html;return;}
for(var i=0;i<gclProcs.length;i++){var pr=gclProcs[i];
var tc=typeColors[pr.type]||"#667788";var ti=typeIcons[pr.type]||"⚙";
html+='<div style="border-bottom:1px solid #111">';
html+='<div style="display:flex;align-items:center;padding:2px 4px;cursor:pointer;gap:4px" onclick="toggleProc('+i+')">';
html+='<span style="color:'+tc+';font-size:10px">'+ti+'</span>';
html+='<span style="color:'+tc+';font-size:9px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+pr.name+'</span>';
html+='<span style="color:#446688;font-size:8px">'+pr.type+'</span>';
// Jump button for camera procs
var camA=null;for(var ci=0;ci<camAngles.length;ci++){if(camAngles[ci].proc===pr.name){camA=camAngles[ci];break}}
if(camA)html+=' <button onclick="event.stopPropagation();focusProcCamera('+i+')" class="btn" style="font-size:8px;padding:0 3px;color:#00aaff">→</button>';
html+='<span style="color:#446688;font-size:9px">'+(pr.expanded?"▲":"▼")+'</span>';
html+='</div>';
if(pr.expanded){html+='<div style="padding:2px 8px 4px;background:#080c12;font-size:9px;max-height:120px;overflow-y:auto;line-height:1.5;white-space:nowrap">'+highlightGCLBody(pr.body)+'</div>'}
html+='</div>'}
p.innerHTML=html}

function toggleProc(idx){if(gclProcs[idx])gclProcs[idx].expanded=!gclProcs[idx].expanded;updateProcPanel()}

function focusProcCamera(procIdx){var pr=gclProcs[procIdx];if(!pr)return;
for(var ci=0;ci<camAngles.length;ci++){var ca=camAngles[ci];if(ca.proc!==pr.name)continue;
if(ca.bound){cTgt.set((ca.bound.x1+ca.bound.x2)/2*S,(ca.bound.y1+ca.bound.y2)/2*S,(ca.bound.z1+ca.bound.z2)/2*S)}
else if(ca.setPos){cTgt.set(ca.setPos.x*S,ca.setPos.y*S,ca.setPos.z*S)}
uCam();drawCamGizmo();
if(!showCamAngles){showCamAngles=true;rebuildCamAngles()}
selCamAngle=ci;rebuildCamAngles();showCamAngleProps();return;}}

function updateBookmarkUI(){var p=document.getElementById("bookmarkPanel");if(!p)return;
var saveBtn='<button class="btn" onclick="event.stopPropagation();saveCamBookmark()" style="font-size:9px;padding:1px 4px">+Save</button>';
var html=panelHeader("bookmark","Bookmarks","#00ccff",saveBtn);
if(!panelCollapsed.bookmark){
for(var i=0;i<camBookmarks.length;i++){html+='<div style="padding:2px 6px;cursor:pointer;border-bottom:1px solid #111;font-size:10px" onclick="loadCamBookmark('+i+')"><span style="color:#00ccff">'+camBookmarks[i].name+'</span> <span onclick="event.stopPropagation();delCamBookmark('+i+')" style="color:#662222;cursor:pointer">✕</span></div>'}}
p.innerHTML=html}

// ==================== STATISTICS ====================
function getStats(){if(!hzm)return"";
var tw=0,tf=0,tz=0,tr=0,trwp=0;
for(var i=0;i<hzm.areas.length;i++){tw+=hzm.areas[i].nc;tf+=hzm.areas[i].fc;tz+=hzm.areas[i].zc}
for(i=0;i<hzm.routes.length;i++){if(hzm.routes[i].waypoints.length>0){tr++;trwp+=hzm.routes[i].waypoints.length}}
var cw=Object.keys(colW).length,cf=Object.keys(colF).length,cz=Object.keys(colZ).length;
return "Walls: "+tw+" (del:"+cw+" new:"+newW.length+")\nFloors: "+tf+" (del:"+cf+" new:"+newF.length+")\nZones: "+tz+" (del:"+cz+" new:"+newZ.length+")\nRoutes: "+tr+" ("+trwp+" WPs)\nKMDs: "+kmdBufs.length+"\nFile ver: "+hzm.ver+"\nAreas: "+hzm.ac}
function showStats(){alert("=== HZM Statistics ===\n\n"+getStats())}

// ==================== ROUTE LIST ====================
function updateRouteList(){
var p=document.getElementById("routeListPanel");if(!p||!hzm)return;
var html='<div style="padding:4px"><b style="color:#00ff88">Routes</b></div><div style="max-height:300px;overflow-y:auto">';
for(var i=0;i<hzm.routes.length;i++){var rt=hzm.routes[i];if(rt.waypoints.length===0)continue;
var isSel=selRoute===i;
html+='<div onclick="selectRoute('+i+')" ondblclick="focusRoute('+i+')" style="padding:3px 6px;cursor:pointer;border-bottom:1px solid #112;'+
(isSel?'background:#112211;color:#ffffff':'color:#00ff88')+'">';
html+='<b>Route '+i+'</b> ('+rt.waypoints.length+' WPs)</div>'}
html+='</div>';p.innerHTML=html}

function selectRoute(ri){selRoute=ri;selWP=0;selW={};selF={};selZ={};rebuild();rebuildGCLVis();uUI();updateRouteList()}
function focusRoute(ri){selectRoute(ri);var rt=hzm.routes[ri];if(!rt||rt.waypoints.length===0)return;
var cx=0,cz=0;for(var i=0;i<rt.waypoints.length;i++){cx+=rt.waypoints[i].x;cz+=rt.waypoints[i].z}
cx/=rt.waypoints.length;cz/=rt.waypoints.length;
cTgt.set(cx*S,0,cz*S);sph.radius=15;uCam()}

// ==================== GRID OVERLAY ====================
var showGrid2=false,gridObjs=[];
function toggleGrid2(){showGrid2=!showGrid2;rebuildGrid2();document.getElementById("btnGrid").classList.toggle("active",showGrid2)}
function rebuildGrid2(){for(var i=0;i<gridObjs.length;i++)sc3.remove(gridObjs[i]);gridObjs=[];
if(!showGrid2||!sc3)return;
var step=5000*S,range=40;
for(var x=-range;x<=range;x+=step){
var g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute([x,placeY*S+0.005,-range,x,placeY*S+0.005,range],3));
var l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0x1a3050,transparent:true,opacity:0.3}));sc3.add(l);gridObjs.push(l)}
for(var z=-range;z<=range;z+=step){
var g2=new THREE.BufferGeometry();g2.setAttribute("position",new THREE.Float32BufferAttribute([-range,placeY*S+0.005,z,range,placeY*S+0.005,z],3));
var l2=new THREE.Line(g2,new THREE.LineBasicMaterial({color:0x1a3050,transparent:true,opacity:0.3}));sc3.add(l2);gridObjs.push(l2)}}

// ==================== GCL PREVIEW ====================
var gclObjs=[];
function parseGCLPreview(){
var text=prompt("Paste GCL lines with positions (OBSTACLE, CAMERA, PUT_OBJECT, etc.):\nFormat: -pos x,y,z lines");
if(!text)return;
gclMarkers=[];
var lines=text.split("\n");
for(var i=0;i<lines.length;i++){
var m=lines[i].match(/-pos\s+(-?\d+),(-?\d+),(-?\d+)/);
if(m){gclMarkers.push({x:parseInt(m[1]),y:parseInt(m[2]),z:parseInt(m[3]),line:lines[i].trim().substring(0,40)})}}
rebuildGCL();alert("Loaded "+gclMarkers.length+" positions")}
function rebuildGCL(){for(var i=0;i<gclObjs.length;i++)sc3.remove(gclObjs[i]);gclObjs=[];
if(!showGcl||!sc3)return;
for(var i=0;i<gclMarkers.length;i++){var mk=gclMarkers[i];
var g=new THREE.SphereGeometry(0.3,8,8);var m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xff4488}));
m.position.set(mk.x*S,mk.y*S,mk.z*S);sc3.add(m);gclObjs.push(m);
var lc=document.createElement("canvas");lc.width=256;lc.height=32;var lctx=lc.getContext("2d");
lctx.fillStyle="#ff4488";lctx.font="12px monospace";lctx.fillText(mk.line,2,16);
var ltex=new THREE.CanvasTexture(lc);var lsp=new THREE.Sprite(new THREE.SpriteMaterial({map:ltex,transparent:true}));
lsp.scale.set(2,0.25,1);lsp.position.set(mk.x*S,mk.y*S+0.5,mk.z*S);sc3.add(lsp);gclObjs.push(lsp)}}
function clearGCL(){gclMarkers=[];rebuildGCL()}

// ==================== FLOOR PROPERTIES ====================
function showFloorProps(k){
var panel=document.getElementById("propPanel");
var pstyle='style="width:58px;background:#0a0e14;color:#00ccff;border:1px solid #1a2535;border-radius:2px;font-size:11px;font-family:monospace;padding:1px 3px;margin:1px"';
if(k.indexOf("nf-")===0){var idx=parseInt(k.substr(3));var fl=newF[idx];if(!fl)return"";
var isSlopedN=fl.ramp&&(fl.ramp.lo!==fl.ramp.hi);
var html='<div style="padding:6px;border-top:1px solid #1a2535"><b style="color:#ff8800">New Floor '+idx+(isSlopedN?' <span style="font-size:9px;background:#0a4a3a;padding:1px 4px;border-radius:2px">RAMP</span>':'')+'</b><br>';
html+='X1:<input type="number" id="fx1" value="'+fl.x1+'" '+pstyle+'> Z1:<input type="number" id="fz1" value="'+fl.z1+'" '+pstyle+'><br>';
html+='X2:<input type="number" id="fx2" value="'+fl.x2+'" '+pstyle+'> Z2:<input type="number" id="fz2" value="'+fl.z2+'" '+pstyle+'><br>';
html+='Y:<input type="number" id="fy1" value="'+fl.y1+'" '+pstyle+'><br>';
// Ramp controls — works on new floors too
html+='<div style="margin-top:4px;padding:3px;background:#0a1a18;border-radius:2px;font-size:9px">';
html+='<b style="color:#44ccaa">Ramp / Stairs:</b> turn this into a slope.<br>';
html+='Low Y:<input type="number" id="fRampLo" value="'+(fl.ramp?fl.ramp.lo:fl.y1)+'" '+pstyle+'>';
html+=' High Y:<input type="number" id="fRampHi" value="'+(fl.ramp?fl.ramp.hi:fl.y1+1000)+'" '+pstyle+'><br>';
html+='Slope axis: <select id="fRampAxis" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:9px">';
var curAxis=fl.ramp?fl.ramp.axis:"x";
html+='<option value="x"'+(curAxis==="x"?" selected":"")+'>X (low at -X, high at +X)</option>';
html+='<option value="-x"'+(curAxis==="-x"?" selected":"")+'>X (low at +X, high at -X)</option>';
html+='<option value="z"'+(curAxis==="z"?" selected":"")+'>Z (low at -Z, high at +Z)</option>';
html+='<option value="-z"'+(curAxis==="-z"?" selected":"")+'>Z (low at +Z, high at -Z)</option>';
html+='</select><br>';
html+='<button onclick="makeRampNewFloor('+idx+')" class="btn" style="font-size:9px;margin-top:3px;color:#44ccaa">'+(isSlopedN?"Update Ramp":"Convert to Ramp")+'</button>';
if(isSlopedN)html+=' <button onclick="flattenNewFloor('+idx+')" class="btn" style="font-size:9px;margin-top:3px;color:#aa8866">Flatten</button>';
html+='</div>';
html+='<div style="margin-top:4px;border-top:1px solid #1a2535;padding-top:4px"><b style="color:#44cc88">Texture:</b> ';
html+=(fl.texHash>=0&&darTextures[fl.texHash]?'<span style="color:#ff0">'+darTextures[fl.texHash].name+'</span>':'<span style="opacity:0.4">none</span>');
html+='<br><button onclick="applyTexToFloor('+idx+')" class="btn" style="margin-top:2px;color:#44cc88">'+(activeTexHash>=0?'Paint: '+(darTextures[activeTexHash]?darTextures[activeTexHash].name:'?'):'Select texture first')+'</button>';
html+='<button onclick="setT(\'eyedrop\')" class="btn" style="margin-top:2px;margin-left:4px;color:#44cc88" title="Pick texture from a KMD face">🎨</button>';
html+='<button onclick="clearTexFromFloor('+idx+')" class="btn" style="margin-top:2px;margin-left:4px">Clear</button>';
html+='<br>UV: <select onchange="setFloorUV('+idx+',this.value)" style="background:#0a0e14;color:#44cc88;border:1px solid #1a2535;font-size:9px"><option value="fit"'+(fl.uvMode!=="repeat"?' selected':'')+'>Fit</option><option value="repeat"'+(fl.uvMode==="repeat"?' selected':'')+'>Repeat</option></select></div>';
html+='<button onclick="applyNewFloorProps('+idx+')" class="btn" style="margin-top:4px">Apply</button> <button onclick="setYFromSurface('+fl.y1+')" class="btn" style="margin-top:4px;color:#44aaff" title="Set place Y to this floor\'s Y">↑Y='+fl.y1+'</button></div>';
return html}
else{var ps=k.split("-"),ai=parseInt(ps[0]),fi=parseInt(ps[1]);
var fl2=hzm.areas[ai]&&hzm.areas[ai].floors[fi];if(!fl2)return"";
// Detect sloped: corners (quads[2..5]) with different Y
var c1=fl2.quads[2],c2=fl2.quads[3],c3=fl2.quads[4],c4=fl2.quads[5];
var isSloped=(c1.y!==c2.y)||(c2.y!==c3.y)||(c3.y!==c4.y);
var html='<div style="padding:6px;border-top:1px solid #1a2535"><b style="color:'+(isSloped?'#44ccaa':'#1a6a9c')+'">Floor '+fi+(isSloped?' <span style="font-size:9px;background:#0a4a3a;padding:1px 4px;border-radius:2px">SLOPED / RAMP</span>':'')+'</b><br>';
html+='<div style="background:#0a1a2a;padding:3px 5px;margin:3px 0;font-size:9px;color:#88aabb">';
html+='BBox: ('+fl2.quads[0].x+','+fl2.quads[0].z+') → ('+fl2.quads[1].x+','+fl2.quads[1].z+')';
html+='</div>';
html+='X1:<input type="number" id="fx1" value="'+fl2.quads[0].x+'" '+pstyle+'> Z1:<input type="number" id="fz1" value="'+fl2.quads[0].z+'" '+pstyle+'><br>';
html+='X2:<input type="number" id="fx2" value="'+fl2.quads[1].x+'" '+pstyle+'> Z2:<input type="number" id="fz2" value="'+fl2.quads[1].z+'" '+pstyle+'><br>';
if(isSloped){
// Per-corner Y editing — labels indicate corner index since p1..p4 mapping varies
html+='<div style="margin-top:4px;padding:4px;background:#0a1a18;border-radius:2px">';
html+='<b style="color:#44ccaa;font-size:9px">CORNER Y VALUES</b> <span style="font-size:8px;color:#558">— bilinear interpolation produces ramp</span><br>';
// h-field encoding: per analysis of 75+ vanilla ramps, h values store the SLOPE NORMAL
// scaled by 256 (PSX fixed-point convention). For axis-aligned ramps the formula is solved.
// For non-axis-aligned (diagonal) slopes we still preserve original h values.
html+='<div style="background:#1a2a18;padding:3px;margin:2px 0;border-radius:2px;font-size:8px;color:#aaffcc">';
html+='After editing Y, click <b>Recompute h</b> to update slope coefficients.';
html+='</div>';
html+='<table style="font-size:9px;border-collapse:collapse"><tr>';
html+='<td style="padding:1px"><span style="color:#666">P1</span> ('+c1.x+','+c1.z+') Y:<input type="number" id="fcy1" value="'+c1.y+'" '+pstyle+'> <span style="font-size:7px;color:#558">h='+c1.h+'</span></td>';
html+='<td style="padding:1px"><span style="color:#666">P2</span> ('+c2.x+','+c2.z+') Y:<input type="number" id="fcy2" value="'+c2.y+'" '+pstyle+'> <span style="font-size:7px;color:#558">h='+c2.h+'</span></td>';
html+='</tr><tr>';
html+='<td style="padding:1px"><span style="color:#666">P3</span> ('+c3.x+','+c3.z+') Y:<input type="number" id="fcy3" value="'+c3.y+'" '+pstyle+'> <span style="font-size:7px;color:#558">h='+c3.h+'</span></td>';
html+='<td style="padding:1px"><span style="color:#666">P4</span> ('+c4.x+','+c4.z+') Y:<input type="number" id="fcy4" value="'+c4.y+'" '+pstyle+'> <span style="font-size:7px;color:#558">h='+c4.h+'</span></td>';
html+='</tr></table>';
html+='<button onclick="recomputeFloorH('+ai+','+fi+')" class="btn" style="font-size:9px;margin-top:3px;color:#44ccaa">Recompute h (after Y edit)</button> ';
html+='<button onclick="flattenFloor('+ai+','+fi+')" class="btn" style="font-size:9px;margin-top:3px;color:#aa8866">Flatten (avg Y)</button>';
html+='</div>';
}else{
// Flat floor: single Y + make-ramp button
html+='Y:<input type="number" id="fy1" value="'+fl2.quads[0].y+'" '+pstyle+'><br>';
html+='<div style="margin-top:4px;padding:3px;background:#0a1a18;border-radius:2px;font-size:9px">';
html+='<b style="color:#44ccaa">Make Ramp:</b> turn this flat floor into a slope.<br>';
html+='Low Y:<input type="number" id="fRampLo" value="'+fl2.quads[0].y+'" '+pstyle+'>';
html+=' High Y:<input type="number" id="fRampHi" value="'+(fl2.quads[0].y+1000)+'" '+pstyle+'><br>';
html+='Slope axis: <select id="fRampAxis" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:9px">';
html+='<option value="x">X (low at -X, high at +X)</option>';
html+='<option value="-x">X (low at +X, high at -X)</option>';
html+='<option value="z">Z (low at -Z, high at +Z)</option>';
html+='<option value="-z">Z (low at +Z, high at -Z)</option>';
html+='</select><br>';
html+='<button onclick="makeRamp('+ai+','+fi+')" class="btn" style="font-size:9px;margin-top:3px;color:#44ccaa">Convert to Ramp</button>';
html+='</div>';}
html+='<div style="margin-top:4px;border-top:1px solid #1a2535;padding-top:4px"><b style="color:#44cc88">KMD Texture:</b> ';
html+='<br><button onclick="paintHZMFloor('+ai+','+fi+')" class="btn" style="margin-top:2px;color:#44cc88">'+(activeTexHash>=0?'Paint: '+(darTextures[activeTexHash]?darTextures[activeTexHash].name:'?'):'Select texture first')+'</button>';
html+='<button onclick="setT(\'eyedrop\')" class="btn" style="margin-top:2px;margin-left:4px;color:#44cc88" title="Pick texture from a KMD face">🎨</button>';
html+='<button onclick="removeHZMFloorTex('+ai+','+fi+')" class="btn" style="margin-top:2px;margin-left:4px;color:#ff8844">Remove Texture</button></div>';
html+='<button onclick="applyFloorProps('+ai+','+fi+')" class="btn" style="margin-top:4px">Apply</button> <button onclick="setYFromSurface('+fl2.quads[0].y+')" class="btn" style="margin-top:4px;color:#44aaff" title="Set place Y to this floor\'s Y">↑Y='+fl2.quads[0].y+'</button></div>';
return html}}

function applyFloorProps(ai,fi){var fl=hzm.areas[ai].floors[fi];
var x1=parseInt(document.getElementById("fx1").value)||0,z1=parseInt(document.getElementById("fz1").value)||0;
var x2=parseInt(document.getElementById("fx2").value)||0,z2=parseInt(document.getElementById("fz2").value)||0;
// Check if per-corner Y inputs are present (sloped floor UI)
var corner1=document.getElementById("fcy1");
if(corner1){
// Sloped editing: read each corner Y independently, leave X/Z as-is
fl.quads[2].y=parseInt(corner1.value)||0;
fl.quads[3].y=parseInt(document.getElementById("fcy2").value)||0;
fl.quads[4].y=parseInt(document.getElementById("fcy3").value)||0;
fl.quads[5].y=parseInt(document.getElementById("fcy4").value)||0;
// bbox Y = min/max of corners so engine bbox tests work correctly
var ys=[fl.quads[2].y,fl.quads[3].y,fl.quads[4].y,fl.quads[5].y];
fl.quads[0].y=Math.min.apply(null,ys);
fl.quads[1].y=Math.max.apply(null,ys);
// Update bbox X/Z too
fl.quads[0].x=x1;fl.quads[0].z=z1;
fl.quads[1].x=x2;fl.quads[1].z=z2;
}else{
// Flat floor: single Y applied to all corners
var y=parseInt(document.getElementById("fy1").value)||0;
fl.quads[0].x=x1;fl.quads[0].z=z1;fl.quads[0].y=y;
fl.quads[1].x=x2;fl.quads[1].z=z2;fl.quads[1].y=y;
fl.quads[2].x=x1;fl.quads[2].z=z1;fl.quads[2].y=y;
fl.quads[3].x=x2;fl.quads[3].z=z1;fl.quads[3].y=y;
fl.quads[4].x=x2;fl.quads[4].z=z2;fl.quads[4].y=y;
fl.quads[5].x=x1;fl.quads[5].z=z2;fl.quads[5].y=y;}
rebuild();showProps();logUndo("edit","Edit floor "+fi)}

// Convert a flat floor to a ramp using the form inputs.
//
// h-field formula (REVERSE-ENGINEERED from analyzing 75+ vanilla MGS1 ramps across s02a/s11a/etc):
// The h values encode the slope NORMAL vector scaled by 256 (PSX fixed-point convention).
// For an axis-aligned ramp:
//   - Compute the surface direction: (axis_length, dy) in the slope plane
//   - Normalize it; the perpendicular normal (rotated 90°) is (-dy, axis_length) / magnitude
//   - Multiply by 256
//   - For X-slope: p1.h = -sin(angle)*256, p3.h = cos(angle)*256, p2.h = p4.h = 0
//   - For Z-slope: p2.h = -sin(angle)*256, p3.h = cos(angle)*256, p1.h = p4.h = 0
// Where the sign of p1.h or p2.h depends on whether slope goes up or down along the axis.
//
// Match accuracy: predictions are within ±2 of actual values (integer truncation).
function computeRampNormalH(axisLen,dy){
var L=Math.sqrt(axisLen*axisLen+dy*dy);
if(L===0)return[0,256];
var sinComp=Math.round(-dy/L*256);
var cosComp=Math.round(axisLen/L*256);
return[sinComp,cosComp];}

function makeRamp(ai,fi){var fl=hzm.areas[ai].floors[fi];
var lo=parseInt(document.getElementById("fRampLo").value)||0;
var hi=parseInt(document.getElementById("fRampHi").value)||0;
var axis=document.getElementById("fRampAxis").value;
// Corner positions: p1@(x1,z1), p2@(x2,z1), p3@(x2,z2), p4@(x1,z2)
// dx = p2.x - p1.x (always positive after our resize logic)
// dz = p3.z - p2.z (always positive)
var dx=fl.quads[1].x-fl.quads[0].x;
var dz=fl.quads[1].z-fl.quads[0].z;
var p1y,p2y,p3y,p4y,p1h=0,p2h=0,p3h=0,p4h=0;
if(axis==="x"){
// Slope along +X: Y rises from -X to +X. dy in slope direction = (hi-lo) over dx.
p1y=lo;p4y=lo;p2y=hi;p3y=hi;
var n=computeRampNormalH(dx,hi-lo);
p1h=n[0];p3h=n[1];}
else if(axis==="-x"){
p1y=hi;p4y=hi;p2y=lo;p3y=lo;
var n2=computeRampNormalH(dx,lo-hi);
p1h=n2[0];p3h=n2[1];}
else if(axis==="z"){
p1y=lo;p2y=lo;p3y=hi;p4y=hi;
var n3=computeRampNormalH(dz,hi-lo);
p2h=n3[0];p3h=n3[1];}
else if(axis==="-z"){
p1y=hi;p2y=hi;p3y=lo;p4y=lo;
var n4=computeRampNormalH(dz,lo-hi);
p2h=n4[0];p3h=n4[1];}
fl.quads[2].y=p1y;fl.quads[2].h=p1h&0xFFFF;
fl.quads[3].y=p2y;fl.quads[3].h=p2h&0xFFFF;
fl.quads[4].y=p3y;fl.quads[4].h=p3h&0xFFFF;
fl.quads[5].y=p4y;fl.quads[5].h=p4h&0xFFFF;
fl.quads[0].y=Math.min(lo,hi);fl.quads[1].y=Math.max(lo,hi);
// CRITICAL: clear bit 1 of b1.h (the "use flat Y" flag) so engine actually interpolates the slope.
// Preserve other bits (some flat floors had bits 8/9 set too — likely engine hints).
fl.quads[0].h=(fl.quads[0].h&~2)|1;// clear bit 1, set bit 0 (always-inside)
rebuild();showProps();logUndo("edit","Make ramp floor "+fi);
document.getElementById("coordinfo").textContent="Ramp Y="+lo+"→"+hi+" along "+axis+". Normal-h: p1="+p1h+" p2="+p2h+" p3="+p3h+" p4="+p4h;}

// Flatten a sloped floor by averaging the corner Ys
function flattenFloor(ai,fi){var fl=hzm.areas[ai].floors[fi];
var avg=Math.round((fl.quads[2].y+fl.quads[3].y+fl.quads[4].y+fl.quads[5].y)/4);
for(var qi=2;qi<6;qi++)fl.quads[qi].y=avg;
fl.quads[0].y=avg;fl.quads[1].y=avg;
// Set bit 1 of b1.h ("use flat Y" mode) so engine doesn't run slope interpolation.
// Preserve other bits that may have been there.
fl.quads[0].h=(fl.quads[0].h|3);
// Reset corner h values to vanilla flat pattern (p3.h=255, others=0)
fl.quads[2].h=0;fl.quads[3].h=0;fl.quads[4].h=255;fl.quads[5].h=0;
rebuild();showProps();logUndo("edit","Flatten floor "+fi);
document.getElementById("coordinfo").textContent="Floor "+fi+" flattened to Y="+avg;}

function applyNewFloorProps(idx){var fl=newF[idx];
fl.x1=parseInt(document.getElementById("fx1").value)||0;fl.z1=parseInt(document.getElementById("fz1").value)||0;
fl.x2=parseInt(document.getElementById("fx2").value)||0;fl.z2=parseInt(document.getElementById("fz2").value)||0;
fl.y1=parseInt(document.getElementById("fy1").value)||0;
rebuild();showProps();logUndo("edit","Edit new floor "+idx)}

// Convert a NEW floor into a ramp. Stores ramp params on the floor object;
// the HZM encoder reads these and writes proper sloped corners + h-coefficients.
function makeRampNewFloor(idx){var fl=newF[idx];if(!fl)return;
var lo=parseInt(document.getElementById("fRampLo").value)||0;
var hi=parseInt(document.getElementById("fRampHi").value)||0;
var axis=document.getElementById("fRampAxis").value;
fl.ramp={lo:lo,hi:hi,axis:axis};
fl.y1=Math.min(lo,hi);// keep y1 in sync for placement / display
rebuild();showProps();logUndo("edit","Make ramp new floor "+idx);
document.getElementById("coordinfo").textContent="New floor "+idx+" → ramp Y="+lo+"→"+hi+" along "+axis;}

function flattenNewFloor(idx){var fl=newF[idx];if(!fl)return;
delete fl.ramp;rebuild();showProps();logUndo("edit","Flatten new floor "+idx);
document.getElementById("coordinfo").textContent="New floor "+idx+" flattened";}

// Recompute h-fields for an existing sloped floor based on current corner Y values.
// Works for axis-aligned ramps (the common case for stairs/floors).
// Detects which axis the slope runs along by comparing corner Y pairs.
function recomputeFloorH(ai,fi){var fl=hzm.areas[ai].floors[fi];
var p1=fl.quads[2],p2=fl.quads[3],p3=fl.quads[4],p4=fl.quads[5];
// Is it axis-aligned (rectangle)?
var isRect=(p1.x===p4.x&&p2.x===p3.x&&p1.z===p2.z&&p3.z===p4.z);
if(!isRect){
document.getElementById("coordinfo").textContent="Floor "+fi+" is not axis-aligned — cannot auto-recompute h. Manual edit required.";
return;}
var dx=p2.x-p1.x,dz=p3.z-p2.z;
// Determine slope axis
var xSlope=(p1.y===p4.y&&p2.y===p3.y&&p1.y!==p2.y);
var zSlope=(p1.y===p2.y&&p3.y===p4.y&&p1.y!==p3.y);
function _nrm(axL,dy){var L=Math.sqrt(axL*axL+dy*dy);if(L===0)return[0,256];return[Math.round(-dy/L*256),Math.round(axL/L*256)];}
if(xSlope){
var dy=p2.y-p1.y;var n=_nrm(dx,dy);
p1.h=n[0]&0xFFFF;p2.h=0;p3.h=n[1]&0xFFFF;p4.h=0;
document.getElementById("coordinfo").textContent="Recomputed: X-slope, h="+(p1.h>32767?p1.h-65536:p1.h)+","+(p3.h>32767?p3.h-65536:p3.h);}
else if(zSlope){
var dyZ=p3.y-p1.y;var n2=_nrm(dz,dyZ);
p1.h=0;p2.h=n2[0]&0xFFFF;p3.h=n2[1]&0xFFFF;p4.h=0;
document.getElementById("coordinfo").textContent="Recomputed: Z-slope, h="+(p2.h>32767?p2.h-65536:p2.h)+","+(p3.h>32767?p3.h-65536:p3.h);}
else{
document.getElementById("coordinfo").textContent="Floor "+fi+" has corner Y pattern that's not a simple X or Z slope — manual h required";
return;}
// bbox Y from corner mins/maxes
var ys=[p1.y,p2.y,p3.y,p4.y];
fl.quads[0].y=Math.min.apply(null,ys);fl.quads[1].y=Math.max.apply(null,ys);
// CRITICAL: ensure b1.h's bit 1 ("use flat Y") is CLEARED so engine runs slope interpolation
fl.quads[0].h=(fl.quads[0].h&~2)|1;
rebuild();showProps();logUndo("edit","Recompute h floor "+fi);}


// ============================================================
