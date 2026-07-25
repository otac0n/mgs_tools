// ═══════════════════════════════════════════════════════════════════════════
// FILE: 13_spawn_wizard.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// SPAWN WIZARD — UI for adding entities to a stage
// ============================================================
// Three-step modal flow:
//   1. Pick entity type (browse catalog grouped by category)
//   2. Compatibility report (warnings + offer to inject missing infrastructure)
//   3. Parameter form (fill in -X flags, with type-appropriate inputs)
// Final step generates the GCL chara block and injects it into the editor's
// state, just like the existing addWatcher/addCamera flows.

var wizardOpen=false;
var wizardEntityType=null;
var wizardParamValues={};

function openSpawnWizard(){
// PSX/GCX stages have no gclOrigText and the multi-step wizard's text-splice
// path doesn't apply to them. The only entity the wizard can place on PSX is a
// WATCHER, and its commit already delegates to addGCLWatcher() — which on PSX
// clones a template enemy straight into the GCX AST. So on PSX, skip the modal
// and add the enemy directly (placed at the camera target; set its route in the
// properties panel afterwards).
if(typeof psxGcx!=="undefined"&&psxGcx){
if(typeof addGCLWatcher==="function")addGCLWatcher();
else alert("Add-enemy is unavailable in this build.");
return;}
if(!gclOrigText){alert("Load a stage's GCL first.");return;}
wizardOpen=true;
wizardEntityType=null;
wizardParamValues={};
renderWizardModal();}

function closeSpawnWizard(){
var m=document.getElementById("spawnWizard");
if(m)m.remove();
wizardOpen=false;}

function renderWizardModal(){
var existing=document.getElementById("spawnWizard");
if(existing)existing.remove();
var m=document.createElement("div");
m.id="spawnWizard";
m.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
var box=document.createElement("div");
box.style.cssText="background:#0d1219;border:1px solid #1a2535;border-radius:6px;padding:0;max-width:900px;max-height:90vh;width:100%;overflow:hidden;color:#aabbcc;font-family:monospace;font-size:11px;display:flex;flex-direction:column";
var header=document.createElement("div");
header.style.cssText="padding:10px 16px;background:#1a2535;display:flex;align-items:center;gap:10px;flex-shrink:0";
header.innerHTML='<b style="color:#ff4488;font-size:14px">Spawn Wizard</b>'+
'<span style="color:#88aacc;font-size:10px">Add an entity to the current stage</span>'+
'<span style="flex:1"></span>'+
'<button onclick="closeSpawnWizard()" class="btn danger">Close</button>';
var content=document.createElement("div");
content.id="wizardContent";
content.style.cssText="flex:1;overflow-y:auto;padding:14px 16px";
if(wizardEntityType===null){
content.innerHTML=renderWizardStep1();}
else{
content.innerHTML=renderWizardStep2And3(wizardEntityType);}
box.appendChild(header);
box.appendChild(content);
m.appendChild(box);
document.body.appendChild(m);}

// Step 1: catalog browser. Categories with chips for each entity type.
function renderWizardStep1(){
var cats=getEntityCategories();
var catOrder=["enemy","animal","security_camera","search_light","infrared","mines","item","prop"];
var catLabels={enemy:"Enemies",animal:"Animals & NPCs",
security_camera:"Security & Gun Cameras",search_light:"Searchlights",
infrared:"Infrared Sensors",mines:"Mines",
item:"Items",prop:"Props & Scenery"};
var catColors={enemy:"#ff6644",animal:"#88cc44",
security_camera:"#4488ff",search_light:"#ffcc44",
infrared:"#ff44ff",mines:"#ff8866",
item:"#44ccaa",prop:"#cc8844"};
var html='<div style="margin-bottom:12px;color:#88ddff">'+
'<b>Step 1: Pick an entity type</b><br>'+
'<span style="font-size:10px;color:#778">Hover any entity for details. Click to proceed to compatibility check + parameter setup.</span></div>';
// Door shortcut — doors need the full +Door wizard since they manage keycards,
// zones, lamps, stage transitions, etc. Closing SpawnWiz first so the user
// isn't stuck with two modals stacked.
html+='<div style="margin-bottom:14px">'
+'<div style="color:#ff8844;font-size:11px;margin-bottom:4px"><b>Doors</b></div>'
+'<button onclick="closeSpawnWizard();openDoorWizard();" '
+'style="background:#1a2535;color:#ff8844;border:1px solid #ff8844;padding:6px 14px;'
+'font-size:11px;font-family:monospace;cursor:pointer;border-radius:3px" '
+'title="Doors use the dedicated +Door wizard which handles keycards, zones, lamps, and stage transitions">'
+'+ Door (opens dedicated wizard) →</button>'
+'</div>';
for(var ci=0;ci<catOrder.length;ci++){
var cat=catOrder[ci];
if(!cats[cat])continue;
var col=catColors[cat]||"#88aacc";
html+='<div style="margin-bottom:14px">';
html+='<div style="color:'+col+';font-size:11px;margin-bottom:4px"><b>'+catLabels[cat]+'</b></div>';
html+='<div style="display:flex;flex-wrap:wrap;gap:4px">';
for(var i=0;i<cats[cat].length;i++){
var t=cats[cat][i];
var tpl=ENTITY_TEMPLATES[t];
var ttip=tpl.description.replace(/"/g,"&quot;");
if(tpl.sourceStages)ttip+="&#10;Native to: "+tpl.sourceStages.slice(0,5).join(", ")+(tpl.sourceStages.length>5?"...":"");
var dispName=getEntityDisplayName(t);
html+='<button onclick="wizardPickEntity(\''+t+'\')" title="'+ttip+'" '+
'style="background:#1a2535;color:'+col+';border:1px solid '+col+';padding:4px 10px;'+
'font-size:11px;font-family:monospace;cursor:pointer;border-radius:3px">'+dispName+'</button>';}
html+='</div></div>';}
// Show the unsupported types as a note
html+='<div style="margin-top:16px;padding:8px;background:#1a1a2a;border-radius:3px;font-size:10px;color:#778">';
html+='<b style="color:#aaccff">Note:</b> Only entities with mapped parameter signatures are listed. Stage-specific bosses (MGREX, LIQUID, PSYCO, etc.) and one-off scripted entities aren\'t in the catalog since they typically can\'t be transplanted to other stages without significant additional work.';
html+='</div>';
return html;}

function wizardPickEntity(entityType){
wizardEntityType=entityType;
// Initialize param values to defaults
wizardParamValues={};
var t=ENTITY_TEMPLATES[entityType];
if(t&&t.params){
for(var i=0;i<t.params.length;i++){
var p=t.params[i];
if(p.default!==undefined)wizardParamValues[p.name]=String(p.default);}}
renderWizardModal();}

function wizardBack(){
wizardEntityType=null;
renderWizardModal();}

// Step 2 (compatibility) + Step 3 (parameters) rendered together for one-shot fill.
function renderWizardStep2And3(entityType){
var tpl=ENTITY_TEMPLATES[entityType];
if(!tpl)return"<div>Unknown entity</div>";
var report=checkStageCompatibility(entityType);
var html='<div style="margin-bottom:10px"><button onclick="wizardBack()" class="btn">← Back to catalog</button></div>';
html+='<h2 style="color:#ff4488;font-size:14px;margin:0 0 6px 0">'+getEntityDisplayName(entityType)+
' <span style="color:#556;font-size:10px;font-weight:normal">('+entityType+')</span></h2>';
html+='<div style="color:#aabbcc;font-size:11px;margin-bottom:10px">'+tpl.description+'</div>';
if(tpl.sourceStages&&tpl.sourceStages.length>0&&tpl.sourceStages[0]!=="all"){
html+='<div style="font-size:10px;color:#778;margin-bottom:8px"><b>Native stages:</b> '+tpl.sourceStages.join(", ")+'</div>';}
if(tpl.assetNotes){
html+='<div style="font-size:10px;background:#1a2030;padding:6px;border-radius:3px;margin-bottom:8px;color:#ccaa88"><b>Asset notes:</b> '+tpl.assetNotes+'</div>';}
// === Compatibility report ===
html+='<div style="margin:10px 0;padding:8px;background:'+(report.ok?"#0a2a1a":"#2a1a0a")+';border-radius:3px">';
html+='<b style="color:'+(report.ok?"#44cc88":"#ff8844")+';font-size:11px">Step 2: Stage compatibility</b><br>';
if(report.ok&&report.warnings.length===0){
html+='<span style="color:#44cc88;font-size:10px">✓ Stage looks ready. All required infrastructure is present.</span>';}
else{
for(var mi=0;mi<report.missing.length;mi++){
var iss=report.missing[mi];
html+='<div style="margin-top:4px;font-size:10px;color:#ff8866">✗ '+iss.description+'</div>';
if(iss.fixable){
html+='<div style="margin-left:14px;font-size:9px;color:#aa8866">Will need to be added before this entity will work. (Editor doesn\'t yet auto-inject this infrastructure — coming soon.)</div>';}}
for(var wi=0;wi<report.warnings.length;wi++){
html+='<div style="margin-top:4px;font-size:10px;color:#ffcc66">⚠ '+report.warnings[wi]+'</div>';}}
html+='</div>';
// === Parameter form ===
html+='<div style="margin-top:14px"><b style="color:#88ddff;font-size:11px">Step 3: Parameters</b></div>';
html+='<div style="font-size:9px;color:#778;margin-bottom:6px">Required parameters are marked with *. Hover any label for help.</div>';
// Instance name
html+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:4px 0;border-bottom:1px solid #1a2535">';
html+='<span style="width:80px;color:#88aacc;font-size:10px" title="Unique name for this entity instance. Used in -n flags, mesg targets, etc.">Instance name*</span>';
html+='<input type="text" id="wiz_instance_name" value="'+suggestInstanceName(entityType)+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;padding:2px 6px;font-size:11px;font-family:monospace;flex:1">';
html+='</div>';
var params=tpl.params||[];
for(var pi=0;pi<params.length;pi++){
var p=params[pi];
var val=wizardParamValues[p.name]!==undefined?wizardParamValues[p.name]:(p.default||"");
var reqMark=p.required?'<span style="color:#ff8844">*</span>':'';
html+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
html+='<span style="width:80px;color:#88aacc;font-size:10px" title="'+p.description.replace(/"/g,"&quot;")+'">-'+p.name+reqMark+'</span>';
html+='<input type="text" id="wiz_param_'+p.name+'" value="'+String(val).replace(/"/g,"&quot;")+'" '+
'style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;padding:2px 6px;font-size:11px;font-family:monospace;flex:1" '+
'placeholder="('+p.type+')">';
// Position picker — for any vec3-typed param, surface a "📍 Pick" button that
// lets the user click in the 3D viewport to fill in the position. Skip vec3-pair
// since IR sensors need two endpoints; we'll handle those manually for now.
if(p.type==="vec3"){
html+='<button onclick="spawnWizPick(\''+p.name+'\')" '+
'style="background:#1a2535;color:#44ccaa;border:1px solid #44ccaa;padding:2px 6px;'+
'font-size:10px;font-family:monospace;cursor:pointer;border-radius:2px" '+
'title="Click then point in the 3D viewport to set this position">📍 Pick</button>';}
html+='<span style="color:#556;font-size:9px;width:80px">'+p.type+'</span>';
html+='</div>';}
// === Auto-Stub section ===
// If this entity has callback procs that need to exist for it to work, offer
// to auto-generate them. The wizard generates fresh procs with safe state-var
// slots, picking unused proc numbers and state-var addresses.
if(tpl.callbackStubs){
var stubKeys=Object.keys(tpl.callbackStubs);
html+='<div style="margin-top:14px;padding:8px;background:#2a1a0a;border-radius:3px;border:1px solid #5a3a1a">';
html+='<label style="display:flex;align-items:center;gap:6px;cursor:pointer">';
html+='<input type="checkbox" id="wiz_autostub" onchange="updateWizardPreview()">';
html+='<b style="color:#ff8844;font-size:11px">Auto-stub callback procs (EXPERIMENTAL — known broken)</b>';
html+='</label>';
html+='<div style="margin-top:6px;font-size:10px;color:#ffaa88;padding-left:22px">';
html+='<b>⚠ This feature has known bugs and probably won\'t produce a working entity:</b><br>';
html+='<div style="margin:4px 0">• Generated proc references appear in the chara block but the proc <b>bodies don\'t get injected into the exported GCL</b>. The compiler will fail or the entity will spawn into an undefined proc reference.</div>';
html+='<div style="margin:4px 0">• Multiple spawns of the same entity type re-use the same allocated state variables, causing them to overwrite each other\'s state.</div>';
html+='<div style="margin:4px 0">• The semantics of some parameters (like DOG\'s <code>-b</code>) aren\'t fully understood — the auto-generated values match vanilla GCL surface-syntax but may not be functionally equivalent.</div>';
html+='<div style="margin:6px 0;padding:4px;background:#1a0a0a;border-left:2px solid #ff8844;color:#ffccaa">Recommended: leave unchecked. Manually create the callback procs in the GCL viewer\'s Edit mode using the vanilla pattern (see Asset Notes above). This feature is being researched and will be re-enabled once verified working in-game.</div>';
html+='</div></div>';}
// === Preview pane ===
html+='<div style="margin-top:14px"><b style="color:#88ddff;font-size:11px">Preview</b></div>';
html+='<pre id="wiz_preview" style="background:#0a0e14;color:#aabbcc;padding:8px;border-radius:3px;border:1px solid #1a2535;font-size:10px;white-space:pre-wrap;margin-top:4px;max-height:120px;overflow-y:auto;"></pre>';
// Action buttons row
html+='<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">';
html+='<button onclick="updateWizardPreview()" class="btn">Update Preview</button>';
var canCommit=report.ok||confirm_override(report);
html+='<button onclick="commitSpawnWizard()" '+(canCommit?'':'disabled')+' class="btn" style="background:#1a3a1a;color:#44ccaa;border:1px solid #2a5a2a">+ Add to Stage</button>';
html+='</div>';
// Schedule an initial preview update once the form is rendered. Doing this with a
// setTimeout AFTER injection avoids embedding a literal end-script tag in the HTML
// string — which would otherwise prematurely terminate the outer script block
// and corrupt the entire page.
setTimeout(updateWizardPreview,30);
return html;}

// Decide whether the user can commit despite warnings (currently: yes, always — they
// can choose to inject infrastructure manually). Hooked for future stricter checks.
function confirm_override(report){return true;}

// Generate a suggested unique instance name for the entity. Avoids clashing with
// existing names in gclEntities. For enemies uses "enemy0", "enemy1", etc; for
// other types uses "dog0", "crow0", etc. derived from type.
function suggestInstanceName(entityType){
var base;
if(entityType==="WATCHER"||entityType.indexOf("ZAKO")===0)base="enemy";
else base=entityType.toLowerCase();
var idx=0;
while(true){
var candidate=base+idx;
var clash=false;
if(typeof gclEntities!=="undefined"){
for(var i=0;i<gclEntities.length;i++){
if(gclEntities[i].name===candidate){clash=true;break;}}}
if(gclOrigText&&new RegExp("\\b"+candidate+"\\b").test(gclOrigText))clash=true;
if(!clash)return candidate;
idx++;
if(idx>99)return base+"_new";}}

// Re-render the preview pane based on current form values.
// ====================== AUTO-STUB GENERATION ======================
// When the user has checked "Auto-stub callback procs", we generate fresh procs
// and state vars before rendering the chara block. The output of buildAutoStubs
// is {paramValues, procDefs, summary} — paramValues fills in the empty -h/-o/-e
// fields with proc names; procDefs holds the bodies; summary describes what
// changed (for user feedback).
//
// IMPORTANT: state-var allocation. The vanilla pattern uses slots like $b:0003e0
// and $f:050243. We don't have a perfect "unused slot" detector, but we use a
// heuristic: scan gclOrigText for all currently-referenced $f:/$w:/$b: slots,
// then pick numbers above the highest observed value. This guarantees uniqueness
// within the stage but won't collide with other stages either (each stage has
// its own state-var space at runtime).

function findUnusedProcNumber(){
// Scan existing GCL for unknownProcN names; return next-free N.
var max=0;
if(typeof gclOrigText==="string"){
var re=/\bunknownProc(\d+)\b/g;var m;
while((m=re.exec(gclOrigText))!==null){var n=parseInt(m[1]);if(n>max)max=n;}}
return max+1;}

function findUnusedStateVar(kind){
// kind is "f" (flag), "w" (word), or "b" (byte). Pick a slot one higher than the
// max observed value of that kind. Mid-six-digit-hex addresses (0xNNNNNN) are
// safe — vanilla typically uses these for per-stage scratchpads.
var max=0x010000;// reasonable lower bound for "scratch" area
if(typeof gclOrigText==="string"){
var re=new RegExp("\\$"+kind+":([0-9a-fA-F]+)","g");var m;
while((m=re.exec(gclOrigText))!==null){var v=parseInt(m[1],16);if(v>max)max=v;}}
return"$"+kind+":"+(max+2).toString(16).padStart(6,"0");}

function buildAutoStubs(entityType,instanceName,currentParamValues){
var tpl=ENTITY_TEMPLATES[entityType];
if(!tpl||!tpl.callbackStubs)return{paramValues:currentParamValues,procDefs:[],summary:[]};
// Make a copy of param values so we don't mutate the caller's object
var pvals={};
for(var k in currentParamValues)pvals[k]=currentParamValues[k];
var procDefs=[];
var summary=[];
var nextProcNum=findUnusedProcNumber();
// State-var allocation cache so multiple stubs referencing the same allocateFlag/allocateWord
// get the same fresh slot.
var allocated={};// {ALIAS_NAME: "$f:XXXXXX"}
// First pass: handle statevar stubs (allocate the var) so proc stubs can reference them
var stubKeys=Object.keys(tpl.callbackStubs);
for(var si=0;si<stubKeys.length;si++){
var sk=stubKeys[si];
var stub=tpl.callbackStubs[sk];
if(stub.kind==="statevar"){
// Allocate a fresh $b: slot (DOG-like state var)
var allocated_b=findUnusedStateVar("b");
pvals[sk]=allocated_b;
summary.push("Allocated state variable "+allocated_b+" for -"+sk);
// Memorize this for linkedTo references
allocated["__b__"]=allocated_b;}}
// Second pass: handle proc stubs (need allocated state vars from pass 1)
for(si=0;si<stubKeys.length;si++){
sk=stubKeys[si];
stub=tpl.callbackStubs[sk];
if(stub.kind!=="proc")continue;
// Skip if user already filled in this param manually
if(currentParamValues[sk]&&currentParamValues[sk].trim()!=="")continue;
// Allocate proc name
var procName="unknownProc"+nextProcNum;
nextProcNum++;
pvals[sk]=procName;
// Build the body, substituting allocateFlag/allocateWord placeholders with fresh vars
var body=stub.body||"";
if(stub.allocateFlag){
var fv=findUnusedStateVar("f");
// Bump the hex value to avoid collision with same-stage stubs allocated in this batch
// (since gclOrigText doesn't change between iterations, multiple stubs would alias to
// the same fresh slot otherwise). Use a per-batch counter.
if(allocated[stub.allocateFlag]){fv=allocated[stub.allocateFlag];}
else{
var fvBase=parseInt(fv.split(":")[1],16);
var bump=Object.keys(allocated).length*2;
fv="$f:"+(fvBase+bump).toString(16).padStart(6,"0");
allocated[stub.allocateFlag]=fv;}
body=body.split(stub.allocateFlag).join(fv.split(":")[1]);
// Also support full-form replacement
body=body.replace(/\$f:STATEFLAG/g,fv);}
if(stub.allocateWord){
var wv=findUnusedStateVar("w");
if(allocated[stub.allocateWord]){wv=allocated[stub.allocateWord];}
else{
var wvBase=parseInt(wv.split(":")[1],16);
var bump2=Object.keys(allocated).length*2;
wv="$w:"+(wvBase+bump2).toString(16).padStart(6,"0");
allocated[stub.allocateWord]=wv;}
body=body.split(stub.allocateWord).join(wv.split(":")[1]);
body=body.replace(/\$w:STATEVAR/g,wv);}
if(stub.linkedTo&&pvals[stub.linkedTo]){
// e.g. DOG's -o body has STATEVAR which should equal the -b value
body=body.replace(/STATEVAR/g,pvals[stub.linkedTo]);}
var procText="proc "+procName+" {\n"+(body?"    "+body+"\n":"")+"}";
procDefs.push({name:procName,text:procText});
summary.push("Created "+procName+" (linked to -"+sk+")");}
return{paramValues:pvals,procDefs:procDefs,summary:summary};}

// Check whether the auto-stub checkbox is currently on. The checkbox is conditional
// (only shown for entities with callbackStubs), so defaults to false when absent.
function isAutoStubEnabled(){
var el=document.getElementById("wiz_autostub");
return el?el.checked:false;}

function updateWizardPreview(){
if(!wizardEntityType)return;
var tpl=ENTITY_TEMPLATES[wizardEntityType];
var instEl=document.getElementById("wiz_instance_name");
var inst=instEl?instEl.value.trim():"new0";
var vals={};
if(tpl&&tpl.params){
for(var i=0;i<tpl.params.length;i++){
var p=tpl.params[i];
var el=document.getElementById("wiz_param_"+p.name);
if(el)vals[p.name]=el.value.trim();}}
wizardParamValues=vals;
// If auto-stub is enabled, run the stub generator to fill in callback params and
// also display the auto-generated proc definitions in the preview.
var effectiveVals=vals;
var procDefsPreview=[];
if(isAutoStubEnabled()&&tpl.callbackStubs){
var stubs=buildAutoStubs(wizardEntityType,inst,vals);
effectiveVals=stubs.paramValues;
procDefsPreview=stubs.procDefs;
// Refresh the input boxes to show what was auto-filled — but ONLY for fields the user
// hasn't typed into. We detect this by comparing each input's value to its initial
// state. If the user has typed something, we respect it.
if(tpl.params){
for(var pi2=0;pi2<tpl.params.length;pi2++){
var pp=tpl.params[pi2];
var el2=document.getElementById("wiz_param_"+pp.name);
if(el2&&(!el2.value||el2.value.trim()==="")&&effectiveVals[pp.name]){
el2.value=effectiveVals[pp.name];
el2.style.background="#0a1a14";// subtle green tint to show auto-filled
el2.title="Auto-filled by Auto-Stub. Edit to override.";}}}}
var rendered=renderEntityTemplate(wizardEntityType,inst,effectiveVals);
var prevText=rendered||"";
if(procDefsPreview.length>0){
prevText+="\n\n// Auto-stub procs that will also be injected:\n";
for(var pd=0;pd<procDefsPreview.length;pd++){
prevText+="\n"+procDefsPreview[pd].text+"\n";}}
var prev=document.getElementById("wiz_preview");
if(prev)prev.textContent=prevText;}

// Commit: validate, generate the chara block, inject into the editor's gclEntities
// and gclOrigText, refresh visualization.
function commitSpawnWizard(){
if(!wizardEntityType)return;
var tpl=ENTITY_TEMPLATES[wizardEntityType];
var instEl=document.getElementById("wiz_instance_name");
var inst=instEl?instEl.value.trim():"";
if(!inst||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(inst)){
alert("Instance name must be a valid identifier (letters, digits, underscore, no spaces).");return;}
// Re-read all current values
updateWizardPreview();
// Validate required params
var missing=[];
if(tpl.params){
for(var i=0;i<tpl.params.length;i++){
var p=tpl.params[i];
if(p.required&&!wizardParamValues[p.name]){missing.push(p.name);}}}
// Apply auto-stub generation if enabled. Each callback param that's still empty
// gets a fresh auto-generated proc name; fresh state-var slots are allocated for
// -b style state vars. The generated proc bodies are injected into gclOrigText
// just before any existing procs/charas.
var effectiveVals=wizardParamValues;
var autoStubProcs=[];
var autoStubSummary=[];
if(isAutoStubEnabled()&&tpl.callbackStubs){
var stubs=buildAutoStubs(wizardEntityType,inst,wizardParamValues);
effectiveVals=stubs.paramValues;
autoStubProcs=stubs.procDefs;
autoStubSummary=stubs.summary;
// Recompute missing-required after auto-stub fill-in
missing=[];
if(tpl.params){
for(var msi=0;msi<tpl.params.length;msi++){
var mpp=tpl.params[msi];
if(mpp.required&&!effectiveVals[mpp.name]){missing.push(mpp.name);}}}}
if(missing.length>0){
if(!confirm("These required parameters are empty:\n\n• -"+missing.join("\n• -")+"\n\nProceed anyway? Entity may not function correctly without them."))return;}
// Generate the block using effective values (with auto-stub fills if applicable)
var block=renderEntityTemplate(wizardEntityType,inst,effectiveVals);
if(!block){alert("Failed to generate entity block.");return;}
// Inject auto-stub proc definitions into gclOrigText so they exist BEFORE the chara
// block references them. The GCL converter is single-pass, so proc definitions
// must come earlier in the file than any references.
if(autoStubProcs.length>0&&typeof gclOrigText==="string"){
var injectionText="\n";
for(var apI=0;apI<autoStubProcs.length;apI++){
injectionText+=autoStubProcs[apI].text+"\n\n";}
var firstProcMatch=gclOrigText.match(/^\s*proc\s+\w+\s*\{/m);
var firstCharaMatch=gclOrigText.match(/^\s*chara\s+\w+/m);
var insertPos=gclOrigText.length;
if(firstProcMatch)insertPos=firstProcMatch.index;
if(firstCharaMatch&&firstCharaMatch.index<insertPos)insertPos=firstCharaMatch.index;
gclOrigText=gclOrigText.substring(0,insertPos)+injectionText+gclOrigText.substring(insertPos);
if(typeof parseProcList==="function")parseProcList(gclOrigText);
if(typeof updateProcPanel==="function")updateProcPanel();}
// Inject into gclEntities for the visualizer
if(typeof gclEntities!=="undefined"){
// WATCHER has a complex shape (route, dir, life, faint, sizeBonus, bloodType,
// areaType, yFlag, spawnPos, origName) that the renderer relies on. The
// side-panel +Enemy button (addGCLWatcher) already builds it correctly, so
// use that as the source of truth and patch in any wizard-overridden values.
if(wizardEntityType==="WATCHER"&&typeof addGCLWatcher==="function"){
addGCLWatcher();
var addedEnt=gclEntities[gclEntities.length-1];
if(addedEnt){
addedEnt.name=inst;addedEnt.origName=inst;
addedEnt.customRaw=block;addedEnt.entityType="WATCHER";
// WATCHER uses -n for spawn position (not -p / -pos). Read straight from
// the wizard's collected values rather than parsing the generated block.
if(effectiveVals.n){
var nM=String(effectiveVals.n).match(/(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)/);
if(nM){
addedEnt.pos={x:parseInt(nM[1]),y:parseInt(nM[2]),z:parseInt(nM[3])};
addedEnt.spawnPos={x:addedEnt.pos.x,y:addedEnt.pos.y,z:addedEnt.pos.z};}}
if(effectiveVals.route!==undefined)addedEnt.route=parseInt(effectiveVals.route)||0;
if(effectiveVals.life!==undefined)addedEnt.life=parseInt(effectiveVals.life)||192;
if(effectiveVals.f!==undefined)addedEnt.faint=parseInt(effectiveVals.f)||7;
if(effectiveVals.s!==undefined)addedEnt.sizeBonus=parseInt(effectiveVals.s)||227;
if(effectiveVals.y!==undefined)addedEnt.yFlag=parseInt(effectiveVals.y)||1;
if(effectiveVals.b)addedEnt.bloodType=String(effectiveVals.b).replace(/['"\s]/g,"")||"X";
if(effectiveVals.a)addedEnt.areaType=String(effectiveVals.a).replace(/['"\s]/g,"")||"A";
// Re-render so the new position shows up immediately
if(typeof rebuildGCLVis==="function")rebuildGCLVis();}}
else{
// Generic path for other entity types — minimal entity with pos extracted from block.
var newEnt={type:wizardEntityType,name:inst,isNew:true,raw:block};
var posMatch=block.match(/-(?:p|pos)\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)/);
if(posMatch){
newEnt.pos={x:parseInt(posMatch[1]),y:parseInt(posMatch[2]),z:parseInt(posMatch[3])};
newEnt.spawnPos=newEnt.pos;}
if(effectiveVals.route!==undefined)newEnt.route=parseInt(effectiveVals.route)||0;
newEnt.customRaw=block;
newEnt.entityType=wizardEntityType;
gclEntities.push(newEnt);}}
closeSpawnWizard();
if(typeof rebuildGCLVis==="function")rebuildGCLVis();
if(typeof updateGCLPanel==="function")updateGCLPanel();
var msg="Added "+wizardEntityType+" '"+inst+"' to the stage.";
if(autoStubSummary.length>0){
msg+="\n\nAuto-stub also did:\n• "+autoStubSummary.join("\n• ");}
msg+="\n\nNext steps:\n";
msg+="• Verify the chara block + new procs in ViewGCL\n";
msg+="• Import any required model/texture assets via ImpDAR / ImpKMD / ImpPCX\n";
msg+="• Run VRAM repacker if texture conflicts arise\n";
msg+="• Test in-game";
alert(msg);}

// ===== POSITION PICKER =====
// Lets the user click in the 3D viewport to set a vec3 parameter. The flow:
//   1. User clicks "📍 Pick" next to a vec3 field
//   2. We save the current field values, hide the wizard, show a hint banner
//   3. Global mousedown in 05_main.js checks `window.spawnWizPickField` and,
//      if set, projects the cursor to world-space, writes back, and calls
//      spawnWizFinishPick()
//   4. We restore the wizard with the new value in place
function spawnWizPick(fieldName){
// Save all current field values so we can restore them when the wizard reopens
// (renderWizardModal regenerates inputs from wizardParamValues, so write inputs back first)
var t=ENTITY_TEMPLATES[wizardEntityType];
if(t&&t.params){
for(var i=0;i<t.params.length;i++){
var p=t.params[i];
var el=document.getElementById("wiz_param_"+p.name);
if(el)wizardParamValues[p.name]=el.value;}}
// Also save the instance name field
var nameEl=document.getElementById("wiz_instance_name");
if(nameEl)window._spawnWizSavedName=nameEl.value;
window.spawnWizPickField=fieldName;
// Hide the wizard modal so the viewport is clickable
var m=document.getElementById("spawnWizard");
if(m)m.style.display="none";
// Show a banner overlay
var banner=document.createElement("div");
banner.id="spawnWizPickBanner";
banner.style.cssText="position:fixed;top:50px;left:50%;transform:translateX(-50%);background:#1a2535;color:#44ccaa;border:1px solid #44ccaa;padding:10px 18px;font-family:monospace;font-size:12px;z-index:9998;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.6)";
banner.innerHTML='📍 Click anywhere in the 3D viewport to set <b style="color:#fff">'+fieldName+'</b>. <button onclick="spawnWizCancelPick()" style="background:#331111;color:#ff8888;border:1px solid #882222;padding:2px 8px;font-size:10px;font-family:monospace;cursor:pointer;border-radius:2px;margin-left:10px">Cancel</button>';
document.body.appendChild(banner);}

function spawnWizCancelPick(){
window.spawnWizPickField=null;
var b=document.getElementById("spawnWizPickBanner");if(b)b.remove();
var m=document.getElementById("spawnWizard");if(m)m.style.display="";}

// Called from the global mousedown when a pick is in progress and the user
// has clicked the viewport. The caller has already projected the cursor to
// world-space MGS units (x, y, z).
function spawnWizFinishPick(x,y,z){
var fieldName=window.spawnWizPickField;
if(!fieldName)return;
wizardParamValues[fieldName]=x+","+y+","+z;
window.spawnWizPickField=null;
var b=document.getElementById("spawnWizPickBanner");if(b)b.remove();
// Restore the saved instance name into wizardParamValues so renderWizardModal
// keeps it after the rebuild
if(window._spawnWizSavedName!==undefined){
window._spawnWizSavedInstanceName=window._spawnWizSavedName;
window._spawnWizSavedName=undefined;}
// Re-render the wizard (it picks up wizardParamValues automatically)
var m=document.getElementById("spawnWizard");if(m)m.remove();
renderWizardModal();
// Restore the instance name in the input
if(window._spawnWizSavedInstanceName!==undefined){
var nm=document.getElementById("wiz_instance_name");
if(nm)nm.value=window._spawnWizSavedInstanceName;
window._spawnWizSavedInstanceName=undefined;}}

// ============================================================
