// ═══════════════════════════════════════════════════════════════════════════
// FILE: 28_gcx_text_compiler.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCX TEXT COMPILER  —  Session 1: AST-guided round-trip
// ============================================================
// Parses the text produced by buildGCXTextHTML (after stripping HTML to
// plain text) into a new AST that gcxEncodeGCX can re-emit byte-identically.
//
// Approach:
//   - Lexer turns text into tokens (IDENT, NUMBER, HEX, OPTION, REF, ...)
//   - Parser walks tokens IN PARALLEL with the original AST. The original
//     provides the BYTE-LEVEL TYPE for each value, so we can reconstruct
//     things like SHORT vs BYTE from a bare integer token. The text provides
//     the (possibly edited) VALUE.
//
// Same-structure edits are fully supported. Structural changes (adding/
// deleting commands, reordering procs) are rejected with a clear message —
// that's Session 2's deliverable.

(function(global) {

  var OP_NAME_TO_CODE = {
    'END':0,'NEG':1,'NOT':2,'CPL':3,
    '+':4,'-':5,'*':6,'/':7,'%':8,
    '==':9,'!=':10,'<':11,'<=':12,'>':13,'>=':14,
    '|':15,'&':16,'^':17,'||':18,'&&':19,'=':20
  };
  var MULTI_CHAR_OPS = ['==','!=','<=','>=','||','&&'];
  var SINGLE_CHAR_OPS = '+-*/%<>|&^=';

  // ---------- Lexer ----------

  function gcxLexText(text) {
    var toks = [];
    var i = 0, n = text.length;
    var line = 1, col = 1;
    var insideExpr = 0;

    function isAlpha(c) { return /[a-zA-Z_]/.test(c); }
    function isDigit(c) { return /[0-9]/.test(c); }
    function isAlnum(c) { return /[a-zA-Z0-9_]/.test(c); }

    function push(kind, txt) { toks.push({ kind: kind, text: txt, line: line, col: col }); }

    while (i < n) {
      var c = text[i];
      if (c === '\n') { i++; line++; col = 1; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; col++; continue; }
      if (c === '#') { while (i < n && text[i] !== '\n') i++; continue; }
      if (c === '/' && text[i+1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
      if (c === '/' && text[i+1] === '*') {
        i += 2; col += 2;
        while (i+1 < n && !(text[i] === '*' && text[i+1] === '/')) {
          if (text[i] === '\n') { line++; col = 1; } else col++;
          i++;
        }
        if (i+1 < n) { i += 2; col += 2; }
        continue;
      }
      if (c === '{') { push('LBRACE','{'); i++; col++; continue; }
      if (c === '}') { push('RBRACE','}'); i++; col++; continue; }
      if (c === '[') { push('LBRACKET','['); i++; col++; insideExpr++; continue; }
      if (c === ']') { push('RBRACKET',']'); i++; col++; insideExpr = Math.max(0, insideExpr-1); continue; }
      if (c === '"') {
        var s = i; i++; col++;
        while (i < n && text[i] !== '"') {
          if (text[i] === '\\' && i+1 < n) { i += 2; col += 2; }
          else { i++; col++; }
        }
        if (i < n) { i++; col++; }
        push('STRING', text.substring(s, i));
        continue;
      }
      if (c === "'") {
        var s2 = i; i++; col++;
        while (i < n && text[i] !== "'") { i++; col++; }
        if (i < n) { i++; col++; }
        push('CHAR', text.substring(s2, i));
        continue;
      }
      // Compound refs
      var rest = text.substring(i);
      var m;
      if ((m = /^\$[0-9a-fA-F]:0x[0-9a-fA-F]+/.exec(rest))) { push('REF', m[0]); i += m[0].length; col += m[0].length; continue; }
      if ((m = /^[a-zA-Z_][a-zA-Z_0-9]*:0x[0-9a-fA-F]+/.exec(rest))) { push('REF', m[0]); i += m[0].length; col += m[0].length; continue; }
      if ((m = /^t:[0-9a-fA-F]+/.exec(rest))) { push('REF', m[0]); i += m[0].length; col += m[0].length; continue; }
      if ((m = /^arg\d+/.exec(rest))) { push('REF', m[0]); i += m[0].length; col += m[0].length; continue; }

      // Inside expressions: operators
      if (insideExpr > 0) {
        var consumed = false;
        for (var mi = 0; mi < MULTI_CHAR_OPS.length; mi++) {
          var mop = MULTI_CHAR_OPS[mi];
          if (text.substr(i, mop.length) === mop) {
            push('OP_SYMBOL', mop); i += mop.length; col += mop.length; consumed = true; break;
          }
        }
        if (consumed) continue;
        if (SINGLE_CHAR_OPS.indexOf(c) >= 0) {
          push('OP_SYMBOL', c); i++; col++; continue;
        }
      }
      // Option marker -X (outside expressions)
      if (c === '-' && i+1 < n && isAlpha(text[i+1]) && (i+2 >= n || !isAlnum(text[i+2]))) {
        push('OPTION', '-' + text[i+1]); i += 2; col += 2; continue;
      }
      // Negative number
      if (c === '-' && i+1 < n && isDigit(text[i+1])) {
        m = /^-\d+/.exec(rest); push('NUMBER', m[0]); i += m[0].length; col += m[0].length; continue;
      }
      // Positive numbers
      if (isDigit(c)) {
        if ((m = /^0x[0-9a-fA-F]+/.exec(rest))) { push('HEX', m[0]); i += m[0].length; col += m[0].length; continue; }
        m = /^\d+/.exec(rest); push('NUMBER', m[0]); i += m[0].length; col += m[0].length; continue;
      }
      // Identifier
      if (isAlpha(c) || c === '_') {
        m = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(rest); push('IDENT', m[0]); i += m[0].length; col += m[0].length; continue;
      }
      throw new Error('gcxLexText: unrecognized character ' + JSON.stringify(c) + ' at line ' + line + ' col ' + col);
    }
    push('EOF', '');
    return toks;
  }

  // ---------- Tag constants ----------

  var T_END = 0x00, T_SHORT = 0x01, T_BYTE = 0x02, T_CHAR = 0x03, T_BOOL = 0x04;
  var T_STRID = 0x06, T_STRING = 0x07, T_PROCID = 0x08, T_INT = 0x09, T_SYMBOL = 0x0a;
  var T_VAR = 0x10, T_ARRAY = 0x20, T_EXPR = 0x30;
  var T_ARG = 0x40, T_OPTION = 0x50, T_COMMAND = 0x60, T_PROC = 0x70;

  // ---------- Value reconstruction ----------

  function _parsePayloadFromText(tok, tag) {
    var text = tok.text;
    try {
      if (tag === T_SHORT) return parseInt(text, 10) | 0;
      if (tag === T_BYTE || tag === T_ARRAY) {
        if (tok.kind === 'REF' && text.indexOf('arg') === 0) return parseInt(text.substring(3), 10) & 0xFF;
        return parseInt(text, 10) & 0xFF;
      }
      if (tag === T_CHAR) {
        if (tok.kind === 'CHAR' && text.length >= 3) return text.charCodeAt(1);
        if (tok.kind === 'HEX') return parseInt(text, 16) & 0xFF;
        return parseInt(text, 10) & 0xFF;
      }
      if (tag === T_BOOL) return (text === 'true') ? 1 : 0;
      if (tag === T_INT) return (text.indexOf('0x') === 0 ? parseInt(text, 16) : parseInt(text, 10)) >>> 0;
      if (tag === T_SYMBOL) {
        if (text.indexOf('t:') === 0) return parseInt(text.substring(2), 16) >>> 0;
        return parseInt(text, 16) >>> 0;
      }
      if (tag === T_STRID || tag === T_PROCID) {
        var mm = /0x([0-9a-fA-F]+)/.exec(text);
        if (mm) return parseInt(mm[1], 16) & 0xFFFF;
        return null;
      }
      if (tag === T_STRING) {
        if (!(text.charAt(0) === '"' && text.charAt(text.length-1) === '"')) return null;
        var inner = text.substring(1, text.length - 1);
        var buf = [];
        var j = 0;
        while (j < inner.length) {
          if (inner.charAt(j) === '\\' && j+1 < inner.length && inner.charAt(j+1) === 'x') {
            buf.push(parseInt(inner.substr(j+2, 2), 16) & 0xFF);
            j += 4;
          } else {
            buf.push(inner.charCodeAt(j) & 0xFF);
            j++;
          }
        }
        buf.push(0);
        return new Uint8Array(buf);
      }
      if ((tag & 0xF0) === T_VAR) {
        var vm = /^\$[0-9a-fA-F]:0x([0-9a-fA-F]+)/.exec(text);
        if (vm) return { packed: parseInt(vm[1], 16) & 0xFFFFFF };
        return null;
      }
    } catch (e) { return null; }
    return null;
  }

  function _buildValueFromTokenAndOrig(tok, origV, warnings) {
    var newPayload = _parsePayloadFromText(tok, origV.tag);
    if (newPayload === null) {
      warnings.push('Line ' + tok.line + ': token ' + JSON.stringify(tok.text) + ' unparseable as ' + origV.kind + '; kept original');
      newPayload = origV.payload;
    }
    return {
      tag: origV.tag, raw: new Uint8Array(0), kind: origV.kind,
      payload: newPayload, fileOffset: 0
    };
  }

  // ---------- Templates for structural edits ----------
  // Build a cmdId → template-command map by walking origGcx. We pick the
  // command instance with the MOST values for each cmdId — that gives the
  // richest type schema for inserted commands.
  function _buildCmdTemplates(origGcx) {
    var templates = {};
    function walk(blocks) {
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.tag === T_COMMAND) {
          var cid = b.payload.cmdId;
          if (!templates[cid] || b.payload.values.length > templates[cid].payload.values.length) {
            templates[cid] = b;
          }
          // Recurse into ARGs inside this command
          for (var j = 0; j < b.payload.values.length; j++) {
            var v = b.payload.values[j];
            if (v.tag === T_ARG && v.payload.innerBlocks) walk(v.payload.innerBlocks);
          }
        } else if (b.tag === T_ARG && b.payload.innerBlocks) {
          walk(b.payload.innerBlocks);
        }
      }
    }
    origGcx.procs.forEach(function(p) { walk(p.blocks); });
    walk(origGcx.scriptBody.blocks);
    return templates;
  }

  // Find the cmdId for a name token by checking templates. (We could also use
  // global.gcxCmdNames if exposed, but templates are guaranteed correct.)
  function _cmdIdFromName(name, templates) {
    if (!global.gcxCmdNames) {
      // Fallback: parse "cmd_0xNNNN" form
      var m = /^cmd_0x([0-9a-fA-F]+)$/.exec(name);
      if (m) return parseInt(m[1], 16);
      return null;
    }
    for (var id in global.gcxCmdNames) {
      if (global.gcxCmdNames[id] === name) {
        var idn = parseInt(id);
        // Prefer cmdIds we actually have templates for
        if (templates[idn]) return idn;
      }
    }
    // Maybe an unknown command, parse hex form
    var hm = /^cmd_0x([0-9a-fA-F]+)$/.exec(name);
    if (hm) return parseInt(hm[1], 16);
    return null;
  }

  // Check if a peek'd text token COULD be the same block-kind as origBlk
  // (used for alignment after a drift).
  function _peekMatchesOrigBlock(token, origBlk) {
    if (!origBlk || !token) return false;
    if (token.kind === 'IDENT' && token.text === 'end')     return origBlk.tag === T_END;
    if (token.kind === 'IDENT' && token.text === 'expr')    return origBlk.tag === T_EXPR;
    if (token.kind === 'LBRACE')                            return origBlk.tag === T_ARG;
    if (token.kind === 'IDENT' && token.text === 'call')    return origBlk.tag === T_PROC;
    if (token.kind === 'IDENT' && origBlk.tag === T_COMMAND) {
      var n = global.gcxCmdNames && global.gcxCmdNames[origBlk.payload.cmdId];
      var hexName = 'cmd_0x' + origBlk.payload.cmdId.toString(16).padStart(4,'0');
      return token.text === n || token.text === hexName;
    }
    return false;
  }

  // Infer a value's tag (T_*) from its token form alone — used by the freeform
  // parser when no template values are available or when text has more tokens
  // than the template covers (e.g., a chara line with options not in template).
  function _inferTagFromToken(token) {
    if (token.kind === 'STRING') return T_STRING;
    if (token.kind === 'CHAR')   return T_CHAR;
    if (token.kind === 'OPTION') return T_OPTION;
    if (token.kind === 'NUMBER') return T_SHORT;  // most common; explicit cast via 0xNN can override
    if (token.kind === 'HEX') {
      var v = parseInt(token.text, 16);
      if (v > 0xFFFF) return T_INT;
      return T_SHORT;  // small hex defaults to SHORT (chara strid, etc.)
    }
    if (token.kind === 'IDENT') {
      if (token.text === 'true' || token.text === 'false') return T_BOOL;
      return null;
    }
    if (token.kind === 'REF') {
      // Distinguish by prefix
      if (/^\$[0-9a-fA-F]:/.test(token.text)) {
        // $N:0xNNNNNN → VAR with sub-type N
        var subType = parseInt(token.text.charAt(1), 16) & 0x0F;
        return T_VAR | subType;
      }
      if (/^proc:/.test(token.text))   return T_PROCID;
      if (/^t:/.test(token.text))      return T_SYMBOL;
      if (/^strid:/.test(token.text))  return T_STRID;
      if (/^arg\d+$/.test(token.text)) return T_ARRAY;
      // UPPER:0xNNNN form (e.g. WATCHER:0x6e9a) → STRID
      if (/^[A-Z][A-Z_0-9]*:0x/.test(token.text)) return T_STRID;
      return null;
    }
    if (token.kind === 'LBRACKET') return T_EXPR;
    return null;
  }

  // Build a payload from a token using the inferred tag.
  function _buildValueFromTokenInferred(token, warnings) {
    var tag = _inferTagFromToken(token);
    if (tag === null) {
      warnings.push('Line ' + token.line + ': cannot infer type for token ' + JSON.stringify(token.text));
      return null;
    }
    var payload = _parsePayloadFromText(token, tag);
    if (payload === null) {
      warnings.push('Line ' + token.line + ': inferred tag 0x' + tag.toString(16) + ' but payload unparseable');
      return null;
    }
    var kind;
    if (tag === T_SHORT) kind = 'short';
    else if (tag === T_INT) kind = 'int';
    else if (tag === T_CHAR) kind = 'char';
    else if (tag === T_BOOL) kind = 'bool';
    else if (tag === T_STRING) kind = 'string';
    else if (tag === T_STRID) kind = 'strid';
    else if (tag === T_PROCID) kind = 'procid';
    else if (tag === T_SYMBOL) kind = 'symbol';
    else if (tag === T_ARRAY) kind = 'array';
    else if ((tag & 0xF0) === T_VAR) kind = 'var';
    else kind = 'value';
    return { tag: tag, raw: new Uint8Array(0), kind: kind, payload: payload, fileOffset: 0 };
  }

  // Detect if a token at this position marks the START of a NEW block
  // (and therefore END of the current command).
  function _tokenStartsNewBlock(token, templates) {
    if (!token) return true;
    if (token.kind === 'EOF') return true;
    if (token.kind === 'RBRACE') return true;
    if (token.kind === 'LBRACE') return false;  // LBRACE belongs to current cmd as ARG
    if (token.kind === 'IDENT') {
      if (token.text === 'end' || token.text === 'expr' || token.text === 'call' || token.text === 'proc' || token.text === 'script') return true;
      // Check if it's a command name (in templates registry)
      if (templates) {
        for (var id in templates) {
          if (global.gcxCmdNames && global.gcxCmdNames[id] === token.text) return true;
        }
        if (/^cmd_0x[0-9a-fA-F]+$/.test(token.text)) return true;
      }
    }
    return false;
  }
  // Formulas derived from WantedThing's compiler. Used for newly-inserted blocks
  // (the original parallel-walk preserves lineSkip from refs for unchanged ones).
  var GCX_IF_CMD_ID = 0x0d86;

  function _gcxComputeLineSkip(values, cmdId) {
    if (typeof gcxEncodeValue !== 'function') return 1;
    var preOptBytes = 0, sawOption = false, nonOptArgCount = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v.tag === T_OPTION) { sawOption = true; break; }
      if (v.tag === T_END)    break;
      preOptBytes += gcxEncodeValue(v).length;
      nonOptArgCount++;
    }
    var skip = preOptBytes + 1;
    if (cmdId === GCX_IF_CMD_ID && !sawOption && nonOptArgCount === 2) skip += 1;
    return skip & 0xFF;
  }

  function _gcxComputeMarkerByte(values, optionIdx, cmdId, refOption) {
    if (refOption && refOption.payload && refOption.payload.markerByte === 0) return 0;
    if (typeof gcxEncodeValue !== 'function') return 1;
    var argBytes = 0, isLast = true, optArgCount = 0;
    for (var i = optionIdx + 1; i < values.length; i++) {
      var v = values[i];
      if (v.tag === T_OPTION) { isLast = false; break; }
      if (v.tag === T_END)    break;
      argBytes += gcxEncodeValue(v).length;
      optArgCount++;
    }
    var marker = argBytes + 1;
    if (cmdId === GCX_IF_CMD_ID && isLast) {
      var optCh = String.fromCharCode(values[optionIdx].payload.optChar);
      if ((optCh === 'i' && optArgCount === 2) || (optCh === 'e' && optArgCount === 1)) marker += 1;
    }
    return marker & 0xFF;
  }

  // After parsing, walk the result and (a) recompute lineSkip for any command
  // whose flag is set, (b) recompute markerByte for OPTIONs in such commands.
  function _gcxRecomputeSkipsInPlace(blocks) {
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.tag === T_COMMAND) {
        if (b._needsRecompute) {
          b.payload.lineSkip = _gcxComputeLineSkip(b.payload.values, b.payload.cmdId);
          for (var j = 0; j < b.payload.values.length; j++) {
            var v = b.payload.values[j];
            if (v.tag === T_OPTION) {
              v.payload.markerByte = _gcxComputeMarkerByte(b.payload.values, j, b.payload.cmdId, v._refOpt || null);
            }
          }
          delete b._needsRecompute;
        }
        // Recurse into ARGs inside this command
        for (var k = 0; k < b.payload.values.length; k++) {
          var vv = b.payload.values[k];
          if (vv.tag === T_ARG && vv.payload.innerBlocks) _gcxRecomputeSkipsInPlace(vv.payload.innerBlocks);
        }
      } else if (b.tag === T_ARG && b.payload.innerBlocks) {
        _gcxRecomputeSkipsInPlace(b.payload.innerBlocks);
      }
    }
  }

  // ---------- Freeform block parser (for inserted blocks) ----------
  // Parses a block from text alone using TYPE INFERENCE per token. Used when
  // text adds blocks not in the original AST. Supports arbitrary value
  // sequences (including options in any order/count) and EXPR/ARG children.
  function _parseBlockFreeform(ctx, templates) {
    var t = ctx.peek();
    if (t.kind === 'IDENT' && t.text === 'end') {
      ctx.consume();
      return { tag: T_END, raw: new Uint8Array(0), fileOffset: 0, headerSize: 1, payload: null };
    }
    if (t.kind === 'IDENT' && t.text === 'expr') {
      throw new Error('gcxParseText: line ' + t.line + ': standalone `expr` insertion not supported yet');
    }
    if (t.kind === 'LBRACE') {
      throw new Error('gcxParseText: line ' + t.line + ': standalone `{...}` ARG insertion not supported');
    }
    if (t.kind === 'IDENT' && t.text === 'call') {
      throw new Error('gcxParseText: line ' + t.line + ': `call` block insertion not supported yet');
    }
    if (t.kind === 'IDENT') {
      var name = t.text;
      var cmdId = _cmdIdFromName(name, templates);
      if (cmdId === null || cmdId === undefined) {
        throw new Error('gcxParseText: line ' + t.line + ': unknown command name `' + name + '`');
      }
      ctx.consume();
      var values = _parseCommandValuesFreeform(ctx, cmdId, templates);
      var cmd = { tag: T_COMMAND, raw: new Uint8Array(0), fileOffset: 0, headerSize: 3,
                  payload: { cmdId: cmdId, lineSkip: 0,  // recomputed below
                             values: values, cmdBytes: new Uint8Array(0) },
                  _needsRecompute: true };
      return cmd;
    }
    throw new Error('gcxParseText: line ' + t.line + ': unexpected token ' + t.kind);
  }

  // Parse command values via token-driven type inference. Walks tokens until
  // we hit a "new block" boundary (next command, end, expr, call, RBRACE, EOF).
  function _parseCommandValuesFreeform(ctx, cmdId, templates) {
    var values = [];
    while (true) {
      var t = ctx.peek();
      if (_tokenStartsNewBlock(t, templates)) break;
      if (t.kind === 'LBRACE') {
        // ARG block — must have a template to know inner structure
        // For freeform: parse children using full freeform recursion
        ctx.consume();  // LBRACE
        var inner = _parseBlockListFreeform(ctx, templates);
        ctx.expect('RBRACE');
        values.push({ tag: T_ARG, raw: new Uint8Array(0), kind: 'arg',
                      payload: { innerBlocks: inner, argBytes: new Uint8Array(0) }, fileOffset: 0 });
        continue;
      }
      if (t.kind === 'LBRACKET') {
        // EXPR block — parse via expression bracket parser
        var items = _parseExprBracketsFreeform(ctx);
        values.push({ tag: T_EXPR, raw: new Uint8Array(0), kind: 'expr',
                      payload: { exprItems: items, exprBytes: new Uint8Array(0) }, fileOffset: 0 });
        continue;
      }
      if (t.kind === 'OPTION') {
        ctx.consume();
        values.push({ tag: T_OPTION, raw: new Uint8Array(0), kind: 'option',
                      payload: { optChar: t.text.charCodeAt(1), markerByte: 4 },
                      fileOffset: 0 });  // markerByte recomputed by _gcxRecomputeSkipsInPlace
        continue;
      }
      // Scalar value via type inference
      var v = _buildValueFromTokenInferred(t, ctx.warnings);
      if (!v) {
        // Couldn't infer — consume and skip with warning
        ctx.warnings.push('Line ' + t.line + ': skipping unparseable token ' + JSON.stringify(t.text));
        ctx.consume();
        continue;
      }
      ctx.consume();
      values.push(v);
    }
    // Append END
    values.push({ tag: T_END, raw: new Uint8Array(0), kind: 'end', payload: null, fileOffset: 0 });
    return values;
  }

  function _parseBlockListFreeform(ctx, templates) {
    var result = [];
    while (true) {
      var t = ctx.peek();
      if (t.kind === 'RBRACE' || t.kind === 'EOF') break;
      result.push(_parseBlockFreeform(ctx, templates));
    }
    return result;
  }

  function _parseExprBracketsFreeform(ctx) {
    ctx.expect('LBRACKET');
    var items = [];
    while (true) {
      var t = ctx.peek();
      if (t.kind === 'RBRACKET') { ctx.consume(); break; }
      if (t.kind === 'OP_SYMBOL' || (t.kind === 'IDENT' && OP_NAME_TO_CODE[t.text] !== undefined)) {
        ctx.consume();
        var code = OP_NAME_TO_CODE[t.text];
        if (code === undefined) throw new Error('gcxParseText: line ' + t.line + ': unknown operator ' + t.text);
        items.push({ kind: 'op', opCode: code, origBytePos: 0 });
        continue;
      }
      var v = _buildValueFromTokenInferred(t, ctx.warnings);
      if (v) { ctx.consume(); items.push({ kind: 'value', value: v, origBytePos: 0 }); continue; }
      throw new Error('gcxParseText: line ' + t.line + ': unexpected token in expr ' + t.kind);
    }
    return items;
  }

  // ---------- Parser ----------

  function ParseCtx(toks) { this.toks = toks; this.pos = 0; this.warnings = []; }
  ParseCtx.prototype.peek = function(off) {
    var p = this.pos + (off || 0);
    return p < this.toks.length ? this.toks[p] : this.toks[this.toks.length - 1];
  };
  ParseCtx.prototype.consume = function() { var t = this.toks[this.pos]; this.pos++; return t; };
  ParseCtx.prototype.expect = function(kind, txt) {
    var t = this.consume();
    if (t.kind !== kind || (txt !== undefined && t.text !== txt)) {
      throw new Error('gcxParseText: expected ' + kind + (txt !== undefined ? ' ' + JSON.stringify(txt) : '') +
                      ', got ' + t.kind + ' ' + JSON.stringify(t.text) + ' at line ' + t.line);
    }
    return t;
  };

  function _parseExprBrackets(ctx, origItems) {
    ctx.expect('LBRACKET');
    var newItems = [];
    var oi = 0;
    while (true) {
      var t = ctx.peek();
      if (t.kind === 'RBRACKET') { ctx.consume(); break; }
      if (oi >= origItems.length) throw new Error('gcxParseText: more expr items than original at line ' + t.line);
      var oit = origItems[oi];
      if (oit.kind === 'op') {
        if (t.kind === 'OP_SYMBOL' || t.kind === 'IDENT') {
          ctx.consume();
          var code = OP_NAME_TO_CODE[t.text];
          if (code === undefined) throw new Error('gcxParseText: unknown operator ' + t.text + ' at line ' + t.line);
          newItems.push({ kind: 'op', opCode: code, origBytePos: 0 });
        } else throw new Error('gcxParseText: expected operator at line ' + t.line + ', got ' + t.kind);
        oi++; continue;
      }
      if (t.kind === 'NUMBER' || t.kind === 'HEX' || t.kind === 'STRING' || t.kind === 'CHAR' || t.kind === 'REF' || t.kind === 'IDENT') {
        ctx.consume();
        var nv = _buildValueFromTokenAndOrig(t, oit.value, ctx.warnings);
        newItems.push({ kind: 'value', value: nv, origBytePos: 0 });
        oi++; continue;
      }
      throw new Error('gcxParseText: unexpected token in expression at line ' + t.line + ': ' + t.kind);
    }
    if (oi !== origItems.length) throw new Error('gcxParseText: expression had ' + oi + ' items but original had ' + origItems.length);
    return newItems;
  }

  function _parseCommandValues(ctx, origValues) {
    var result = [];
    var oi = 0;
    while (oi < origValues.length) {
      var ov = origValues[oi];
      if (ov.tag === T_END) {
        result.push({ tag: T_END, raw: new Uint8Array(0), kind: 'end', payload: null, fileOffset: 0 });
        oi++; continue;
      }
      if (ov.tag === T_OPTION) {
        var t = ctx.peek();
        if (t.kind !== 'OPTION') throw new Error('gcxParseText: expected OPTION at line ' + t.line + ', got ' + t.kind + ' ' + JSON.stringify(t.text));
        ctx.consume();
        var oc = t.text.charCodeAt(1);
        var mb = 0;
        if (ov.payload && typeof ov.payload === 'object') {
          if (ov.payload.markerByte !== undefined) mb = ov.payload.markerByte;
          else if (ov.payload.marker_byte !== undefined) mb = ov.payload.marker_byte;
        }
        result.push({ tag: T_OPTION, raw: new Uint8Array(0), kind: 'option',
                      payload: { optChar: oc, markerByte: mb }, fileOffset: 0 });
        oi++; continue;
      }
      if (ov.tag === T_ARG) {
        ctx.expect('LBRACE');
        var newInner = _parseBlockList(ctx, ov.payload.innerBlocks);
        ctx.expect('RBRACE');
        result.push({ tag: T_ARG, raw: new Uint8Array(0), kind: 'arg',
                      payload: { innerBlocks: newInner, argBytes: new Uint8Array(0) }, fileOffset: 0 });
        oi++; continue;
      }
      if (ov.tag === T_EXPR) {
        var ei = _parseExprBrackets(ctx, ov.payload.exprItems);
        result.push({ tag: T_EXPR, raw: new Uint8Array(0), kind: 'expr',
                      payload: { exprItems: ei, exprBytes: new Uint8Array(0) }, fileOffset: 0 });
        oi++; continue;
      }
      var tv = ctx.peek();
      if (tv.kind === 'NUMBER' || tv.kind === 'HEX' || tv.kind === 'STRING' || tv.kind === 'CHAR' || tv.kind === 'REF' || tv.kind === 'IDENT') {
        ctx.consume();
        result.push(_buildValueFromTokenAndOrig(tv, ov, ctx.warnings));
        oi++; continue;
      }
      throw new Error('gcxParseText: unexpected token at line ' + tv.line + ': ' + tv.kind + ' ' + JSON.stringify(tv.text) + ' (expected ' + ov.kind + ' at orig_values[' + oi + '])');
    }
    return result;
  }

  function _parseBlock(ctx, origBlk) {
    var t = ctx.peek();
    if (t.kind === 'IDENT' && t.text === 'end') {
      if (origBlk.tag !== T_END) throw new Error('gcxParseText: line ' + t.line + ': text `end` but AST expects tag 0x' + origBlk.tag.toString(16));
      ctx.consume();
      return { tag: T_END, raw: new Uint8Array(0), fileOffset: 0, headerSize: 1, payload: null };
    }
    if (t.kind === 'IDENT' && t.text === 'expr') {
      ctx.consume();
      if (origBlk.tag !== T_EXPR) throw new Error('gcxParseText: line ' + t.line + ': text `expr` but AST expects tag 0x' + origBlk.tag.toString(16));
      var ni = _parseExprBrackets(ctx, origBlk.payload.exprItems);
      return { tag: T_EXPR, raw: new Uint8Array(0), fileOffset: 0, headerSize: 2,
               payload: { exprItems: ni, exprBytes: new Uint8Array(0) } };
    }
    if (t.kind === 'LBRACE') {
      if (origBlk.tag !== T_ARG) throw new Error('gcxParseText: line ' + t.line + ': text `{` but AST expects tag 0x' + origBlk.tag.toString(16));
      ctx.consume();
      var newInner = _parseBlockList(ctx, origBlk.payload.innerBlocks);
      ctx.expect('RBRACE');
      return { tag: T_ARG, raw: new Uint8Array(0), fileOffset: 0, headerSize: 3,
               payload: { innerBlocks: newInner, argBytes: new Uint8Array(0) } };
    }
    if (t.kind === 'IDENT' && t.text === 'call') {
      if (origBlk.tag !== T_PROC) throw new Error('gcxParseText: line ' + t.line + ': text `call` but AST expects tag 0x' + origBlk.tag.toString(16));
      ctx.consume();
      ctx.expect('REF');
      var origVals = origBlk.payload.values || [];
      var newVals = [];
      for (var pvi = 0; pvi < origVals.length; pvi++) {
        var ov = origVals[pvi];
        if (ov.tag === T_END) {
          newVals.push({ tag: T_END, raw: new Uint8Array(0), kind: 'end', payload: null, fileOffset: 0 });
          continue;
        }
        var tp = ctx.peek();
        if (tp.kind === 'RBRACE' || tp.kind === 'EOF' || tp.kind === 'IDENT') {
          newVals.push({ tag: T_END, raw: new Uint8Array(0), kind: 'end', payload: null, fileOffset: 0 });
          continue;
        }
        ctx.consume();
        newVals.push(_buildValueFromTokenAndOrig(tp, ov, ctx.warnings));
      }
      return { tag: T_PROC, raw: new Uint8Array(0), fileOffset: 0, headerSize: 2,
               payload: { procId: origBlk.payload.procId, values: newVals, procBytes: new Uint8Array(0) } };
    }
    if (t.kind === 'IDENT') {
      if (origBlk.tag !== T_COMMAND) throw new Error('gcxParseText: line ' + t.line + ': text IDENT but AST expects tag 0x' + origBlk.tag.toString(16));
      ctx.consume();
      var nv = _parseCommandValues(ctx, origBlk.payload.values);
      return { tag: T_COMMAND, raw: new Uint8Array(0), fileOffset: 0, headerSize: 3,
               payload: { cmdId: origBlk.payload.cmdId, lineSkip: origBlk.payload.lineSkip,
                          values: nv, cmdBytes: new Uint8Array(0) } };
    }
    throw new Error('gcxParseText: line ' + t.line + ': unexpected token ' + t.kind + ' ' + JSON.stringify(t.text));
  }

  function _parseBlockList(ctx, origBlocks) {
    var result = [];
    var i = 0;
    var templates = ctx.cmdTemplates || {};
    while (true) {
      var t = ctx.peek();
      if (t.kind === 'RBRACE' || t.kind === 'EOF') break;

      // Append-at-end: text has more blocks than ref. Use template-driven parse.
      if (i >= origBlocks.length) {
        result.push(_parseBlockFreeform(ctx, templates));
        continue;
      }

      // Normal path: parallel walk against ref.
      // We do NOT try mid-list alignment — that requires real diff (text-block
      // identity isn't unique enough: two charas at different positions look
      // the same to the parser). For safety, we throw on mid-list mismatches.
      if (!_peekMatchesOrigBlock(t, origBlocks[i])) {
        // Special case: text might be deleting blocks from the END. Check if
        // remaining text matches a SUFFIX of origBlocks (i.e., text skipped
        // some refs to get to a later one). Allow this iff: the mismatch is
        // because text moved AHEAD, never BACK.
        var foundAt = -1;
        for (var k = i + 1; k < origBlocks.length; k++) {
          if (_peekMatchesOrigBlock(t, origBlocks[k])) { foundAt = k; break; }
        }
        if (foundAt >= 0) {
          // Deletion of origBlocks[i..foundAt-1]. Accept it.
          i = foundAt;
          result.push(_parseBlock(ctx, origBlocks[i]));
          i++;
          continue;
        }
        // No match anywhere ahead — text has an insertion in the middle.
        // This is the dangerous case (alignment ambiguity). Refuse cleanly.
        throw new Error('gcxParseText: line ' + t.line + ': cannot align text token `' +
          t.text + '` with original AST. Insertions in the MIDDLE of a block list ' +
          'aren\'t yet supported (only appending at the END works reliably). ' +
          'Tip: paste new lines just before the closing `}` of the block.');
      }
      result.push(_parseBlock(ctx, origBlocks[i]));
      i++;
    }
    // Any remaining origBlocks are deletions — silently dropped.
    return result;
  }

  function gcxParseText(text, origGcx) {
    var toks = gcxLexText(text);
    var ctx = new ParseCtx(toks);
    // Attach template registry to ctx so _parseBlockList can use it for inserts
    ctx.cmdTemplates = _buildCmdTemplates(origGcx);
    var sortedProcs = origGcx.procs.slice().sort(function(a, b) { return a.fileOffset - b.fileOffset; });
    var newProcs = [];

    for (var pi = 0; pi < sortedProcs.length; pi++) {
      var op = sortedProcs[pi];
      var kw = ctx.expect('IDENT');
      if (kw.text !== 'proc') throw new Error('gcxParseText: line ' + kw.line + ': expected `proc`, got ' + JSON.stringify(kw.text));
      var hex = ctx.expect('HEX');
      var procIdHex = parseInt(hex.text, 16) & 0xFFFF;
      if (procIdHex !== op.tableEntry.procId) {
        throw new Error('gcxParseText: line ' + kw.line + ': proc id mismatch (0x' + procIdHex.toString(16) +
                        ' vs original 0x' + op.tableEntry.procId.toString(16) + ')');
      }
      ctx.expect('LBRACE');
      var nb = _parseBlockList(ctx, op.blocks);
      ctx.expect('RBRACE');
      newProcs.push({
        tableEntry: { procId: op.tableEntry.procId, offset: op.tableEntry.offset },
        preamble: op.preamble, blocks: nb, raw: op.raw, fileOffset: op.fileOffset
      });
    }
    var sw = ctx.expect('IDENT');
    if (sw.text !== 'script') throw new Error('gcxParseText: line ' + sw.line + ': expected `script`');
    ctx.expect('LBRACE');
    var nsb = _parseBlockList(ctx, origGcx.scriptBody.blocks);
    ctx.expect('RBRACE');
    var newScriptBody = {
      tableEntry: origGcx.scriptBody.tableEntry,
      preamble: origGcx.scriptBody.preamble,
      blocks: nsb, raw: origGcx.scriptBody.raw,
      fileOffset: origGcx.scriptBody.fileOffset
    };

    // After parse: recompute lineSkip/markerByte for any block that was newly
    // inserted (marked with _needsRecompute by the freeform parser).
    newProcs.forEach(function(p) { _gcxRecomputeSkipsInPlace(p.blocks); });
    _gcxRecomputeSkipsInPlace(newScriptBody.blocks);

    var result = {
      raw: origGcx.raw,
      procSectionLen: origGcx.procSectionLen,
      procTable: origGcx.procTable.slice(),
      procTableEnd: origGcx.procTableEnd,
      procBodyOffset: origGcx.procBodyOffset,
      procs: newProcs,
      scriptBodyLen: origGcx.scriptBodyLen,
      scriptBodyOffset: origGcx.scriptBodyOffset,
      scriptBody: newScriptBody,
      trailing: origGcx.trailing,
      _compilerWarnings: ctx.warnings
    };

    // Recompute size-dependent metadata from actual encoded contents.
    // This is essential when structural edits change block list lengths —
    // the disassembler reads scriptBodyLen and procSectionLen as authoritative,
    // so any mismatch causes truncation/corruption.
    if (typeof gcxEncodeProcBody === 'function') {
      // Recompute proc offsets, procTable, and procSectionLen
      var bodyOff = 0;
      var sortedNew = result.procs.slice().sort(function(a,b){ return a.fileOffset - b.fileOffset; });
      var newTable = [];
      for (var si = 0; si < sortedNew.length; si++) {
        var enc = gcxEncodeProcBody(sortedNew[si]);
        sortedNew[si].tableEntry.offset = bodyOff;
        newTable.push({ procId: sortedNew[si].tableEntry.procId, offset: bodyOff });
        bodyOff += enc.length;
      }
      // procTable in original ORDER (preserve table entry order from origGcx)
      // Match procTable to original by procId, take new offsets
      var newTableMap = {};
      newTable.forEach(function(e) { newTableMap[e.procId] = e.offset; });
      result.procTable = origGcx.procTable.map(function(e) {
        return { procId: e.procId, offset: newTableMap[e.procId] !== undefined ? newTableMap[e.procId] : e.offset };
      });
      // procSectionLen = 4*N table entries + 4 terminator + sum of body sizes
      var tableBytes = result.procTable.length * 4 + 4;
      result.procSectionLen = tableBytes + bodyOff;
      // scriptBodyLen = byte size of encoded scriptBody
      var sbEnc = gcxEncodeProcBody(result.scriptBody);
      result.scriptBodyLen = sbEnc.length;
    }

    return result;
  }

  function gcxCompileTextToBytes(text, origGcx) {
    var newGcx = gcxParseText(text, origGcx);
    if (typeof gcxEncodeGCX !== 'function') {
      throw new Error('gcxCompileTextToBytes: gcxEncodeGCX is not loaded');
    }
    return { bytes: gcxEncodeGCX(newGcx), gcx: newGcx, warnings: newGcx._compilerWarnings };
  }

  var api = {
    gcxLexText: gcxLexText,
    gcxParseText: gcxParseText,
    gcxCompileTextToBytes: gcxCompileTextToBytes
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else for (var key in api) if (api.hasOwnProperty(key)) global[key] = api[key];

})(typeof window !== 'undefined' ? window : this);

// ============================================================
