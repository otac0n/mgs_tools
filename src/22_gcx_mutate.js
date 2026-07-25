// ═══════════════════════════════════════════════════════════════════════════
// FILE: 22_gcx_mutate.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCX MUTATION API (JavaScript port of mutate.py)
// ============================================================
// AST traversal and editing helpers for the GCX AST.
//
// Browser: relies on globals from disassemble.js.
// Node: loads disassemble via require.

(function(global) {
  var _C;
  if (typeof GCL_END !== 'undefined') {
    _C = { GCL_END: GCL_END, GCL_VAR: GCL_VAR, GCL_EXPR: GCL_EXPR,
           GCL_OP: GCL_OP, GCL_ARG: GCL_ARG, GCL_OPTION: GCL_OPTION,
           GCL_COMMAND: GCL_COMMAND, GCL_PROC: GCL_PROC };
  } else if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    _C = require('./disassemble.js');
  } else {
    _C = global;
  }

  var GCL_END     = _C.GCL_END;
  var GCL_VAR     = _C.GCL_VAR;
  var GCL_EXPR    = _C.GCL_EXPR;
  var GCL_OP      = _C.GCL_OP;
  var GCL_ARG     = _C.GCL_ARG;
  var GCL_OPTION  = _C.GCL_OPTION;
  var GCL_COMMAND = _C.GCL_COMMAND;
  var GCL_PROC    = _C.GCL_PROC;

  // ---------- Walkers ----------

  function gcxWalkAllBlocks(gcx, callback) {
    var seen = new Set();
    function walkBlock(b) {
      if (seen.has(b)) return;
      seen.add(b);
      callback(b);
      if (!b.payload || typeof b.payload !== 'object') return;
      if (b.payload.innerBlocks) {
        for (var i = 0; i < b.payload.innerBlocks.length; i++) {
          walkBlock(b.payload.innerBlocks[i]);
        }
      }
      if (b.payload.values) {
        for (var j = 0; j < b.payload.values.length; j++) {
          var v = b.payload.values[j];
          if (v && v.payload && v.payload.innerBlocks) {
            for (var k = 0; k < v.payload.innerBlocks.length; k++) {
              walkBlock(v.payload.innerBlocks[k]);
            }
          }
        }
      }
    }
    for (var p = 0; p < gcx.procs.length; p++) {
      for (var q = 0; q < gcx.procs[p].blocks.length; q++) {
        walkBlock(gcx.procs[p].blocks[q]);
      }
    }
    for (var s = 0; s < gcx.scriptBody.blocks.length; s++) {
      walkBlock(gcx.scriptBody.blocks[s]);
    }
  }

  function gcxWalkAllValues(gcx, callback) {
    var seen = new Set();
    function walkObj(obj) {
      if (obj === null || obj === undefined) return;
      if (typeof obj !== 'object') return;
      if (seen.has(obj)) return;
      seen.add(obj);

      // Is it a Value? (heuristic: has .tag and .kind and .raw)
      if (typeof obj.tag === 'number' && typeof obj.kind === 'string'
          && obj.raw !== undefined && obj.fileOffset !== undefined) {
        // Treat as Value
        callback(obj);
        walkObj(obj.payload);
        return;
      }

      // Is it a Block? (has .tag, .headerSize, no .kind — Block doesn't have kind field)
      if (typeof obj.tag === 'number' && obj.headerSize !== undefined) {
        walkObj(obj.payload);
        return;
      }

      // Array
      if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length; i++) walkObj(obj[i]);
        return;
      }

      // Uint8Array — skip
      if (obj instanceof Uint8Array) return;

      // Plain object — walk values
      for (var k in obj) {
        if (obj.hasOwnProperty(k)) walkObj(obj[k]);
      }
    }
    for (var p = 0; p < gcx.procs.length; p++) {
      for (var q = 0; q < gcx.procs[p].blocks.length; q++) {
        walkObj(gcx.procs[p].blocks[q]);
      }
    }
    for (var s = 0; s < gcx.scriptBody.blocks.length; s++) {
      walkObj(gcx.scriptBody.blocks[s]);
    }
  }

  // ---------- Targeted finders ----------

  function gcxFindValues(gcx, opts) {
    opts = opts || {};
    var matches = [];
    gcxWalkAllValues(gcx, function(v) {
      if (opts.tag !== undefined && v.tag !== opts.tag) return;
      if (opts.kind !== undefined && v.kind !== opts.kind) return;
      if (opts.payload !== undefined && v.payload !== opts.payload) return;
      if (opts.predicate && !opts.predicate(v)) return;
      matches.push(v);
    });
    return matches;
  }

  function gcxFindCommands(gcx, opts) {
    opts = opts || {};
    var matches = [];
    gcxWalkAllBlocks(gcx, function(b) {
      if (b.tag !== GCL_COMMAND) return;
      if (opts.cmdId !== undefined && b.payload.cmdId !== opts.cmdId) return;
      matches.push(b);
    });
    return matches;
  }

  function gcxFindProcCalls(gcx, opts) {
    opts = opts || {};
    var matches = [];
    gcxWalkAllBlocks(gcx, function(b) {
      if (b.tag !== GCL_PROC) return;
      if (opts.procId !== undefined && b.payload.procId !== opts.procId) return;
      matches.push(b);
    });
    return matches;
  }

  function gcxFindProcBodies(gcx, opts) {
    opts = opts || {};
    var matches = [];
    for (var i = 0; i < gcx.procs.length; i++) {
      var p = gcx.procs[i];
      if (opts.procId !== undefined && p.tableEntry.procId !== opts.procId) continue;
      matches.push(p);
    }
    return matches;
  }

  function gcxFindOptions(gcx, opts) {
    opts = opts || {};
    var optChar = opts.optChar;
    if (typeof optChar === 'string') optChar = optChar.charCodeAt(0);
    var matches = [];
    gcxWalkAllValues(gcx, function(v) {
      if (v.tag !== GCL_OPTION) return;
      if (optChar !== undefined && v.payload.optChar !== optChar) return;
      matches.push(v);
    });
    return matches;
  }

  // ---------- Context-aware find (with breadcrumb) ----------

  function gcxFindValuesWithContext(gcx, opts) {
    opts = opts || {};
    var matches = [];

    function walk(obj, crumb) {
      if (obj === null || obj === undefined) return;
      if (typeof obj !== 'object') return;
      if (obj instanceof Uint8Array) return;

      // Value
      if (typeof obj.tag === 'number' && typeof obj.kind === 'string'
          && obj.raw !== undefined && obj.fileOffset !== undefined) {
        if ((opts.tag === undefined || obj.tag === opts.tag)
            && (opts.payload === undefined || obj.payload === opts.payload)) {
          matches.push({ value: obj, breadcrumb: crumb.slice() });
        }
        if (obj.payload && typeof obj.payload === 'object'
            && !(obj.payload instanceof Uint8Array)) {
          walk(obj.payload, crumb);
        }
        return;
      }

      // Block
      if (typeof obj.tag === 'number' && obj.headerSize !== undefined) {
        var newCrumb = crumb;
        if (obj.tag === GCL_COMMAND) {
          newCrumb = crumb.concat(['cmd 0x' + obj.payload.cmdId.toString(16).padStart(4, '0')]);
        } else if (obj.tag === GCL_PROC) {
          newCrumb = crumb.concat(['proc_call 0x' + obj.payload.procId.toString(16).padStart(4, '0')]);
        } else if (obj.tag === GCL_ARG) {
          newCrumb = crumb.concat(['arg']);
        } else if (obj.tag === GCL_EXPR) {
          newCrumb = crumb.concat(['expr']);
        }
        if (obj.payload && typeof obj.payload === 'object') {
          walk(obj.payload, newCrumb);
        }
        return;
      }

      if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length; i++) walk(obj[i], crumb);
        return;
      }

      // Plain dict
      for (var k in obj) {
        if (obj.hasOwnProperty(k)) walk(obj[k], crumb);
      }
    }

    for (var i = 0; i < gcx.procs.length; i++) {
      var p = gcx.procs[i];
      var pcrumb = ['proc 0x' + p.tableEntry.procId.toString(16).padStart(4, '0')];
      for (var j = 0; j < p.blocks.length; j++) {
        walk(p.blocks[j], pcrumb);
      }
    }
    for (var s = 0; s < gcx.scriptBody.blocks.length; s++) {
      walk(gcx.scriptBody.blocks[s], ['script']);
    }
    return matches;
  }

  // ---------- Convenience: same-width size check ----------

  function gcxAssertSameSize(origBytes, gcx, encodeFn) {
    var out = encodeFn(gcx);
    if (out.length !== origBytes.length) {
      throw new Error('Size changed after edits: ' + origBytes.length +
                      ' -> ' + out.length + '. Same-width edit assumption violated.');
    }
    return out;
  }

  // ---------- Structural edits ----------

  // Deep-clone a value node, dropping the cached raw byte slices so the encoder
  // re-serializes from the (cloned, mutable) structured payload. Recurses into
  // command/proc values, ARG inner blocks, and EXPR items.
  function gcxCloneValue(v) {
    var c = { tag: v.tag, kind: v.kind };
    var tag = v.tag;
    if ((tag & 0xF0) === 0x10 /* VAR */) {
      c.payload = { packed: v.payload.packed }; return c;
    }
    if (tag === 0x40 /* ARG */) {
      c.payload = {};
      if (v.payload && v.payload.innerBlocks) {
        c.payload.innerBlocks = v.payload.innerBlocks.map(gcxCloneBlock);
      } else if (v.payload && v.payload.argBytes) {
        c.payload.argBytes = v.payload.argBytes.slice();
      }
      return c;
    }
    if (tag === 0x30 /* EXPR */) {
      c.payload = {};
      if (v.payload && v.payload.exprItems) {
        c.payload.exprItems = v.payload.exprItems.map(function (it) {
          return it.kind === 'value'
            ? { kind: 'value', value: gcxCloneValue(it.value) }
            : { kind: it.kind, opCode: it.opCode, raw: it.raw };
        });
      } else if (v.payload && v.payload.exprBytes) {
        c.payload.exprBytes = v.payload.exprBytes.slice();
      }
      return c;
    }
    if (tag === 0x50 /* OPTION */) {
      c.payload = { optChar: v.payload.optChar, markerByte: v.payload.markerByte };
      return c;
    }
    if (tag === 0x07 /* STRING */) { c.payload = v.payload.slice(); return c; }
    // Scalars (SHORT/BYTE/CHAR/BOOL/STRID/PROCID/INT/SYMBOL/ARRAY) store a number.
    c.payload = v.payload;
    if (v.kind === 'eob' || (typeof v.kind === 'string' &&
        (v.kind.indexOf('truncated_') === 0 || v.kind.indexOf('UNKNOWN_') === 0))) {
      c.raw = v.raw; // these encode from raw by design
    }
    return c;
  }

  // Deep-clone a block node (COMMAND / PROC / ARG / EXPR / END).
  function gcxCloneBlock(b) {
    var c = { tag: b.tag, kind: b.kind };
    var tag = b.tag;
    if (tag === 0x00 /* END */) return c;
    if (tag === 0x60 /* COMMAND */) {
      c.payload = { cmdId: b.payload.cmdId, lineSkip: b.payload.lineSkip };
      if (b.payload.values) c.payload.values = b.payload.values.map(gcxCloneValue);
      else if (b.payload.cmdBytes) c.payload.cmdBytes = b.payload.cmdBytes.slice();
      return c;
    }
    if (tag === 0x70 /* PROC (call) */) {
      c.payload = { procId: b.payload.procId };
      if (b.payload.values) c.payload.values = b.payload.values.map(gcxCloneValue);
      else if (b.payload.procBytes) c.payload.procBytes = b.payload.procBytes.slice();
      return c;
    }
    if (tag === 0x40 /* ARG */) {
      c.payload = {};
      if (b.payload.innerBlocks) c.payload.innerBlocks = b.payload.innerBlocks.map(gcxCloneBlock);
      else if (b.payload.argBytes) c.payload.argBytes = b.payload.argBytes.slice();
      return c;
    }
    if (tag === 0x30 /* EXPR */) {
      c.payload = {};
      if (b.payload.exprItems) {
        c.payload.exprItems = b.payload.exprItems.map(function (it) {
          return it.kind === 'value'
            ? { kind: 'value', value: gcxCloneValue(it.value) }
            : { kind: it.kind, opCode: it.opCode, raw: it.raw };
        });
      } else if (b.payload.exprBytes) c.payload.exprBytes = b.payload.exprBytes.slice();
      return c;
    }
    c.payload = b.payload;
    return c;
  }

  // Recompute the GCX header offsets after a structural (size-changing) edit:
  // each proc body's table offset, the proc-section length, and the script body
  // length. Requires gcxEncodeProcBody (module 21) to measure encoded lengths.
  // Unchanged input leaves every field at its original value.
  function gcxRecomputeOffsets(gcx) {
    if (typeof gcxEncodeProcBody !== 'function') {
      throw new Error('gcxRecomputeOffsets needs gcxEncodeProcBody (load module 21)');
    }
    var sorted = gcx.procs.slice().sort(function (a, b) {
      return a.fileOffset - b.fileOffset;
    });
    var cum = 0;
    for (var i = 0; i < sorted.length; i++) {
      sorted[i].tableEntry.offset = cum;       // offset within proc-bodies region
      cum += gcxEncodeProcBody(sorted[i]).length;
    }
    var tableRegion = gcx.procTable.length * 4 + 4; // entries + 4-byte terminator
    gcx.procSectionLen = tableRegion + cum;
    gcx.scriptBodyLen = gcxEncodeProcBody(gcx.scriptBody).length;
    return gcx;
  }

  // Locate every chara COMMAND (cmdId 0x9906) together with the block array and
  // index that contain it, so new commands can be spliced in beside it.
  function gcxFindCharasWithContainer(gcx) {
    var hits = [];
    function scan(blocks) {
      if (!blocks) return;
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.tag === 0x60 && b.payload && b.payload.cmdId === 0x9906) {
          hits.push({ cmd: b, container: blocks, index: i });
        }
        if (b.tag === 0x60 && b.payload && b.payload.values) {
          for (var j = 0; j < b.payload.values.length; j++) {
            var v = b.payload.values[j];
            if (v.tag === 0x40 && v.payload && v.payload.innerBlocks) scan(v.payload.innerBlocks);
          }
        } else if (b.tag === 0x40 && b.payload && b.payload.innerBlocks) {
          scan(b.payload.innerBlocks);
        }
      }
    }
    for (var p = 0; p < gcx.procs.length; p++) scan(gcx.procs[p].blocks);
    if (gcx.scriptBody) scan(gcx.scriptBody.blocks);
    return hits;
  }

  // Clone an existing chara entity (template) and insert the copy right after it
  // in the same script container, with a new name hash and (optionally) new
  // position. Cloning guarantees the option schema is valid without needing the
  // per-command option dictionary. Recomputes offsets so the GCX stays valid.
  // opts: { nameHash, pos:{x,y,z} (optional), recompute:bool (default true) }.
  // Returns the newly inserted command block.
  function gcxCloneEntity(gcx, templateHit, opts) {
    opts = opts || {};
    var clone = gcxCloneBlock(templateHit.cmd);
    var vals = clone.payload.values;
    // value[1] is the name STR_ID
    if (opts.nameHash != null && vals[1] && vals[1].tag === 0x06) {
      vals[1].payload = opts.nameHash & 0xFFFF;
    }
    templateHit.container.splice(templateHit.index + 1, 0, clone);
    if (opts.recompute !== false) gcxRecomputeOffsets(gcx);
    return clone;
  }

  // ---------- Export ----------

  var api = {
    gcxWalkAllBlocks: gcxWalkAllBlocks,
    gcxWalkAllValues: gcxWalkAllValues,
    gcxFindValues: gcxFindValues,
    gcxFindCommands: gcxFindCommands,
    gcxFindProcCalls: gcxFindProcCalls,
    gcxFindProcBodies: gcxFindProcBodies,
    gcxFindOptions: gcxFindOptions,
    gcxFindValuesWithContext: gcxFindValuesWithContext,
    gcxAssertSameSize: gcxAssertSameSize,
    gcxCloneValue: gcxCloneValue,
    gcxCloneBlock: gcxCloneBlock,
    gcxRecomputeOffsets: gcxRecomputeOffsets,
    gcxFindCharasWithContainer: gcxFindCharasWithContainer,
    gcxCloneEntity: gcxCloneEntity
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
