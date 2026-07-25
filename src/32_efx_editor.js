// ============================================================================
// 32_efx_editor.js  —  EFX (per-stage SE sequence bank) viewer / editor
// EFX = the non-resident, stage-specific counterpart to blob.h's SE sequences.
// Loaded at runtime per stage (stageld.c case 'e' -> SD_SeDataLoadInit).
// File layout (reverse-engineered, validated against s08b 57_27965.efx):
//   [0]  index table: N x 16-byte entries (on-disk SETBL)
//        +0 pri  +1 tracks(1..3)  +2 kind(0/1)  +3 character
//        +4 u32 LE track0 offset   +8 track1   +12 track2   (0xffffffff = none)
//        offsets are RELATIVE to the data section base (= N*16)
//   [N*16] data section: 4-byte SE events, each track ends with 00 00 fe ff
//   event: [vel/b0, gate/b1, len/b2, op/b3]; op<0x80 = NOTE(pitch=b3); 0xD2 = tone(b2)
// Entry index i  <->  in-game non-resident SE code 0x80 + i.
// Editing is IN-PLACE: we clone the original bytes and overwrite only edited
// bytes, so the rebuilt .efx is byte-identical except for the changes.
// ============================================================================

var EFX_state = { panelEl:null, model:null, orig:null, fileName:'', sel:-1, filter:'',
                  edits:{} /* absPos -> byte */ };

// ---- friendly labels --------------------------------------------------------
// codes 0x80-0x96 named in g_sound.h; ranges per the header comment.
var EFX_CODE_LABELS = {
  0x80:'Enemy: "Who\'s that!?"', 0x81:'Enemy: (radio) "This way!"', 0x82:'Enemy: (radio) "There he is!"',
  0x83:'Enemy: "Eat this!"', 0x84:'Enemy: "Where\'d he go?"', 0x85:'Enemy: (radio) "Return to positions!"',
  0x86:'Enemy: "Hm..."', 0x87:'Enemy: "What was that noise?"', 0x88:'Enemy: "Huh?"',
  0x89:'Enemy: "Something moved!"', 0x8a:'Enemy: "Whose footprints?"', 0x8b:'Enemy: "Just a box."',
  0x8c:'Enemy: "Get out of the way!"', 0x8d:'Enemy: punched', 0x8e:'Enemy: thrown', 0x8f:'Enemy: grabbed',
  0x90:'Enemy: neck snapped', 0x91:'Enemy: killed', 0x92:'Enemy: yawn', 0x93:'Enemy: snore',
  0x94:'Enemy: sneeze', 0x95:'Enemy: "I heard something!"', 0x96:'Enemy: "What\'s that?"'
};
function EFX_label(code){
  if (EFX_CODE_LABELS[code]) return EFX_CODE_LABELS[code];
  if (code>=0x80 && code<=0x99) return 'Character voice';
  if (code>=0x9a && code<=0x9f) return 'Knocking';
  if (code>=0xa0 && code<=0xaf) return 'Footstep';
  if (code>=0xb0) return 'Stage-specific sound';
  return '';
}

// ---- parse ------------------------------------------------------------------
function EFX_parse(bytes){
  var dv=new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var N=0;
  while((N+1)*16<=bytes.length){
    var o=N*16, trk=bytes[o+1], kind=bytes[o+2];
    if(!(trk>=1&&trk<=3)||!(kind===0||kind===1)) break;
    N++;
  }
  var base=N*16, entries=[];
  for(var i=0;i<N;i++){ var o=i*16;
    var e={idx:i, code:0x80+i, pri:bytes[o], tracks:bytes[o+1], kind:bytes[o+2], character:bytes[o+3],
           trackOffs:[dv.getUint32(o+4,true),dv.getUint32(o+8,true),dv.getUint32(o+12,true)], tracksData:[] };
    entries.push(e);
  }
  var offMap={}; entries.forEach(function(e){ e.trackOffs.forEach(function(r){ if(r!==0xffffffff) offMap[r]=1; }); });
  var offs=Object.keys(offMap).map(Number).sort(function(a,b){return a-b;});
  function nextOff(rel){ for(var i=0;i<offs.length;i++){ if(offs[i]>rel) return offs[i]; } return bytes.length-base; }
  function decode(rel){ if(rel===0xffffffff) return null;
    var limit=base+nextOff(rel), p=base+rel, evs=[];
    while(p+4<=bytes.length && p<limit){
      evs.push({pos:p, b:[bytes[p],bytes[p+1],bytes[p+2],bytes[p+3]]}); p+=4;
      if(bytes[p-2]===0xfe && bytes[p-1]===0xff) break;
    }
    return evs;
  }
  entries.forEach(function(e){ for(var t=0;t<3;t++) e.tracksData.push(decode(e.trackOffs[t])); });
  return {N:N, base:base, entries:entries};
}
function EFX_evType(b){ if(b[3]===0xff&&b[2]===0xfe)return'END'; if(b[3]<0x80)return'NOTE'; if(b[3]===0xd2)return'TONE'; return'CMD'; }
function EFX_cmdName(op){ var n={0xD0:'tempo',0xD2:'tone',0xD5:'vol',0xD7:'env',0xD8:'env',0xD9:'env',0xFE:'rest',0xFF:'END'}; return n[op]||('cmd 0x'+op.toString(16)); }
// "real" = has a tone, or a note with non-zero length (filters out empty placeholder slots)
function EFX_entryReal(e){
  for(var t=0;t<3;t++){ var s=e.tracksData[t]; if(!s)continue;
    for(var k=0;k<s.length;k++){ var ty=EFX_evType(s[k].b);
      if(ty==='TONE') return true;
      if(ty==='NOTE' && (s[k].b[1]||s[k].b[2])) return true; } }
  return false;
}
// current byte value at a position (edit overrides original)
function EFX_byte(pos){ return (pos in EFX_state.edits) ? EFX_state.edits[pos] : EFX_state.orig[pos]; }

// ---- UI ---------------------------------------------------------------------
function openEfxEditor(){
  if (EFX_state.panelEl){ EFX_state.panelEl.style.display='flex'; EFX_renderList(); return; }
  var ov=document.createElement('div'); ov.id='efxEditorPanel';
  ov.style.cssText='position:fixed;inset:0;z-index:10001;background:#0c0810;display:flex;flex-direction:column;font-family:monospace';
  ov.innerHTML=
    '<div style="display:flex;align-items:center;gap:14px;padding:8px 12px;background:#140d1c;border-bottom:1px solid #2a1d3a">'+
      '<div style="font-size:13px;font-weight:bold;color:#7fe">\u{1F39A} EFX Editor <span style="color:#9f7;font-size:10px;border:1px solid #4a4;border-radius:3px;padding:0 4px;margin-left:4px">build v75 \u00b7 stage SE</span></div>'+
      '<span style="color:#89a;font-size:11px" id="efxInfo">\u2014 load a stage .efx file \u2014</span>'+
      '<label style="color:#aac;font-size:10px">.efx file <input type="file" id="efxFile" accept=".efx,.bin" style="font-size:10px"></label>'+
      '<button id="efxExport" style="margin-left:auto;background:#2a4d2a;color:#cfc;border:1px solid #4a4;border-radius:4px;padding:5px 10px;font-size:11px;cursor:pointer">\u{1F4BE} Export rebuilt .efx</button>'+
      '<button id="efxClose" style="background:#3a1d2a;color:#fcc;border:1px solid #a44;border-radius:4px;padding:5px 10px;font-size:11px;cursor:pointer">\u2715 Close</button>'+
    '</div>'+
    '<div style="padding:6px 12px;color:#778;font-size:10px;background:#100a16;border-bottom:1px solid #1d1428">'+
      'Per-stage SE bank (codes 0x80+). Edit a NOTE\u2019s <b>len</b> (ticks) and set <b>gate</b>=100 so the release-clamp won\u2019t cut a swapped sample. '+
      'Export writes a rebuilt <b>.efx</b> (byte-identical except your edits) \u2014 drop it back into the stage and repack. '+
      'Codes 0xB0+ are this stage\u2019s own sounds (for s08b, the Ninja).</div>'+
    '<div style="display:flex;flex:1;min-height:0">'+
      '<div style="width:280px;border-right:1px solid #1d1428;display:flex;flex-direction:column">'+
        '<input id="efxFilter" placeholder="filter\u2026 (footstep, stage, 0xb1, voice)" style="margin:6px;padding:5px;background:#160f1f;color:#dfe;border:1px solid #2a1d3a;font-size:11px">'+
        '<div id="efxList" style="overflow:auto;flex:1"></div>'+
      '</div>'+
      '<div style="flex:1;display:flex;flex-direction:column;min-width:0">'+
        '<div id="efxEntryTitle" style="padding:8px 12px;color:#9fd;font-size:12px;border-bottom:1px solid #1d1428">\u2014 select an entry \u2014</div>'+
        '<div id="efxEvents" style="overflow:auto;flex:1;padding:4px 12px"></div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(ov); EFX_state.panelEl=ov;
  document.getElementById('efxClose').onclick=function(){ ov.style.display='none'; };
  document.getElementById('efxFile').onchange=EFX_onFile;
  document.getElementById('efxExport').onclick=EFX_export;
  document.getElementById('efxFilter').oninput=function(){ EFX_state.filter=this.value.toLowerCase(); EFX_renderList(); };
  EFX_renderList();
}
function EFX_onFile(ev){ var f=ev.target.files[0]; if(!f)return; var r=new FileReader();
  r.onload=function(){ EFX_state.orig=new Uint8Array(r.result); EFX_state.edits={}; EFX_state.fileName=f.name;
    EFX_state.model=EFX_parse(EFX_state.orig); EFX_state.sel=-1;
    document.getElementById('efxInfo').textContent=f.name+' \u00b7 '+EFX_state.model.N+' entries \u00b7 '+EFX_state.orig.length+' bytes';
    document.getElementById('efxEvents').innerHTML='';
    document.getElementById('efxEntryTitle').textContent='\u2014 select an entry \u2014';
    EFX_renderList(); };
  r.readAsArrayBuffer(f); }

function EFX_entryEdited(e){ // any edited byte within this entry's tracks?
  for(var t=0;t<3;t++){ var s=e.tracksData[t]; if(!s)continue;
    for(var k=0;k<s.length;k++){ for(var bi=0;bi<4;bi++){ if((s[k].pos+bi) in EFX_state.edits) return true; } } }
  return false;
}
function EFX_renderList(){
  if(!EFX_state.panelEl) return; var el=document.getElementById('efxList'); if(!el)return;
  if(!EFX_state.model){ el.innerHTML='<div style="color:#667;padding:10px;font-size:11px">No file loaded.</div>'; return; }
  var f=EFX_state.filter, h='';
  EFX_state.model.entries.forEach(function(e){
    if(!EFX_entryReal(e)) return;
    var lbl=EFX_label(e.code), codeHex='0x'+e.code.toString(16);
    if(f){ var hay=(codeHex+' '+lbl+' idx'+e.idx).toLowerCase(); if(hay.indexOf(f)<0) return; }
    var sel=(e.idx===EFX_state.sel), star=EFX_entryEdited(e)?' <span style="color:#7f7">\u2605</span>':'';
    h+='<div class="efxRow" data-i="'+e.idx+'" style="cursor:pointer;padding:4px 8px;border-bottom:1px solid #1a1422;font-size:11px;'+(sel?'background:#1a2a2a':'')+'">'+
       '<span style="color:#bdf">'+codeHex+'</span> <span style="color:#566">(idx '+e.idx+')</span>'+star+
       '<div style="color:#7fa088;font-size:9px;margin-top:1px">'+lbl+'</div></div>';
  });
  el.innerHTML=h||'<div style="color:#667;padding:10px;font-size:11px">No matching entries.</div>';
  var rows=el.querySelectorAll('.efxRow'); for(var i=0;i<rows.length;i++) rows[i].onclick=function(){ EFX_state.sel=parseInt(this.getAttribute('data-i'),10); EFX_renderList(); EFX_renderEvents(); };
}
function EFX_renderEvents(){
  var m=EFX_state.model; if(!m)return; var e=m.entries[EFX_state.sel]; if(!e)return;
  document.getElementById('efxEntryTitle').textContent='0x'+e.code.toString(16)+' (idx '+e.idx+')  \u2014  '+EFX_label(e.code)+'   [pri 0x'+e.pri.toString(16)+', '+e.tracks+' track'+(e.tracks>1?'s':'')+']';
  var h='';
  for(var t=0;t<3;t++){ var s=e.tracksData[t]; if(!s)continue;
    if(e.tracks>1) h+='<div style="color:#9bd;font-size:10px;margin:6px 0 2px">Track '+t+'</div>';
    h+='<table style="width:100%;border-collapse:collapse;font-size:11px;color:#cdd"><tr style="position:sticky;top:0;background:#112020;color:#9fd;text-align:left">'+
       '<th style="padding:4px 6px">#</th><th>type</th><th>note</th><th>len</th><th>gate%</th><th>vel</th><th>tone</th><th>raw</th></tr>';
    for(var i=0;i<s.length;i++){ var ev=s[i], ty=EFX_evType(ev.b);
      var raw=[0,1,2,3].map(function(bi){ var cur=EFX_byte(ev.pos+bi), edd=(ev.pos+bi) in EFX_state.edits;
        return '<span style="color:'+(edd?'#7f7':'#557')+'">'+cur.toString(16).padStart(2,'0')+'</span>'; }).join(' ');
      function cell(bi){ return EFX_inp(ev.pos,bi); }
      if(ty==='NOTE') h+='<tr style="border-top:1px solid #14201a"><td style="padding:2px 6px">'+i+'</td><td style="color:#9c9">NOTE</td><td>'+cell(3)+'</td><td>'+cell(2)+'</td><td>'+cell(1)+'</td><td>'+cell(0)+'</td><td></td><td>'+raw+'</td></tr>';
      else if(ty==='TONE') h+='<tr style="border-top:1px solid #14201a;color:#9bd"><td style="padding:2px 6px">'+i+'</td><td>tone</td><td colspan=4></td><td>'+cell(2)+'</td><td>'+raw+'</td></tr>';
      else h+='<tr style="border-top:1px solid #14201a;color:#99a"><td style="padding:2px 6px">'+i+'</td><td>'+EFX_cmdName(ev.b[3])+'</td><td colspan=5></td><td>'+raw+'</td></tr>';
    }
    h+='</table>';
  }
  var el=document.getElementById('efxEvents'); el.innerHTML=h;
  var inp=el.querySelectorAll('input[data-pos]'); for(var k=0;k<inp.length;k++) inp[k].onchange=EFX_edit;
}
function EFX_inp(pos, bi){ var v=EFX_byte(pos+bi);
  return '<input type="number" min="0" max="255" value="'+v+'" data-pos="'+(pos+bi)+'" style="width:50px;font-size:10px;background:#0f1614;color:#dfe;border:1px solid #243">'; }
function EFX_edit(){ var pos=parseInt(this.getAttribute('data-pos'),10), v=parseInt(this.value,10);
  if(isNaN(v))v=0; v=Math.max(0,Math.min(255,v)); this.value=v;
  if(v===EFX_state.orig[pos]) delete EFX_state.edits[pos]; else EFX_state.edits[pos]=v;
  EFX_renderEvents(); EFX_renderList(); }

function EFX_export(){
  if(!EFX_state.orig){ alert('Load an .efx file first.'); return; }
  var out=new Uint8Array(EFX_state.orig);            // clone
  for(var pos in EFX_state.edits) out[pos]=EFX_state.edits[pos];
  var nEdits=Object.keys(EFX_state.edits).length;
  var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'}));
  var base=(EFX_state.fileName||'stage').replace(/\.efx$/i,'');
  a.download=base+'_mod.efx'; document.body.appendChild(a); a.click(); a.remove();
  var info=document.getElementById('efxInfo'); if(info) info.textContent=EFX_state.fileName+' \u00b7 exported with '+nEdits+' byte edit'+(nEdits===1?'':'s');
}
