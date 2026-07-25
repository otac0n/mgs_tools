// ═══════════════════════════════════════════════════════════════════════════
// FILE: 21_gcx_assemble.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCX ENCODER (JavaScript port of assemble.py)
// ============================================================
// Re-emits a .gcx byte stream from the structured AST produced by disassemble.js.
// Byte-identical for unmodified ASTs.
//
// In browser: relies on globals defined by disassemble.js (loaded first).
// In Node: loads disassemble.js via require.

(function(global) {
  var _C;
  // Prefer already-defined globals (browser concatenated build, or Node tests
  // that loaded disassemble.js first). Only fall back to require() if globals
  // aren't set AND we're in Node.
  if (typeof GCL_END !== 'undefined') {
    _C = { GCL_END: GCL_END, GCL_SHORT: GCL_SHORT, GCL_BYTE: GCL_BYTE,
           GCL_CHAR: GCL_CHAR, GCL_BOOL: GCL_BOOL, GCL_STRID: GCL_STRID,
           GCL_STRING: GCL_STRING, GCL_PROCID: GCL_PROCID, GCL_INT: GCL_INT,
           GCL_SYMBOL: GCL_SYMBOL, GCL_VAR: GCL_VAR, GCL_ARRAY: GCL_ARRAY,
           GCL_EXPR: GCL_EXPR, GCL_OP: GCL_OP, GCL_ARG: GCL_ARG,
           GCL_OPTION: GCL_OPTION, GCL_COMMAND: GCL_COMMAND, GCL_PROC: GCL_PROC };
  } else if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    _C = require('./disassemble.js');
  } else {
    _C = global;
  }

  var GCL_END     = _C.GCL_END;
  var GCL_SHORT   = _C.GCL_SHORT;
  var GCL_BYTE    = _C.GCL_BYTE;
  var GCL_CHAR    = _C.GCL_CHAR;
  var GCL_BOOL    = _C.GCL_BOOL;
  var GCL_STRID   = _C.GCL_STRID;
  var GCL_STRING  = _C.GCL_STRING;
  var GCL_PROCID  = _C.GCL_PROCID;
  var GCL_INT     = _C.GCL_INT;
  var GCL_SYMBOL  = _C.GCL_SYMBOL;
  var GCL_VAR     = _C.GCL_VAR;
  var GCL_ARRAY   = _C.GCL_ARRAY;
  var GCL_EXPR    = _C.GCL_EXPR;
  var GCL_OP      = _C.GCL_OP;
  var GCL_ARG     = _C.GCL_ARG;
  var GCL_OPTION  = _C.GCL_OPTION;
  var GCL_COMMAND = _C.GCL_COMMAND;
  var GCL_PROC    = _C.GCL_PROC;

  function writeBeU16(out, v) {
    out.push((v >>> 8) & 0xFF, v & 0xFF);
  }
  function writeBeU32(out, v) {
    out.push(Math.floor(v / 0x1000000) & 0xFF,
             (v >>> 16) & 0xFF,
             (v >>> 8) & 0xFF,
             v & 0xFF);
  }

  function gcxEncodeValue(v) {
    var tag = v.tag;

    if (v.kind === 'eob' || v.kind.indexOf('truncated_') === 0
        || v.kind.indexOf('UNKNOWN_') === 0) {
      return Array.from(v.raw);
    }

    if ((tag & 0xF0) === GCL_VAR) {
      var packed = v.payload.packed;
      return [tag, (packed >> 16) & 0xFF, (packed >> 8) & 0xFF, packed & 0xFF];
    }

    if (tag === GCL_END) return [tag];

    if (tag === GCL_SHORT) {
      var val16 = v.payload & 0xFFFF;
      return [tag, (val16 >> 8) & 0xFF, val16 & 0xFF];
    }

    if (tag === GCL_INT || tag === GCL_SYMBOL) {
      var val32 = v.payload >>> 0;
      return [tag,
        Math.floor(val32 / 0x1000000) & 0xFF,
        (val32 >>> 16) & 0xFF,
        (val32 >>> 8) & 0xFF,
        val32 & 0xFF];
    }

    if (tag === GCL_STRID || tag === GCL_PROCID) {
      var sv = v.payload & 0xFFFF;
      return [tag, (sv >> 8) & 0xFF, sv & 0xFF];
    }

    if (tag === GCL_BYTE || tag === GCL_CHAR || tag === GCL_BOOL) {
      return [tag, v.payload & 0xFF];
    }

    if (tag === GCL_STRING) {
      var data = v.payload;
      var out = [tag, data.length & 0xFF];
      for (var i = 0; i < data.length; i++) out.push(data[i]);
      return out;
    }

    if (tag === GCL_ARRAY) return [tag, v.payload & 0xFF];

    if (tag === GCL_ARG) {
      var inner;
      if (v.payload && v.payload.innerBlocks) {
        inner = [];
        for (var j = 0; j < v.payload.innerBlocks.length; j++) {
          var blk = gcxEncodeBlock(v.payload.innerBlocks[j]);
          for (var k = 0; k < blk.length; k++) inner.push(blk[k]);
        }
      } else {
        inner = v.payload && v.payload.argBytes
          ? Array.from(v.payload.argBytes)
          : (v.payload instanceof Uint8Array ? Array.from(v.payload) : []);
      }
      var argSize = inner.length + 2;
      var result = [tag, (argSize >> 8) & 0xFF, argSize & 0xFF];
      for (var i2 = 0; i2 < inner.length; i2++) result.push(inner[i2]);
      return result;
    }

    if (tag === GCL_EXPR) {
      var ebytes;
      if (v.payload && v.payload.exprItems) {
        ebytes = encodeExprStream(v.payload.exprItems);
      } else {
        ebytes = v.payload && v.payload.exprBytes
          ? Array.from(v.payload.exprBytes)
          : (v.payload instanceof Uint8Array ? Array.from(v.payload) : []);
      }
      var esize = ebytes.length + 1;
      var er = [tag, esize & 0xFF];
      for (var ii = 0; ii < ebytes.length; ii++) er.push(ebytes[ii]);
      return er;
    }

    if (tag === GCL_OPTION) {
      return [tag, v.payload.optChar & 0xFF, v.payload.markerByte & 0xFF];
    }

    throw new Error('gcxEncodeValue: unknown tag 0x' + tag.toString(16));
  }

  function encodeExprStream(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'value') {
        var vb = gcxEncodeValue(it.value);
        for (var j = 0; j < vb.length; j++) out.push(vb[j]);
      } else if (it.kind === 'op') {
        out.push(GCL_OP, it.opCode & 0xFF);
      } else if (it.kind === 'truncated_op') {
        for (var k = 0; k < it.raw.length; k++) out.push(it.raw[k]);
      }
    }
    return out;
  }

  function gcxEncodeBlock(b) {
    var tag = b.tag;

    if (tag === GCL_END) return [tag];

    if (tag === GCL_EXPR) {
      var ebytes;
      if (b.payload && b.payload.exprItems) {
        ebytes = encodeExprStream(b.payload.exprItems);
      } else {
        ebytes = Array.from(b.payload.exprBytes || new Uint8Array(0));
      }
      var esize = ebytes.length + 1;
      var er = [tag, esize & 0xFF];
      for (var i = 0; i < ebytes.length; i++) er.push(ebytes[i]);
      return er;
    }

    if (tag === GCL_COMMAND) {
      var data;
      if (b.payload && b.payload.values) {
        var cmdId = b.payload.cmdId;
        var lineSkip = b.payload.lineSkip;
        data = [(cmdId >> 8) & 0xFF, cmdId & 0xFF, lineSkip & 0xFF];
        for (var j = 0; j < b.payload.values.length; j++) {
          var vb = gcxEncodeValue(b.payload.values[j]);
          for (var k = 0; k < vb.length; k++) data.push(vb[k]);
        }
      } else {
        data = Array.from(b.payload.cmdBytes || new Uint8Array(0));
      }
      var sz = data.length + 2;
      var rr = [tag, (sz >> 8) & 0xFF, sz & 0xFF];
      for (var m = 0; m < data.length; m++) rr.push(data[m]);
      return rr;
    }

    if (tag === GCL_PROC) {
      var pdata;
      if (b.payload && b.payload.values) {
        var procId = b.payload.procId;
        pdata = [(procId >> 8) & 0xFF, procId & 0xFF];
        for (var j2 = 0; j2 < b.payload.values.length; j2++) {
          var vb2 = gcxEncodeValue(b.payload.values[j2]);
          for (var k2 = 0; k2 < vb2.length; k2++) pdata.push(vb2[k2]);
        }
      } else {
        pdata = Array.from(b.payload.procBytes || new Uint8Array(0));
      }
      var ps = pdata.length + 1;
      var pr = [tag, ps & 0xFF];
      for (var m2 = 0; m2 < pdata.length; m2++) pr.push(pdata[m2]);
      return pr;
    }

    if (tag === GCL_ARG) {
      var adata;
      if (b.payload && b.payload.innerBlocks) {
        adata = [];
        for (var n = 0; n < b.payload.innerBlocks.length; n++) {
          var ib = gcxEncodeBlock(b.payload.innerBlocks[n]);
          for (var o = 0; o < ib.length; o++) adata.push(ib[o]);
        }
      } else {
        adata = Array.from(b.payload.argBytes || new Uint8Array(0));
      }
      var asz = adata.length + 2;
      var ar = [tag, (asz >> 8) & 0xFF, asz & 0xFF];
      for (var p = 0; p < adata.length; p++) ar.push(adata[p]);
      return ar;
    }

    throw new Error('gcxEncodeBlock: unknown tag 0x' + tag.toString(16));
  }

  function gcxEncodeProcBody(pb) {
    var out = [];
    for (var i = 0; i < pb.blocks.length; i++) {
      var b = gcxEncodeBlock(pb.blocks[i]);
      for (var j = 0; j < b.length; j++) out.push(b[j]);
    }
    return out;
  }

  function gcxEncodeGCX(gcx) {
    var out = [];
    writeBeU32(out, gcx.procSectionLen);

    for (var i = 0; i < gcx.procTable.length; i++) {
      var e = gcx.procTable[i];
      writeBeU16(out, e.procId);
      writeBeU16(out, e.offset);
    }
    out.push(0, 0, 0, 0);

    var sortedProcs = gcx.procs.slice().sort(function(a, b) {
      return a.fileOffset - b.fileOffset;
    });
    for (var j = 0; j < sortedProcs.length; j++) {
      var pb = gcxEncodeProcBody(sortedProcs[j]);
      for (var k = 0; k < pb.length; k++) out.push(pb[k]);
    }

    writeBeU32(out, gcx.scriptBodyLen);
    var sb = gcxEncodeProcBody(gcx.scriptBody);
    for (var m = 0; m < sb.length; m++) out.push(sb[m]);

    if (gcx.trailing) {
      for (var n = 0; n < gcx.trailing.length; n++) out.push(gcx.trailing[n]);
    }

    return new Uint8Array(out);
  }

  var api = {
    gcxEncodeValue: gcxEncodeValue,
    gcxEncodeBlock: gcxEncodeBlock,
    gcxEncodeProcBody: gcxEncodeProcBody,
    gcxEncodeGCX: gcxEncodeGCX
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    for (var key in api) {
      if (api.hasOwnProperty(key)) global[key] = api[key];
    }
  }
})(typeof window !== 'undefined' ? window : this);

// ============================================================
