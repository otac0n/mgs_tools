// ═══════════════════════════════════════════════════════════════════════════
// FILE: 06_gcl_viewer.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCL VIEWER POPUP
// ============================================================
// Modal popup that shows the live GCL text — exactly what export would produce.
// Supports an EDIT MODE where the user can modify GCL source in-place; on save,
// the change is written to gclOrigText and the parser is re-run so the editor's
// model stays in sync with the file. Also supports jump-to-line so the event-
// chain tracer can open the viewer pre-scrolled to a referenced location.

var gclViewerOpen=false;
var gclViewerLastText="";
var gclViewerSearchHits=[];
var gclViewerEditMode=false;
var gclViewerJumpLine=-1;// when non-negative, viewer scrolls here on open

function openGCLViewer(jumpLine){
// Build the current GCL text using the same pipeline as export
var r=buildGCLText();
if(!r.text){
// No PC-dialect GCL text available. If a .gcx is loaded instead (e.g. via
// STAGE.DIR / STAGE.MGZ), serialize its parsed AST into GCL dialect and show
// THAT — real GCL (proc sub_XXXX { }, lowercase commands, -options), not the
// GCX disassembly view.
if(typeof psxGcx!=="undefined"&&psxGcx&&typeof gcxAstToGCL==="function"){
r={text:gcxAstToGCL(psxGcx),errors:[]};}
else{
alert("No GCL loaded — load a stage's .gcl file, or a .gcx via STAGE.DIR / STAGE.MGZ.");
return;}}
gclViewerLastText=r.text;
gclViewerJumpLine=(typeof jumpLine==="number"&&jumpLine>0)?jumpLine:-1;
// Clear any stale highlight; the jump-to-line below will set it if needed
gclvHighlightedLine=-1;

// Remove any existing modal first
closeGCLViewer();
gclViewerOpen=true;
gclViewerEditMode=false;

var modal=document.createElement("div");
modal.id="gclViewerModal";
modal.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:9999;display:flex;flex-direction:column;padding:20px;box-sizing:border-box";

// Header bar
var header=document.createElement("div");
header.id="gclvHeader";
header.style.cssText="background:#0d1219;border:1px solid #1a2535;border-bottom:none;padding:6px 10px;display:flex;align-items:center;gap:8px;flex-shrink:0";
renderGCLViewerHeader(header,r);

// Errors panel (if any)
var errPanel=document.createElement("div");
errPanel.id="gclvErrPanel";
if(r.errors.length>0){
errPanel.style.cssText="background:#2a0a0a;border:1px solid #551111;border-bottom:none;padding:5px 10px;font-size:10px;color:#ff8866;flex-shrink:0";
errPanel.innerHTML='<b>Validation:</b> '+r.errors.map(function(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;")}).join(" · ");}

// Body container — swaps between read-only view and edit textarea
var body=document.createElement("div");
body.id="gclvBody";
body.style.cssText="flex:1;background:#0a0e14;border:1px solid #1a2535;overflow:auto;font-family:monospace;font-size:11px;line-height:1.4;display:flex;min-height:0";

renderGCLViewerBody(body,r.text,false);

modal.appendChild(header);
if(r.errors.length>0)modal.appendChild(errPanel);
modal.appendChild(body);
document.body.appendChild(modal);

// Wire up search (only relevant in view mode)
var searchEl=document.getElementById("gclvSearch");
if(searchEl){
searchEl.addEventListener("keydown",function(e){
if(e.key==="Enter"){e.preventDefault();gclvFindNext(searchEl.value)}
else if(e.key==="Escape"){closeGCLViewer()}});
searchEl.focus();}

// Global escape handler
document.addEventListener("keydown",gclvEscapeHandler);

// If we got a jump target, scroll to it after layout settles
if(gclViewerJumpLine>0){
setTimeout(function(){scrollGCLViewerToLine(gclViewerJumpLine,true);},50);}}

// Render the header bar — different controls in view vs edit mode.
function renderGCLViewerHeader(header,r){
var totalLines=gclViewerLastText.split(/\r?\n/).length;
var sizeKB=(gclViewerLastText.length/1024).toFixed(1);
var errBadge=r&&r.errors&&r.errors.length>0?'<span style="color:#ff8866;background:#3a0a0a;padding:1px 6px;border-radius:2px;font-size:9px">⚠ '+r.errors.length+' warning'+(r.errors.length>1?"s":"")+'</span>':'';
if(gclViewerEditMode){
header.innerHTML='<b style="color:#ff4488">GCL Editor</b>'+
'<span style="color:#ff8866;font-size:9px">⚠ EDIT MODE — save to apply changes to the editor\'s model</span>'+
'<span style="flex:1"></span>'+
'<button onclick="saveGCLViewerEdits()" class="btn" style="color:#44ccaa;font-size:10px" title="Apply edits to gclOrigText and re-parse">Save Changes</button>'+
'<button onclick="exitGCLEditMode(false)" class="btn danger" style="font-size:10px">Cancel</button>';}
else{
header.innerHTML='<b style="color:#ff4488">GCL Viewer</b>'+
'<span style="color:#446688;font-size:9px">'+totalLines+' lines · '+sizeKB+' KB</span>'+
errBadge+
'<span style="flex:1"></span>'+
'<input type="text" id="gclvSearch" placeholder="Search (Enter to find next)" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;padding:2px 6px;font-size:11px;font-family:monospace;width:220px">'+
'<span id="gclvSearchInfo" style="color:#446688;font-size:9px;min-width:60px"></span>'+
'<button onclick="enterGCLEditMode()" class="btn" style="color:#ffaa44;font-size:10px" title="Edit GCL source in-place">Edit</button>'+
'<button onclick="copyGCLViewer()" class="btn" style="font-size:10px">Copy All</button>'+
'<button onclick="exportGCL()" class="btn export" style="font-size:10px">Download</button>'+
'<button onclick="closeGCLViewer()" class="btn danger" style="font-size:10px">Close (Esc)</button>';}}

// Render the body — either highlighted code pane (view) or textarea (edit).
function renderGCLViewerBody(body,text,isEdit){
// Preserve scroll position when toggling between read and edit views so the
// user doesn't lose their place in long scripts.
var savedScrollTop=body.scrollTop||0;
var savedCodeScroll=0;
var codeEl=document.getElementById("gclvCode");
if(codeEl)savedCodeScroll=codeEl.scrollTop||0;
body.innerHTML="";
body.style.display=isEdit?"block":"flex";
if(isEdit){
// Plain textarea — give it full control, no overlay. User can use Ctrl+F natively.
var ta=document.createElement("textarea");
ta.id="gclvEditor";
ta.spellcheck=false;
ta.style.cssText="width:100%;height:100%;background:#0a0e14;color:#cce0f0;border:none;outline:none;padding:10px;font-family:monospace;font-size:11px;line-height:1.4;resize:none;white-space:pre;tab-size:4";
ta.value=text;
body.appendChild(ta);
// Tab key inserts an actual tab instead of shifting focus
ta.addEventListener("keydown",function(e){
if(e.key==="Tab"){e.preventDefault();
var s=ta.selectionStart,en=ta.selectionEnd;
ta.value=ta.value.substring(0,s)+"\t"+ta.value.substring(en);
ta.selectionStart=ta.selectionEnd=s+1;}
else if(e.key==="Escape"){e.preventDefault();exitGCLEditMode(false);}});
// Restore scroll position. The browser auto-scrolls textareas on focus, so
// we (a) put the caret at position 0 (avoids jump to end) and (b) restore
// the saved scrollTop after a tick so layout has settled. Don't call focus()
// — that forces a scroll to wherever the caret lands. The user can click into
// the textarea to edit.
ta.selectionStart=ta.selectionEnd=0;
var scrollTarget=Math.max(savedScrollTop,savedCodeScroll);
setTimeout(function(){body.scrollTop=scrollTarget;ta.scrollTop=scrollTarget;},0);}
else{
// Read-only: line numbers gutter + syntax-highlighted code pane
var totalLines=text.split(/\r?\n/).length;
var gutter=document.createElement("div");
gutter.id="gclvGutter";
gutter.style.cssText="background:#070b10;color:#334455;padding:6px 8px;text-align:right;user-select:none;border-right:1px solid #1a2535;flex-shrink:0;white-space:pre";
var gutterText="";
for(var ln=1;ln<=totalLines;ln++)gutterText+=ln+"\n";
gutter.textContent=gutterText;
var code=document.createElement("div");
code.id="gclvCode";
code.style.cssText="padding:6px 10px;white-space:pre;flex:1;color:#aabbcc;tab-size:4";
code.innerHTML=highlightGCL(text);
body.appendChild(gutter);
body.appendChild(code);
// Restore the saved scroll position. Both the body and the code pane can
// scroll depending on layout, so set both.
setTimeout(function(){body.scrollTop=savedScrollTop;code.scrollTop=savedScrollTop;},0);}}

function enterGCLEditMode(){
if(!gclViewerOpen)return;
gclViewerEditMode=true;
// Highlight is irrelevant in edit mode (raw textarea, no HTML rendering).
// Clear it so when user cancels back to view mode, no stale highlight remains.
gclvHighlightedLine=-1;
var body=document.getElementById("gclvBody");
var header=document.getElementById("gclvHeader");
if(body)renderGCLViewerBody(body,gclViewerLastText,true);
if(header)renderGCLViewerHeader(header,null);}

function exitGCLEditMode(saved){
gclViewerEditMode=false;
// If exited without saving, rebuild from gclOrigText (which is untouched)
if(!saved){
var r=buildGCLText();
gclViewerLastText=r.text;}
var body=document.getElementById("gclvBody");
var header=document.getElementById("gclvHeader");
if(body)renderGCLViewerBody(body,gclViewerLastText,false);
if(header)renderGCLViewerHeader(header,{errors:[]});
gclViewerSearchHits=[];gclvLastQuery="";gclvSearchIdx=0;}

// Commit edits from the textarea back to gclOrigText. Re-parses everything that
// depends on the GCL text so the editor's model stays consistent with the new
// source. Note: ENTITY edits made through the property panel may need re-applying
// if they aren't reflected in the text being saved.
function saveGCLViewerEdits(){
var ta=document.getElementById("gclvEditor");
if(!ta){alert("Editor not found");return;}
var newText=ta.value;
if(newText===gclViewerLastText){exitGCLEditMode(false);return;}
if(!confirm("Apply edits to the editor's GCL model?\n\n"+
"This re-parses the GCL from your edited text. Any pending changes you made "+
"through the entity property panel will need to be re-applied if they aren't "+
"reflected in the text you're saving.\n\nContinue?"))return;
try{
gclOrigText=newText;
parseGCLScript(newText);
parseHzdDeclarations(newText);
parseProcList(newText);
rebuildGCLVis();
rebuildCamAngles();
updateGCLPanel();
updateProcPanel();
gclViewerLastText=newText;
exitGCLEditMode(true);
var info=document.getElementById("gclvSearchInfo");
if(info){info.textContent="✓ saved";info.style.color="#44cc88";
setTimeout(function(){info.textContent="";info.style.color="#446688"},2000);}}
catch(err){
alert("Failed to parse edited GCL: "+err.message+"\n\nThe text was NOT saved. Fix the error and try again.");}}

function gclvEscapeHandler(e){
if(e.key==="Escape"&&gclViewerOpen){
// In edit mode, Esc is handled by the textarea (cancels edit). In view mode, closes.
if(!gclViewerEditMode)closeGCLViewer();}}

function closeGCLViewer(){
var m=document.getElementById("gclViewerModal");
if(m)m.remove();
gclViewerOpen=false;
gclViewerEditMode=false;
gclViewerSearchHits=[];
gclvHighlightedLine=-1;
document.removeEventListener("keydown",gclvEscapeHandler);}

function copyGCLViewer(){
var ta=document.createElement("textarea");
ta.value=gclViewerLastText;
ta.style.position="fixed";ta.style.opacity="0";
document.body.appendChild(ta);
ta.select();
try{document.execCommand("copy");
var info=document.getElementById("gclvSearchInfo");
if(info){info.textContent="✓ copied";info.style.color="#44cc88";
setTimeout(function(){info.textContent="";info.style.color="#446688"},1500);}}
catch(err){alert("Copy failed: "+err.message)}
document.body.removeChild(ta);}

// Scroll the viewer to a specific 1-indexed line. Used by the event-chain tracer
// to jump from a reference link to the GCL source. Instead of doing a fragile
// token search (which may match the wrong instance of a common word), we re-render
// the code with a permanent highlight ON the target line so it stays visible
// even as the user scrolls.
var gclvHighlightedLine=-1;
function scrollGCLViewerToLine(lineNum,highlight){
var body=document.getElementById("gclvBody");
if(!body||gclViewerEditMode)return;
gclvHighlightedLine=highlight?lineNum:-1;
// Re-render the code pane with the line-level highlight applied
var codeEl=document.getElementById("gclvCode");
if(codeEl){codeEl.innerHTML=highlightGCL(gclViewerLastText);}
// Scroll the highlighted line into view. We find the element by id and use
// scrollIntoView so positioning works regardless of font size or zoom.
var target=document.getElementById("gclvLineTarget");
if(target){target.scrollIntoView({block:"center",behavior:"instant"});}
else{
// Fallback if the line wasn't highlightable for some reason
var lineHeight=11*1.4;
body.scrollTop=Math.max(0,(lineNum-5)*lineHeight);}}

var gclvSearchIdx=0;
var gclvLastQuery="";
function gclvFindNext(query){
var info=document.getElementById("gclvSearchInfo");
var codeEl=document.getElementById("gclvCode");
if(!info||!codeEl)return;
if(!query){
gclvSearchIdx=0;gclvLastQuery="";gclViewerSearchHits=[];
codeEl.innerHTML=highlightGCL(gclViewerLastText);
info.textContent="";return;}
if(query!==gclvLastQuery){
gclViewerSearchHits=[];
var lower=gclViewerLastText.toLowerCase();
var q=query.toLowerCase();
var pos=0;
while((pos=lower.indexOf(q,pos))!==-1){gclViewerSearchHits.push(pos);pos++;}
gclvSearchIdx=0;
gclvLastQuery=query;}
if(gclViewerSearchHits.length===0){
info.textContent="no matches";
info.style.color="#aa6666";
codeEl.innerHTML=highlightGCL(gclViewerLastText);
return;}
codeEl.innerHTML=renderGCLWithSearch(gclViewerLastText,query,gclvSearchIdx);
var currentEl=document.getElementById("gclvCurrentHit");
if(currentEl){currentEl.scrollIntoView({block:"center",behavior:"instant"});}
var hitPos=gclViewerSearchHits[gclvSearchIdx];
var lineNum=gclViewerLastText.substring(0,hitPos).split(/\r?\n/).length;
info.textContent=(gclvSearchIdx+1)+"/"+gclViewerSearchHits.length+" (line "+lineNum+")";
info.style.color="#44cc88";
gclvSearchIdx=(gclvSearchIdx+1)%gclViewerSearchHits.length;}

function renderGCLWithSearch(text,query,currentIdx){
if(!query||gclViewerSearchHits.length===0)return highlightGCL(text);
var qLen=query.length;
var OPEN_ALL="\u0001SHALL\u0001",CLOSE_ALL="\u0001EHALL\u0001";
var OPEN_CUR="\u0001SHCUR\u0001",CLOSE_CUR="\u0001EHCUR\u0001";
var marked=text;
for(var i=gclViewerSearchHits.length-1;i>=0;i--){
var p=gclViewerSearchHits[i];
var matchText=marked.substring(p,p+qLen);
var open=(i===currentIdx)?OPEN_CUR:OPEN_ALL;
var close=(i===currentIdx)?CLOSE_CUR:CLOSE_ALL;
marked=marked.substring(0,p)+open+matchText+close+marked.substring(p+qLen);}
var highlighted=highlightGCL(marked);
highlighted=highlighted.split(OPEN_CUR).join('<span id="gclvCurrentHit" style="background:#ffeb3b;color:#000;padding:1px 0;outline:2px solid #ff4488;border-radius:2px;font-weight:bold">');
highlighted=highlighted.split(CLOSE_CUR).join('</span>');
highlighted=highlighted.split(OPEN_ALL).join('<span style="background:#665500;color:#ffffaa;padding:1px 0;border-radius:2px">');
highlighted=highlighted.split(CLOSE_ALL).join('</span>');
return highlighted;}

function highlightGCL(text){
var s=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
s=s.replace(/^(#[^\n]*)$/gm,'<span style="color:#445566">$1</span>');
s=s.replace(/('[^']*'|"[^"]*")/g,'<span style="color:#ddaa66">$1</span>');
s=s.replace(/(\$[fwbs]:[A-Za-z0-9_]+)/g,'<span style="color:#dd6699">$1</span>');
s=s.replace(/\b(snd:[A-Fa-f0-9]+)\b/g,'<span style="color:#ddaa66">$1</span>');
s=s.replace(/\b(0x[A-Fa-f0-9]+)\b/g,'<span style="color:#dd9966">$1</span>');
s=s.replace(/\b(proc)\s+(\w+)/g,'<span style="color:#ff6699">$1</span> <span style="color:#66ccff">$2</span>');
s=s.replace(/\b(chara)\s+(\w+)\s+(\w+)/g,'<span style="color:#88ddaa">$1</span> <span style="color:#ffaa44">$2</span> <span style="color:#66ddff">$3</span>');
s=s.replace(/\b(if|else|call|map|delay|mesg|sound|eval|trap|ntrap|func|load|define|true|false)\b/g,'<span style="color:#ff6699">$1</span>');
s=s.replace(/(\s)(-\w+)/g,'$1<span style="color:#88aaff">$2</span>');
// If a line is currently flagged as the "jumped-to" target, wrap that line in a
// bright highlight span. We do this last so we wrap already-highlighted content.
// Split by newline, wrap the target line, rejoin.
if(typeof gclvHighlightedLine!=="undefined"&&gclvHighlightedLine>0){
var arr=s.split("\n");
if(gclvHighlightedLine-1<arr.length){
// Use a block-level inline-block so the highlight spans the full visible line
arr[gclvHighlightedLine-1]='<span id="gclvLineTarget" style="display:inline-block;width:100%;background:#3a2a08;outline:2px solid #ff8844;border-radius:2px;font-weight:bold">'+arr[gclvHighlightedLine-1]+'</span>';
s=arr.join("\n");}}
return s;}

// ============================================================
