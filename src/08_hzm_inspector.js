// ═══════════════════════════════════════════════════════════════════════════
// FILE: 08_hzm_inspector.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// HZM DIAGNOSTIC TOOL
// ============================================================
// Lets the user load any HZM file (including their exported one) and immediately
// see its raw waypoint data. Designed to answer "did my changes actually get written
// to the file on disk?" by inspecting the file independently of the editor's memory.

function openHZMInspector(){
// Add a hidden file input we can trigger
var existing=document.getElementById("hzmInspectorInput");
if(existing)existing.remove();
var fi=document.createElement("input");
fi.type="file";fi.accept=".hzm";fi.id="hzmInspectorInput";fi.style.display="none";
fi.addEventListener("change",function(e){
if(e.target.files&&e.target.files[0])inspectHZMFile(e.target.files[0]);});
document.body.appendChild(fi);
fi.click();}

function inspectHZMFile(file){
var r=new FileReader();
r.onload=function(ev){
try{
var inspected=parseHZM(ev.target.result);
showHZMInspectorReport(file.name,inspected,ev.target.result.byteLength);
}catch(err){
alert("Could not parse "+file.name+": "+err.message);}};
r.readAsArrayBuffer(file);}

function showHZMInspectorReport(fname,inspected,fileSize){
// Remove existing report if any
var existing=document.getElementById("hzmInspectorModal");
if(existing)existing.remove();

var modal=document.createElement("div");
modal.id="hzmInspectorModal";
modal.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;flex-direction:column;padding:20px;box-sizing:border-box";

// Header
var header=document.createElement("div");
header.style.cssText="background:#0d1219;border:1px solid #1a2535;padding:8px 12px;display:flex;align-items:center;gap:10px;flex-shrink:0";
header.innerHTML='<b style="color:#ff4488">HZM Inspector</b>'+
'<span style="color:#446688;font-size:10px">'+fname+' · '+fileSize.toLocaleString()+' bytes</span>'+
'<span style="flex:1"></span>'+
'<button onclick="document.getElementById(\'hzmInspectorModal\').remove()" class="btn danger">Close</button>';

// Body
var body=document.createElement("div");
body.style.cssText="flex:1;background:#0a0e14;border:1px solid #1a2535;border-top:none;overflow:auto;padding:10px;font-family:monospace;font-size:11px;color:#aabbcc;min-height:0";

var html='';
html+='<div style="margin-bottom:10px;color:#88ddff"><b>FILE OVERVIEW</b></div>';
html+='<div style="margin-left:10px;line-height:1.6">';
html+='Areas: '+inspected.areas.length+'<br>';
html+='Nav zones: '+(inspected.navZones?inspected.navZones.length:0)+'<br>';
html+='Route slots: '+inspected.routes.length+' (with waypoints: '+inspected.routes.filter(function(r){return r.waypoints.length>0}).length+')<br>';
html+='</div>';

// Build comparison if we have current HZM loaded
var hasCurrent=hzm&&hzm.routes;
if(hasCurrent){
html+='<div style="margin-top:12px;color:#88ddff"><b>COMPARISON vs CURRENTLY-LOADED HZM</b></div>';
html+='<div style="margin-left:10px;color:#446688;font-size:10px;margin-bottom:6px">Differences highlight where the file on disk differs from what the editor has in memory.</div>';
var anyDiff=false;
for(var ri=0;ri<Math.max(inspected.routes.length,hzm.routes.length);ri++){
var fileRt=inspected.routes[ri];
var memRt=hzm.routes[ri];
var fileN=fileRt?fileRt.waypoints.length:0;
var memN=memRt?memRt.waypoints.length:0;
if(fileN===0&&memN===0)continue;// both empty, skip
if(fileN!==memN){
html+='<div style="padding:4px 8px;background:#3a1a0a;margin-bottom:2px;border-left:3px solid #ff8844">';
html+='<b>Route '+ri+'</b>: file has '+fileN+' WPs, memory has '+memN+' WPs <span style="color:#ff8844">DIFF</span>';
html+='</div>';
anyDiff=true;continue;}
// Same WP count — check each WP
var rowDiffs=[];
for(var wi=0;wi<fileN;wi++){
var fW=fileRt.waypoints[wi],mW=memRt.waypoints[wi];
if(fW.x!==mW.x||fW.z!==mW.z||fW.y!==mW.y||fW.dir!==mW.dir){
rowDiffs.push("WP"+(wi+1)+": file=("+fW.x+","+fW.z+","+fW.y+" cmd=0x"+fW.dir.toString(16).padStart(4,"0")+")"+
" mem=("+mW.x+","+mW.z+","+mW.y+" cmd=0x"+mW.dir.toString(16).padStart(4,"0")+")");}}
if(rowDiffs.length>0){
html+='<div style="padding:4px 8px;background:#3a1a0a;margin-bottom:2px;border-left:3px solid #ff8844">';
html+='<b>Route '+ri+'</b>: '+rowDiffs.length+' waypoint(s) differ <span style="color:#ff8844">DIFF</span>';
html+='<div style="margin-top:3px;color:#ffaa88;font-size:10px">'+rowDiffs.join("<br>")+'</div></div>';
anyDiff=true;}}
if(!anyDiff){
html+='<div style="padding:6px 8px;background:#0a3a1a;border-left:3px solid #44cc88;color:#44cc88"><b>NO DIFFERENCES</b> — every waypoint in the file matches memory exactly.</div>';}}

html+='<div style="margin-top:14px;color:#88ddff"><b>ROUTE DETAIL (from file on disk)</b></div>';
html+='<div style="color:#446688;font-size:10px;margin-bottom:4px">Each route\'s waypoints with the packed command field decoded into subfields.</div>';
for(var ri2=0;ri2<inspected.routes.length;ri2++){
var rt=inspected.routes[ri2];if(rt.waypoints.length===0)continue;
html+='<div style="margin-top:8px;padding:4px 8px;background:#0a1820;border-left:3px solid #88aacc">';
html+='<b style="color:#00ff88">Route '+ri2+'</b> <span style="color:#778">('+rt.waypoints.length+' waypoints)</span>';
html+='<table style="margin-top:4px;font-size:10px;width:100%"><tr style="color:#88aacc;text-align:left">'+
'<th style="padding:2px 6px">#</th><th style="padding:2px 6px">X</th><th>Z</th><th>Y</th><th>cmd</th>'+
'<th>act</th><th>time</th><th>dir</th><th>con</th></tr>';
for(var wi2=0;wi2<rt.waypoints.length;wi2++){
var wp=rt.waypoints[wi2];
var cmd=wp.dir|0;
var act=cmd&0x1F;
var tim=(cmd>>5)&0x07;
var dir=(cmd>>8)&0x03;
var con=(cmd>>10)&0x07;
var dirName="NESW"[dir];
html+='<tr><td style="padding:2px 6px;color:#ccaa44">'+(wi2+1)+'</td>'+
'<td style="padding:2px 6px">'+wp.x+'</td><td>'+wp.z+'</td><td>'+wp.y+'</td>'+
'<td style="color:#ff8844">0x'+cmd.toString(16).padStart(4,"0")+'</td>'+
'<td>'+act+'</td><td>'+tim+'</td><td>'+dir+' ('+dirName+')</td><td>'+con+'</td></tr>';}
html+='</table></div>';}
html+='</div>';

body.innerHTML=html;
modal.appendChild(header);
modal.appendChild(body);
document.body.appendChild(modal);}

// ============================================================
