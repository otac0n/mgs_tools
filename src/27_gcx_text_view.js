// ═══════════════════════════════════════════════════════════════════════════
// FILE: 27_gcx_text_view.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCX TEXT VIEWER (color-coded, editable)
// ============================================================
// Renders the current .gcx AST as readable, syntax-highlighted text.
// EDIT MODE: edits are line-diffed against the rendered text; value changes
// (numbers, hex, strings) are applied to the corresponding AST Values via
// refs captured during render. Structural edits (added/removed lines,
// changed command names) are rejected with a clear message.
// Works for both PC and PSX .gcx — the format is identical.

// ---------- Known names ----------

var gcxCmdNames = {
  0x0d86: 'if', 0x64c0: 'eval', 0xcd3a: 'return', 0x7636: 'foreach',
  0x22ff: 'mesg', 0xd4cb: 'trap', 0x9906: 'chara', 0xc091: 'map',
  0x7d50: 'mapdef', 0xeee9: 'camera', 0x306a: 'light', 0x9a1f: 'start',
  0xc8bb: 'load', 0x24e1: 'radio', 0xe43c: 'restart', 0xa242: 'demo',
  0xdbab: 'ntrap', 0x430d: 'delay', 0xcc85: 'pad', 0x5c9e: 'varsave',
  0x4ad9: 'system', 0x698d: 'sound', 0x226d: 'menu', 0x925e: 'rand',
  0xe257: 'func', 0xa2bf: 'demodebug', 0xb96e: 'print', 0xec9d: 'jimaku'
};

var gcxOpNames = {
  0:'END', 1:'NEG', 2:'NOT', 3:'CPL',
  4:'+', 5:'-', 6:'*', 7:'/', 8:'%',
  9:'==', 10:'!=', 11:'<', 12:'<=', 13:'>', 14:'>=',
  15:'|', 16:'&', 17:'^', 18:'||', 19:'&&', 20:'='
};
var gcxOpFromName = (function() {
  var m = {}; for (var k in gcxOpNames) m[gcxOpNames[k]] = +k; return m;
})();

// ---------- State ----------

var gcxViewerOpen = false;
var gcxViewerLastText = '';
var gcxViewerEditMode = false;
// Per-line arrays of {ref, kind} for editable values, in render order.
var gcxLineValues = [];
var gcxLineKinds = [];

// ---------- Token formatter ----------

function _gcxTokVal(v) {
  if (!v) return { text: '?', kind: 'unknown', ref: null };
  if (v.tag === GCL_END)   return { text: 'end',  kind: 'keyword', ref: null };
  if (v.tag === GCL_SHORT) return { text: String(v.payload | 0), kind: 'short', ref: v };
  if (v.tag === GCL_BYTE)  return { text: String(v.payload),     kind: 'byte',  ref: v };
  if (v.tag === GCL_CHAR) {
    var c = v.payload;
    var t = (c >= 32 && c < 127) ? ("'" + String.fromCharCode(c) + "'") : ("0x" + c.toString(16).padStart(2,'0'));
    return { text: t, kind: 'char', ref: v };
  }
  if (v.tag === GCL_BOOL)  return { text: v.payload ? 'true' : 'false', kind: 'bool', ref: v };
  if (v.tag === GCL_STRID) {
    var h = v.payload;
    var n = (typeof gcxCharaTable !== 'undefined' && gcxCharaTable[h]) ? gcxCharaTable[h] : null;
    return { text: n ? (n + ':0x' + h.toString(16).padStart(4,'0')) : ('strid:0x' + h.toString(16).padStart(4,'0')),
             kind: 'strid', ref: v };
  }
  if (v.tag === GCL_PROCID) return { text: 'proc:0x' + v.payload.toString(16).padStart(4,'0'), kind: 'procid', ref: v };
  if (v.tag === GCL_INT)    return { text: '0x' + (v.payload >>> 0).toString(16).padStart(8,'0'), kind: 'int', ref: v };
  if (v.tag === GCL_SYMBOL) return { text: 't:' + (v.payload >>> 0).toString(16).padStart(8,'0'), kind: 'symbol', ref: v };
  if (v.tag === GCL_STRING) {
    var s = '';
    for (var i = 0; i < v.payload.length; i++) {
      var b = v.payload[i];
      if (b === 0) break;
      s += (b >= 32 && b < 127) ? String.fromCharCode(b) : ('\\x' + b.toString(16).padStart(2,'0'));
    }
    return { text: '"' + s + '"', kind: 'string', ref: v };
  }
  if (v.tag === GCL_ARRAY)  return { text: 'arg' + v.payload, kind: 'array', ref: v };
  if ((v.tag & 0xF0) === GCL_VAR) {
    return { text: '$' + (v.tag & 0x0F).toString(16) + ':0x' + v.payload.packed.toString(16).padStart(6,'0'),
             kind: 'var', ref: v };
  }
  if (v.tag === GCL_OPTION) {
    return { text: '-' + String.fromCharCode(v.payload.optChar), kind: 'option', ref: null };
  }
  return { text: '<' + v.kind + '>', kind: 'unknown', ref: null };
}

function _gcxEscapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Wraps any token in a colored span.
function _gcxTokenHtml(tok) {
  return '<span class="gcx-' + tok.kind + '">' + _gcxEscapeHtml(tok.text) + '</span>';
}

// ---------- Line builder ----------

var _gcxLineNum;

function _newLineParts() {
  return {
    parts: [], refs: [], kinds: [],
    pushToken: function(tok) {
      this.parts.push(_gcxTokenHtml(tok));
      if (tok.ref) { this.refs.push(tok.ref); this.kinds.push(tok.kind); }
    },
    pushHtml: function(s) { this.parts.push(s); },
    pushText: function(s) { this.parts.push(_gcxEscapeHtml(s)); }
  };
}

function _emitLine(lp, outLines) {
  var idx = _gcxLineNum++;
  gcxLineValues[idx] = lp.refs.slice();
  gcxLineKinds[idx]  = lp.kinds.slice();
  outLines.push(lp.parts.join(''));
}

function _renderExpr(items, lp) {
  lp.pushHtml('<span class="gcx-punct">[ </span>');
  for (var i = 0; i < items.length; i++) {
    if (i > 0) lp.pushHtml(' ');
    var it = items[i];
    if (it.kind === 'op') {
      var nm = gcxOpNames[it.opCode] || ('OP_0x' + it.opCode.toString(16));
      lp.parts.push('<span class="gcx-op">' + _gcxEscapeHtml(nm) + '</span>');
      lp.refs.push(it); lp.kinds.push('op');
    } else if (it.kind === 'value') {
      lp.pushToken(_gcxTokVal(it.value));
    } else {
      lp.pushHtml('<span class="gcx-unknown">&lt;' + _gcxEscapeHtml(it.kind) + '&gt;</span>');
    }
  }
  lp.pushHtml('<span class="gcx-punct"> ]</span>');
}

function _renderBlock(b, indent, outLines) {
  var pad = ''; for (var p = 0; p < indent; p++) pad += '  ';
  if (!b) return;

  if (b.tag === GCL_END) {
    var lp = _newLineParts();
    lp.pushHtml(_gcxEscapeHtml(pad));
    lp.pushHtml('<span class="gcx-keyword">end</span>');
    _emitLine(lp, outLines); return;
  }

  if (b.tag === GCL_EXPR) {
    var lp1 = _newLineParts();
    lp1.pushHtml(_gcxEscapeHtml(pad));
    lp1.pushHtml('<span class="gcx-keyword">expr</span> ');
    _renderExpr(b.payload.exprItems, lp1);
    _emitLine(lp1, outLines); return;
  }

  if (b.tag === GCL_COMMAND) {
    var name = gcxCmdNames[b.payload.cmdId] || ('cmd_0x' + b.payload.cmdId.toString(16).padStart(4,'0'));
    var known = !!gcxCmdNames[b.payload.cmdId];
    var lp2 = _newLineParts();
    lp2.pushHtml(_gcxEscapeHtml(pad));
    lp2.pushHtml('<span class="gcx-cmd' + (known ? '' : '-unknown') + '">' + _gcxEscapeHtml(name) + '</span>');
    // Preserve lineSkip for byte-identical round-trip via the compiler
    lp2.pushHtml(' <span class="gcx-comment">/*L=' + (b.payload.lineSkip|0) + '*/</span>');

    var vals = b.payload.values;

    // Branch-paired interleaved rendering: ARG blocks appear inline `{ ... }`
    // wherever they occur in the AST values list. This is how the binary
    // structures `if [cond] { body } -i [cond] { body } -e { body }` and
    // also how the parser reconstructs them.
    var i = 0;
    while (i < vals.length) {
      var v = vals[i];
      if (v.tag === GCL_END) { i++; continue; }
      if (v.tag === GCL_OPTION) {
        lp2.pushHtml(' <span class="gcx-option">-' + _gcxEscapeHtml(String.fromCharCode(v.payload.optChar)) + '</span>');
        i++; continue;
      }
      if (v.tag === GCL_EXPR) {
        lp2.pushHtml(' ');
        _renderExpr(v.payload.exprItems, lp2);
        i++; continue;
      }
      if (v.tag === GCL_ARG) {
        // Emit ` {` to close current line; render inner block list indented; close with `}`
        lp2.pushHtml(' <span class="gcx-punct">{</span>');
        _emitLine(lp2, outLines);
        var inner = v.payload.innerBlocks || [];
        for (var inj = 0; inj < inner.length; inj++) {
          _renderBlock(inner[inj], indent + 1, outLines);
        }
        // Look ahead: if the next value is an OPTION, append it onto the closing `}` line
        var lp3 = _newLineParts();
        lp3.pushHtml(_gcxEscapeHtml(pad));
        lp3.pushHtml('<span class="gcx-punct">}</span>');
        i++;
        if (i < vals.length && vals[i].tag === GCL_OPTION) {
          lp3.pushHtml(' <span class="gcx-option">-' + _gcxEscapeHtml(String.fromCharCode(vals[i].payload.optChar)) + '</span>');
          i++;
        }
        // If we now find another EXPR or ARG, continue building this line
        lp2 = lp3;
        continue;
      }
      // Plain value
      lp2.pushHtml(' ');
      lp2.pushToken(_gcxTokVal(v));
      i++;
    }
    _emitLine(lp2, outLines);
    return;
  }

  if (b.tag === GCL_PROC) {
    var lp3 = _newLineParts();
    lp3.pushHtml(_gcxEscapeHtml(pad));
    lp3.pushHtml('<span class="gcx-keyword">call</span> ');
    lp3.pushHtml('<span class="gcx-procid">proc:0x' + b.payload.procId.toString(16).padStart(4,'0') + '</span>');
    var pV = b.payload.values;
    for (var k = 0; k < pV.length; k++) {
      if (pV[k].tag === GCL_END) continue;
      lp3.pushHtml(' ');
      lp3.pushToken(_gcxTokVal(pV[k]));
    }
    _emitLine(lp3, outLines); return;
  }

  if (b.tag === GCL_ARG) {
    var alp = _newLineParts();
    alp.pushHtml(_gcxEscapeHtml(pad) + '<span class="gcx-punct">{</span>');
    _emitLine(alp, outLines);
    var inn = b.payload.innerBlocks || [];
    for (var m = 0; m < inn.length; m++) _renderBlock(inn[m], indent + 1, outLines);
    var clp3 = _newLineParts();
    clp3.pushHtml(_gcxEscapeHtml(pad) + '<span class="gcx-punct">}</span>');
    _emitLine(clp3, outLines); return;
  }

  var ulp = _newLineParts();
  ulp.pushHtml(_gcxEscapeHtml(pad) + '<span class="gcx-unknown">&lt;unknown 0x' + b.tag.toString(16) + '&gt;</span>');
  _emitLine(ulp, outLines);
}

// Build colored HTML; also populate gcxLineValues / gcxLineKinds.
function buildGCXTextHTML(gcx) {
  if (!gcx) return { html: '', plainText: '', lineCount: 0 };
  if (typeof gcxWriteEntitiesBack === 'function' && typeof gclEntities !== 'undefined') {
    gcxWriteEntitiesBack(gclEntities);
  }
  gcxLineValues = []; gcxLineKinds = []; _gcxLineNum = 0;
  var lines = [];

  var name = (typeof psxGcxName !== 'undefined' ? psxGcxName : '?');
  var h1 = _newLineParts();
  h1.pushHtml('<span class="gcx-comment"># GCX — ' + _gcxEscapeHtml(name) + '</span>');
  _emitLine(h1, lines);
  var h2 = _newLineParts();
  h2.pushHtml('<span class="gcx-comment"># ' + gcx.procs.length + ' procs, script body ' + gcx.scriptBodyLen + ' bytes</span>');
  _emitLine(h2, lines);
  _emitLine(_newLineParts(), lines);

  var sorted = gcx.procs.slice().sort(function(a,b) { return a.fileOffset - b.fileOffset; });
  for (var i = 0; i < sorted.length; i++) {
    var p = sorted[i];
    var plp = _newLineParts();
    plp.pushHtml('<span class="gcx-keyword">proc</span> ');
    plp.pushHtml('<span class="gcx-procid">0x' + p.tableEntry.procId.toString(16).padStart(4,'0') + '</span>');
    plp.pushHtml(' <span class="gcx-comment">/* +0x' + p.tableEntry.offset.toString(16) + ', ' + (p.raw ? p.raw.length : '?') + 'B */</span> ');
    plp.pushHtml('<span class="gcx-punct">{</span>');
    _emitLine(plp, lines);
    for (var j = 0; j < p.blocks.length; j++) _renderBlock(p.blocks[j], 1, lines);
    var ep = _newLineParts();
    ep.pushHtml('<span class="gcx-punct">}</span>');
    _emitLine(ep, lines);
    _emitLine(_newLineParts(), lines);
  }

  var slp = _newLineParts();
  slp.pushHtml('<span class="gcx-keyword">script</span> ');
  slp.pushHtml('<span class="gcx-comment">/* ' + gcx.scriptBodyLen + ' bytes */</span> ');
  slp.pushHtml('<span class="gcx-punct">{</span>');
  _emitLine(slp, lines);
  for (var k = 0; k < gcx.scriptBody.blocks.length; k++) {
    _renderBlock(gcx.scriptBody.blocks[k], 1, lines);
  }
  var sep = _newLineParts();
  sep.pushHtml('<span class="gcx-punct">}</span>');
  _emitLine(sep, lines);

  var html = lines.join('\n');
  var plain = html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return { html: html, plainText: plain, lineCount: lines.length };
}

// ============================================================
// GCL-DIALECT SERIALIZER
// Walks the same parsed psxGcx AST as buildGCXTextHTML, but emits true GCL
// script text (proc sub_XXXX(...) { }, lowercase commands, -options, infix
// expressions, call(sub_XXXX, ...)) matching WantedThing's decompiler output.
// Read-only render for the ViewGCL panel; the value-edit path stays on the
// GCX viewer. Does NOT touch bytes — pure AST->text.
// ============================================================

var _GCL_VAR_LETTER = {1:'w',2:'b',3:'c',4:'f',6:'s',7:'s',8:'p',9:'s',0x0a:'t'};

function _gclHex(n, width){ var s=(n>>>0).toString(16); while(s.length<width)s='0'+s; return s; }

// Resolve a STR_ID hash to a readable name using whatever tables the editor
// already has: the charalst type table (index-keyed) and any runtime/user-added
// names. Returns a bare name for true-GCL output, or null if unknown (caller
// falls back to s:hhhh). A full reverse dictionary for instance names requires
// a name wordlist (see gcxStridNames hook below).
var gcxStridNames = (typeof gcxStridNames !== 'undefined') ? gcxStridNames : {}; // hash(int) -> name, fillable
function _gclResolveStrid(h){
  if(gcxStridNames && gcxStridNames[h]) return gcxStridNames[h];
  if(typeof gcxCharaTable!=='undefined' && gcxCharaTable[h]){
    // charalst names are stored "00XX_NAME"; strip the index prefix for clean GCL
    return String(gcxCharaTable[h]).replace(/^[0-9A-Fa-f]{4}_/,'');
  }
  if(typeof PSXT_runtimeNames!=='undefined'){
    var key='0x'+_gclHex(h,4);
    if(PSXT_runtimeNames[key] && PSXT_runtimeNames[key].length) return PSXT_runtimeNames[key][0];
  }
  return null;
}

// Format a single value token in GCL dialect.
function _gclTokText(v){
  if(!v) return '?';
  switch(v.tag){
    case GCL_SHORT:  return String(v.payload|0);
    case GCL_BYTE:   return String(v.payload);              // plain (WantedThing drops type prefix)
    case GCL_CHAR: {
      var c=v.payload;
      return (c>=32&&c<127) ? ("'"+String.fromCharCode(c)+"'") : ('0x'+_gclHex(c,2));
    }
    case GCL_BOOL:   return v.payload ? 'true' : 'false';    // lowercase keyword
    case GCL_STRID:  { var nm=_gclResolveStrid(v.payload); return nm ? nm : ('s:'+_gclHex(v.payload,4)); }
    case GCL_STRING: {
      var s='';
      for(var i=0;i<v.payload.length;i++){ var b=v.payload[i]; if(b===0)break;
        s += (b>=32&&b<127) ? String.fromCharCode(b) : ('\\x'+_gclHex(b,2)); }
      return '"'+s+'"';
    }
    case GCL_PROCID: return 'sub_'+_gclHex(v.payload,4).toUpperCase();
    case GCL_INT:    return 'snd:'+_gclHex(v.payload,8);     // sound code, 8-hex lowercase
    case GCL_SYMBOL: return 't:'+_gclHex(v.payload,8);       // table code, lowercase
    case GCL_ARRAY:  return 'arg'+v.payload;
    case GCL_OPTION: return '-'+String.fromCharCode(v.payload.optChar);
  }
  if((v.tag&0xF0)===GCL_VAR){
    var letter=_GCL_VAR_LETTER[v.tag&0x0F]||'v';
    return '$'+letter+':'+_gclHex(v.payload.packed,6);       // lowercase hex
  }
  return '?';
}

// Operator precedence (higher binds tighter) for minimal-paren printing.
var _GCL_OP_PREC={1:14,2:14,3:14, 6:12,7:12,8:12, 4:11,5:11,
  11:9,12:9,13:9,14:9, 9:8,10:8, 16:7,17:6,15:5, 19:4,18:3, 20:1};

// RPN expr item list -> infix GCL string, WantedThing style (minimal parens).
function _gclExpr(items){
  var st=[];
  for(var i=0;i<items.length;i++){
    var it=items[i];
    if(it.kind==='value'){ st.push({s:_gclTokText(it.value), prec:99}); continue; }
    if(it.kind!=='op') continue;
    var op=it.opCode; if(op===0) continue;
    var sym=gcxOpNames[op]||('op'+op); var prec=_GCL_OP_PREC[op]||0;
    if(op>=1&&op<=3){ // unary
      var a=st.pop()||{s:'',prec:99};
      if(op===1) st.push({s:'-('+a.s+')', prec:14});                  // negate -> -(x)
      else st.push({s:sym+((a.prec<14)?('('+a.s+')'):a.s), prec:14}); // ! ~
    } else {
      var b=st.pop()||{s:'',prec:99}, a2=st.pop()||{s:'',prec:99};
      var ls=(a2.prec<prec)?('('+a2.s+')'):a2.s;
      var rs=(b.prec<prec)?('('+b.s+')'):b.s;
      st.push({s:ls+' '+sym+' '+rs, prec:prec});
    }
  }
  return st.length ? st[st.length-1].s : '';
}

function _gclSpaces(n){ var s=''; while(n-->0)s+=' '; return s; }

// Collect highest arg index used in a proc body (for the proc(argN,...) header).
function _gclMaxArg(blocks){
  var max=0;
  function scanVal(v){ if(v&&v.tag===GCL_ARRAY&&v.payload>max)max=v.payload; }
  function scanBlock(b){
    if(!b)return;
    if(b.tag===GCL_EXPR){ var it=b.payload.exprItems||[]; for(var i=0;i<it.length;i++) if(it[i].kind==='value')scanVal(it[i].value); return; }
    if(b.tag===GCL_COMMAND||b.tag===GCL_PROC){
      var vals=b.payload.values||[];
      for(var j=0;j<vals.length;j++){
        var v=vals[j];
        if(v.tag===GCL_EXPR){ var ei=v.payload.exprItems||[]; for(var e=0;e<ei.length;e++) if(ei[e].kind==='value')scanVal(ei[e].value); }
        else if(v.tag===GCL_ARG){ var ib=v.payload.innerBlocks||[]; for(var k=0;k<ib.length;k++)scanBlock(ib[k]); }
        else scanVal(v);
      }
      return;
    }
    if(b.tag===GCL_ARG){ var inn=b.payload.innerBlocks||[]; for(var m=0;m<inn.length;m++)scanBlock(inn[m]); }
  }
  for(var i=0;i<blocks.length;i++)scanBlock(blocks[i]);
  return max;
}

function _gclPad(indent){ var s=''; for(var i=0;i<indent;i++)s+='    '; return s; }

// Emit a non-control command in WantedThing layout: positional args on the
// command line, each option on its own '\'-continued, value-aligned line, and
// option-blocks as `-x {` ... `}`. Options are kept as single letters (the GCX
// stores only the letter; the keyword table needed to expand -r -> -route is
// not available without WantedThing's per-command option dictionaries).
function _emitCommand(name, vals, indent, out){
  var pad=_gclPad(indent), oind=pad+'    ';
  var i=0, positional=[];
  while(i<vals.length){
    var v=vals[i];
    if(v.tag===GCL_OPTION||v.tag===GCL_ARG) break;
    if(v.tag===GCL_END){ i++; continue; }
    if(v.tag===GCL_EXPR){ positional.push('('+_gclExpr(v.payload.exprItems||[])+')'); i++; continue; }
    positional.push(_gclTokText(v)); i++;
  }
  var segs=[];
  while(i<vals.length){
    var vv=vals[i];
    if(vv.tag===GCL_END){ i++; continue; }
    if(vv.tag===GCL_OPTION){
      var opt='-'+String.fromCharCode(vv.payload.optChar); i++;
      var ovals=[];
      while(i<vals.length && vals[i].tag!==GCL_OPTION && vals[i].tag!==GCL_ARG && vals[i].tag!==GCL_END){
        if(vals[i].tag===GCL_EXPR) ovals.push('('+_gclExpr(vals[i].payload.exprItems||[])+')');
        else ovals.push(_gclTokText(vals[i]));
        i++;
      }
      if(i<vals.length && vals[i].tag===GCL_ARG){
        var blk=vals[i].payload.innerBlocks||[]; i++;
        var blines=[]; for(var q=0;q<blk.length;q++)_gclBlock(blk[q], indent+2, blines);
        segs.push({opt:opt, vals:ovals, block:blines});
      } else { segs.push({opt:opt, vals:ovals}); }
    } else if(vv.tag===GCL_ARG){
      var blk2=vv.payload.innerBlocks||[]; i++;
      var bl2=[]; for(var q2=0;q2<blk2.length;q2++)_gclBlock(blk2[q2], indent+2, bl2);
      segs.push({opt:null, block:bl2});
    } else { i++; }
  }
  var cmdLine=pad+name+(positional.length?(' '+positional.join(' ')):'');
  if(segs.length===0){ out.push(cmdLine); return; }
  var maxOpt=0; for(var s=0;s<segs.length;s++){ if(segs[s].opt && segs[s].opt.length>maxOpt)maxOpt=segs[s].opt.length; }
  var lines=[]; // {text, slash}
  lines.push({text:cmdLine, slash:true});
  for(var s2=0;s2<segs.length;s2++){
    var seg=segs[s2];
    var optPad= seg.opt ? (seg.opt+_gclSpaces(maxOpt-seg.opt.length+1)) : '';
    if(seg.block){
      lines.push({text:oind+(seg.opt?optPad:'')+'{', slash:false});
      for(var bl=0;bl<seg.block.length;bl++) lines.push({text:seg.block[bl], slash:false});
      lines.push({text:oind+'}', slash:true});
    } else {
      lines.push({text:oind+optPad+seg.vals.join(' '), slash:true});
    }
  }
  for(var L=0;L<lines.length;L++){
    var isLast=(L===lines.length-1);
    out.push(lines[L].text + ((!isLast && lines[L].slash)?' \\':''));
  }
}

// Render one block to GCL lines.
function _gclBlock(b, indent, out){
  if(!b) return;
  var pad=_gclPad(indent);
  if(b.tag===GCL_END) return;

  if(b.tag===GCL_EXPR){ out.push(pad+_gclExpr(b.payload.exprItems||[])); return; }

  if(b.tag===GCL_ARG){
    out.push(pad+'{');
    var inn=b.payload.innerBlocks||[];
    for(var i=0;i<inn.length;i++)_gclBlock(inn[i], indent+1, out);
    out.push(pad+'}');
    return;
  }

  if(b.tag===GCL_PROC){ // CALL
    var line=pad+'call(sub_'+_gclHex(b.payload.procId,4).toUpperCase();
    var pv=b.payload.values||[];
    var args=[]; for(var k=0;k<pv.length;k++){ if(pv[k].tag===GCL_END)continue; args.push(_gclTokText(pv[k])); }
    out.push(line+(args.length?(', '+args.join(', ')):'')+')');
    return;
  }

  if(b.tag===GCL_COMMAND){
    var cmdId=b.payload.cmdId;
    var name=gcxCmdNames[cmdId]||('cmd_0x'+_gclHex(cmdId,4));
    var vals=b.payload.values||[];

    if(cmdId===0x0d86){ // IF -> if / elseif / else
      var i=0;
      while(i<vals.length && vals[i].tag===GCL_END) i++;
      var cond=''; if(i<vals.length && vals[i].tag===GCL_EXPR){ cond=' ('+_gclExpr(vals[i].payload.exprItems||[])+')'; i++; }
      if(i<vals.length && vals[i].tag===GCL_ARG){
        out.push(pad+'if'+cond+' {');
        var tb=vals[i].payload.innerBlocks||[]; for(var t=0;t<tb.length;t++)_gclBlock(tb[t], indent+1, out); i++;
        var tail=pad+'}';
        while(i<vals.length){
          var v=vals[i];
          if(v.tag===GCL_OPTION){
            var ch=String.fromCharCode(v.payload.optChar); i++;
            if(ch==='i'){
              var c2=''; if(i<vals.length&&vals[i].tag===GCL_EXPR){ c2=' ('+_gclExpr(vals[i].payload.exprItems||[])+')'; i++; }
              out.push(tail+' elseif'+c2+' {');
              if(i<vals.length&&vals[i].tag===GCL_ARG){ var eb=vals[i].payload.innerBlocks||[]; for(var e=0;e<eb.length;e++)_gclBlock(eb[e], indent+1, out); i++; }
              tail=pad+'}';
            } else if(ch==='e'){
              out.push(tail+' else {');
              if(i<vals.length&&vals[i].tag===GCL_ARG){ var xb=vals[i].payload.innerBlocks||[]; for(var x=0;x<xb.length;x++)_gclBlock(xb[x], indent+1, out); i++; }
              tail=pad+'}';
            } else { i++; }
          } else { i++; }
        }
        out.push(tail);
        return;
      }
      out.push(pad+'if'+cond);
      return;
    }

    if(cmdId===0x64c0){ // EVAL(expr)
      var exprs=[];
      for(var ei=0;ei<vals.length;ei++){ if(vals[ei].tag===GCL_EXPR) exprs.push(_gclExpr(vals[ei].payload.exprItems||[])); }
      out.push(pad+'eval('+exprs.join('; ')+')');
      return;
    }

    _emitCommand(name, vals, indent, out);
    return;
  }
  out.push(pad+'# <unknown 0x'+b.tag.toString(16)+'>');
}

function _gclProc(procId, blocks, out, isMain){
  // The GCX proc body is itself a SCRIPT block, so blocks is typically a single
  // wrapping GCL_ARG. Unwrap it so statements sit directly inside the proc braces
  // (matching WantedThing) instead of nesting a redundant { }.
  var body=blocks;
  var nonEnd=blocks.filter(function(b){ return b && b.tag!==GCL_END; });
  if(nonEnd.length===1 && nonEnd[0].tag===GCL_ARG){ body=nonEnd[0].payload.innerBlocks||[]; }
  out.push('proc sub_'+_gclHex(procId,4).toUpperCase()+' {');
  for(var i=0;i<body.length;i++)_gclBlock(body[i], 1, out);
  out.push('}');
  out.push('');
}

// Public: AST -> GCL script string.
function gcxAstToGCL(gcx){
  if(!gcx) return '';
  if(typeof gcxWriteEntitiesBack==='function' && typeof gclEntities!=='undefined'){
    try{ gcxWriteEntitiesBack(gclEntities); }catch(e){}
  }
  var out=[];
  var nm=(typeof psxGcxName!=='undefined'?psxGcxName:'');
  out.push('# GCL (decompiled from '+nm+')');
  out.push('');
  var sorted=gcx.procs.slice().sort(function(a,b){return a.fileOffset-b.fileOffset;});
  for(var i=0;i<sorted.length;i++){
    _gclProc(sorted[i].tableEntry.procId, sorted[i].blocks, out, false);
  }
  // Main script body = main procedure (id 0).
  if(gcx.scriptBody && gcx.scriptBody.blocks){
    _gclProc(0, gcx.scriptBody.blocks, out, true);
  }
  return out.join('\n');
}

// ---------- Edit mode: extract value tokens, apply line by line ----------

function _gcxExtractValueTokens(line) {
  // Strip block comments (e.g. "/*L=7*/", "/* +0x0, 48B */") so their numeric
  // content isn't confused for value tokens by the line-diff editor.
  line = line.replace(/\/\*[^*]*\*\//g, '');
  var toks = [];
  var pat = /(strid:0x[0-9a-fA-F]+)|(proc:0x[0-9a-fA-F]+)|(t:[0-9a-fA-F]+)|(arg\d+)|(\$[0-9a-fA-F]:0x[0-9a-fA-F]+)|([A-Z][A-Z_0-9]*:0x[0-9a-fA-F]+)|('[^']*')|("[^"]*")|(\b0x[0-9a-fA-F]+\b)|(-?\d+)|(\btrue\b|\bfalse\b)/g;
  var m; while ((m = pat.exec(line)) !== null) toks.push(m[0]);
  return toks;
}

function _gcxApplyTokenToValue(tok, kind, ref) {
  if (!ref) return false;
  try {
    switch (kind) {
      case 'short': {
        var n = parseInt(tok, 10); if (isNaN(n)) return false;
        ref.payload = n | 0; return true;
      }
      case 'byte': case 'array': {
        var n2 = parseInt(tok, 10); if (isNaN(n2)) return false;
        ref.payload = n2 & 0xFF; return true;
      }
      case 'char': {
        if (tok.length === 3 && tok[0] === "'" && tok[2] === "'") { ref.payload = tok.charCodeAt(1); return true; }
        var nh = parseInt(tok, 16);
        if (!isNaN(nh)) { ref.payload = nh & 0xFF; return true; }
        return false;
      }
      case 'bool': ref.payload = (tok === 'true') ? 1 : 0; return true;
      case 'int': {
        var ni = parseInt(tok, 16); if (isNaN(ni)) return false;
        ref.payload = ni >>> 0; return true;
      }
      case 'symbol': {
        var hex = tok.replace(/^t:/, '');
        var ns = parseInt(hex, 16); if (isNaN(ns)) return false;
        ref.payload = ns >>> 0; return true;
      }
      case 'strid': case 'procid': {
        var mm = tok.match(/0x([0-9a-fA-F]+)$/); if (!mm) return false;
        var hp = parseInt(mm[1], 16); if (isNaN(hp)) return false;
        ref.payload = hp & 0xFFFF; return true;
      }
      case 'var': {
        var mv = tok.match(/^\$([0-9a-fA-F]):0x([0-9a-fA-F]+)$/); if (!mv) return false;
        ref.payload.packed = parseInt(mv[2], 16) & 0xFFFFFF;
        return true;
      }
      case 'op': {
        if (gcxOpFromName[tok] !== undefined) { ref.opCode = gcxOpFromName[tok]; return true; }
        return false;
      }
      case 'string': {
        if (tok.length < 2 || tok[0] !== '"' || tok[tok.length-1] !== '"') return false;
        var inner = tok.slice(1, -1);
        var bytes = [];
        for (var i = 0; i < inner.length; i++) {
          if (inner[i] === '\\' && inner[i+1] === 'x') {
            bytes.push(parseInt(inner.substr(i+2, 2), 16));
            i += 3;
          } else bytes.push(inner.charCodeAt(i));
        }
        if (bytes.length + 1 !== ref.payload.length) return false;
        var newP = new Uint8Array(bytes.length + 1);
        for (var b = 0; b < bytes.length; b++) newP[b] = bytes[b] & 0xFF;
        newP[bytes.length] = 0;
        ref.payload = newP; return true;
      }
    }
  } catch (e) { return false; }
  return false;
}

function applyGCXTextEdits(origPlain, editPlain) {
  var oL = origPlain.split('\n'), eL = editPlain.split('\n');
  if (oL.length !== eL.length) {
    return { ok: false, applied: 0, skipped: 0, errors: [
      'Line count changed (' + oL.length + ' -> ' + eL.length + '). Structural edits not supported.'
    ] };
  }
  var applied = 0, skipped = 0, errors = [];
  for (var i = 0; i < oL.length; i++) {
    if (oL[i] === eL[i]) continue;
    var refs = gcxLineValues[i] || [], kinds = gcxLineKinds[i] || [];
    var ot = _gcxExtractValueTokens(oL[i]), et = _gcxExtractValueTokens(eL[i]);
    if (ot.length !== et.length) { errors.push('Line ' + (i+1) + ': token count changed — skipped.'); skipped++; continue; }
    if (et.length !== refs.length) { errors.push('Line ' + (i+1) + ': refs mismatch — skipped.'); skipped++; continue; }
    for (var j = 0; j < et.length; j++) {
      if (ot[j] === et[j]) continue;
      var ok = _gcxApplyTokenToValue(et[j], kinds[j], refs[j]);
      if (ok) applied++;
      else { errors.push('Line ' + (i+1) + ': "' + ot[j] + '" -> "' + et[j] + '" (' + kinds[j] + ') — could not parse.'); skipped++; }
    }
  }
  return { ok: true, applied: applied, skipped: skipped, errors: errors };
}

// ---------- Modal ----------

function openGCXViewer() {
  if (typeof psxGcx === 'undefined' || !psxGcx) {
    alert('No .gcx loaded. Click "Load .gcx" first.');
    return;
  }
  closeGCXViewer();
  gcxViewerOpen = true;
  gcxViewerEditMode = false;
  _gcxRenderModal();
}

function _gcxRenderModal() {
  var existing = document.getElementById('gcxViewerModal');
  if (existing) existing.remove();

  var built;
  try { built = buildGCXTextHTML(psxGcx); }
  catch (err) { console.error('buildGCXTextHTML', err); alert('Render error: ' + err.message); return; }
  gcxViewerLastText = built.plainText;

  var modal = document.createElement('div');
  modal.id = 'gcxViewerModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);' +
    'z-index:9999;display:flex;flex-direction:column;padding:20px;box-sizing:border-box';

  if (!document.getElementById('gcxViewerStyles')) {
    var style = document.createElement('style');
    style.id = 'gcxViewerStyles';
    style.textContent =
      '.gcx-keyword{color:#ff4488;font-weight:bold}' +
      '.gcx-cmd{color:#88ddff}' +
      '.gcx-cmd-unknown{color:#886688}' +
      '.gcx-procid{color:#ff8866}' +
      '.gcx-strid{color:#00ccff}' +
      '.gcx-symbol{color:#cc88ff}' +
      '.gcx-int{color:#44cc88}' +
      '.gcx-short,.gcx-byte,.gcx-array{color:#44cc88}' +
      '.gcx-char{color:#ddcc66}' +
      '.gcx-bool{color:#ffaa44}' +
      '.gcx-string{color:#ddcc66}' +
      '.gcx-var{color:#cc88ff}' +
      '.gcx-option{color:#88aaff}' +
      '.gcx-op{color:#ff66aa}' +
      '.gcx-comment{color:#446688;font-style:italic}' +
      '.gcx-punct{color:#667788}' +
      '.gcx-unknown{color:#ff8866;background:#3a0a0a;padding:0 2px}' +
      '.gcxv-hit{background:#665500;color:#fff}' +
      '.gcxv-hit-current{background:#cc6600;color:#fff;outline:1px solid #ff8800}';
    document.head.appendChild(style);
  }

  var name = (typeof psxGcxName !== 'undefined' ? psxGcxName : '');
  var sizeKB = (built.plainText.length / 1024).toFixed(1);

  var header = document.createElement('div');
  header.style.cssText = 'background:#0d1219;border:1px solid #1a2535;border-bottom:none;' +
    'padding:6px 10px;display:flex;align-items:center;gap:8px;flex-shrink:0';
  header.innerHTML =
    '<span style="color:#00ccff;font-weight:bold">ViewGCX</span>' +
    '<span style="color:#446688;font-size:10px">' + _gcxEscapeHtml(name) + '</span>' +
    '<span style="color:#446688;font-size:10px">' + built.lineCount + ' lines · ' + sizeKB + ' KB</span>' +
    '<span style="flex:1"></span>' +
    '<input id="gcxvSearch" type="text" placeholder="search (Enter=next, Shift+Enter=prev)" class="ninput" style="width:240px">' +
    '<span id="gcxvSearchCount" style="color:#446688;font-size:10px;min-width:60px"></span>' +
    '<button id="gcxvEditBtn" class="btn">Edit</button>' +
    '<button id="gcxvSaveBtn" class="btn export" style="display:none">Save changes</button>' +
    '<button id="gcxvCancelBtn" class="btn" style="display:none">Cancel</button>' +
    '<button id="gcxvCopyBtn" class="btn">Copy</button>' +
    '<button id="gcxvRefreshBtn" class="btn" title="Re-render from current state">↻</button>' +
    '<button id="gcxvCloseBtn" class="btn danger">✕</button>';

  var body = document.createElement('div');
  body.id = 'gcxvBody';
  body.style.cssText = 'flex:1;background:#0a0e14;border:1px solid #1a2535;overflow:auto;' +
    'font-family:monospace;font-size:11px;line-height:1.4;min-height:0;' +
    'padding:8px 12px;white-space:pre;color:#aabbcc';
  body.innerHTML = built.html;

  var editArea = document.createElement('textarea');
  editArea.id = 'gcxvEditArea';
  editArea.style.cssText = 'flex:1;background:#0a0e14;border:1px solid #1a2535;overflow:auto;' +
    'font-family:monospace;font-size:11px;line-height:1.4;min-height:0;' +
    'padding:8px 12px;color:#aabbcc;display:none;resize:none;outline:none';
  editArea.value = built.plainText;
  editArea.spellcheck = false;

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(editArea);
  document.body.appendChild(modal);

  document.getElementById('gcxvCloseBtn').onclick = closeGCXViewer;
  document.getElementById('gcxvRefreshBtn').onclick = _gcxRenderModal;
  document.getElementById('gcxvCopyBtn').onclick = gcxvCopyToClipboard;
  document.getElementById('gcxvEditBtn').onclick = _gcxToggleEditMode;
  document.getElementById('gcxvSaveBtn').onclick = _gcxSaveEdits;
  document.getElementById('gcxvCancelBtn').onclick = _gcxCancelEdits;

  var searchEl = document.getElementById('gcxvSearch');
  if (searchEl) {
    searchEl.addEventListener('input', function() {
      _gcxHighlightAll(searchEl.value);
    });
    searchEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) _gcxJumpToHit(-1);
        else            _gcxJumpToHit(+1);
      } else if (e.key === 'Escape') {
        if (searchEl.value) { searchEl.value = ''; _gcxHighlightAll(''); }
        else closeGCXViewer();
      }
    });
    setTimeout(function() { searchEl.focus(); }, 0);
  }
  document.addEventListener('keydown', gcxvEscapeHandler);
}

function _gcxToggleEditMode() {
  gcxViewerEditMode = true;
  document.getElementById('gcxvBody').style.display = 'none';
  document.getElementById('gcxvEditArea').style.display = '';
  document.getElementById('gcxvEditBtn').style.display = 'none';
  document.getElementById('gcxvSaveBtn').style.display = '';
  document.getElementById('gcxvCancelBtn').style.display = '';
  document.getElementById('gcxvEditArea').focus();
}

function _gcxCancelEdits() {
  gcxViewerEditMode = false;
  document.getElementById('gcxvEditArea').value = gcxViewerLastText;
  document.getElementById('gcxvBody').style.display = '';
  document.getElementById('gcxvEditArea').style.display = 'none';
  document.getElementById('gcxvEditBtn').style.display = '';
  document.getElementById('gcxvSaveBtn').style.display = 'none';
  document.getElementById('gcxvCancelBtn').style.display = 'none';
}

function _gcxSaveEdits() {
  var edited = document.getElementById('gcxvEditArea').value;
  var origLines = gcxViewerLastText.split('\n').length;
  var newLines  = edited.split('\n').length;
  var structural = (origLines !== newLines);

  // STRATEGY:
  //   1. If line count is unchanged, try the fast line-diff path (value-only edits).
  //   2. If line count CHANGED, or line-diff fails, fall through to the compiler.
  //   3. The compiler reparses the whole text, recomputes lineSkip/markerByte/offsets,
  //      and rebuilds the AST. It supports add/delete/restructure.

  var msg = '';

  if (!structural) {
    // Try line-diff for same-shape edits first (faster, more surgical)
    var result = applyGCXTextEdits(gcxViewerLastText, edited);
    if (result.ok && result.skipped === 0 && result.errors.length === 0) {
      msg = 'Applied ' + result.applied + ' value change(s) (line-diff).';
      if (result.applied === 0) msg = 'No changes detected.';
      if (result.applied > 0) _gcxRefreshAllViews();
      alert(msg);
      _gcxCancelEdits();
      _gcxRenderModal();
      return;
    }
    // line-diff had errors — fall through to compiler
  }

  // Compiler path: full reparse + re-encode
  try {
    if (typeof gcxParseText !== 'function') {
      alert('Compiler not loaded. Cannot apply structural edits.');
      return;
    }
    var parsed = gcxParseText(edited, psxGcx);
    // gcxParseText returns a full GCX-shape object (with original procSectionLen,
    // procTable, trailing, etc preserved). Direct replacement.
    psxGcx = parsed;
    _gcxRefreshAllViews();
    var warnings = parsed._compilerWarnings || [];
    var delta = (newLines - origLines);
    msg = 'Compiler applied edits ' + (delta === 0 ? '(no line changes)' : '(' + (delta > 0 ? '+' + delta : delta) + ' lines)') + '.';
    if (warnings.length > 0) msg += '\n\nWarnings:\n  ' + warnings.slice(0, 5).join('\n  ');
    alert(msg);
    _gcxCancelEdits();
    _gcxRenderModal();
  } catch (err) {
    var detail = (err && err.message) ? err.message : String(err);
    alert('Compiler failed:\n\n' + detail +
          '\n\nNo changes applied. Fix the error and try again.');
  }
}

// Refresh all views after AST changes
function _gcxRefreshAllViews() {
  if (typeof gcxBuildEntities === 'function') {
    var newEnts = gcxBuildEntities(psxGcx);
    if (typeof gclEntities !== 'undefined') {
      gclEntities.length = 0;
      for (var i = 0; i < newEnts.length; i++) gclEntities.push(newEnts[i]);
      if (typeof selGCL !== 'undefined') selGCL = -1;
      if (typeof rebuildGCLVis === 'function') rebuildGCLVis();
      if (typeof updateGCLPanel === 'function') updateGCLPanel();
      if (typeof showGCLProps === 'function') showGCLProps();
    }
  }
}

function closeGCXViewer() {
  var m = document.getElementById('gcxViewerModal');
  if (m) m.remove();
  gcxViewerOpen = false;
  gcxViewerEditMode = false;
  document.removeEventListener('keydown', gcxvEscapeHandler);
}

function gcxvEscapeHandler(e) { if (e.key === 'Escape') closeGCXViewer(); }

// ---------- Search: highlight all matches + jump nav ----------

var _gcxvCurrentHit = -1;   // index into all <span class="gcxv-hit"> elements
var _gcxvLastNeedle = '';

function _gcxClearHighlights() {
  var body = document.getElementById('gcxvBody');
  if (!body) return;
  var hits = body.querySelectorAll('.gcxv-hit, .gcxv-hit-current');
  hits.forEach(function(el) {
    var parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
  var cnt = document.getElementById('gcxvSearchCount');
  if (cnt) cnt.textContent = '';
}

function _gcxHighlightAll(needle) {
  _gcxClearHighlights();
  _gcxvLastNeedle = needle;
  _gcxvCurrentHit = -1;
  if (!needle) return 0;

  var body = document.getElementById('gcxvBody');
  if (!body) return 0;

  // Walk text nodes, find matches, replace text nodes with spans
  var needleLow = needle.toLowerCase();
  var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
  var textNodes = [];
  var node;
  while ((node = walker.nextNode())) {
    // Skip text inside hit spans (shouldn't be any after clear, but safe)
    if (node.parentElement.classList.contains('gcxv-hit') ||
        node.parentElement.classList.contains('gcxv-hit-current')) continue;
    textNodes.push(node);
  }

  var totalHits = 0;
  textNodes.forEach(function(n) {
    var text = n.nodeValue;
    var lower = text.toLowerCase();
    var idx = 0, match;
    var parts = [];
    while ((match = lower.indexOf(needleLow, idx)) >= 0) {
      if (match > idx) parts.push({ text: text.substring(idx, match), hit: false });
      parts.push({ text: text.substr(match, needle.length), hit: true });
      idx = match + needle.length;
      totalHits++;
    }
    if (parts.length === 0) return;
    if (idx < text.length) parts.push({ text: text.substring(idx), hit: false });

    // Replace n with the new sequence of nodes/spans
    var frag = document.createDocumentFragment();
    parts.forEach(function(p) {
      if (p.hit) {
        var sp = document.createElement('span');
        sp.className = 'gcxv-hit';
        sp.textContent = p.text;
        frag.appendChild(sp);
      } else {
        frag.appendChild(document.createTextNode(p.text));
      }
    });
    n.parentNode.replaceChild(frag, n);
  });

  var cnt = document.getElementById('gcxvSearchCount');
  if (cnt) cnt.textContent = totalHits === 0 ? 'no matches' : ('0 / ' + totalHits);
  if (totalHits > 0) _gcxJumpToHit(+1);
  return totalHits;
}

function _gcxJumpToHit(direction) {
  var body = document.getElementById('gcxvBody');
  if (!body) return;
  var hits = body.querySelectorAll('.gcxv-hit, .gcxv-hit-current');
  if (hits.length === 0) return;
  // Reset current's class
  if (_gcxvCurrentHit >= 0 && _gcxvCurrentHit < hits.length) {
    hits[_gcxvCurrentHit].className = 'gcxv-hit';
  }
  _gcxvCurrentHit = (_gcxvCurrentHit + direction + hits.length) % hits.length;
  var cur = hits[_gcxvCurrentHit];
  cur.className = 'gcxv-hit-current';
  // Scroll into view
  var bodyRect = body.getBoundingClientRect();
  var curRect = cur.getBoundingClientRect();
  body.scrollTop = body.scrollTop + (curRect.top - bodyRect.top) - body.clientHeight / 3;
  var cnt = document.getElementById('gcxvSearchCount');
  if (cnt) cnt.textContent = (_gcxvCurrentHit + 1) + ' / ' + hits.length;
}

// Legacy entry point (still wired by edit-area search). For backwards compat,
// route plain Enter through the new highlight system.
function gcxvFindNext(needle) {
  if (gcxViewerEditMode) {
    // textarea search: simple in-text find as before
    var target = document.getElementById('gcxvEditArea');
    if (!target) return;
    var text = target.value;
    if (!needle) return;
    if (needle !== _gcxvLastNeedle) _gcxvLastNeedle = needle;
    var last = target.selectionEnd || 0;
    var idx = text.toLowerCase().indexOf(needle.toLowerCase(), last);
    if (idx < 0) idx = text.toLowerCase().indexOf(needle.toLowerCase(), 0);
    if (idx < 0) return;
    target.focus();
    target.setSelectionRange(idx, idx + needle.length);
    var linesBefore = text.substr(0, idx).split('\n').length;
    target.scrollTop = (linesBefore - 5) * 16;
  } else {
    if (needle !== _gcxvLastNeedle) _gcxHighlightAll(needle);
    else _gcxJumpToHit(+1);
  }
}

function gcxvCopyToClipboard() {
  var text = gcxViewerEditMode ? document.getElementById('gcxvEditArea').value : gcxViewerLastText;
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function() { _gcxvCopyFallback(text); });
  else _gcxvCopyFallback(text);
}
function _gcxvCopyFallback(text) {
  var ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

// ---------- Inject ViewGCX button into the GCX bar ----------

(function addViewGCXButton() {
  function add() {
    var bar = document.getElementById('psxButtonBar');
    if (!bar) { setTimeout(add, 200); return; }
    if (document.getElementById('psxViewBtn')) return;

    var btn = document.createElement('button');
    btn.id = 'psxViewBtn';
    btn.className = 'btn';
    btn.textContent = 'ViewGCX';
    btn.title = 'Open color-coded view of the loaded .gcx (read+edit)';
    btn.style.color = '#88ddff';
    btn.onclick = openGCXViewer;
    btn.disabled = (typeof editorMode === 'undefined' || editorMode !== 'psx');

    var saveBtn = document.getElementById('psxSaveBtn');
    if (saveBtn) bar.insertBefore(btn, saveBtn);
    else bar.appendChild(btn);

    var orig = window.psxUpdateModeUI;
    if (typeof orig === 'function') {
      window.psxUpdateModeUI = function() {
        orig.apply(this, arguments);
        var b = document.getElementById('psxViewBtn');
        if (b) b.disabled = (editorMode !== 'psx');
      };
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
})();

// ============================================================
