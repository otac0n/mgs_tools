// ═══════════════════════════════════════════════════════════════════════════
// FILE: 09_event_tracing.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// EVENT-CHAIN TRACING
// ============================================================
// Given an entity name (or proc name, or trap zone name), scan the GCL text for
// every reference to it and classify each one. The result is a list the user can
// click to jump to the matching line in the GCL viewer. This makes it possible
// to answer questions like "what triggers this guard?", "what proc does this
// camera angle attach to?", and "which procs spawn from this trap zone?" without
// hunting through the GCL by hand.

// Find every reference to `name` in the current GCL source. Returns an array of
// {line, col, kind, snippet, procName} entries sorted by line number.
//
// Recognized reference kinds:
//   "decl-chara"  → `chara <TYPE> <name>` declaration
//   "decl-proc"   → `proc <name>` declaration
//   "nparam"      → `-n<name>` flag (mesg target, COMMAND watcher list, etc.)
//   "eparam"      → `-e<name>` flag (trap event handler — proc to call)
//   "cparam"      → `-c<name>` flag (combat continuation proc)
//   "exec"        → `-exec <name>` or `-execproc <name>`
//   "call"        → `call <name>` invocation
//   "trap"        → `trap <name>` or `ntrap <name>` zone reference
//   "mention"     → fallback: any other word-boundary occurrence
function findGCLReferences(name){
var results=[];
if(!gclOrigText||!name)return results;
// Walk line-by-line so we can record line numbers easily
var lines=gclOrigText.split(/\r?\n/);
// Build the regex to find the name as a whole-word match. Word boundaries matter
// because "enemy0" shouldn't match "enemy01" but should match in "-nenemy0".
// We can't use \b directly since GCL uses dashes/slashes, so we hand-craft it.
var nameEsc=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
var pat=new RegExp("(^|[^\\w])("+nameEsc+")($|[^\\w])","g");
// Track which proc each match is inside (for context)
var procStack=[];// stack of {name, depth} for nested-brace tracking
for(var li=0;li<lines.length;li++){
var line=lines[li];
// Detect proc declarations / scope changes on this line.
// Track brace nesting per char so we know when we LEAVE a proc.
var procMatch=line.match(/\bproc\s+(\w+)/);
if(procMatch){procStack.push({name:procMatch[1],depth:0});}
// Update brace depth for the top proc
if(procStack.length>0){
var top=procStack[procStack.length-1];
for(var ci=0;ci<line.length;ci++){
if(line[ci]==="{")top.depth++;
else if(line[ci]==="}"){top.depth--;
if(top.depth<=0){procStack.pop();break;}}}}
var procName=procStack.length>0?procStack[procStack.length-1].name:"(top)";
// Search for references in this line
pat.lastIndex=0;
var m;
while((m=pat.exec(line))!==null){
var matchStart=m.index+m[1].length;// start of the actual name
var before=line.substring(0,matchStart);
var after=line.substring(matchStart+name.length);
var kind=classifyReference(line,matchStart,name);
results.push({
line:li+1,
col:matchStart+1,
kind:kind,
snippet:line.trim(),
procName:procName});
// Avoid infinite loop on zero-width match
if(m.index===pat.lastIndex)pat.lastIndex++;}}
return results;}

// Classify the kind of reference by looking at the surrounding context.
// Examines what comes immediately before the match start to detect param flags.
function classifyReference(line,matchStart,name){
// Look at what's right before the name
var prefix=line.substring(Math.max(0,matchStart-12),matchStart);
// proc declaration?
if(/\bproc\s+$/.test(line.substring(0,matchStart)))return"decl-proc";
// chara declaration: "chara TYPE name"
if(/^\s*chara\s+\w+\s*$/.test(line.substring(0,matchStart-1)))return"decl-chara";
// mesg <name> command — direct message-target form (without -n)
if(/\bmesg\s+$/.test(prefix))return"mesg-target";
// -n<name>, -e<name>, -c<name>, -exec <name>
if(/-n$/.test(prefix))return"nparam";
if(/-e$/.test(prefix))return"eparam";
if(/-c$/.test(prefix))return"cparam";
if(/-exec\s*$/.test(prefix)||/-execproc\s*$/.test(prefix))return"exec";
// call <name>
if(/\bcall\s+$/.test(prefix))return"call";
// trap/ntrap zone reference (the zone name follows the keyword)
if(/^\s*n?trap\s+$/.test(line.substring(0,matchStart)))return"trap";
// Otherwise it's a mention — could be anything (param value, comment, etc)
return"mention";}

// Human-readable label for each reference kind, with a color hint for the badge.
function refKindLabel(kind){
switch(kind){
case"decl-chara":return{label:"declared as chara",color:"#88ddaa"};
case"decl-proc":return{label:"proc declaration",color:"#66ccff"};
case"nparam":return{label:"-n target",color:"#ff8844"};
case"mesg-target":return{label:"mesg target",color:"#ffaa44"};
case"eparam":return{label:"-e event handler",color:"#ffcc44"};
case"cparam":return{label:"-c continuation",color:"#ffaacc"};
case"exec":return{label:"-exec callback",color:"#ffcc44"};
case"call":return{label:"call",color:"#ff6699"};
case"trap":return{label:"trap zone use",color:"#ff8800"};
case"mention":default:return{label:"mention",color:"#778899"};}}

// Render the references panel as HTML, given a name to trace and an optional
// title to show above the list. Returns an HTML string for embedding in any panel.
// If maxResults is set, the list is truncated with a "+N more" footer.
function renderReferencesHTML(name,title,maxResults){
if(!gclOrigText)return"";
var refs=findGCLReferences(name);
var max=maxResults||10;
var html='<div style="padding:6px;border-top:1px solid #1a2535">';
html+='<b style="color:#88ddff;font-size:10px">'+(title||("References to "+name))+'</b> ';
html+='<span style="color:#446688;font-size:9px">'+refs.length+' found</span>';
if(refs.length===0){
html+='<div style="color:#665522;font-size:9px;padding:4px 0">No references found in GCL.</div>';
html+='</div>';return html;}
html+='<div style="max-height:180px;overflow-y:auto;margin-top:3px">';
var shown=Math.min(max,refs.length);
for(var i=0;i<shown;i++){
var ref=refs[i];
var kindInfo=refKindLabel(ref.kind);
// Snippet shortened so the panel stays narrow
var snip=ref.snippet.length>60?ref.snippet.substring(0,60)+"…":ref.snippet;
snip=snip.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
html+='<div onclick="jumpToGCLLine('+ref.line+')" style="padding:3px 6px;border-bottom:1px solid #112;cursor:pointer;background:#0a0e14" onmouseover="this.style.background=\'#1a1f2a\'" onmouseout="this.style.background=\'#0a0e14\'">';
html+='<div style="display:flex;align-items:center;gap:6px;font-size:9px">';
html+='<span style="color:'+kindInfo.color+';font-weight:bold">'+kindInfo.label+'</span>';
html+='<span style="color:#446688">in <b>'+ref.procName+'</b></span>';
html+='<span style="color:#446688;margin-left:auto">L'+ref.line+'</span>';
html+='</div>';
html+='<div style="color:#aabbcc;font-family:monospace;font-size:9px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+snip+'</div>';
html+='</div>';}
if(refs.length>shown){
html+='<div style="padding:4px 6px;color:#778;font-size:9px;text-align:center">+'+(refs.length-shown)+' more — search the viewer to see all</div>';}
html+='</div></div>';
return html;}

// Open the GCL viewer and scroll to the given line. Called from reference clicks.
function jumpToGCLLine(line){
if(gclViewerOpen){
// Viewer already open — just scroll
scrollGCLViewerToLine(line,true);}
else{
openGCLViewer(line);}}

// ============================================================
