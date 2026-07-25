// ═══════════════════════════════════════════════════════════════════════════
// 30_wvx_viewer.js  —  MGS1 PSX WVX bank viewer / player / character-sound swapper
// PSX-only. Lives inside the Sound Swap tool.
//
// Container (mgs_reversing SD_80083F54 + unWVX.rb): 16B BE header (+4 = table
// size), table of (size/16) WAVE_W (16B LE: +0 addr, +4 i8 note, +5 i8 tune,
// +6..13 ADSR, +14 pan, +15 vol), 16B subheader, then VAG ADPCM at size+32.
// Native rate 11025. The ADPCM is a SHARED POOL: 104 entries point into ~79
// distinct sample regions (instruments alias SFX waveforms), so swaps operate on
// regions and remap every pointer. Character swaps are lossless VAG→VAG: copy a
// source sample's raw ADPCM into a dest region, no decode/encode.
// ═══════════════════════════════════════════════════════════════════════════

var WVX_F0 = [0,60,115,98,122], WVX_F1 = [0,0,-52,-55,-60];

var WVX_state = {
  panelEl:null, dest:null, src:null,
  selDest:-1, selSrc:-1,
  overrides:{},        // dest region index -> {bytes:Uint8Array, note, tune, srcLabel}
  rate:11025, audio:null, blobUrl:null, keyHandler:null
};

function WVX_be32(d,o){ return ((d[o]<<24)|(d[o+1]<<16)|(d[o+2]<<8)|d[o+3])>>>0; }
function WVX_wbe32(a,o,v){ a[o]=(v>>>24)&255; a[o+1]=(v>>>16)&255; a[o+2]=(v>>>8)&255; a[o+3]=v&255; }

// parse a WVX into a bank object
function WVX_parseBank(d, name){
  var size = WVX_be32(d,4), table=0x10, sub=table+size, dataStart=sub+16, n=(size/16)|0;
  var entries=[];
  for (var i=0;i<n;i++){
    var b=table+i*16; if (b+16>d.length) break;
    var addr=(d[b]|(d[b+1]<<8)|(d[b+2]<<16)|(d[b+3]<<24))>>>0;
    var note=d[b+4]; if(note&0x80)note-=0x100;
    var tune=d[b+5]; if(tune&0x80)tune-=0x100;
    entries.push({idx:i, offset:addr, note:note, tune:tune, pan:d[b+14], vol:d[b+15]});
  }
  var base = entries.length ? entries[0].offset : 0;
  var totalAdpcm = d.length - dataStart;
  // distinct regions (sorted unique file-offsets)
  var fo = entries.map(function(e){ return (e.offset-base)>>>0; });
  var uniq = fo.slice().sort(function(a,b){return a-b;}).filter(function(v,i,a){return i===0||v!==a[i-1];});
  return {data:d, name:name, size:size, table:table, sub:sub, dataStart:dataStart,
          base:base, totalAdpcm:totalAdpcm, entries:entries, fo:fo, uniq:uniq};
}
// region [start,end) containing a file-offset
function WVX_region(bank, fileOff){
  var u=bank.uniq;
  for (var j=0;j<u.length;j++){
    var s=u[j], e=(j+1<u.length)?u[j+1]:bank.totalAdpcm;
    if (fileOff>=s && fileOff<e) return {idx:j, start:s, end:e};
  }
  return {idx:u.length-1, start:u[u.length-1], end:bank.totalAdpcm};
}
function WVX_entryFileOff(bank,e){ return (e.offset-bank.base)>>>0; }
function WVX_entrySpan(bank,e){ var r=WVX_region(bank, WVX_entryFileOff(bank,e)); return r.end - WVX_entryFileOff(bank,e); }
function WVX_entryRaw(bank,e){ var o=bank.dataStart+WVX_entryFileOff(bank,e); return bank.data.subarray(o, o+WVX_entrySpan(bank,e)); }

// ─── SPU BUDGET ─────────────────────────────────────────────────────────────
// WVX banks upload to FIXED SPU-RAM allocations sized at authoring time (the
// WAVE_W addrs are SPU addresses). If the rebuilt bank grows past its original
// wave size, the upload overruns the NEXT bank's samples in SPU RAM and other
// sounds corrupt or pitch-shift in-game (e.g. item pickup after a gunshot
// swap). The file itself stays "valid" — the damage is runtime-only — so the
// budget below is a hard ceiling: the rebuilt wave pool must never exceed the
// bank's original wave size.
function WVX_poolBytes(){
  var bank=WVX_state.dest; if(!bank) return 0;
  var u=bank.uniq, pool=0;
  for (var j=0;j<u.length;j++){
    var s=u[j], e=(j+1<u.length)?u[j+1]:bank.totalAdpcm;
    var ov=WVX_state.overrides[j];
    pool += ov ? ov.bytes.length : (e-s);
  }
  return pool;
}
function WVX_capBytes(){ return WVX_state.dest ? WVX_state.dest.totalAdpcm : 0; }
// Trim ADPCM to fit `avail` bytes: 16-byte block granularity, final block gets
// the SPU END flag (0x01) so playback stops cleanly instead of running into
// the neighbouring sample. Returns null if fewer than 4 blocks would survive.
function WVX_trimAdpcm(bytes, avail){
  var keep = Math.floor(avail/16)*16;
  if (keep < 64) return null;
  var out = bytes.slice(0, keep);
  out[keep-16+1] = 0x01;                     // flags byte of the last block: END
  return out;
}
// Gate an override before installing it. Returns {bytes, trimmed} or null.
function WVX_fitBudget(newBytes, regIdx){
  var bank=WVX_state.dest, u=bank.uniq;
  var s=u[regIdx], e=(regIdx+1<u.length)?u[regIdx+1]:bank.totalAdpcm;
  var cur = WVX_state.overrides[regIdx] ? WVX_state.overrides[regIdx].bytes.length : (e-s);
  var poolAfter = WVX_poolBytes() - cur + newBytes.length;
  var cap = WVX_capBytes();
  if (poolAfter <= cap) return { bytes:newBytes, trimmed:0 };
  var avail = newBytes.length - (poolAfter - cap);
  var t = WVX_trimAdpcm(newBytes, avail);
  if (!t) return null;
  return { bytes:t, trimmed:newBytes.length - t.length };
}
function WVX_updateBudgetUi(){
  var el=document.getElementById('wvxBudget'); if(!el) return;
  var used=WVX_poolBytes(), cap=WVX_capBytes(), free=cap-used;
  el.innerHTML='SPU budget: '+used+' / '+cap+' B '+
    (free>=0 ? '<span style="color:#7f7">(free '+free+')</span>'
             : '<span style="color:#f66">(OVER by '+(-free)+' — would corrupt other banks!)</span>');
}

// decode bounded by region end (no bleed)
function WVX_decodeEntry(bank, e){
  var d=bank.data, p=bank.dataStart+WVX_entryFileOff(bank,e), end=p+WVX_entrySpan(bank,e);
  var h1=0,h2=0,out=[],blocks=0,flag=0;
  while (p+16<=end && p+16<=d.length){
    var b0=d[p]; flag=d[p+1]; var shift=b0&0xf, filt=(b0>>4)&0xf; if(filt>4)filt=0;
    for (var n=0;n<14;n++){ var by=d[p+2+n], nb=[by&0xf,(by>>4)&0xf];
      for (var k=0;k<2;k++){ var s=(nb[k]<<12)&0xffff; if(s&0x8000)s-=0x10000; s>>=shift;
        s+=(WVX_F0[filt]*h1+WVX_F1[filt]*h2)>>6; if(s>32767)s=32767; else if(s<-32768)s=-32768;
        out.push(s); h2=h1; h1=s; } }
    blocks++; p+=16; if (flag&1) break;
  }
  return {pcm:Int16Array.from(out), blocks:blocks, flagEnd:flag};
}

// ─── WAV / VAG blobs ────────────────────────────────────────────────────────
function WVX_wav(pcm,rate){ var n=pcm.length,b=new ArrayBuffer(44+n*2),v=new DataView(b);
  function S(o,s){for(var j=0;j<s.length;j++)v.setUint8(o+j,s.charCodeAt(j));}
  S(0,'RIFF');v.setUint32(4,36+n*2,true);S(8,'WAVE');S(12,'fmt ');v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);S(36,'data');v.setUint32(40,n*2,true);
  for(var j=0;j<n;j++)v.setInt16(44+j*2,pcm[j],true); return new Blob([b],{type:'audio/wav'}); }
function WVX_vag(raw,rate,name){ var h=new ArrayBuffer(48),v=new DataView(h);
  v.setUint32(0,0x56414770);v.setUint32(4,3);v.setUint32(12,raw.length);v.setUint32(16,rate>>>0);
  var nm=(name||'wvx').slice(0,15); for(var i=0;i<nm.length;i++)v.setUint8(32+i,nm.charCodeAt(i));
  return new Blob([h,raw],{type:'application/octet-stream'}); }

// ─── Export rebuilt dest bank (pool model + pointer remap) ───────────────────
// ─── WAV IMPORT: PCM WAV -> SPU ADPCM (feeds the same override/repack system) ──
// Encoder is the exact inverse of WVX_decodeEntry: per 16-byte block, pick the
// filter+shift with the least reconstruction error (verified 0.00 RMS round-trip).
function WVX_encodeAdpcm(pcm){
  var nB=Math.ceil(pcm.length/28)||1, out=new Uint8Array(nB*16), h1=0,h2=0, bi,ft,sh,k;
  for(bi=0;bi<nB;bi++){
    var bs=bi*28, best=null;
    for(ft=0;ft<5;ft++){ var f0=WVX_F0[ft], f1=WVX_F1[ft];
      for(sh=0;sh<=12;sh++){ var lh1=h1,lh2=h2,err=0,nibs=new Array(28);
        for(k=0;k<28;k++){ var s=(bs+k<pcm.length)?pcm[bs+k]:0;
          var pred=(lh1*f0+lh2*f1)>>6, diff=s-pred, step=(4096>>sh)||1;
          var q=Math.round(diff/step); if(q<-8)q=-8; else if(q>7)q=7;
          var o=((q<<12)>>sh)+pred; if(o>32767)o=32767; else if(o<-32768)o=-32768;
          lh2=lh1; lh1=o; var e=o-s; err+=e*e; nibs[k]=q&15; }
        if(best===null||err<best.err) best={err:err,ft:ft,sh:sh,nibs:nibs,h1:lh1,h2:lh2}; } }
    var o0=bi*16; out[o0]=(best.sh&15)|((best.ft&7)<<4); out[o0+1]=0;
    for(k=0;k<28;k++){ if(!(k&1)) out[o0+2+(k>>1)]=best.nibs[k]; else out[o0+2+(k>>1)]|=best.nibs[k]<<4; }
    h1=best.h1; h2=best.h2;
  }
  out[(nB-1)*16+1]|=1;   // end flag on the last block
  return out;
}

// parse a PCM/float WAV -> { pcm:Int16Array(mono), rate }
function WVX_parseWav(buf){
  var v=new DataView(buf), d=new Uint8Array(buf);
  function S(o,n){ var s=''; for(var i=0;i<n;i++)s+=String.fromCharCode(d[o+i]); return s; }
  if(S(0,4)!=='RIFF'||S(8,4)!=='WAVE') throw 'not a WAV file';
  var p=12, fmt=null, dOff=0, dLen=0;
  while(p+8<=buf.byteLength){ var id=S(p,4), sz=v.getUint32(p+4,true), body=p+8;
    if(id==='fmt ') fmt={af:v.getUint16(body,true),ch:v.getUint16(body+2,true),rate:v.getUint32(body+4,true),bits:v.getUint16(body+14,true)};
    else if(id==='data'){ dOff=body; dLen=Math.min(sz,buf.byteLength-body); }
    p=body+sz+(sz&1); }
  if(!fmt||!dOff) throw 'WAV missing fmt/data';
  var isFloat=(fmt.af===3), bytesPer=fmt.bits>>3, ch=fmt.ch||1, frame=bytesPer*ch;
  var nF=Math.floor(dLen/frame), pcm=new Int16Array(nF), i, cc;
  for(i=0;i<nF;i++){ var acc=0;
    for(cc=0;cc<ch;cc++){ var o=dOff+i*frame+cc*bytesPer, s=0;
      if(fmt.bits===16) s=v.getInt16(o,true);
      else if(fmt.bits===8) s=(d[o]-128)<<8;
      else if(fmt.bits===24){ var x=d[o]|(d[o+1]<<8)|(d[o+2]<<16); if(x&0x800000)x-=0x1000000; s=x>>8; }
      else if(fmt.bits===32) s=isFloat?Math.round(Math.max(-1,Math.min(1,v.getFloat32(o,true)))*32767):(v.getInt32(o,true)>>16);
      acc+=s; }
    var m=Math.round(acc/ch); pcm[i]=m>32767?32767:(m<-32768?-32768:m); }
  return { pcm:pcm, rate:fmt.rate };
}

// linear resample
function WVX_resample(pcm, from, to){
  if(from===to||!from) return pcm;
  var ratio=to/from, n=Math.max(1,Math.round(pcm.length*ratio)), out=new Int16Array(n), i;
  for(i=0;i<n;i++){ var sp=i/ratio, i0=Math.floor(sp), fr=sp-i0,
      a=pcm[i0]||0, b=(i0+1<pcm.length)?pcm[i0+1]:a; out[i]=Math.round(a+(b-a)*fr); }
  return out;
}

// Peak-normalize to a target so quiet clips are boosted to (near) full scale.
// Scales the whole clip by one gain factor -> no distortion, just louder.
function WVX_normalize(pcm){
  var peak=0,i,a;
  for(i=0;i<pcm.length;i++){ a=pcm[i]<0?-pcm[i]:pcm[i]; if(a>peak)peak=a; }
  if(peak===0) return pcm;
  var g=32000/peak;                 // ~-0.3 dB headroom to avoid ADPCM overshoot
  var out=new Int16Array(pcm.length), v;
  for(i=0;i<pcm.length;i++){ v=Math.round(pcm[i]*g); out[i]=v>32767?32767:(v<-32768?-32768:v); }
  return out;
}

// Import WAV over the selected dest sample: decode -> mono -> resample to the
// chosen rate -> encode ADPCM -> set as override (WVX_buildBank repacks the bank).
function WVX_importWav(ev){
  var f=ev.target.files&&ev.target.files[0]; if(!f) return;
  if(!WVX_state.dest){ alert('Load the bank to edit first'); ev.target.value=''; return; }
  if(WVX_state.selDest<0){ alert('Select a destination sample (left) first'); ev.target.value=''; return; }
  var rd=new FileReader();
  rd.onload=function(){
    var wav; try{ wav=WVX_parseWav(rd.result); }catch(err){ alert('WAV error: '+err); return; }
    var pcm=WVX_resample(wav.pcm, wav.rate, WVX_state.rate);
    var _nb=document.getElementById('wvxNorm');
    var _normd=false;
    if(_nb && _nb.checked){ pcm=WVX_normalize(pcm); _normd=true; }
    var adpcm=WVX_encodeAdpcm(pcm);
    var dst=WVX_state.dest, de=dst.entries[WVX_state.selDest], reg=WVX_region(dst, WVX_entryFileOff(dst,de));
    var oldBytes=reg.end-reg.start;
    var fit=WVX_fitBudget(adpcm, reg.idx);
    if(!fit){ alert('Encoded WAV cannot fit the bank\u2019s SPU budget even after trimming.\nLower the import rate (fits more duration per byte) or shorten the WAV.'); ev.target.value=''; return; }
    if(fit.trimmed) adpcm=fit.bytes;
    WVX_state.overrides[reg.idx]={ bytes:adpcm, attr:null, srcLabel:'WAV:'+f.name };  // attr:null keeps dest voice/pitch
    WVX_renderDest(); WVX_updateBudgetUi();
    if(fit.trimmed && st) st.innerHTML='\u26A0 trimmed '+fit.trimmed+'B to fit the SPU budget (END flag set) \u2014 lower the rate to fit the full duration. ';
    var st=document.getElementById('wvxSeStatus');
    if(st) st.innerHTML='✓ imported '+f.name+' → sample '+WVX_state.selDest+' ('+adpcm.length+'B ADPCM @ '+WVX_state.rate+'Hz'+(_normd?', normalized':'')+', was '+oldBytes+'B). Export .wvx to save.';
    // longer than the slot? stretch the SE cues that trigger it (same as VAG swap)
    var ratio=oldBytes>0?(adpcm.length/oldBytes):1;
    if(typeof SE_autoLengthen==='function' && ratio>1.001){
      var idxs=[]; for(var i=0;i<dst.entries.length;i++) if(WVX_region(dst,dst.fo[i]).idx===reg.idx) idxs.push(i);
      var log=SE_autoLengthen(idxs, ratio);
      if(log&&log.length){ var cues={}; for(var q=0;q<log.length;q++)cues[log[q].cue]=1;
        if(st) st.innerHTML+=' — auto-lengthened '+Object.keys(cues).length+' SE cue(s) ×'+ratio.toFixed(2)+' ('+Object.keys(cues).join(', ')+'); open “SE edits…” to export.';
        var btn=document.getElementById('wvxOpenSe'); if(btn) btn.disabled=false; }
    }
    ev.target.value='';
  };
  rd.readAsArrayBuffer(f);
}

function WVX_buildBank(){
  var bank=WVX_state.dest, d=bank.data, u=bank.uniq;
  // region bytes (apply overrides)
  var regBytes=[], j;
  for (j=0;j<u.length;j++){
    var s=u[j], e=(j+1<u.length)?u[j+1]:bank.totalAdpcm;
    var ov=WVX_state.overrides[j];
    regBytes.push(ov ? ov.bytes : d.subarray(bank.dataStart+s, bank.dataStart+e));
  }
  // new region starts
  var newStart=[], pool=0;
  for (j=0;j<regBytes.length;j++){ newStart.push(pool); pool+=regBytes[j].length; }
  // remap each entry: newStart[region] + (off - oldRegionStart)
  function regionIdx(fileOff){ for (var k=0;k<u.length;k++){ var s=u[k], e=(k+1<u.length)?u[k+1]:bank.totalAdpcm; if(fileOff>=s&&fileOff<e) return k; } return u.length-1; }
  var out=new Uint8Array(bank.dataStart + pool);
  out.set(d.subarray(0,bank.dataStart),0);                 // header+table+subheader copy
  for (var i=0;i<bank.entries.length;i++){
    var fo=bank.fo[i], r=regionIdx(fo), nf=newStart[r] + (fo - u[r]);
    var addr=(bank.base + nf)>>>0, b=bank.table+i*16;
    out[b]=addr&255; out[b+1]=(addr>>>8)&255; out[b+2]=(addr>>>16)&255; out[b+3]=(addr>>>24)&255;
    var ov=WVX_state.overrides[r];
    if (ov && ov.attr){ for (var q=0;q<12;q++) out[b+4+q]=ov.attr[q]; }  // adopt source voice attrs
  }
  WVX_wbe32(out, bank.sub+4, pool);                          // subheader upload size (BE)
  var off=bank.dataStart;
  for (j=0;j<regBytes.length;j++){ out.set(regBytes[j], off); off+=regBytes[j].length; }
  return out;
}

// ─── UI ─────────────────────────────────────────────────────────────────────
function openWvxViewer(){
  if (WVX_state.panelEl){ WVX_state.panelEl.style.display='flex'; return; }
  var ov=document.createElement('div'); ov.id='wvxViewerPanel';
  ov.style.cssText='position:fixed;inset:0;background:rgba(8,12,18,0.96);z-index:10000;display:flex;flex-direction:column;padding:14px;font-family:monospace';
  ov.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">'+
      '<div style="font-size:13px;font-weight:bold;color:#7cf">🎵 PSX WVX Viewer / Swapper <span style="color:#9f7;font-size:10px;border:1px solid #4a4;border-radius:3px;padding:0 4px;margin-left:4px">build v76</span></div>'+
      '<span id="wvxInfo" style="color:#888;font-size:10px"></span>'+
      '<span id="wvxBudget" style="color:#888;font-size:10px;margin-left:8px"></span>'+
      '<div style="flex:1"></div>'+
      '<label style="color:#aac;font-size:10px">edit bank <input type="file" id="wvxFile" accept=".wvx" style="font-size:10px"></label>'+
      '<label style="color:#fa7;font-size:10px">source <input type="file" id="wvxSrc" accept=".wvx" style="font-size:10px"></label>'+
      '<label style="color:#7fa;font-size:10px">import WAV\u2192dest <input type="file" id="wvxWav" accept=".wav" style="font-size:10px"></label>'+
      '<label style="color:#7fa;font-size:10px" title="Peak-boost quiet clips to full scale on import"><input type="checkbox" id="wvxNorm" checked style="vertical-align:middle"> normalize</label>'+
      '<label style="color:#aac;font-size:10px">rate <select id="wvxRate" style="font-size:10px"><option value="8000">8000</option><option value="11025" selected>11025</option><option value="22050">22050</option><option value="44100">44100</option></select></label>'+
      '<button id="wvxExportBank" class="btn" style="font-size:10px;padding:4px 8px;background:#2a3a1a;color:#9f7" disabled>💾 Export .wvx</button>'+
      '<button id="wvxOpenSe" class="btn" style="font-size:10px;padding:4px 8px;background:#1d1228;color:#c9f" disabled>🎛 SE edits…</button>'+
      '<button id="wvxClose" class="btn" style="font-size:11px;padding:4px 10px">✕ Close</button>'+
    '</div>'+
    '<div style="color:#667;font-size:10px;margin-bottom:6px">Load the bank to edit (e.g. init.wvx) + a source bank (e.g. the ninja stage). Click a row to play. Select a dest row, then ⇆ on a source row to splice (lossless VAG), or use import WAV→dest to encode a PCM WAV into it. Snake\'s grunts: 56,57,58,60,61.</div>'+
    '<div id="wvxSeStatus" style="color:#9c9;font-size:10px;margin-bottom:6px;min-height:13px"></div>'+
    '<div style="display:flex;flex:1;min-height:0;gap:8px">'+
      '<div style="flex:1;display:flex;flex-direction:column;min-width:0">'+
        '<div style="color:#7cf;font-size:10px;padding:2px 4px">EDIT BANK (dest)</div>'+
        '<div id="wvxList" style="flex:1;overflow:auto;border:1px solid #223;border-radius:4px;background:#0c1118"></div>'+
      '</div>'+
      '<div style="flex:1;display:flex;flex-direction:column;min-width:0">'+
        '<div style="color:#fa7;font-size:10px;padding:2px 4px">SOURCE BANK</div>'+
        '<div id="wvxSrcList" style="flex:1;overflow:auto;border:1px solid #322;border-radius:4px;background:#120c0c"></div>'+
      '</div>'+
    '</div>'+
    '<audio id="wvxAudio" style="display:none"></audio>';
  document.body.appendChild(ov); WVX_state.panelEl=ov;
  document.getElementById('wvxClose').onclick=closeWvxViewer;
  document.getElementById('wvxFile').onchange=function(e){ WVX_load(e,'dest'); };
  document.getElementById('wvxSrc').onchange=function(e){ WVX_load(e,'src'); };
  document.getElementById('wvxWav').onchange=WVX_importWav;
  document.getElementById('wvxRate').onchange=function(){ WVX_state.rate=parseInt(this.value,10); };
  document.getElementById('wvxExportBank').onclick=WVX_exportBank;
  document.getElementById('wvxOpenSe').onclick=function(){ if (typeof openSeEditor==='function') openSeEditor(); };
  WVX_state.keyHandler=function(ev){ if(!WVX_state.panelEl||WVX_state.panelEl.style.display==='none')return;
    var t=(ev.target.tagName||'').toLowerCase(); if(t==='input'||t==='select'||t==='audio')return;
    if(ev.key==='ArrowDown'){ev.preventDefault();WVX_nav(1);} else if(ev.key==='ArrowUp'){ev.preventDefault();WVX_nav(-1);} };
  window.addEventListener('keydown',WVX_state.keyHandler);
}
function closeWvxViewer(){ if(WVX_state.blobUrl){URL.revokeObjectURL(WVX_state.blobUrl);WVX_state.blobUrl=null;}
  if(WVX_state.keyHandler)window.removeEventListener('keydown',WVX_state.keyHandler);
  if(WVX_state.panelEl)WVX_state.panelEl.style.display='none'; }

function WVX_load(ev, which){
  var f=ev.target.files&&ev.target.files[0]; if(!f)return;
  var rd=new FileReader();
  rd.onload=function(){
    var bank=WVX_parseBank(new Uint8Array(rd.result), f.name);
    if (which==='dest'){ WVX_state.dest=bank; WVX_state.overrides={}; WVX_state.selDest=-1;
      document.getElementById('wvxExportBank').disabled=false; WVX_renderDest(); }
    else { WVX_state.src=bank; WVX_state.selSrc=-1; WVX_renderSrc(); }
    var di=WVX_state.dest?(WVX_state.dest.name+': '+WVX_state.dest.entries.length+' samples'):'';
    var si=WVX_state.src?('  |  src '+WVX_state.src.name+': '+WVX_state.src.entries.length):'';
    document.getElementById('wvxInfo').textContent=di+si;
  };
  rd.readAsArrayBuffer(f);
}

function WVX_rowHtml(bank, i, sel, side){
  var e=bank.entries[i];
  var dur=(WVX_entrySpan(bank,e)/16*28/WVX_state.rate*1000).toFixed(0);
  var mod = (side==='dest' && WVX_state.overrides[WVX_region(bank,bank.fo[i]).idx]) ? ' ★' : '';
  var swapBtn = (side==='src')
    ? '<td><button class="btn" style="font-size:9px;padding:2px 6px;color:#fa7" onclick="WVX_swap('+i+');event.stopPropagation()">⇆ into dest</button></td>'
    : '<td><button class="btn" style="font-size:9px;padding:2px 5px" onclick="WVX_dl('+i+",'wav');event.stopPropagation()\">⬇WAV</button> <button class=\"btn\" style=\"font-size:9px;padding:2px 5px\" onclick=\"WVX_dl("+i+",'vag');event.stopPropagation()\">⬇VAG</button></td>";
  return '<tr id="wvx'+side+i+'" style="cursor:pointer;border-top:1px solid #1a2330;'+(sel?'background:'+(side==='dest'?'#1d3346':'#3a241a'):'')+'">'+
    '<td style="padding:3px 6px">'+i+mod+'</td><td>0x'+e.offset.toString(16)+'</td><td>'+e.note+'</td><td>'+e.tune+'</td><td>'+WVX_entrySpan(bank,e)+'B</td><td>~'+dur+'ms</td>'+swapBtn+'</tr>';
}
function WVX_renderDest(){
  WVX_updateBudgetUi();
  var bank=WVX_state.dest; if(!bank){return;}
  var h='<table style="width:100%;border-collapse:collapse;font-size:11px;color:#cdd"><tr style="position:sticky;top:0;background:#11202e;color:#7cf;text-align:left"><th style="padding:4px 6px">#</th><th>offset</th><th>note</th><th>tune</th><th>size</th><th>dur</th><th></th></tr>';
  for(var i=0;i<bank.entries.length;i++) h+=WVX_rowHtml(bank,i,i===WVX_state.selDest,'dest');
  h+='</table>'; document.getElementById('wvxList').innerHTML=h;
  for(var j=0;j<bank.entries.length;j++)(function(x){document.getElementById('wvxdest'+x).onclick=function(){WVX_playSel('dest',x);};})(j);
}
function WVX_renderSrc(){
  var bank=WVX_state.src; if(!bank){return;}
  var h='<table style="width:100%;border-collapse:collapse;font-size:11px;color:#cdd"><tr style="position:sticky;top:0;background:#2a1810;color:#fa7;text-align:left"><th style="padding:4px 6px">#</th><th>offset</th><th>note</th><th>tune</th><th>size</th><th>dur</th><th></th></tr>';
  for(var i=0;i<bank.entries.length;i++) h+=WVX_rowHtml(bank,i,i===WVX_state.selSrc,'src');
  h+='</table>'; document.getElementById('wvxSrcList').innerHTML=h;
  for(var j=0;j<bank.entries.length;j++)(function(x){document.getElementById('wvxsrc'+x).onclick=function(){WVX_playSel('src',x);};})(j);
}

function WVX_playSel(side, i){
  var bank = side==='dest'?WVX_state.dest:WVX_state.src; if(!bank)return;
  if(side==='dest'){WVX_state.selDest=i; WVX_renderDest();} else {WVX_state.selSrc=i; WVX_renderSrc();}
  var e=bank.entries[i], r=WVX_decodeEntry(bank,e);
  if(WVX_state.blobUrl)URL.revokeObjectURL(WVX_state.blobUrl);
  WVX_state.blobUrl=URL.createObjectURL(WVX_wav(r.pcm,WVX_state.rate));
  var au=document.getElementById('wvxAudio'); au.src=WVX_state.blobUrl; au.play().catch(function(){});
}
function WVX_nav(d){ if(!WVX_state.dest)return; var n=WVX_state.dest.entries.length; var i=WVX_state.selDest+d; if(i<0)i=0; if(i>=n)i=n-1; WVX_playSel('dest',i); }

// splice selected dest <- source entry j  (lossless raw VAG + full voice attrs)
function WVX_swap(j){
  if(!WVX_state.dest){alert('Load the bank to edit first');return;}
  if(WVX_state.selDest<0){alert('Select a destination sample (left) first');return;}
  var src=WVX_state.src, dst=WVX_state.dest;
  var se=src.entries[j], de=dst.entries[WVX_state.selDest];
  var reg=WVX_region(dst, WVX_entryFileOff(dst,de));
  // copy the source WAVE_W attribute bytes (+4..+15: note,tune,ADSR,pan,vol) so the
  // ninja sample keeps its own envelope/release and plays to full length
  var ab=src.table+j*16;
  var attr=src.data.slice(ab+4, ab+16);   // note,tune,a_mode,ar,dr,s_mode,sr,sl,r_mode,rr,pan,vol (verbatim)
  var fit=WVX_fitBudget(WVX_entryRaw(src,se).slice(), reg.idx);
  if(!fit){ alert('This sample cannot fit the bank\u2019s SPU budget even after trimming.\nFree space by shrinking another sample first, or pick a shorter source.'); return; }
  WVX_state.overrides[reg.idx] = { bytes: fit.bytes, attr: attr, srcLabel: src.name+'#'+j };
  WVX_renderDest(); WVX_updateBudgetUi();
  if(fit.trimmed){
    var stT=document.getElementById('wvxSeStatus');
    if(stT) stT.innerHTML='\u26A0 source was '+fit.trimmed+'B over the bank\u2019s SPU budget \u2014 tail trimmed and END-flagged so other banks stay intact.';
  }

  // Auto-lengthen the SE cues that trigger this sample so the longer source plays full.
  // The cue edits live in SE_state; export them via the SE editor (blob.h or EXE patch).
  var oldBytes = reg.end - reg.start, newBytes = WVX_entryRaw(src,se).length;
  var ratio = oldBytes>0 ? (newBytes/oldBytes) : 1;
  var idxs=[]; for (var i=0;i<dst.entries.length;i++) if (WVX_region(dst, dst.fo[i]).idx===reg.idx) idxs.push(i);
  if (typeof SE_autoLengthen==='function' && ratio>1.001){
    var log=SE_autoLengthen(idxs, ratio);
    var st=document.getElementById('wvxSeStatus'), btn=document.getElementById('wvxOpenSe');
    if (log.length){
      var cues={}; for (var q=0;q<log.length;q++) cues[log[q].cue]=1;
      if(st) st.innerHTML='✓ auto-lengthened '+Object.keys(cues).length+' SE cue(s) ×'+ratio.toFixed(2)+': '+Object.keys(cues).join(', ')+' — open “SE edits…” to export blob.h or patch your game EXE';
      if(btn) btn.disabled=false;
    } else if (st){ st.textContent='(no SE cue references sample '+idxs.join('/')+' — only the bank changed)'; }
  }
}

function WVX_dl(i, fmt){
  var bank=WVX_state.dest, e=bank.entries[i], base=bank.name.replace(/\.wvx$/i,'');
  var blob = fmt==='vag' ? WVX_vag(WVX_entryRaw(bank,e), WVX_state.rate, base+'_'+i)
                         : WVX_wav(WVX_decodeEntry(bank,e).pcm, WVX_state.rate);
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=base+'_'+String(i).padStart(3,'0')+'.'+fmt;
  document.body.appendChild(a);a.click(); setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(a.href);},200);
}

function WVX_exportBank(){
  if(!WVX_state.dest)return;
  if(WVX_poolBytes()>WVX_capBytes()){
    alert('Export blocked: the rebuilt bank is '+(WVX_poolBytes()-WVX_capBytes())+'B over its SPU allocation.\nIn-game this overwrites the next bank\u2019s samples (the \u201Cother sounds corrupt\u201D bug). Shrink or re-import a sample first.');
    return;
  }
  var out=WVX_buildBank(), base=WVX_state.dest.name.replace(/\.wvx$/i,'');
  var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'}));
  a.download=base+'_mod.wvx';
  document.body.appendChild(a);a.click(); setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(a.href);},200);
}
