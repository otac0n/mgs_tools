// ═══════════════════════════════════════════════════════════════════════════
// FILE: 23_gcx_viewer.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCX BINARY EDITOR
// ============================================================
// Self-contained modal that loads a binary .gcx file (PC or PSX — same format),
// parses it via the gcxParseGCX module, lets the user edit individual values
// (SYMBOL, STRID, PROCID, INT, SHORT, BYTE, etc.), and downloads the modified
// .gcx. Same-width edits only — file size is preserved, so the PSX .bin
// relocation table remains valid.
//
// Cross-platform: works on PC and PSX .gcx files identically.

var gcxEdState={
file:null,           // current file's bytes (Uint8Array)
fileName:"",         // original filename
gcx:null,            // parsed AST
dirty:false,         // unsaved changes
activeKind:"symbol", // current tab
search:""            // current search filter
};

function openGcxEditor(){
closeGcxEditor();

var modal=document.createElement("div");
modal.id="gcxEditorModal";
modal.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:9999;display:flex;flex-direction:column;padding:20px;box-sizing:border-box";

// Header
var header=document.createElement("div");
header.id="gcxEdHeader";
header.style.cssText="background:#0d1219;border:1px solid #1a2535;padding:8px 12px;display:flex;align-items:center;gap:8px;flex-shrink:0";
header.innerHTML='<span style="color:#ff4488;font-weight:bold">GCX Binary Editor</span>'
+'<span class="info" id="gcxEdInfo" style="color:#446688">no file loaded</span>'
+'<span class="spacer" style="flex:1"></span>'
+'<input type="file" id="gcxFileIn" accept=".gcx,.GCX" style="display:none">'
+'<button class="btn" onclick="document.getElementById(\'gcxFileIn\').click()">Load .gcx</button>'
+'<button class="btn export" id="gcxSaveBtn" onclick="saveGcxEdited()" disabled>Save .gcx</button>'
+'<button class="btn danger" onclick="closeGcxEditor()">✕ Close</button>';

// Tab strip
var tabBar=document.createElement("div");
tabBar.id="gcxEdTabs";
tabBar.style.cssText="background:#0a0e14;border:1px solid #1a2535;border-top:none;padding:4px 8px;display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap";
var tabs=["symbol","strid","procid","int","short","byte","var","option","string"];
for(var i=0;i<tabs.length;i++){
var t=tabs[i];
var b=document.createElement("button");
b.className="btn";
b.textContent=t;
b.setAttribute("data-kind",t);
if(t===gcxEdState.activeKind)b.classList.add("active");
b.onclick=(function(kind){return function(){gcxEdState.activeKind=kind;renderGcxEdBody()};})(t);
tabBar.appendChild(b);
}
// Search
var searchSpan=document.createElement("span");
searchSpan.style.cssText="margin-left:auto;display:flex;align-items:center;gap:4px";
searchSpan.innerHTML='<span style="color:#446688;font-size:10px">filter:</span>'
+'<input type="text" id="gcxEdSearch" placeholder="e.g. 0x16d04" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;padding:2px 6px;font-family:monospace;font-size:11px;width:120px">';
tabBar.appendChild(searchSpan);

// Body container
var body=document.createElement("div");
body.id="gcxEdBody";
body.style.cssText="flex:1;background:#070b10;border:1px solid #1a2535;border-top:none;overflow:auto;font-family:monospace;font-size:11px;line-height:1.6;padding:8px 12px;min-height:0";
body.innerHTML='<div style="color:#446688;text-align:center;padding:40px">Load a .gcx file to begin editing.</div>';

modal.appendChild(header);
modal.appendChild(tabBar);
modal.appendChild(body);
document.body.appendChild(modal);

// Wire up file input
document.getElementById("gcxFileIn").addEventListener("change",function(e){
var f=e.target.files[0];
if(!f)return;
gcxEdState.fileName=f.name;
var rd=new FileReader();
rd.onload=function(ev){
var bytes=new Uint8Array(ev.target.result);
gcxEdState.file=bytes;
try{
gcxEdState.gcx=gcxParseGCX(bytes);
gcxEdState.dirty=false;
document.getElementById("gcxEdInfo").textContent=
f.name+" — "+bytes.length+" bytes — "+gcxEdState.gcx.procs.length+" procs";
document.getElementById("gcxSaveBtn").disabled=false;
renderGcxEdBody();
}catch(err){
alert("Parse error: "+err.message);
console.error(err);
}};
rd.readAsArrayBuffer(f);
});

// Wire up search input
document.getElementById("gcxEdSearch").addEventListener("input",function(e){
gcxEdState.search=e.target.value.trim().toLowerCase();
renderGcxEdBody();
});

// Esc to close
document.addEventListener("keydown",gcxEdEscapeHandler);
}

function gcxEdEscapeHandler(e){
if(e.key==="Escape"){
var m=document.getElementById("gcxEditorModal");
if(m)closeGcxEditor();
}
}

function closeGcxEditor(){
var m=document.getElementById("gcxEditorModal");
if(m)m.remove();
document.removeEventListener("keydown",gcxEdEscapeHandler);
}

// Map a 'kind' tab to the value tag(s) it shows.
function gcxEdKindToTag(kind){
return ({
symbol:GCL_SYMBOL,
strid:GCL_STRID,
procid:GCL_PROCID,
int:GCL_INT,
short:GCL_SHORT,
byte:GCL_BYTE,
var:null,    // VAR uses high-nibble — see gcxEdRenderRow
option:GCL_OPTION,
string:GCL_STRING
})[kind];
}

// Pretty format for display & re-parsing on edit.
function gcxEdFormatValue(v){
if(v.tag===GCL_SHORT||v.tag===GCL_BYTE||v.tag===GCL_CHAR||v.tag===GCL_BOOL)
return String(v.payload);
if(v.tag===GCL_SYMBOL||v.tag===GCL_INT)
return "0x"+v.payload.toString(16).padStart(8,"0");
if(v.tag===GCL_STRID||v.tag===GCL_PROCID)
return "0x"+v.payload.toString(16).padStart(4,"0");
if((v.tag&0xF0)===GCL_VAR)
return "0x"+v.payload.packed.toString(16).padStart(6,"0");
if(v.tag===GCL_OPTION){
var c=v.payload.optChar;
var marker=v.payload.markerByte;
return "-"+String.fromCharCode(c)+" (marker 0x"+marker.toString(16)+")";}
if(v.tag===GCL_STRING){
try{return JSON.stringify(new TextDecoder().decode(v.payload));}
catch(e){return "<binary "+v.payload.length+"B>";}}
return "?";
}

// Parse an edited string back to the right typed payload for the value's tag.
// Returns {ok:true, payload:...} or {ok:false, error:"..."}.
function gcxEdParseValueText(v,text){
text=text.trim();
if(v.tag===GCL_SHORT){
var n=parseInt(text,0);
if(isNaN(n))return{ok:false,error:"expected integer"};
if(n<-32768||n>65535)return{ok:false,error:"out of range for i16"};
return{ok:true,payload:n<0?n+0x10000:n};}
if(v.tag===GCL_BYTE||v.tag===GCL_CHAR||v.tag===GCL_BOOL){
var n2=parseInt(text,0);
if(isNaN(n2))return{ok:false,error:"expected integer"};
if(n2<0||n2>255)return{ok:false,error:"out of range for u8"};
return{ok:true,payload:n2};}
if(v.tag===GCL_SYMBOL||v.tag===GCL_INT){
var n3=parseInt(text,0);
if(isNaN(n3))return{ok:false,error:"expected integer"};
return{ok:true,payload:n3>>>0};}
if(v.tag===GCL_STRID||v.tag===GCL_PROCID){
var n4=parseInt(text,0);
if(isNaN(n4))return{ok:false,error:"expected integer"};
if(n4<0||n4>0xFFFF)return{ok:false,error:"out of range for u16"};
return{ok:true,payload:n4};}
if((v.tag&0xF0)===GCL_VAR){
var n5=parseInt(text,0);
if(isNaN(n5))return{ok:false,error:"expected integer"};
if(n5<0||n5>0xFFFFFF)return{ok:false,error:"out of range for 24-bit"};
return{ok:true,payload:{packed:n5}};}
return{ok:false,error:"editing this kind not implemented yet"};
}

// Find every value of a given tag (or all VAR vars when kind==='var')
// with context breadcrumb. Returns [{value, crumb}].
function gcxEdGatherValuesByKind(kind){
if(!gcxEdState.gcx)return[];
var tag=gcxEdKindToTag(kind);

if(kind==="var"){
// VAR uses high nibble; collect all 0x10..0x1F tags
var results=[];
var raw=gcxFindValuesWithContext(gcxEdState.gcx,{});
for(var i=0;i<raw.length;i++){
if((raw[i].value.tag&0xF0)===GCL_VAR)results.push(raw[i]);}
return results;}
return gcxFindValuesWithContext(gcxEdState.gcx,{tag:tag});
}

function renderGcxEdBody(){
// Re-render tab bar active state
var tabs=document.querySelectorAll("#gcxEdTabs button[data-kind]");
for(var i=0;i<tabs.length;i++){
tabs[i].classList.toggle("active",tabs[i].getAttribute("data-kind")===gcxEdState.activeKind);}

var body=document.getElementById("gcxEdBody");
if(!body)return;
body.innerHTML="";

if(!gcxEdState.gcx){
body.innerHTML='<div style="color:#446688;text-align:center;padding:40px">Load a .gcx file to begin editing.</div>';
return;}

var rows=gcxEdGatherValuesByKind(gcxEdState.activeKind);

// Apply search filter
if(gcxEdState.search){
var q=gcxEdState.search;
rows=rows.filter(function(r){
var txt=gcxEdFormatValue(r.value).toLowerCase();
var crumb=(r.crumb||r.breadcrumb||[]).join(" > ").toLowerCase();
return txt.indexOf(q)>=0||crumb.indexOf(q)>=0;});}

var stats=document.createElement("div");
stats.style.cssText="color:#446688;font-size:10px;margin-bottom:8px;border-bottom:1px solid #1a2535;padding-bottom:4px";
stats.textContent=rows.length+" "+gcxEdState.activeKind+" value(s)"+
(gcxEdState.search?" matching '"+gcxEdState.search+"'":"");
body.appendChild(stats);

if(rows.length===0){
var empty=document.createElement("div");
empty.style.cssText="color:#446688;padding:20px;text-align:center";
empty.textContent="No "+gcxEdState.activeKind+" values"+(gcxEdState.search?" match the filter":"");
body.appendChild(empty);
return;}

// Build rows, but cap at 500 for performance
var maxRows=500;
for(var r=0;r<Math.min(rows.length,maxRows);r++){
body.appendChild(gcxEdRenderRow(rows[r],r));}
if(rows.length>maxRows){
var more=document.createElement("div");
more.style.cssText="color:#886633;padding:8px;text-align:center;font-size:10px";
more.textContent="(showing first "+maxRows+" of "+rows.length+"; refine filter to see more)";
body.appendChild(more);}
}

function gcxEdRenderRow(entry,idx){
var v=entry.value;
var crumb=entry.breadcrumb||[];
var row=document.createElement("div");
row.style.cssText="display:flex;align-items:center;gap:8px;padding:3px 4px;border-bottom:1px solid #0d1219";
row.onmouseenter=function(){this.style.background="#0d1219"};
row.onmouseleave=function(){this.style.background=""};

// Index
var idxEl=document.createElement("span");
idxEl.style.cssText="color:#334455;width:36px;font-size:9px;text-align:right";
idxEl.textContent="["+idx+"]";
row.appendChild(idxEl);

// Editable input
var input=document.createElement("input");
input.type="text";
input.value=gcxEdFormatValue(v);
input.style.cssText="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;padding:2px 6px;font-family:monospace;font-size:11px;width:130px";

// For OPTION / STRING tabs, make input read-only for now (more complex edits)
if(v.tag===GCL_OPTION||v.tag===GCL_STRING){
input.readOnly=true;
input.style.opacity="0.5";
}else{
input.addEventListener("change",function(){
var parsed=gcxEdParseValueText(v,input.value);
if(!parsed.ok){
input.style.borderColor="#aa4444";
input.title=parsed.error;
return;}
input.style.borderColor="#1a2535";
input.title="";
v.payload=parsed.payload;
gcxEdState.dirty=true;
document.getElementById("gcxSaveBtn").classList.add("active");
// Update info to show unsaved
var info=document.getElementById("gcxEdInfo");
if(info&&info.textContent.indexOf("(unsaved)")===-1)info.textContent+="  (unsaved)";});}
row.appendChild(input);

// Context breadcrumb
var ctx=document.createElement("span");
ctx.style.cssText="color:#446688;font-size:10px;margin-left:8px";
ctx.textContent="in: "+(crumb.slice(-3).join(" > ")||"<top>");
row.appendChild(ctx);

return row;
}

function saveGcxEdited(){
if(!gcxEdState.gcx)return;
var out;
try{out=gcxEncodeGCX(gcxEdState.gcx);}
catch(err){alert("Encode error: "+err.message);console.error(err);return;}

if(gcxEdState.file&&out.length!==gcxEdState.file.length){
if(!confirm("WARNING: output is "+out.length+" bytes but original was "+
gcxEdState.file.length+" bytes. This will likely break the paired .bin file. Save anyway?"))return;
}

// Trigger download
var blob=new Blob([out],{type:"application/octet-stream"});
var url=URL.createObjectURL(blob);
var a=document.createElement("a");
a.href=url;
a.download=gcxEdState.fileName.replace(/\.gcx$/i,"")+"_modified.gcx";
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
gcxEdState.dirty=false;
document.getElementById("gcxEdInfo").textContent=
gcxEdState.fileName+" — "+gcxEdState.file.length+" bytes — "+gcxEdState.gcx.procs.length+" procs";
}

// Install a floating button at app load so users can find this feature.
(function installGcxEditorTrigger(){
function add(){
if(document.getElementById("gcxEdTrigger"))return;
var b=document.createElement("button");
b.id="gcxEdTrigger";
b.className="btn";
b.textContent="GCX Editor";
b.title="Open the binary .gcx editor (PC or PSX, cross-compatible)";
b.style.cssText="position:fixed;bottom:8px;left:8px;z-index:200;background:#1a3a55;color:#00ccff;border:1px solid #0088cc;padding:4px 10px;font-family:monospace;font-size:11px;border-radius:3px;cursor:pointer";
b.onclick=openGcxEditor;
document.body.appendChild(b);
}
if(document.readyState==="loading"){
document.addEventListener("DOMContentLoaded",add);
}else{add();}
})();

// ============================================================
