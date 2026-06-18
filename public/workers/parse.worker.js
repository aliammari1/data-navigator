var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/papaparse@5.5.3/node_modules/papaparse/papaparse.min.js
var require_papaparse_min = __commonJS({
  "node_modules/.pnpm/papaparse@5.5.3/node_modules/papaparse/papaparse.min.js"(exports, module) {
    ((e, t) => {
      "function" == typeof define && define.amd ? define([], t) : "object" == typeof module && "undefined" != typeof exports ? module.exports = t() : e.Papa = t();
    })(exports, function r() {
      var n = "undefined" != typeof self ? self : "undefined" != typeof window ? window : void 0 !== n ? n : {};
      var d, s = !n.document && !!n.postMessage, a = n.IS_PAPA_WORKER || false, o = {}, h = 0, v = {};
      function u(e) {
        this._handle = null, this._finished = false, this._completed = false, this._halted = false, this._input = null, this._baseIndex = 0, this._partialLine = "", this._rowCount = 0, this._start = 0, this._nextChunk = null, this.isFirstChunk = true, this._completeResults = { data: [], errors: [], meta: {} }, function(e2) {
          var t = b(e2);
          t.chunkSize = parseInt(t.chunkSize), e2.step || e2.chunk || (t.chunkSize = null);
          this._handle = new i(t), (this._handle.streamer = this)._config = t;
        }.call(this, e), this.parseChunk = function(t, e2) {
          var i2 = parseInt(this._config.skipFirstNLines) || 0;
          if (this.isFirstChunk && 0 < i2) {
            let e3 = this._config.newline;
            e3 || (r2 = this._config.quoteChar || '"', e3 = this._handle.guessLineEndings(t, r2)), t = [...t.split(e3).slice(i2)].join(e3);
          }
          this.isFirstChunk && U(this._config.beforeFirstChunk) && void 0 !== (r2 = this._config.beforeFirstChunk(t)) && (t = r2), this.isFirstChunk = false, this._halted = false;
          var i2 = this._partialLine + t, r2 = (this._partialLine = "", this._handle.parse(i2, this._baseIndex, !this._finished));
          if (!this._handle.paused() && !this._handle.aborted()) {
            t = r2.meta.cursor, i2 = (this._finished || (this._partialLine = i2.substring(t - this._baseIndex), this._baseIndex = t), r2 && r2.data && (this._rowCount += r2.data.length), this._finished || this._config.preview && this._rowCount >= this._config.preview);
            if (a) n.postMessage({ results: r2, workerId: v.WORKER_ID, finished: i2 });
            else if (U(this._config.chunk) && !e2) {
              if (this._config.chunk(r2, this._handle), this._handle.paused() || this._handle.aborted()) return void (this._halted = true);
              this._completeResults = r2 = void 0;
            }
            return this._config.step || this._config.chunk || (this._completeResults.data = this._completeResults.data.concat(r2.data), this._completeResults.errors = this._completeResults.errors.concat(r2.errors), this._completeResults.meta = r2.meta), this._completed || !i2 || !U(this._config.complete) || r2 && r2.meta.aborted || (this._config.complete(this._completeResults, this._input), this._completed = true), i2 || r2 && r2.meta.paused || this._nextChunk(), r2;
          }
          this._halted = true;
        }, this._sendError = function(e2) {
          U(this._config.error) ? this._config.error(e2) : a && this._config.error && n.postMessage({ workerId: v.WORKER_ID, error: e2, finished: false });
        };
      }
      function f(e) {
        var r2;
        (e = e || {}).chunkSize || (e.chunkSize = v.RemoteChunkSize), u.call(this, e), this._nextChunk = s ? function() {
          this._readChunk(), this._chunkLoaded();
        } : function() {
          this._readChunk();
        }, this.stream = function(e2) {
          this._input = e2, this._nextChunk();
        }, this._readChunk = function() {
          if (this._finished) this._chunkLoaded();
          else {
            if (r2 = new XMLHttpRequest(), this._config.withCredentials && (r2.withCredentials = this._config.withCredentials), s || (r2.onload = y(this._chunkLoaded, this), r2.onerror = y(this._chunkError, this)), r2.open(this._config.downloadRequestBody ? "POST" : "GET", this._input, !s), this._config.downloadRequestHeaders) {
              var e2, t = this._config.downloadRequestHeaders;
              for (e2 in t) r2.setRequestHeader(e2, t[e2]);
            }
            var i2;
            this._config.chunkSize && (i2 = this._start + this._config.chunkSize - 1, r2.setRequestHeader("Range", "bytes=" + this._start + "-" + i2));
            try {
              r2.send(this._config.downloadRequestBody);
            } catch (e3) {
              this._chunkError(e3.message);
            }
            s && 0 === r2.status && this._chunkError();
          }
        }, this._chunkLoaded = function() {
          4 === r2.readyState && (r2.status < 200 || 400 <= r2.status ? this._chunkError() : (this._start += this._config.chunkSize || r2.responseText.length, this._finished = !this._config.chunkSize || this._start >= ((e2) => null !== (e2 = e2.getResponseHeader("Content-Range")) ? parseInt(e2.substring(e2.lastIndexOf("/") + 1)) : -1)(r2), this.parseChunk(r2.responseText)));
        }, this._chunkError = function(e2) {
          e2 = r2.statusText || e2;
          this._sendError(new Error(e2));
        };
      }
      function l(e) {
        (e = e || {}).chunkSize || (e.chunkSize = v.LocalChunkSize), u.call(this, e);
        var i2, r2, n2 = "undefined" != typeof FileReader;
        this.stream = function(e2) {
          this._input = e2, r2 = e2.slice || e2.webkitSlice || e2.mozSlice, n2 ? ((i2 = new FileReader()).onload = y(this._chunkLoaded, this), i2.onerror = y(this._chunkError, this)) : i2 = new FileReaderSync(), this._nextChunk();
        }, this._nextChunk = function() {
          this._finished || this._config.preview && !(this._rowCount < this._config.preview) || this._readChunk();
        }, this._readChunk = function() {
          var e2 = this._input, t = (this._config.chunkSize && (t = Math.min(this._start + this._config.chunkSize, this._input.size), e2 = r2.call(e2, this._start, t)), i2.readAsText(e2, this._config.encoding));
          n2 || this._chunkLoaded({ target: { result: t } });
        }, this._chunkLoaded = function(e2) {
          this._start += this._config.chunkSize, this._finished = !this._config.chunkSize || this._start >= this._input.size, this.parseChunk(e2.target.result);
        }, this._chunkError = function() {
          this._sendError(i2.error);
        };
      }
      function c(e) {
        var i2;
        u.call(this, e = e || {}), this.stream = function(e2) {
          return i2 = e2, this._nextChunk();
        }, this._nextChunk = function() {
          var e2, t;
          if (!this._finished) return e2 = this._config.chunkSize, i2 = e2 ? (t = i2.substring(0, e2), i2.substring(e2)) : (t = i2, ""), this._finished = !i2, this.parseChunk(t);
        };
      }
      function p(e) {
        u.call(this, e = e || {});
        var t = [], i2 = true, r2 = false;
        this.pause = function() {
          u.prototype.pause.apply(this, arguments), this._input.pause();
        }, this.resume = function() {
          u.prototype.resume.apply(this, arguments), this._input.resume();
        }, this.stream = function(e2) {
          this._input = e2, this._input.on("data", this._streamData), this._input.on("end", this._streamEnd), this._input.on("error", this._streamError);
        }, this._checkIsFinished = function() {
          r2 && 1 === t.length && (this._finished = true);
        }, this._nextChunk = function() {
          this._checkIsFinished(), t.length ? this.parseChunk(t.shift()) : i2 = true;
        }, this._streamData = y(function(e2) {
          try {
            t.push("string" == typeof e2 ? e2 : e2.toString(this._config.encoding)), i2 && (i2 = false, this._checkIsFinished(), this.parseChunk(t.shift()));
          } catch (e3) {
            this._streamError(e3);
          }
        }, this), this._streamError = y(function(e2) {
          this._streamCleanUp(), this._sendError(e2);
        }, this), this._streamEnd = y(function() {
          this._streamCleanUp(), r2 = true, this._streamData("");
        }, this), this._streamCleanUp = y(function() {
          this._input.removeListener("data", this._streamData), this._input.removeListener("end", this._streamEnd), this._input.removeListener("error", this._streamError);
        }, this);
      }
      function i(m2) {
        var n2, s2, a2, t, o2 = Math.pow(2, 53), h2 = -o2, u2 = /^\s*-?(\d+\.?|\.\d+|\d+\.\d+)([eE][-+]?\d+)?\s*$/, d2 = /^((\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)))$/, i2 = this, r2 = 0, f2 = 0, l2 = false, e = false, c2 = [], p2 = { data: [], errors: [], meta: {} };
        function y2(e2) {
          return "greedy" === m2.skipEmptyLines ? "" === e2.join("").trim() : 1 === e2.length && 0 === e2[0].length;
        }
        function g2() {
          if (p2 && a2 && (k("Delimiter", "UndetectableDelimiter", "Unable to auto-detect delimiting character; defaulted to '" + v.DefaultDelimiter + "'"), a2 = false), m2.skipEmptyLines && (p2.data = p2.data.filter(function(e3) {
            return !y2(e3);
          })), _2()) {
            let t3 = function(e3, t4) {
              U(m2.transformHeader) && (e3 = m2.transformHeader(e3, t4)), c2.push(e3);
            };
            var t2 = t3;
            if (p2) if (Array.isArray(p2.data[0])) {
              for (var e2 = 0; _2() && e2 < p2.data.length; e2++) p2.data[e2].forEach(t3);
              p2.data.splice(0, 1);
            } else p2.data.forEach(t3);
          }
          function i3(e3, t3) {
            for (var i4 = m2.header ? {} : [], r4 = 0; r4 < e3.length; r4++) {
              var n3 = r4, s3 = e3[r4], s3 = ((e4, t4) => ((e5) => (m2.dynamicTypingFunction && void 0 === m2.dynamicTyping[e5] && (m2.dynamicTyping[e5] = m2.dynamicTypingFunction(e5)), true === (m2.dynamicTyping[e5] || m2.dynamicTyping)))(e4) ? "true" === t4 || "TRUE" === t4 || "false" !== t4 && "FALSE" !== t4 && (((e5) => {
                if (u2.test(e5)) {
                  e5 = parseFloat(e5);
                  if (h2 < e5 && e5 < o2) return 1;
                }
              })(t4) ? parseFloat(t4) : d2.test(t4) ? new Date(t4) : "" === t4 ? null : t4) : t4)(n3 = m2.header ? r4 >= c2.length ? "__parsed_extra" : c2[r4] : n3, s3 = m2.transform ? m2.transform(s3, n3) : s3);
              "__parsed_extra" === n3 ? (i4[n3] = i4[n3] || [], i4[n3].push(s3)) : i4[n3] = s3;
            }
            return m2.header && (r4 > c2.length ? k("FieldMismatch", "TooManyFields", "Too many fields: expected " + c2.length + " fields but parsed " + r4, f2 + t3) : r4 < c2.length && k("FieldMismatch", "TooFewFields", "Too few fields: expected " + c2.length + " fields but parsed " + r4, f2 + t3)), i4;
          }
          var r3;
          p2 && (m2.header || m2.dynamicTyping || m2.transform) && (r3 = 1, !p2.data.length || Array.isArray(p2.data[0]) ? (p2.data = p2.data.map(i3), r3 = p2.data.length) : p2.data = i3(p2.data, 0), m2.header && p2.meta && (p2.meta.fields = c2), f2 += r3);
        }
        function _2() {
          return m2.header && 0 === c2.length;
        }
        function k(e2, t2, i3, r3) {
          e2 = { type: e2, code: t2, message: i3 };
          void 0 !== r3 && (e2.row = r3), p2.errors.push(e2);
        }
        U(m2.step) && (t = m2.step, m2.step = function(e2) {
          p2 = e2, _2() ? g2() : (g2(), 0 !== p2.data.length && (r2 += e2.data.length, m2.preview && r2 > m2.preview ? s2.abort() : (p2.data = p2.data[0], t(p2, i2))));
        }), this.parse = function(e2, t2, i3) {
          var r3 = m2.quoteChar || '"', r3 = (m2.newline || (m2.newline = this.guessLineEndings(e2, r3)), a2 = false, m2.delimiter ? U(m2.delimiter) && (m2.delimiter = m2.delimiter(e2), p2.meta.delimiter = m2.delimiter) : ((r3 = ((e3, t3, i4, r4, n3) => {
            var s3, a3, o3, h3;
            n3 = n3 || [",", "	", "|", ";", v.RECORD_SEP, v.UNIT_SEP];
            for (var u3 = 0; u3 < n3.length; u3++) {
              for (var d3, f3 = n3[u3], l3 = 0, c3 = 0, p3 = 0, g3 = (o3 = void 0, new E({ comments: r4, delimiter: f3, newline: t3, preview: 10 }).parse(e3)), _3 = 0; _3 < g3.data.length; _3++) i4 && y2(g3.data[_3]) ? p3++ : (d3 = g3.data[_3].length, c3 += d3, void 0 === o3 ? o3 = d3 : 0 < d3 && (l3 += Math.abs(d3 - o3), o3 = d3));
              0 < g3.data.length && (c3 /= g3.data.length - p3), (void 0 === a3 || l3 <= a3) && (void 0 === h3 || h3 < c3) && 1.99 < c3 && (a3 = l3, s3 = f3, h3 = c3);
            }
            return { successful: !!(m2.delimiter = s3), bestDelimiter: s3 };
          })(e2, m2.newline, m2.skipEmptyLines, m2.comments, m2.delimitersToGuess)).successful ? m2.delimiter = r3.bestDelimiter : (a2 = true, m2.delimiter = v.DefaultDelimiter), p2.meta.delimiter = m2.delimiter), b(m2));
          return m2.preview && m2.header && r3.preview++, n2 = e2, s2 = new E(r3), p2 = s2.parse(n2, t2, i3), g2(), l2 ? { meta: { paused: true } } : p2 || { meta: { paused: false } };
        }, this.paused = function() {
          return l2;
        }, this.pause = function() {
          l2 = true, s2.abort(), n2 = U(m2.chunk) ? "" : n2.substring(s2.getCharIndex());
        }, this.resume = function() {
          i2.streamer._halted ? (l2 = false, i2.streamer.parseChunk(n2, true)) : setTimeout(i2.resume, 3);
        }, this.aborted = function() {
          return e;
        }, this.abort = function() {
          e = true, s2.abort(), p2.meta.aborted = true, U(m2.complete) && m2.complete(p2), n2 = "";
        }, this.guessLineEndings = function(e2, t2) {
          e2 = e2.substring(0, 1048576);
          var t2 = new RegExp(P(t2) + "([^]*?)" + P(t2), "gm"), i3 = (e2 = e2.replace(t2, "")).split("\r"), t2 = e2.split("\n"), e2 = 1 < t2.length && t2[0].length < i3[0].length;
          if (1 === i3.length || e2) return "\n";
          for (var r3 = 0, n3 = 0; n3 < i3.length; n3++) "\n" === i3[n3][0] && r3++;
          return r3 >= i3.length / 2 ? "\r\n" : "\r";
        };
      }
      function P(e) {
        return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      function E(C) {
        var S = (C = C || {}).delimiter, O = C.newline, x = C.comments, I = C.step, A = C.preview, T = C.fastMode, D = null, L = false, F = null == C.quoteChar ? '"' : C.quoteChar, j = F;
        if (void 0 !== C.escapeChar && (j = C.escapeChar), ("string" != typeof S || -1 < v.BAD_DELIMITERS.indexOf(S)) && (S = ","), x === S) throw new Error("Comment character same as delimiter");
        true === x ? x = "#" : ("string" != typeof x || -1 < v.BAD_DELIMITERS.indexOf(x)) && (x = false), "\n" !== O && "\r" !== O && "\r\n" !== O && (O = "\n");
        var z = 0, M = false;
        this.parse = function(i2, t, r2) {
          if ("string" != typeof i2) throw new Error("Input must be a string");
          var n2 = i2.length, e = S.length, s2 = O.length, a2 = x.length, o2 = U(I), h2 = [], u2 = [], d2 = [], f2 = z = 0;
          if (!i2) return w();
          if (T || false !== T && -1 === i2.indexOf(F)) {
            for (var l2 = i2.split(O), c2 = 0; c2 < l2.length; c2++) {
              if (d2 = l2[c2], z += d2.length, c2 !== l2.length - 1) z += O.length;
              else if (r2) return w();
              if (!x || d2.substring(0, a2) !== x) {
                if (o2) {
                  if (h2 = [], k(d2.split(S)), R(), M) return w();
                } else k(d2.split(S));
                if (A && A <= c2) return h2 = h2.slice(0, A), w(true);
              }
            }
            return w();
          }
          for (var p2 = i2.indexOf(S, z), g2 = i2.indexOf(O, z), _2 = new RegExp(P(j) + P(F), "g"), m2 = i2.indexOf(F, z); ; ) if (i2[z] === F) for (m2 = z, z++; ; ) {
            if (-1 === (m2 = i2.indexOf(F, m2 + 1))) return r2 || u2.push({ type: "Quotes", code: "MissingQuotes", message: "Quoted field unterminated", row: h2.length, index: z }), E2();
            if (m2 === n2 - 1) return E2(i2.substring(z, m2).replace(_2, F));
            if (F === j && i2[m2 + 1] === j) m2++;
            else if (F === j || 0 === m2 || i2[m2 - 1] !== j) {
              -1 !== p2 && p2 < m2 + 1 && (p2 = i2.indexOf(S, m2 + 1));
              var y2 = v2(-1 === (g2 = -1 !== g2 && g2 < m2 + 1 ? i2.indexOf(O, m2 + 1) : g2) ? p2 : Math.min(p2, g2));
              if (i2.substr(m2 + 1 + y2, e) === S) {
                d2.push(i2.substring(z, m2).replace(_2, F)), i2[z = m2 + 1 + y2 + e] !== F && (m2 = i2.indexOf(F, z)), p2 = i2.indexOf(S, z), g2 = i2.indexOf(O, z);
                break;
              }
              y2 = v2(g2);
              if (i2.substring(m2 + 1 + y2, m2 + 1 + y2 + s2) === O) {
                if (d2.push(i2.substring(z, m2).replace(_2, F)), b2(m2 + 1 + y2 + s2), p2 = i2.indexOf(S, z), m2 = i2.indexOf(F, z), o2 && (R(), M)) return w();
                if (A && h2.length >= A) return w(true);
                break;
              }
              u2.push({ type: "Quotes", code: "InvalidQuotes", message: "Trailing quote on quoted field is malformed", row: h2.length, index: z }), m2++;
            }
          }
          else if (x && 0 === d2.length && i2.substring(z, z + a2) === x) {
            if (-1 === g2) return w();
            z = g2 + s2, g2 = i2.indexOf(O, z), p2 = i2.indexOf(S, z);
          } else if (-1 !== p2 && (p2 < g2 || -1 === g2)) d2.push(i2.substring(z, p2)), z = p2 + e, p2 = i2.indexOf(S, z);
          else {
            if (-1 === g2) break;
            if (d2.push(i2.substring(z, g2)), b2(g2 + s2), o2 && (R(), M)) return w();
            if (A && h2.length >= A) return w(true);
          }
          return E2();
          function k(e2) {
            h2.push(e2), f2 = z;
          }
          function v2(e2) {
            var t2 = 0;
            return t2 = -1 !== e2 && (e2 = i2.substring(m2 + 1, e2)) && "" === e2.trim() ? e2.length : t2;
          }
          function E2(e2) {
            return r2 || (void 0 === e2 && (e2 = i2.substring(z)), d2.push(e2), z = n2, k(d2), o2 && R()), w();
          }
          function b2(e2) {
            z = e2, k(d2), d2 = [], g2 = i2.indexOf(O, z);
          }
          function w(e2) {
            if (C.header && !t && h2.length && !L) {
              var s3 = h2[0], a3 = /* @__PURE__ */ Object.create(null), o3 = new Set(s3);
              let n3 = false;
              for (let r3 = 0; r3 < s3.length; r3++) {
                let i3 = s3[r3];
                if (a3[i3 = U(C.transformHeader) ? C.transformHeader(i3, r3) : i3]) {
                  let e3, t2 = a3[i3];
                  for (; e3 = i3 + "_" + t2, t2++, o3.has(e3); ) ;
                  o3.add(e3), s3[r3] = e3, a3[i3]++, n3 = true, (D = null === D ? {} : D)[e3] = i3;
                } else a3[i3] = 1, s3[r3] = i3;
                o3.add(i3);
              }
              n3 && console.warn("Duplicate headers found and renamed."), L = true;
            }
            return { data: h2, errors: u2, meta: { delimiter: S, linebreak: O, aborted: M, truncated: !!e2, cursor: f2 + (t || 0), renamedHeaders: D } };
          }
          function R() {
            I(w()), h2 = [], u2 = [];
          }
        }, this.abort = function() {
          M = true;
        }, this.getCharIndex = function() {
          return z;
        };
      }
      function g(e) {
        var t = e.data, i2 = o[t.workerId], r2 = false;
        if (t.error) i2.userError(t.error, t.file);
        else if (t.results && t.results.data) {
          var n2 = { abort: function() {
            r2 = true, _(t.workerId, { data: [], errors: [], meta: { aborted: true } });
          }, pause: m, resume: m };
          if (U(i2.userStep)) {
            for (var s2 = 0; s2 < t.results.data.length && (i2.userStep({ data: t.results.data[s2], errors: t.results.errors, meta: t.results.meta }, n2), !r2); s2++) ;
            delete t.results;
          } else U(i2.userChunk) && (i2.userChunk(t.results, n2, t.file), delete t.results);
        }
        t.finished && !r2 && _(t.workerId, t.results);
      }
      function _(e, t) {
        var i2 = o[e];
        U(i2.userComplete) && i2.userComplete(t), i2.terminate(), delete o[e];
      }
      function m() {
        throw new Error("Not implemented.");
      }
      function b(e) {
        if ("object" != typeof e || null === e) return e;
        var t, i2 = Array.isArray(e) ? [] : {};
        for (t in e) i2[t] = b(e[t]);
        return i2;
      }
      function y(e, t) {
        return function() {
          e.apply(t, arguments);
        };
      }
      function U(e) {
        return "function" == typeof e;
      }
      return v.parse = function(e, t) {
        var i2 = (t = t || {}).dynamicTyping || false;
        U(i2) && (t.dynamicTypingFunction = i2, i2 = {});
        if (t.dynamicTyping = i2, t.transform = !!U(t.transform) && t.transform, !t.worker || !v.WORKERS_SUPPORTED) return i2 = null, v.NODE_STREAM_INPUT, "string" == typeof e ? (e = ((e2) => 65279 !== e2.charCodeAt(0) ? e2 : e2.slice(1))(e), i2 = new (t.download ? f : c)(t)) : true === e.readable && U(e.read) && U(e.on) ? i2 = new p(t) : (n.File && e instanceof File || e instanceof Object) && (i2 = new l(t)), i2.stream(e);
        (i2 = (() => {
          var e2;
          return !!v.WORKERS_SUPPORTED && (e2 = (() => {
            var e3 = n.URL || n.webkitURL || null, t2 = r.toString();
            return v.BLOB_URL || (v.BLOB_URL = e3.createObjectURL(new Blob(["var global = (function() { if (typeof self !== 'undefined') { return self; } if (typeof window !== 'undefined') { return window; } if (typeof global !== 'undefined') { return global; } return {}; })(); global.IS_PAPA_WORKER=true; ", "(", t2, ")();"], { type: "text/javascript" })));
          })(), (e2 = new n.Worker(e2)).onmessage = g, e2.id = h++, o[e2.id] = e2);
        })()).userStep = t.step, i2.userChunk = t.chunk, i2.userComplete = t.complete, i2.userError = t.error, t.step = U(t.step), t.chunk = U(t.chunk), t.complete = U(t.complete), t.error = U(t.error), delete t.worker, i2.postMessage({ input: e, config: t, workerId: i2.id });
      }, v.unparse = function(e, t) {
        var n2 = false, _2 = true, m2 = ",", y2 = "\r\n", s2 = '"', a2 = s2 + s2, i2 = false, r2 = null, o2 = false, h2 = ((() => {
          if ("object" == typeof t) {
            if ("string" != typeof t.delimiter || v.BAD_DELIMITERS.filter(function(e2) {
              return -1 !== t.delimiter.indexOf(e2);
            }).length || (m2 = t.delimiter), "boolean" != typeof t.quotes && "function" != typeof t.quotes && !Array.isArray(t.quotes) || (n2 = t.quotes), "boolean" != typeof t.skipEmptyLines && "string" != typeof t.skipEmptyLines || (i2 = t.skipEmptyLines), "string" == typeof t.newline && (y2 = t.newline), "string" == typeof t.quoteChar && (s2 = t.quoteChar), "boolean" == typeof t.header && (_2 = t.header), Array.isArray(t.columns)) {
              if (0 === t.columns.length) throw new Error("Option columns is empty");
              r2 = t.columns;
            }
            void 0 !== t.escapeChar && (a2 = t.escapeChar + s2), t.escapeFormulae instanceof RegExp ? o2 = t.escapeFormulae : "boolean" == typeof t.escapeFormulae && t.escapeFormulae && (o2 = /^[=+\-@\t\r].*$/);
          }
        })(), new RegExp(P(s2), "g"));
        "string" == typeof e && (e = JSON.parse(e));
        if (Array.isArray(e)) {
          if (!e.length || Array.isArray(e[0])) return u2(null, e, i2);
          if ("object" == typeof e[0]) return u2(r2 || Object.keys(e[0]), e, i2);
        } else if ("object" == typeof e) return "string" == typeof e.data && (e.data = JSON.parse(e.data)), Array.isArray(e.data) && (e.fields || (e.fields = e.meta && e.meta.fields || r2), e.fields || (e.fields = Array.isArray(e.data[0]) ? e.fields : "object" == typeof e.data[0] ? Object.keys(e.data[0]) : []), Array.isArray(e.data[0]) || "object" == typeof e.data[0] || (e.data = [e.data])), u2(e.fields || [], e.data || [], i2);
        throw new Error("Unable to serialize unrecognized input");
        function u2(e2, t2, i3) {
          var r3 = "", n3 = ("string" == typeof e2 && (e2 = JSON.parse(e2)), "string" == typeof t2 && (t2 = JSON.parse(t2)), Array.isArray(e2) && 0 < e2.length), s3 = !Array.isArray(t2[0]);
          if (n3 && _2) {
            for (var a3 = 0; a3 < e2.length; a3++) 0 < a3 && (r3 += m2), r3 += k(e2[a3], a3);
            0 < t2.length && (r3 += y2);
          }
          for (var o3 = 0; o3 < t2.length; o3++) {
            var h3 = (n3 ? e2 : t2[o3]).length, u3 = false, d2 = n3 ? 0 === Object.keys(t2[o3]).length : 0 === t2[o3].length;
            if (i3 && !n3 && (u3 = "greedy" === i3 ? "" === t2[o3].join("").trim() : 1 === t2[o3].length && 0 === t2[o3][0].length), "greedy" === i3 && n3) {
              for (var f2 = [], l2 = 0; l2 < h3; l2++) {
                var c2 = s3 ? e2[l2] : l2;
                f2.push(t2[o3][c2]);
              }
              u3 = "" === f2.join("").trim();
            }
            if (!u3) {
              for (var p2 = 0; p2 < h3; p2++) {
                0 < p2 && !d2 && (r3 += m2);
                var g2 = n3 && s3 ? e2[p2] : p2;
                r3 += k(t2[o3][g2], p2);
              }
              o3 < t2.length - 1 && (!i3 || 0 < h3 && !d2) && (r3 += y2);
            }
          }
          return r3;
        }
        function k(e2, t2) {
          var i3, r3;
          return null == e2 ? "" : e2.constructor === Date ? JSON.stringify(e2).slice(1, 25) : (r3 = false, o2 && "string" == typeof e2 && o2.test(e2) && (e2 = "'" + e2, r3 = true), i3 = e2.toString().replace(h2, a2), (r3 = r3 || true === n2 || "function" == typeof n2 && n2(e2, t2) || Array.isArray(n2) && n2[t2] || ((e3, t3) => {
            for (var i4 = 0; i4 < t3.length; i4++) if (-1 < e3.indexOf(t3[i4])) return true;
            return false;
          })(i3, v.BAD_DELIMITERS) || -1 < i3.indexOf(m2) || " " === i3.charAt(0) || " " === i3.charAt(i3.length - 1)) ? s2 + i3 + s2 : i3);
        }
      }, v.RECORD_SEP = String.fromCharCode(30), v.UNIT_SEP = String.fromCharCode(31), v.BYTE_ORDER_MARK = "\uFEFF", v.BAD_DELIMITERS = ["\r", "\n", '"', v.BYTE_ORDER_MARK], v.WORKERS_SUPPORTED = !s && !!n.Worker, v.NODE_STREAM_INPUT = 1, v.LocalChunkSize = 10485760, v.RemoteChunkSize = 5242880, v.DefaultDelimiter = ",", v.Parser = E, v.ParserHandle = i, v.NetworkStreamer = f, v.FileStreamer = l, v.StringStreamer = c, v.ReadableStreamStreamer = p, n.jQuery && ((d = n.jQuery).fn.parse = function(o2) {
        var i2 = o2.config || {}, h2 = [];
        return this.each(function(e2) {
          if (!("INPUT" === d(this).prop("tagName").toUpperCase() && "file" === d(this).attr("type").toLowerCase() && n.FileReader) || !this.files || 0 === this.files.length) return true;
          for (var t = 0; t < this.files.length; t++) h2.push({ file: this.files[t], inputElem: this, instanceConfig: d.extend({}, i2) });
        }), e(), this;
        function e() {
          if (0 === h2.length) U(o2.complete) && o2.complete();
          else {
            var e2, t, i3, r2, n2 = h2[0];
            if (U(o2.before)) {
              var s2 = o2.before(n2.file, n2.inputElem);
              if ("object" == typeof s2) {
                if ("abort" === s2.action) return e2 = "AbortError", t = n2.file, i3 = n2.inputElem, r2 = s2.reason, void (U(o2.error) && o2.error({ name: e2 }, t, i3, r2));
                if ("skip" === s2.action) return void u2();
                "object" == typeof s2.config && (n2.instanceConfig = d.extend(n2.instanceConfig, s2.config));
              } else if ("skip" === s2) return void u2();
            }
            var a2 = n2.instanceConfig.complete;
            n2.instanceConfig.complete = function(e3) {
              U(a2) && a2(e3, n2.file, n2.inputElem), u2();
            }, v.parse(n2.file, n2.instanceConfig);
          }
        }
        function u2() {
          h2.splice(0, 1), e();
        }
      }), a && (n.onmessage = function(e) {
        e = e.data;
        void 0 === v.WORKER_ID && e && (v.WORKER_ID = e.workerId);
        "string" == typeof e.input ? n.postMessage({ workerId: v.WORKER_ID, results: v.parse(e.input, e.config), finished: true }) : (n.File && e.input instanceof File || e.input instanceof Object) && (e = v.parse(e.input, e.config)) && n.postMessage({ workerId: v.WORKER_ID, results: e, finished: true });
      }), (f.prototype = Object.create(u.prototype)).constructor = f, (l.prototype = Object.create(u.prototype)).constructor = l, (c.prototype = Object.create(c.prototype)).constructor = c, (p.prototype = Object.create(u.prototype)).constructor = p, v;
    });
  }
});

// node_modules/.pnpm/comlink@4.4.2/node_modules/comlink/dist/esm/comlink.mjs
var proxyMarker = /* @__PURE__ */ Symbol("Comlink.proxy");
var createEndpoint = /* @__PURE__ */ Symbol("Comlink.endpoint");
var releaseProxy = /* @__PURE__ */ Symbol("Comlink.releaseProxy");
var finalizer = /* @__PURE__ */ Symbol("Comlink.finalizer");
var throwMarker = /* @__PURE__ */ Symbol("Comlink.thrown");
var isObject = (val) => typeof val === "object" && val !== null || typeof val === "function";
var proxyTransferHandler = {
  canHandle: (val) => isObject(val) && val[proxyMarker],
  serialize(obj) {
    const { port1, port2 } = new MessageChannel();
    expose(obj, port1);
    return [port2, [port2]];
  },
  deserialize(port) {
    port.start();
    return wrap(port);
  }
};
var throwTransferHandler = {
  canHandle: (value) => isObject(value) && throwMarker in value,
  serialize({ value }) {
    let serialized;
    if (value instanceof Error) {
      serialized = {
        isError: true,
        value: {
          message: value.message,
          name: value.name,
          stack: value.stack
        }
      };
    } else {
      serialized = { isError: false, value };
    }
    return [serialized, []];
  },
  deserialize(serialized) {
    if (serialized.isError) {
      throw Object.assign(new Error(serialized.value.message), serialized.value);
    }
    throw serialized.value;
  }
};
var transferHandlers = /* @__PURE__ */ new Map([
  ["proxy", proxyTransferHandler],
  ["throw", throwTransferHandler]
]);
function isAllowedOrigin(allowedOrigins, origin) {
  for (const allowedOrigin of allowedOrigins) {
    if (origin === allowedOrigin || allowedOrigin === "*") {
      return true;
    }
    if (allowedOrigin instanceof RegExp && allowedOrigin.test(origin)) {
      return true;
    }
  }
  return false;
}
function expose(obj, ep = globalThis, allowedOrigins = ["*"]) {
  ep.addEventListener("message", function callback(ev) {
    if (!ev || !ev.data) {
      return;
    }
    if (!isAllowedOrigin(allowedOrigins, ev.origin)) {
      console.warn(`Invalid origin '${ev.origin}' for comlink proxy`);
      return;
    }
    const { id, type, path } = Object.assign({ path: [] }, ev.data);
    const argumentList = (ev.data.argumentList || []).map(fromWireValue);
    let returnValue;
    try {
      const parent = path.slice(0, -1).reduce((obj2, prop) => obj2[prop], obj);
      const rawValue = path.reduce((obj2, prop) => obj2[prop], obj);
      switch (type) {
        case "GET":
          {
            returnValue = rawValue;
          }
          break;
        case "SET":
          {
            parent[path.slice(-1)[0]] = fromWireValue(ev.data.value);
            returnValue = true;
          }
          break;
        case "APPLY":
          {
            returnValue = rawValue.apply(parent, argumentList);
          }
          break;
        case "CONSTRUCT":
          {
            const value = new rawValue(...argumentList);
            returnValue = proxy(value);
          }
          break;
        case "ENDPOINT":
          {
            const { port1, port2 } = new MessageChannel();
            expose(obj, port2);
            returnValue = transfer(port1, [port1]);
          }
          break;
        case "RELEASE":
          {
            returnValue = void 0;
          }
          break;
        default:
          return;
      }
    } catch (value) {
      returnValue = { value, [throwMarker]: 0 };
    }
    Promise.resolve(returnValue).catch((value) => {
      return { value, [throwMarker]: 0 };
    }).then((returnValue2) => {
      const [wireValue, transferables] = toWireValue(returnValue2);
      ep.postMessage(Object.assign(Object.assign({}, wireValue), { id }), transferables);
      if (type === "RELEASE") {
        ep.removeEventListener("message", callback);
        closeEndPoint(ep);
        if (finalizer in obj && typeof obj[finalizer] === "function") {
          obj[finalizer]();
        }
      }
    }).catch((error) => {
      const [wireValue, transferables] = toWireValue({
        value: new TypeError("Unserializable return value"),
        [throwMarker]: 0
      });
      ep.postMessage(Object.assign(Object.assign({}, wireValue), { id }), transferables);
    });
  });
  if (ep.start) {
    ep.start();
  }
}
function isMessagePort(endpoint) {
  return endpoint.constructor.name === "MessagePort";
}
function closeEndPoint(endpoint) {
  if (isMessagePort(endpoint))
    endpoint.close();
}
function wrap(ep, target) {
  const pendingListeners = /* @__PURE__ */ new Map();
  ep.addEventListener("message", function handleMessage(ev) {
    const { data } = ev;
    if (!data || !data.id) {
      return;
    }
    const resolver = pendingListeners.get(data.id);
    if (!resolver) {
      return;
    }
    try {
      resolver(data);
    } finally {
      pendingListeners.delete(data.id);
    }
  });
  return createProxy(ep, pendingListeners, [], target);
}
function throwIfProxyReleased(isReleased) {
  if (isReleased) {
    throw new Error("Proxy has been released and is not useable");
  }
}
function releaseEndpoint(ep) {
  return requestResponseMessage(ep, /* @__PURE__ */ new Map(), {
    type: "RELEASE"
  }).then(() => {
    closeEndPoint(ep);
  });
}
var proxyCounter = /* @__PURE__ */ new WeakMap();
var proxyFinalizers = "FinalizationRegistry" in globalThis && new FinalizationRegistry((ep) => {
  const newCount = (proxyCounter.get(ep) || 0) - 1;
  proxyCounter.set(ep, newCount);
  if (newCount === 0) {
    releaseEndpoint(ep);
  }
});
function registerProxy(proxy2, ep) {
  const newCount = (proxyCounter.get(ep) || 0) + 1;
  proxyCounter.set(ep, newCount);
  if (proxyFinalizers) {
    proxyFinalizers.register(proxy2, ep, proxy2);
  }
}
function unregisterProxy(proxy2) {
  if (proxyFinalizers) {
    proxyFinalizers.unregister(proxy2);
  }
}
function createProxy(ep, pendingListeners, path = [], target = function() {
}) {
  let isProxyReleased = false;
  const proxy2 = new Proxy(target, {
    get(_target, prop) {
      throwIfProxyReleased(isProxyReleased);
      if (prop === releaseProxy) {
        return () => {
          unregisterProxy(proxy2);
          releaseEndpoint(ep);
          pendingListeners.clear();
          isProxyReleased = true;
        };
      }
      if (prop === "then") {
        if (path.length === 0) {
          return { then: () => proxy2 };
        }
        const r = requestResponseMessage(ep, pendingListeners, {
          type: "GET",
          path: path.map((p) => p.toString())
        }).then(fromWireValue);
        return r.then.bind(r);
      }
      return createProxy(ep, pendingListeners, [...path, prop]);
    },
    set(_target, prop, rawValue) {
      throwIfProxyReleased(isProxyReleased);
      const [value, transferables] = toWireValue(rawValue);
      return requestResponseMessage(ep, pendingListeners, {
        type: "SET",
        path: [...path, prop].map((p) => p.toString()),
        value
      }, transferables).then(fromWireValue);
    },
    apply(_target, _thisArg, rawArgumentList) {
      throwIfProxyReleased(isProxyReleased);
      const last = path[path.length - 1];
      if (last === createEndpoint) {
        return requestResponseMessage(ep, pendingListeners, {
          type: "ENDPOINT"
        }).then(fromWireValue);
      }
      if (last === "bind") {
        return createProxy(ep, pendingListeners, path.slice(0, -1));
      }
      const [argumentList, transferables] = processArguments(rawArgumentList);
      return requestResponseMessage(ep, pendingListeners, {
        type: "APPLY",
        path: path.map((p) => p.toString()),
        argumentList
      }, transferables).then(fromWireValue);
    },
    construct(_target, rawArgumentList) {
      throwIfProxyReleased(isProxyReleased);
      const [argumentList, transferables] = processArguments(rawArgumentList);
      return requestResponseMessage(ep, pendingListeners, {
        type: "CONSTRUCT",
        path: path.map((p) => p.toString()),
        argumentList
      }, transferables).then(fromWireValue);
    }
  });
  registerProxy(proxy2, ep);
  return proxy2;
}
function myFlat(arr) {
  return Array.prototype.concat.apply([], arr);
}
function processArguments(argumentList) {
  const processed = argumentList.map(toWireValue);
  return [processed.map((v) => v[0]), myFlat(processed.map((v) => v[1]))];
}
var transferCache = /* @__PURE__ */ new WeakMap();
function transfer(obj, transfers) {
  transferCache.set(obj, transfers);
  return obj;
}
function proxy(obj) {
  return Object.assign(obj, { [proxyMarker]: true });
}
function toWireValue(value) {
  for (const [name, handler] of transferHandlers) {
    if (handler.canHandle(value)) {
      const [serializedValue, transferables] = handler.serialize(value);
      return [
        {
          type: "HANDLER",
          name,
          value: serializedValue
        },
        transferables
      ];
    }
  }
  return [
    {
      type: "RAW",
      value
    },
    transferCache.get(value) || []
  ];
}
function fromWireValue(value) {
  switch (value.type) {
    case "HANDLER":
      return transferHandlers.get(value.name).deserialize(value.value);
    case "RAW":
      return value.value;
  }
}
function requestResponseMessage(ep, pendingListeners, msg, transfers) {
  return new Promise((resolve) => {
    const id = generateUUID();
    pendingListeners.set(id, resolve);
    if (ep.start) {
      ep.start();
    }
    ep.postMessage(Object.assign({ id }, msg), transfers);
  });
}
function generateUUID() {
  return new Array(4).fill(0).map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)).join("-");
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/constants.js
var MAGIC = Uint8Array.of(65, 82, 82, 79, 87, 49);
var EOS = Uint8Array.of(255, 255, 255, 255, 0, 0, 0, 0);
var Version = (
  /** @type {const} */
  {
    /** 0.1.0 (October 2016). */
    V1: 0,
    /** 0.2.0 (February 2017). Non-backwards compatible with V1. */
    V2: 1,
    /** 0.3.0 -> 0.7.1 (May - December 2017). Non-backwards compatible with V2. */
    V3: 2,
    /** >= 0.8.0 (December 2017). Non-backwards compatible with V3. */
    V4: 3,
    /**
     * >= 1.0.0 (July 2020). Backwards compatible with V4 (V5 readers can read V4
     * metadata and IPC messages). Implementations are recommended to provide a
     * V4 compatibility mode with V5 format changes disabled.
     *
     * Incompatible changes between V4 and V5:
     * - Union buffer layout has changed.
     *   In V5, Unions don't have a validity bitmap buffer.
     */
    V5: 4
  }
);
var MessageHeader = (
  /** @type {const} */
  {
    NONE: 0,
    /**
     * A Schema describes the columns in a record batch.
     */
    Schema: 1,
    /**
     * For sending dictionary encoding information. Any Field can be
     * dictionary-encoded, but in this case none of its children may be
     * dictionary-encoded.
     * There is one vector / column per dictionary, but that vector / column
     * may be spread across multiple dictionary batches by using the isDelta
     * flag.
     */
    DictionaryBatch: 2,
    /**
     * A data header describing the shared memory layout of a "record" or "row"
     * batch. Some systems call this a "row batch" internally and others a "record
     * batch".
     */
    RecordBatch: 3,
    /**
     * EXPERIMENTAL: Metadata for n-dimensional arrays, aka "tensors" or
     * "ndarrays". Arrow implementations in general are not required to implement
     * this type.
     *
     * Not currently supported by Flechette.
     */
    Tensor: 4,
    /**
     * EXPERIMENTAL: Metadata for n-dimensional sparse arrays, aka "sparse
     * tensors". Arrow implementations in general are not required to implement
     * this type.
     *
     * Not currently supported by Flechette.
     */
    SparseTensor: 5
  }
);
var Type = (
  /** @type {const} */
  {
    /**
     * Dictionary types compress data by using a set of integer indices to
     * lookup potentially repeated vales in a separate dictionary of values.
     *
     * This type entry is provided for API convenience, it does not occur
     * in actual Arrow IPC binary data.
     */
    Dictionary: -1,
    /** No data type. Included for flatbuffer compatibility. */
    NONE: 0,
    /** Null values only. */
    Null: 1,
    /** Integers, either signed or unsigned, with 8, 16, 32, or 64 bit widths. */
    Int: 2,
    /** Floating point numbers with 16, 32, or 64 bit precision. */
    Float: 3,
    /** Opaque binary data. */
    Binary: 4,
    /** Unicode with UTF-8 encoding. */
    Utf8: 5,
    /** Booleans represented as 8 bit bytes. */
    Bool: 6,
    /**
     * Exact decimal value represented as an integer value in two's complement.
     * Currently only 128-bit (16-byte) and 256-bit (32-byte) integers are used.
     * The representation uses the endianness indicated in the schema.
     */
    Decimal: 7,
    /**
     * Date is either a 32-bit or 64-bit signed integer type representing an
     * elapsed time since UNIX epoch (1970-01-01), stored in either of two units:
     * - Milliseconds (64 bits) indicating UNIX time elapsed since the epoch (no
     * leap seconds), where the values are evenly divisible by 86400000
     * - Days (32 bits) since the UNIX epoch
     */
    Date: 8,
    /**
     * Time is either a 32-bit or 64-bit signed integer type representing an
     * elapsed time since midnight, stored in either of four units: seconds,
     * milliseconds, microseconds or nanoseconds.
     *
     * The integer `bitWidth` depends on the `unit` and must be one of the following:
     * - SECOND and MILLISECOND: 32 bits
     * - MICROSECOND and NANOSECOND: 64 bits
     *
     * The allowed values are between 0 (inclusive) and 86400 (=24*60*60) seconds
     * (exclusive), adjusted for the time unit (for example, up to 86400000
     * exclusive for the MILLISECOND unit).
     * This definition doesn't allow for leap seconds. Time values from
     * measurements with leap seconds will need to be corrected when ingesting
     * into Arrow (for example by replacing the value 86400 with 86399).
     */
    Time: 9,
    /**
     * Timestamp is a 64-bit signed integer representing an elapsed time since a
     * fixed epoch, stored in either of four units: seconds, milliseconds,
     * microseconds or nanoseconds, and is optionally annotated with a timezone.
     *
     * Timestamp values do not include any leap seconds (in other words, all
     * days are considered 86400 seconds long).
     *
     * The timezone is an optional string for the name of a timezone, one of:
     *
     *  - As used in the Olson timezone database (the "tz database" or
     *    "tzdata"), such as "America/New_York".
     *  - An absolute timezone offset of the form "+XX:XX" or "-XX:XX",
     *    such as "+07:30".
     *
     * Whether a timezone string is present indicates different semantics about
     * the data.
     */
    Timestamp: 10,
    /**
     * A "calendar" interval which models types that don't necessarily
     * have a precise duration without the context of a base timestamp (e.g.
     * days can differ in length during day light savings time transitions).
     * All integers in the units below are stored in the endianness indicated
     * by the schema.
     *
     *  - YEAR_MONTH - Indicates the number of elapsed whole months, stored as
     *    4-byte signed integers.
     *  - DAY_TIME - Indicates the number of elapsed days and milliseconds (no
     *    leap seconds), stored as 2 contiguous 32-bit signed integers (8-bytes
     *    in total). Support of this IntervalUnit is not required for full arrow
     *    compatibility.
     *  - MONTH_DAY_NANO - A triple of the number of elapsed months, days, and
     *    nanoseconds. The values are stored contiguously in 16-byte blocks.
     *    Months and days are encoded as 32-bit signed integers and nanoseconds
     *    is encoded as a 64-bit signed integer. Nanoseconds does not allow for
     *    leap seconds. Each field is independent (e.g. there is no constraint
     *    that nanoseconds have the same sign as days or that the quantity of
     *    nanoseconds represents less than a day's worth of time).
     */
    Interval: 11,
    /**
     * List (vector) data supporting variably-sized lists.
     * A list has a single child data type for list entries.
     */
    List: 12,
    /**
     * A struct consisting of multiple named child data types.
     */
    Struct: 13,
    /**
     * A union is a complex type with parallel child data types. By default ids
     * in the type vector refer to the offsets in the children. Optionally
     * typeIds provides an indirection between the child offset and the type id.
     * For each child `typeIds[offset]` is the id used in the type vector.
     */
    Union: 14,
    /**
     * Binary data where each entry has the same fixed size.
     */
    FixedSizeBinary: 15,
    /**
     * List (vector) data where every list has the same fixed size.
     * A list has a single child data type for list entries.
     */
    FixedSizeList: 16,
    /**
     * A Map is a logical nested type that is represented as
     * List<entries: Struct<key: K, value: V>>
     *
     * In this layout, the keys and values are each respectively contiguous. We do
     * not constrain the key and value types, so the application is responsible
     * for ensuring that the keys are hashable and unique. Whether the keys are sorted
     * may be set in the metadata for this field.
     *
     * In a field with Map type, the field has a child Struct field, which then
     * has two children: key type and the second the value type. The names of the
     * child fields may be respectively "entries", "key", and "value", but this is
     * not enforced.
     *
     * Map
     * ```text
     *   - child[0] entries: Struct
     *   - child[0] key: K
     *   - child[1] value: V
     *  ```
     * Neither the "entries" field nor the "key" field may be nullable.
     *
     * The metadata is structured so that Arrow systems without special handling
     * for Map can make Map an alias for List. The "layout" attribute for the Map
     * field must have the same contents as a List.
     */
    Map: 17,
    /**
     * An absolute length of time unrelated to any calendar artifacts. For the
     * purposes of Arrow implementations, adding this value to a Timestamp
     * ("t1") naively (i.e. simply summing the two numbers) is acceptable even
     * though in some cases the resulting Timestamp (t2) would not account for
     * leap-seconds during the elapsed time between "t1" and "t2". Similarly,
     * representing the difference between two Unix timestamp is acceptable, but
     * would yield a value that is possibly a few seconds off from the true
     * elapsed time.
     *
     * The resolution defaults to millisecond, but can be any of the other
     * supported TimeUnit values as with Timestamp and Time types. This type is
     * always represented as an 8-byte integer.
     */
    Duration: 18,
    /**
     * Same as Binary, but with 64-bit offsets, allowing representation of
     * extremely large data values.
     */
    LargeBinary: 19,
    /**
     * Same as Utf8, but with 64-bit offsets, allowing representation of
     * extremely large data values.
     */
    LargeUtf8: 20,
    /**
     * Same as List, but with 64-bit offsets, allowing representation of
     * extremely large data values.
     */
    LargeList: 21,
    /**
     * Contains two child arrays, run_ends and values. The run_ends child array
     * must be a 16/32/64-bit integer array which encodes the indices at which
     * the run with the value in each corresponding index in the values child
     * array ends. Like list/struct types, the value array can be of any type.
     */
    RunEndEncoded: 22,
    /**
     * Logically the same as Binary, but the internal representation uses a view
     * struct that contains the string length and either the string's entire data
     * inline (for small strings) or an inlined prefix, an index of another buffer,
     * and an offset pointing to a slice in that buffer (for non-small strings).
     *
     * Since it uses a variable number of data buffers, each Field with this type
     * must have a corresponding entry in `variadicBufferCounts`.
     */
    BinaryView: 23,
    /**
     * Logically the same as Utf8, but the internal representation uses a view
     * struct that contains the string length and either the string's entire data
     * inline (for small strings) or an inlined prefix, an index of another buffer,
     * and an offset pointing to a slice in that buffer (for non-small strings).
     *
     * Since it uses a variable number of data buffers, each Field with this type
     * must have a corresponding entry in `variadicBufferCounts`.
     */
    Utf8View: 24,
    /**
     * Represents the same logical types that List can, but contains offsets and
     * sizes allowing for writes in any order and sharing of child values among
     * list values.
     */
    ListView: 25,
    /**
     * Same as ListView, but with 64-bit offsets and sizes, allowing to represent
     * extremely large data values.
     */
    LargeListView: 26
  }
);
var Precision = (
  /** @type {const} */
  {
    /** 16-bit floating point number. */
    HALF: 0,
    /** 32-bit floating point number. */
    SINGLE: 1,
    /** 64-bit floating point number. */
    DOUBLE: 2
  }
);
var DateUnit = (
  /** @type {const} */
  {
    /* Days (as 32 bit int) since the UNIX epoch. */
    DAY: 0,
    /**
     * Milliseconds (as 64 bit int) indicating UNIX time elapsed since the epoch
     * (no leap seconds), with values evenly divisible by 86400000.
     */
    MILLISECOND: 1
  }
);
var TimeUnit = (
  /** @type {const} */
  {
    /** Seconds. */
    SECOND: 0,
    /** Milliseconds. */
    MILLISECOND: 1,
    /** Microseconds. */
    MICROSECOND: 2,
    /** Nanoseconds. */
    NANOSECOND: 3
  }
);
var IntervalUnit = (
  /** @type {const} */
  {
    /**
     * Indicates the number of elapsed whole months, stored as 4-byte signed
     * integers.
     */
    YEAR_MONTH: 0,
    /**
     * Indicates the number of elapsed days and milliseconds (no leap seconds),
     * stored as 2 contiguous 32-bit signed integers (8-bytes in total). Support
     * of this IntervalUnit is not required for full arrow compatibility.
     */
    DAY_TIME: 1,
    /**
     * A triple of the number of elapsed months, days, and nanoseconds.
     * The values are stored contiguously in 16-byte blocks. Months and days are
     * encoded as 32-bit signed integers and nanoseconds is encoded as a 64-bit
     * signed integer. Nanoseconds does not allow for leap seconds. Each field is
     * independent (e.g. there is no constraint that nanoseconds have the same
     * sign as days or that the quantity of nanoseconds represents less than a
     * day's worth of time).
     */
    MONTH_DAY_NANO: 2
  }
);
var UnionMode = (
  /** @type {const} */
  {
    /** Sparse union layout with full arrays for each sub-type. */
    Sparse: 0,
    /** Dense union layout with offsets into value arrays. */
    Dense: 1
  }
);
var CompressionType = (
  /** @type {const} */
  {
    /**
     * LZ4 frame compression.
     * Not to be confused with "raw" (also called "block") format.
     */
    LZ4_FRAME: 0,
    /** Zstandard compression. */
    ZSTD: 1
  }
);
var BodyCompressionMethod = (
  /** @type {const} */
  {
    /**
     * Each constituent buffer is first compressed with the indicated
     * compressor, and then written with the uncompressed length in the first 8
     * bytes as a 64-bit little-endian signed integer followed by the compressed
     * buffer bytes (and then padding as required by the protocol). The
     * uncompressed length may be set to -1 to indicate that the data that
     * follows is not compressed, which can be useful for cases where
     * compression does not yield appreciable savings.
     */
    BUFFER: 0
  }
);

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/util/arrays.js
var uint8Array = Uint8Array;
var uint16Array = Uint16Array;
var uint32Array = Uint32Array;
var uint64Array = BigUint64Array;
var int8Array = Int8Array;
var int16Array = Int16Array;
var int32Array = Int32Array;
var int64Array = BigInt64Array;
var float32Array = Float32Array;
var float64Array = Float64Array;
function objectToString(value) {
  return Object.prototype.toString.call(value);
}
function isArrayBufferLike(data) {
  return objectToString(data) === "[object ArrayBuffer]" || objectToString(data) === "[object SharedArrayBuffer]";
}
function isUint8Array(value) {
  return objectToString(value) === "[object Uint8Array]";
}
function intArrayType(bitWidth, signed) {
  const i = Math.log2(bitWidth) - 3;
  return (signed ? [int8Array, int16Array, int32Array, int64Array] : [uint8Array, uint16Array, uint32Array, uint64Array])[i];
}
function bisect(offsets, index) {
  let a = 0;
  let b = offsets.length;
  if (b <= 2147483648) {
    do {
      const mid = a + b >>> 1;
      if (offsets[mid] <= index) a = mid + 1;
      else b = mid;
    } while (a < b);
  } else {
    do {
      const mid = Math.trunc((a + b) / 2);
      if (offsets[mid] <= index) a = mid + 1;
      else b = mid;
    } while (a < b);
  }
  return a;
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/util/objects.js
function check(value, test, message) {
  if (test(value)) return value;
  throw new Error(message(value));
}
function checkOneOf(value, set, message) {
  set = Array.isArray(set) ? set : Object.values(set);
  return check(
    value,
    (value2) => set.includes(value2),
    message ?? (() => `${value} must be one of ${set}`)
  );
}
function keyFor(object, value) {
  for (const [key, val] of Object.entries(object)) {
    if (val === value) return key;
  }
  return "<Unknown>";
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/data-types.js
var invalidDataType = (typeId) => `Unsupported data type: "${keyFor(Type, typeId)}" (id ${typeId})`;
var field = (name, type, nullable = true, metadata = null) => ({
  name,
  type,
  nullable,
  metadata
});
function isField(value) {
  return Object.hasOwn(value, "name") && isDataType(value.type);
}
function isDataType(value) {
  return typeof value?.typeId === "number";
}
function asField(value, defaultName = "", defaultNullable = true) {
  return isField(value) ? value : field(
    defaultName,
    check(value, isDataType, () => `Data type expected.`),
    defaultNullable
  );
}
var dictionary = (type, indexType, ordered = false, id = -1) => ({
  typeId: Type.Dictionary,
  id,
  dictionary: type,
  indices: indexType || int32(),
  ordered
});
var int = (bitWidth = 32, signed = true) => ({
  typeId: Type.Int,
  bitWidth: checkOneOf(bitWidth, [8, 16, 32, 64]),
  signed,
  values: intArrayType(bitWidth, signed)
});
var int32 = () => int(32);
var float = (precision = 2) => ({
  typeId: Type.Float,
  precision: checkOneOf(precision, Precision),
  values: [uint16Array, float32Array, float64Array][precision]
});
var binary = () => ({
  typeId: Type.Binary,
  offsets: int32Array
});
var utf8 = () => ({
  typeId: Type.Utf8,
  offsets: int32Array
});
var decimal = (precision, scale, bitWidth = 128) => ({
  typeId: Type.Decimal,
  precision,
  scale,
  bitWidth: checkOneOf(bitWidth, [32, 64, 128, 256]),
  values: bitWidth === 32 ? int32Array : uint64Array
});
var date = (unit) => ({
  typeId: Type.Date,
  unit: checkOneOf(unit, DateUnit),
  values: unit === DateUnit.DAY ? int32Array : int64Array
});
var time = (unit = TimeUnit.MILLISECOND) => {
  unit = checkOneOf(unit, TimeUnit);
  const bitWidth = unit === TimeUnit.SECOND || unit === TimeUnit.MILLISECOND ? 32 : 64;
  return {
    typeId: Type.Time,
    unit,
    bitWidth,
    values: bitWidth === 32 ? int32Array : int64Array
  };
};
var timestamp = (unit = TimeUnit.MILLISECOND, timezone = null) => ({
  typeId: Type.Timestamp,
  unit: checkOneOf(unit, TimeUnit),
  timezone,
  values: int64Array
});
var interval = (unit = IntervalUnit.MONTH_DAY_NANO) => ({
  typeId: Type.Interval,
  unit: checkOneOf(unit, IntervalUnit),
  values: unit === IntervalUnit.MONTH_DAY_NANO ? void 0 : int32Array
});
var list = (child) => ({
  typeId: Type.List,
  children: [asField(child)],
  offsets: int32Array
});
var struct = (children) => ({
  typeId: Type.Struct,
  children: Array.isArray(children) && children.length > 0 && isField(children[0]) ? (
    /** @type {Field[]} */
    children
  ) : Object.entries(children).map(([name, type]) => field(name, type))
});
var union = (mode, children, typeIds, typeIdForValue) => {
  typeIds ??= children.map((v, i) => i);
  return {
    typeId: Type.Union,
    mode: checkOneOf(mode, UnionMode),
    typeIds,
    typeMap: typeIds.reduce((m, id, i) => (m[id] = i, m), {}),
    children: children.map((v, i) => asField(v, `_${i}`)),
    typeIdForValue,
    offsets: int32Array
  };
};
var fixedSizeBinary = (stride) => ({
  typeId: Type.FixedSizeBinary,
  stride
});
var fixedSizeList = (child, stride) => ({
  typeId: Type.FixedSizeList,
  stride,
  children: [asField(child)]
});
var mapType = (keysSorted, child) => ({
  typeId: Type.Map,
  keysSorted,
  children: [child],
  offsets: int32Array
});
var duration = (unit = TimeUnit.MILLISECOND) => ({
  typeId: Type.Duration,
  unit: checkOneOf(unit, TimeUnit),
  values: int64Array
});
var largeBinary = () => ({
  typeId: Type.LargeBinary,
  offsets: int64Array
});
var largeUtf8 = () => ({
  typeId: Type.LargeUtf8,
  offsets: int64Array
});
var largeList = (child) => ({
  typeId: Type.LargeList,
  children: [asField(child)],
  offsets: int64Array
});
var runEndEncoded = (runsField, valuesField) => ({
  typeId: Type.RunEndEncoded,
  children: [
    check(
      asField(runsField, "run_ends"),
      (field2) => field2.type.typeId === Type.Int,
      () => "Run-ends must have an integer type."
    ),
    asField(valuesField, "values")
  ]
});
var listView = (child) => ({
  typeId: Type.ListView,
  children: [asField(child, "value")],
  offsets: int32Array
});
var largeListView = (child) => ({
  typeId: Type.LargeListView,
  children: [asField(child, "value")],
  offsets: int64Array
});

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/util/numbers.js
var f64 = new float64Array(2);
var buf = f64.buffer;
var i64 = new int64Array(buf);
var u32 = new uint32Array(buf);
var i32 = new int32Array(buf);
var u8 = new uint8Array(buf);
function toNumber(value) {
  if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
    throw Error(`BigInt exceeds integer number representation: ${value}`);
  }
  return Number(value);
}
function divide(num, div) {
  return Number(num / div) + Number(num % div) / Number(div);
}
var asUint64 = (v) => BigInt.asUintN(64, v);
function fromDecimal64(buf2, offset) {
  return BigInt.asIntN(64, buf2[offset]);
}
function fromDecimal128(buf2, offset) {
  const i = offset << 1;
  let x;
  if (BigInt.asIntN(64, buf2[i + 1]) < 0) {
    x = asUint64(~buf2[i]) | asUint64(~buf2[i + 1]) << 64n;
    x = -(x + 1n);
  } else {
    x = buf2[i] | buf2[i + 1] << 64n;
  }
  return x;
}
function fromDecimal256(buf2, offset) {
  const i = offset << 2;
  let x;
  if (BigInt.asIntN(64, buf2[i + 3]) < 0) {
    x = asUint64(~buf2[i]) | asUint64(~buf2[i + 1]) << 64n | asUint64(~buf2[i + 2]) << 128n | asUint64(~buf2[i + 3]) << 192n;
    x = -(x + 1n);
  } else {
    x = buf2[i] | buf2[i + 1] << 64n | buf2[i + 2] << 128n | buf2[i + 3] << 192n;
  }
  return x;
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/util/strings.js
var textDecoder = new TextDecoder("utf-8");
var textEncoder = new TextEncoder();
function decodeUtf8(buf2) {
  return textDecoder.decode(buf2);
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/util/read.js
var SIZEOF_INT = 4;
function decodeBit(bitmap2, index) {
  return (bitmap2[index >> 3] & 1 << index % 8) !== 0;
}
function readObject(buf2, index) {
  const pos = index + readInt32(buf2, index);
  const vtable = pos - readInt32(buf2, pos);
  const size = readInt16(buf2, vtable);
  return (index2, read, fallback = null) => {
    if (index2 < size) {
      const off = readInt16(buf2, vtable + index2);
      if (off) return read(buf2, pos + off);
    }
    return fallback;
  };
}
function readOffset(buf2, offset) {
  return offset;
}
function readBoolean(buf2, offset) {
  return !!readInt8(buf2, offset);
}
function readInt8(buf2, offset) {
  return readUint8(buf2, offset) << 24 >> 24;
}
function readUint8(buf2, offset) {
  return buf2[offset];
}
function readInt16(buf2, offset) {
  return readUint16(buf2, offset) << 16 >> 16;
}
function readUint16(buf2, offset) {
  return buf2[offset] | buf2[offset + 1] << 8;
}
function readInt32(buf2, offset) {
  return buf2[offset] | buf2[offset + 1] << 8 | buf2[offset + 2] << 16 | buf2[offset + 3] << 24;
}
function readUint32(buf2, offset) {
  return readInt32(buf2, offset) >>> 0;
}
function readInt64(buf2, offset) {
  return toNumber(BigInt.asIntN(
    64,
    BigInt(readUint32(buf2, offset)) + (BigInt(readUint32(buf2, offset + SIZEOF_INT)) << 32n)
  ));
}
function readString(buf2, index) {
  let offset = index + readInt32(buf2, index);
  const length = readInt32(buf2, offset);
  offset += SIZEOF_INT;
  return decodeUtf8(buf2.subarray(offset, offset + length));
}
function readVector(buf2, offset, stride, extract) {
  if (!offset) return [];
  const base = offset + readInt32(buf2, offset);
  return Array.from(
    { length: readInt32(buf2, base) },
    (_, i) => extract(buf2, base + SIZEOF_INT + i * stride)
  );
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/util/struct.js
var RowIndex = /* @__PURE__ */ Symbol("rowIndex");
function proxyFactory(names, batches) {
  class RowObject {
    /**
     * Create a new proxy row object representing a struct or table row.
     * @param {number} index The record batch row index.
     */
    constructor(index) {
      this[RowIndex] = index;
    }
    /**
     * Return a JSON-compatible object representation.
     */
    toJSON() {
      return structObject(names, batches, this[RowIndex]);
    }
  }
  ;
  const proto = RowObject.prototype;
  for (let i = 0; i < names.length; ++i) {
    if (Object.hasOwn(proto, names[i])) continue;
    const batch = batches[i];
    Object.defineProperty(proto, names[i], {
      get() {
        return batch.at(this[RowIndex]);
      },
      enumerable: true
    });
  }
  return (index) => new RowObject(index);
}
function objectFactory(names, batches) {
  return (index) => structObject(names, batches, index);
}
function structObject(names, batches, index) {
  const obj = {};
  for (let i = 0; i < names.length; ++i) {
    obj[names[i]] = batches[i].at(index);
  }
  return obj;
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/batch.js
function isDirectBatch(batch) {
  return batch instanceof DirectBatch;
}
var Batch = class {
  /**
   * The array type to use when extracting data from the batch.
   * A null value indicates that the array type should match
   * the type of the batch's values array.
   * @type {ArrayConstructor | TypedArrayConstructor | null}
   */
  static ArrayType = null;
  /**
   * Create a new column batch.
   * @param {object} options
   * @param {number} options.length The length of the batch
   * @param {number} options.nullCount The null value count
   * @param {DataType} options.type The data type.
   * @param {Uint8Array} [options.validity] Validity bitmap buffer
   * @param {TypedArray} [options.values] Values buffer
   * @param {OffsetArray} [options.offsets] Offsets buffer
   * @param {OffsetArray} [options.sizes] Sizes buffer
   * @param {Batch[]} [options.children] Children batches
   */
  constructor({
    length,
    nullCount,
    type,
    validity,
    values,
    offsets,
    sizes,
    children
  }) {
    this.length = length;
    this.nullCount = nullCount;
    this.type = type;
    this.validity = validity;
    this.values = values;
    this.offsets = offsets;
    this.sizes = sizes;
    this.children = children;
    if (!nullCount || !this.validity) {
      this.at = (index) => this.value(index);
    }
  }
  /**
   * Provide an informative object string tag.
   */
  get [Symbol.toStringTag]() {
    return "Batch";
  }
  /**
   * Return the value at the given index.
   * @param {number} index The value index.
   * @returns {T | null} The value.
   */
  at(index) {
    return this.isValid(index) ? this.value(index) : null;
  }
  /**
   * Check if a value at the given index is valid (non-null).
   * @param {number} index The value index.
   * @returns {boolean} True if valid, false otherwise.
   */
  isValid(index) {
    return decodeBit(this.validity, index);
  }
  /**
   * Return the value at the given index. This method does not check the
   * validity bitmap and is intended primarily for internal use. In most
   * cases, callers should use the `at()` method instead.
   * @param {number} index The value index
   * @returns {T} The value, ignoring the validity bitmap.
   */
  value(index) {
    return (
      /** @type {T} */
      this.values[index]
    );
  }
  /**
   * Extract an array of values within the given index range. Unlike
   * Array.slice, all arguments are required and may not be negative indices.
   * @param {number} start The starting index, inclusive
   * @param {number} end The ending index, exclusive
   * @returns {ValueArray<T?>} The slice of values
   */
  slice(start, end) {
    const n = end - start;
    const values = Array(n);
    for (let i = 0; i < n; ++i) {
      values[i] = this.at(start + i);
    }
    return values;
  }
  /**
   * Return an iterator over the values in this batch.
   * @returns {Iterator<T?>}
   */
  *[Symbol.iterator]() {
    for (let i = 0; i < this.length; ++i) {
      yield this.at(i);
    }
  }
};
var DirectBatch = class extends Batch {
  /**
   * Create a new column batch with direct value array access.
   * @param {object} options
   * @param {number} options.length The length of the batch
   * @param {number} options.nullCount The null value count
   * @param {DataType} options.type The data type.
   * @param {Uint8Array} [options.validity] Validity bitmap buffer
   * @param {TypedArray} options.values Values buffer
   */
  constructor(options) {
    super(options);
    const { length, values } = this;
    this.values = values.subarray(0, length);
  }
  /**
   * Extract an array of values within the given index range. Unlike
   * Array.slice, all arguments are required and may not be negative indices.
   * When feasible, a zero-copy subarray of a typed array is returned.
   * @param {number} start The starting index, inclusive
   * @param {number} end The ending index, exclusive
   * @returns {ValueArray<T?>} The slice of values
   */
  slice(start, end) {
    return this.nullCount ? super.slice(start, end) : this.values.subarray(start, end);
  }
  /**
   * Return an iterator over the values in this batch.
   * @returns {Iterator<T?>}
   */
  [Symbol.iterator]() {
    return this.nullCount ? super[Symbol.iterator]() : (
      /** @type {Iterator<T?>} */
      this.values[Symbol.iterator]()
    );
  }
};
var NumberBatch = class extends Batch {
  static ArrayType = float64Array;
};
var ArrayBatch = class extends Batch {
  static ArrayType = Array;
};
var NullBatch = class extends ArrayBatch {
  /**
   * @param {number} index The value index
   * @returns {null}
   */
  value(index) {
    return null;
  }
};
var Int64Batch = class extends NumberBatch {
  /**
   * @param {number} index The value index
   */
  value(index) {
    return toNumber(
      /** @type {bigint} */
      this.values[index]
    );
  }
};
var Float16Batch = class extends NumberBatch {
  /**
   * @param {number} index The value index
   */
  value(index) {
    const v = (
      /** @type {number} */
      this.values[index]
    );
    const expo = (v & 31744) >> 10;
    const sigf = (v & 1023) / 1024;
    const sign = (-1) ** ((v & 32768) >> 15);
    switch (expo) {
      case 31:
        return sign * (sigf ? Number.NaN : 1 / 0);
      case 0:
        return sign * (sigf ? 6103515625e-14 * sigf : 0);
    }
    return sign * 2 ** (expo - 15) * (1 + sigf);
  }
};
var BoolBatch = class extends ArrayBatch {
  /**
   * @param {number} index The value index
   */
  value(index) {
    return decodeBit(
      /** @type {Uint8Array} */
      this.values,
      index
    );
  }
};
var Decimal32NumberBatch = class extends NumberBatch {
  constructor(options) {
    super(options);
    const { scale } = (
      /** @type {DecimalType} */
      this.type
    );
    this.scale = 10 ** scale;
  }
  /**
   * @param {number} index The value index
   */
  value(index) {
    return (
      /** @type {number} */
      this.values[index] / this.scale
    );
  }
};
var DecimalBatch = class extends Batch {
  constructor(options) {
    super(options);
    const { bitWidth, scale } = (
      /** @type {DecimalType} */
      this.type
    );
    this.decimal = bitWidth === 64 ? fromDecimal64 : bitWidth === 128 ? fromDecimal128 : fromDecimal256;
    this.scale = 10n ** BigInt(scale);
  }
};
var DecimalNumberBatch = class extends DecimalBatch {
  static ArrayType = float64Array;
  /**
   * @param {number} index The value index
   */
  value(index) {
    return divide(
      this.decimal(
        /** @type {BigUint64Array} */
        this.values,
        index
      ),
      this.scale
    );
  }
};
var DecimalBigIntBatch = class extends DecimalBatch {
  static ArrayType = Array;
  /**
   * @param {number} index The value index
   */
  value(index) {
    return this.decimal(
      /** @type {BigUint64Array} */
      this.values,
      index
    );
  }
};
var DateBatch = class extends ArrayBatch {
  /**
   * Create a new date batch.
   * @param {Batch<number>} batch A batch of timestamp values.
   */
  constructor(batch) {
    super(batch);
    this.source = batch;
  }
  /**
   * @param {number} index The value index
   */
  value(index) {
    return new Date(this.source.value(index));
  }
};
var DateDayBatch = class extends NumberBatch {
  /**
   * @param {number} index The value index
   * @returns {number}
   */
  value(index) {
    return 864e5 * /** @type {number} */
    this.values[index];
  }
};
var DateDayMillisecondBatch = Int64Batch;
var TimestampSecondBatch = class extends Int64Batch {
  /**
   * @param {number} index The value index
   */
  value(index) {
    return super.value(index) * 1e3;
  }
};
var TimestampMillisecondBatch = Int64Batch;
var TimestampMicrosecondBatch = class extends Int64Batch {
  /**
   * @param {number} index The value index
   */
  value(index) {
    return divide(
      /** @type {bigint} */
      this.values[index],
      1000n
    );
  }
};
var TimestampNanosecondBatch = class extends Int64Batch {
  /**
   * @param {number} index The value index
   */
  value(index) {
    return divide(
      /** @type {bigint} */
      this.values[index],
      1000000n
    );
  }
};
var IntervalDayTimeBatch = class extends ArrayBatch {
  /**
   * @param {number} index The value index
   * @returns {Int32Array}
   */
  value(index) {
    const values = (
      /** @type {Int32Array} */
      this.values
    );
    return values.subarray(index << 1, index + 1 << 1);
  }
};
var IntervalMonthDayNanoBatch = class extends ArrayBatch {
  /**
   * @param {number} index The value index
   */
  value(index) {
    const values = (
      /** @type {Uint8Array} */
      this.values
    );
    const base = index << 4;
    return Float64Array.of(
      readInt32(values, base),
      readInt32(values, base + 4),
      readInt64(values, base + 8)
    );
  }
};
var offset32 = ({ values, offsets }, index) => values.subarray(offsets[index], offsets[index + 1]);
var offset64 = ({ values, offsets }, index) => values.subarray(toNumber(offsets[index]), toNumber(offsets[index + 1]));
var BinaryBatch = class extends ArrayBatch {
  /**
   * @param {number} index
   * @returns {Uint8Array}
   */
  value(index) {
    return offset32(this, index);
  }
};
var LargeBinaryBatch = class extends ArrayBatch {
  /**
   * @param {number} index
   * @returns {Uint8Array}
   */
  value(index) {
    return offset64(this, index);
  }
};
var Utf8Batch = class extends ArrayBatch {
  /**
   * @param {number} index
   */
  value(index) {
    return decodeUtf8(offset32(this, index));
  }
};
var LargeUtf8Batch = class extends ArrayBatch {
  /**
   * @param {number} index
   */
  value(index) {
    return decodeUtf8(offset64(this, index));
  }
};
var ListBatch = class extends ArrayBatch {
  /**
   * @param {number} index
   * @returns {ValueArray<V>}
   */
  value(index) {
    const offsets = (
      /** @type {Int32Array} */
      this.offsets
    );
    return this.children[0].slice(offsets[index], offsets[index + 1]);
  }
};
var LargeListBatch = class extends ArrayBatch {
  /**
   * @param {number} index
   * @returns {ValueArray<V>}
   */
  value(index) {
    const offsets = (
      /** @type {BigInt64Array} */
      this.offsets
    );
    return this.children[0].slice(toNumber(offsets[index]), toNumber(offsets[index + 1]));
  }
};
var ListViewBatch = class extends ArrayBatch {
  /**
   * @param {number} index
   * @returns {ValueArray<V>}
   */
  value(index) {
    const a = (
      /** @type {number} */
      this.offsets[index]
    );
    const b = a + /** @type {number} */
    this.sizes[index];
    return this.children[0].slice(a, b);
  }
};
var LargeListViewBatch = class extends ArrayBatch {
  /**
   * @param {number} index
   * @returns {ValueArray<V>}
   */
  value(index) {
    const a = (
      /** @type {bigint} */
      this.offsets[index]
    );
    const b = a + /** @type {bigint} */
    this.sizes[index];
    return this.children[0].slice(toNumber(a), toNumber(b));
  }
};
var FixedBatch = class extends ArrayBatch {
  constructor(options) {
    super(options);
    this.stride = this.type.stride;
  }
};
var FixedBinaryBatch = class extends FixedBatch {
  /**
   * @param {number} index
   * @returns {Uint8Array}
   */
  value(index) {
    const { stride, values } = this;
    return (
      /** @type {Uint8Array} */
      values.subarray(index * stride, (index + 1) * stride)
    );
  }
};
var FixedListBatch = class extends FixedBatch {
  /**
   * @param {number} index
   * @returns {ValueArray<V>}
   */
  value(index) {
    const { children, stride } = this;
    return children[0].slice(index * stride, (index + 1) * stride);
  }
};
function pairs({ children, offsets }, index) {
  const [keys, vals] = children[0].children;
  const start = offsets[index];
  const end = offsets[index + 1];
  const entries = [];
  for (let i = start; i < end; ++i) {
    entries.push([keys.at(i), vals.at(i)]);
  }
  return entries;
}
var MapEntryBatch = class extends ArrayBatch {
  /**
   * Return the value at the given index.
   * @param {number} index The value index.
   * @returns {[K, V][]} The map entries as an array of [key, value] arrays.
   */
  value(index) {
    return (
      /** @type {[K, V][]} */
      pairs(this, index)
    );
  }
};
var MapBatch = class extends ArrayBatch {
  /**
   * Return the value at the given index.
   * @param {number} index The value index.
   * @returns {Map<K, V>} The map value.
   */
  value(index) {
    return new Map(
      /** @type {[K, V][]} */
      pairs(this, index)
    );
  }
};
var SparseUnionBatch = class extends ArrayBatch {
  /**
   * Create a new column batch.
   * @param {object} options
   * @param {number} options.length The length of the batch
   * @param {number} options.nullCount The null value count
   * @param {DataType} options.type The data type.
   * @param {Uint8Array} [options.validity] Validity bitmap buffer
   * @param {Int32Array} [options.offsets] Offsets buffer
   * @param {Batch[]} options.children Children batches
   * @param {Int8Array} options.typeIds Union type ids buffer
   * @param {Record<string, number>} options.map A typeId to children index map
   */
  constructor({ typeIds, ...options }) {
    super(options);
    this.typeIds = typeIds;
    this.typeMap = this.type.typeMap;
  }
  /**
   * @param {number} index The value index.
   */
  value(index, offset = index) {
    const { typeIds, children, typeMap } = this;
    return children[typeMap[typeIds[index]]].at(offset);
  }
};
var DenseUnionBatch = class extends SparseUnionBatch {
  /**
   * @param {number} index The value index.
   */
  value(index) {
    return super.value(
      index,
      /** @type {number} */
      this.offsets[index]
    );
  }
};
var StructBatch = class extends ArrayBatch {
  constructor(options, factory = objectFactory) {
    super(options);
    this.names = this.type.children.map((child) => child.name);
    this.factory = factory(this.names, this.children);
  }
  /**
   * @param {number} index The value index.
   * @returns {Record<string, any>}
   */
  value(index) {
    return this.factory(index);
  }
};
var StructProxyBatch = class extends StructBatch {
  constructor(options) {
    super(options, proxyFactory);
  }
};
var RunEndEncodedBatch = class extends ArrayBatch {
  /**
   * @param {number} index The value index.
   */
  value(index) {
    const [{ values: runs }, vals] = this.children;
    return vals.at(
      bisect(
        /** @type {IntegerArray} */
        runs,
        index
      )
    );
  }
};
var DictionaryBatch = class extends ArrayBatch {
  /**
   * Register the backing dictionary. Dictionaries are added
   * after batch creation as the complete dictionary may not
   * be finished across multiple record batches.
   * @param {Column<T>} dictionary
   * The dictionary of column values.
   */
  setDictionary(dictionary2) {
    this.dictionary = dictionary2;
    this.cache = dictionary2.cache();
    return this;
  }
  /**
   * @param {number} index The value index.
   */
  value(index) {
    return this.cache[this.key(index)];
  }
  /**
   * @param {number} index The value index.
   * @returns {number} The dictionary key
   */
  key(index) {
    return (
      /** @type {number} */
      this.values[index]
    );
  }
};
var ViewBatch = class extends ArrayBatch {
  /**
   * Create a new view batch.
   * @param {object} options Batch options.
   * @param {number} options.length The length of the batch
   * @param {number} options.nullCount The null value count
   * @param {DataType} options.type The data type.
   * @param {Uint8Array} [options.validity] Validity bitmap buffer
   * @param {Uint8Array} options.values Values buffer
   * @param {Uint8Array[]} options.data View data buffers
   */
  constructor({ data, ...options }) {
    super(options);
    this.data = data;
  }
  /**
   * Get the binary data at the provided index.
   * @param {number} index The value index.
   * @returns {Uint8Array}
   */
  view(index) {
    const { values, data } = this;
    const offset = index << 4;
    let start = offset + 4;
    let buf2 = (
      /** @type {Uint8Array} */
      values
    );
    const length = readInt32(buf2, offset);
    if (length > 12) {
      start = readInt32(buf2, offset + 12);
      buf2 = data[readInt32(buf2, offset + 8)];
    }
    return buf2.subarray(start, start + length);
  }
};
var BinaryViewBatch = class extends ViewBatch {
  /**
   * @param {number} index The value index.
   */
  value(index) {
    return this.view(index);
  }
};
var Utf8ViewBatch = class extends ViewBatch {
  /**
   * @param {number} index The value index.
   */
  value(index) {
    return decodeUtf8(this.view(index));
  }
};

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/column.js
function columnBuilder(type) {
  let data = [];
  return {
    add(batch) {
      data.push(batch);
      return this;
    },
    clear: () => data = [],
    done: () => new Column(data, type)
  };
}
var Column = class {
  /**
   * Create a new column instance.
   * @param {Batch<T>[]} data The value batches.
   * @param {DataType} [type] The column data type.
   *  If not specified, the type is extracted from the batches.
   */
  constructor(data, type = data[0]?.type) {
    this.type = type;
    this.length = data.reduce((m, c) => m + c.length, 0);
    this.nullCount = data.reduce((m, c) => m + c.nullCount, 0);
    this.data = data;
    const n = data.length;
    const offsets = new Int32Array(n + 1);
    if (n === 1) {
      const [batch] = data;
      offsets[1] = batch.length;
      this.at = (index) => batch.at(index);
    } else {
      for (let i = 0, s = 0; i < n; ++i) {
        offsets[i + 1] = s += data[i].length;
      }
    }
    this.offsets = offsets;
  }
  /**
   * Provide an informative object string tag.
   */
  get [Symbol.toStringTag]() {
    return "Column";
  }
  /**
   * Return an iterator over the values in this column.
   * @returns {Iterator<T?>}
   */
  [Symbol.iterator]() {
    const data = this.data;
    return data.length === 1 ? data[0][Symbol.iterator]() : batchedIterator(data);
  }
  /**
   * Return the column value at the given index. If a column has multiple
   * batches, this method performs binary search over the batch lengths to
   * determine the batch from which to retrieve the value. The search makes
   * lookup less efficient than a standard array access. If making a full
   * scan of a column, consider extracting arrays via `toArray()` or using an
   * iterator (`for (const value of column) {...}`).
   * @param {number} index The row index.
   * @returns {T | null} The value.
   */
  at(index) {
    const { data, offsets } = this;
    const i = bisect(offsets, index) - 1;
    return data[i]?.at(index - offsets[i]);
  }
  /**
   * Return the column value at the given index. This method is the same as
   * `at()` and is provided for better compatibility with Apache Arrow JS.
   * @param {number} index The row index.
   * @returns {T | null} The value.
   */
  get(index) {
    return this.at(index);
  }
  /**
   * Extract column values into a single array instance. When possible,
   * a zero-copy subarray of the input Arrow data is returned.
   * @returns {ValueArray<T?>}
   */
  toArray() {
    const { length, nullCount, data } = this;
    const copy = !nullCount && isDirectBatch(data[0]);
    const n = data.length;
    if (copy && n === 1) {
      return data[0].values;
    }
    const ArrayType = !n || nullCount > 0 ? Array : data[0].constructor.ArrayType ?? data[0].values.constructor;
    const array = new ArrayType(length);
    return copy ? copyArray(array, data) : extractArray(array, data);
  }
  /**
   * Return an array of cached column values.
   * Used internally to accelerate dictionary types.
   */
  cache() {
    return this._cache ?? (this._cache = this.toArray());
  }
};
function* batchedIterator(data) {
  for (let i = 0; i < data.length; ++i) {
    const iter = data[i][Symbol.iterator]();
    for (let next = iter.next(); !next.done; next = iter.next()) {
      yield next.value;
    }
  }
}
function copyArray(array, data) {
  for (let i = 0, offset = 0; i < data.length; ++i) {
    const { values } = data[i];
    array.set(values, offset);
    offset += values.length;
  }
  return array;
}
function extractArray(array, data) {
  let index = -1;
  for (let i = 0; i < data.length; ++i) {
    const batch = data[i];
    for (let j = 0; j < batch.length; ++j) {
      array[++index] = batch.at(j);
    }
  }
  return array;
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/table.js
var Table = class _Table {
  /**
   * Create a new table with the given schema and columns (children).
   * @param {Schema} schema The table schema.
   * @param {Column[]} children The table columns.
   * @param {boolean} [useProxy=false] Flag indicating if row proxy
   *  objects should be used to represent table rows (default `false`).
   */
  constructor(schema, children, useProxy = false) {
    const names = schema.fields.map((f) => f.name);
    this.schema = schema;
    this.names = names;
    this.children = children;
    this.factory = useProxy ? proxyFactory : objectFactory;
    const gen = [];
    this.getFactory = (b) => gen[b] ?? (gen[b] = this.factory(names, children.map((c) => c.data[b])));
  }
  /**
   * Provide an informative object string tag.
   */
  get [Symbol.toStringTag]() {
    return "Table";
  }
  /**
   * The number of columns in this table.
   * @return {number} The number of columns.
   */
  get numCols() {
    return this.names.length;
  }
  /**
   * The number of rows in this table.
   * @return {number} The number of rows.
   */
  get numRows() {
    return this.children[0]?.length ?? 0;
  }
  /**
   * Return the child column at the given index position.
   * @template {T[keyof T]} R
   * @param {number} index The column index.
   * @returns {Column<R>}
   */
  getChildAt(index) {
    return this.children[index];
  }
  /**
   * Return the first child column with the given name.
   * @template {keyof T} P
   * @param {P} name The column name.
   * @returns {Column<T[P]>}
   */
  getChild(name) {
    const i = this.names.findIndex((x) => x === name);
    return i > -1 ? this.children[i] : void 0;
  }
  /**
   * Construct a new table containing only columns at the specified indices.
   * The order of columns in the new table matches the order of input indices.
   * @template {T[keyof T]} V
   * @param {number[]} indices The indices of columns to keep.
   * @param {string[]} [as] Optional new names for selected columns.
   * @returns {Table<{ [key: string]: V }>} A new table with selected columns.
   */
  selectAt(indices, as = []) {
    const { children, factory, schema } = this;
    const { fields } = schema;
    return new _Table(
      {
        ...schema,
        fields: indices.map((i, j) => renameField(fields[i], as[j]))
      },
      indices.map((i) => children[i]),
      factory === proxyFactory
    );
  }
  /**
   * Construct a new table containing only columns with the specified names.
   * If columns have duplicate names, the first (with lowest index) is used.
   * The order of columns in the new table matches the order of input names.
   * @template {keyof T} K
   * @param {K[]} names Names of columns to keep.
   * @param {string[]} [as] Optional new names for selected columns.
   * @returns A new table with columns matching the specified names.
   */
  select(names, as) {
    const all = (
      /** @type {K[]} */
      this.names
    );
    const indices = names.map((name) => all.indexOf(name));
    return this.selectAt(indices, as);
  }
  /**
   * Return an object mapping column names to extracted value arrays.
   * @returns {{ [P in keyof T]: ValueArray<T[P]> }}
   */
  toColumns() {
    const { children, names } = this;
    const cols = {};
    names.forEach((name, i) => cols[name] = children[i]?.toArray() ?? []);
    return cols;
  }
  /**
   * Return an array of objects representing the rows of this table.
   * @returns {{ [P in keyof T]: T[P] }[]}
   */
  toArray() {
    const { children, getFactory, numRows } = this;
    const data = children[0]?.data ?? [];
    const output = Array(numRows);
    for (let b = 0, row = -1; b < data.length; ++b) {
      const f = getFactory(b);
      for (let i = 0; i < data[b].length; ++i) {
        output[++row] = f(i);
      }
    }
    return output;
  }
  /**
   * Return an iterator over objects representing the rows of this table.
   * @returns {Generator<{ [P in keyof T]: T[P] }, any, any>}
   */
  *[Symbol.iterator]() {
    const { children, getFactory } = this;
    const data = children[0]?.data ?? [];
    for (let b = 0; b < data.length; ++b) {
      const f = getFactory(b);
      for (let i = 0; i < data[b].length; ++i) {
        yield f(i);
      }
    }
  }
  /**
   * Return a row object for the given index.
   * @param {number} index The row index.
   * @returns {{ [P in keyof T]: T[P] }} The row object.
   */
  at(index) {
    const { children, getFactory, numRows } = this;
    if (index < 0 || index >= numRows) return null;
    const [{ offsets }] = children;
    const b = bisect(offsets, index) - 1;
    return getFactory(b)(index - offsets[b]);
  }
  /**
   * Return a row object for the given index. This method is the same as
   * `at()` and is provided for better compatibility with Apache Arrow JS.
   * @param {number} index The row index.
   * @returns {{ [P in keyof T]: T[P] }} The row object.
   */
  get(index) {
    return this.at(index);
  }
};
function renameField(field2, name) {
  return name != null && name !== field2.name ? { ...field2, name } : field2;
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/batch-type.js
function batchType(type, options = {}) {
  const { typeId, bitWidth, mode, precision, unit } = (
    /** @type {any} */
    type
  );
  const { useBigInt, useBigIntTimestamp, useDate, useDecimalInt, useMap, useProxy } = options;
  switch (typeId) {
    case Type.Null:
      return NullBatch;
    case Type.Bool:
      return BoolBatch;
    case Type.Int:
    case Type.Time:
    case Type.Duration:
      return useBigInt || bitWidth < 64 ? DirectBatch : Int64Batch;
    case Type.Float:
      return precision ? DirectBatch : Float16Batch;
    case Type.Date:
      return wrap2(
        unit === DateUnit.DAY ? DateDayBatch : DateDayMillisecondBatch,
        useDate && DateBatch
      );
    case Type.Timestamp:
      return useBigIntTimestamp ? DirectBatch : wrap2(
        unit === TimeUnit.SECOND ? TimestampSecondBatch : unit === TimeUnit.MILLISECOND ? TimestampMillisecondBatch : unit === TimeUnit.MICROSECOND ? TimestampMicrosecondBatch : TimestampNanosecondBatch,
        useDate && DateBatch
      );
    case Type.Decimal:
      return bitWidth === 32 ? useDecimalInt ? DirectBatch : Decimal32NumberBatch : useDecimalInt ? DecimalBigIntBatch : DecimalNumberBatch;
    case Type.Interval:
      return unit === IntervalUnit.DAY_TIME ? IntervalDayTimeBatch : unit === IntervalUnit.YEAR_MONTH ? DirectBatch : IntervalMonthDayNanoBatch;
    case Type.FixedSizeBinary:
      return FixedBinaryBatch;
    case Type.Utf8:
      return Utf8Batch;
    case Type.LargeUtf8:
      return LargeUtf8Batch;
    case Type.Binary:
      return BinaryBatch;
    case Type.LargeBinary:
      return LargeBinaryBatch;
    case Type.BinaryView:
      return BinaryViewBatch;
    case Type.Utf8View:
      return Utf8ViewBatch;
    case Type.List:
      return ListBatch;
    case Type.LargeList:
      return LargeListBatch;
    case Type.Map:
      return useMap ? MapBatch : MapEntryBatch;
    case Type.ListView:
      return ListViewBatch;
    case Type.LargeListView:
      return LargeListViewBatch;
    case Type.FixedSizeList:
      return FixedListBatch;
    case Type.Struct:
      return useProxy ? StructProxyBatch : StructBatch;
    case Type.RunEndEncoded:
      return RunEndEncodedBatch;
    case Type.Dictionary:
      return DictionaryBatch;
    case Type.Union:
      return mode ? DenseUnionBatch : SparseUnionBatch;
  }
  throw new Error(invalidDataType(typeId));
}
function wrap2(BaseClass, WrapperClass) {
  return WrapperClass ? class WrapBatch extends WrapperClass {
    constructor(options) {
      super(new BaseClass(options));
    }
  } : BaseClass;
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/compression.js
var LENGTH_NO_COMPRESSED_DATA = -1;
var COMPRESS_LENGTH_PREFIX = 8;
function missingCodec(type) {
  return `Missing compression codec "${keyFor(CompressionType, type)}" (id ${type})`;
}
var codecs = /* @__PURE__ */ new Map();
function getCompressionCodec(type) {
  return type != null && codecs.get(type) || null;
}
function decompressBuffer(body, { offset, length }, codec) {
  if (length === 0) {
    return { bytes: new Uint8Array(0), offset: 0, length: 0 };
  }
  const ulen = readInt64(body, offset);
  const buf2 = body.subarray(offset + COMPRESS_LENGTH_PREFIX, offset + length);
  const bytes = ulen === LENGTH_NO_COMPRESSED_DATA ? buf2 : codec.decode(buf2, ulen);
  return { bytes, offset: 0, length: bytes.length };
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/decode/block.js
function decodeBlock(buf2, index) {
  return {
    offset: readInt64(buf2, index),
    metadataLength: readInt32(buf2, index + 8),
    bodyLength: readInt64(buf2, index + 16)
  };
}
function decodeBlocks(buf2, index) {
  return readVector(buf2, index, 24, decodeBlock);
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/decode/body-compression.js
function decodeBodyCompression(buf2, index) {
  const get = readObject(buf2, index);
  return {
    codec: (
      /** @type {CompressionType_} */
      get(4, readInt8, CompressionType.LZ4_FRAME)
    ),
    method: (
      /** @type {BodyCompressionMethod_} */
      get(6, readInt8, BodyCompressionMethod.BUFFER)
    )
  };
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/decode/record-batch.js
function decodeRecordBatch(buf2, index, version) {
  const get = readObject(buf2, index);
  const offset = version < Version.V4 ? 8 : 0;
  return {
    length: get(4, readInt64, 0),
    nodes: readVector(buf2, get(6, readOffset), 16, (buf3, pos) => ({
      length: readInt64(buf3, pos),
      nullCount: readInt64(buf3, pos + 8)
    })),
    regions: readVector(buf2, get(8, readOffset), 16 + offset, (buf3, pos) => ({
      offset: readInt64(buf3, pos + offset),
      length: readInt64(buf3, pos + offset + 8)
    })),
    compression: get(10, decodeBodyCompression),
    variadic: readVector(buf2, get(12, readOffset), 8, readInt64)
  };
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/decode/dictionary-batch.js
function decodeDictionaryBatch(buf2, index, version) {
  const get = readObject(buf2, index);
  return {
    id: get(4, readInt64, 0),
    data: get(6, (buf3, off) => decodeRecordBatch(buf3, off, version)),
    /**
     * If isDelta is true the values in the dictionary are to be appended to a
     * dictionary with the indicated id. If isDelta is false this dictionary
     * should replace the existing dictionary.
     */
    isDelta: get(8, readBoolean, false)
  };
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/decode/data-type.js
function decodeDataType(buf2, index, typeId, children) {
  checkOneOf(typeId, Type, invalidDataType);
  const get = readObject(buf2, index);
  switch (typeId) {
    // types without flatbuffer objects
    case Type.Binary:
      return binary();
    case Type.Utf8:
      return utf8();
    case Type.LargeBinary:
      return largeBinary();
    case Type.LargeUtf8:
      return largeUtf8();
    case Type.List:
      return list(children[0]);
    case Type.ListView:
      return listView(children[0]);
    case Type.LargeList:
      return largeList(children[0]);
    case Type.LargeListView:
      return largeListView(children[0]);
    case Type.Struct:
      return struct(children);
    case Type.RunEndEncoded:
      return runEndEncoded(children[0], children[1]);
    // types with flatbuffer objects
    case Type.Int:
      return int(
        // @ts-ignore
        get(4, readInt32, 0),
        // bitwidth
        get(6, readBoolean, false)
        // signed
      );
    case Type.Float:
      return float(
        // @ts-ignore
        get(4, readInt16, Precision.HALF)
        // precision
      );
    case Type.Decimal:
      return decimal(
        get(4, readInt32, 0),
        // precision
        get(6, readInt32, 0),
        // scale
        // @ts-ignore
        get(8, readInt32, 128)
        // bitwidth
      );
    case Type.Date:
      return date(
        // @ts-ignore
        get(4, readInt16, DateUnit.MILLISECOND)
        // unit
      );
    case Type.Time:
      return time(
        // @ts-ignore
        get(4, readInt16, TimeUnit.MILLISECOND)
        // unit
      );
    case Type.Timestamp:
      return timestamp(
        // @ts-ignore
        get(4, readInt16, TimeUnit.SECOND),
        // unit
        get(6, readString)
        // timezone
      );
    case Type.Interval:
      return interval(
        // @ts-ignore
        get(4, readInt16, IntervalUnit.YEAR_MONTH)
        // unit
      );
    case Type.Duration:
      return duration(
        // @ts-ignore
        get(4, readInt16, TimeUnit.MILLISECOND)
        // unit
      );
    case Type.FixedSizeBinary:
      return fixedSizeBinary(
        get(4, readInt32, 0)
        // stride
      );
    case Type.FixedSizeList:
      return fixedSizeList(
        children[0],
        get(4, readInt32, 0)
        // stride
      );
    case Type.Map:
      return mapType(
        get(4, readBoolean, false),
        // keysSorted
        children[0]
      );
    case Type.Union:
      return union(
        // @ts-ignore
        get(4, readInt16, UnionMode.Sparse),
        // mode
        children,
        readVector(buf2, get(6, readOffset), 4, readInt32)
        // type ids
      );
  }
  return { typeId };
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/decode/metadata.js
function decodeMetadata(buf2, index) {
  const entries = readVector(buf2, index, 4, (buf3, pos) => {
    const get = readObject(buf3, pos);
    return (
      /** @type {[string, string]} */
      [
        get(4, readString),
        // 4: key (string)
        get(6, readString)
        // 6: key (string)
      ]
    );
  });
  return entries.length ? new Map(entries) : null;
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/decode/schema.js
function decodeSchema(buf2, index, version) {
  const get = readObject(buf2, index);
  return {
    version,
    endianness: (
      /** @type {Endianness_} */
      get(4, readInt16, 0)
    ),
    fields: get(6, decodeSchemaFields, []),
    metadata: get(8, decodeMetadata)
  };
}
function decodeSchemaFields(buf2, fieldsOffset) {
  return readVector(buf2, fieldsOffset, 4, decodeField);
}
function decodeField(buf2, index) {
  const get = readObject(buf2, index);
  const typeId = get(8, readUint8, Type.NONE);
  const typeOffset = get(10, readOffset, 0);
  const dict = get(12, decodeDictionary);
  const children = get(14, decodeFieldChildren, []);
  let type = decodeDataType(buf2, typeOffset, typeId, children);
  if (dict) {
    dict.dictionary = type;
    type = dict;
  }
  return {
    name: get(4, readString),
    type,
    nullable: get(6, readBoolean, false),
    metadata: get(16, decodeMetadata)
  };
}
function decodeFieldChildren(buf2, fieldOffset) {
  return readVector(buf2, fieldOffset, 4, decodeField);
}
function decodeDictionary(buf2, index) {
  if (!index) return null;
  const get = readObject(buf2, index);
  return dictionary(
    null,
    // data type will be populated by caller
    get(6, decodeInt, int32()),
    // index type
    get(8, readBoolean, false),
    // ordered
    get(4, readInt64, 0)
    // id
  );
}
function decodeInt(buf2, index) {
  return (
    /** @type {IntType} */
    decodeDataType(buf2, index, Type.Int)
  );
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/decode/message.js
var invalidMessageMetadata = (expected, actual) => `Expected to read ${expected} metadata bytes, but only read ${actual}.`;
var invalidMessageBodyLength = (expected, actual) => `Expected to read ${expected} bytes for message body, but only read ${actual}.`;
var invalidMessageType = (type) => `Unsupported message type: ${type} (${keyFor(MessageHeader, type)})`;
function decodeMessage(buf2, index) {
  let metadataLength = readInt32(buf2, index) || 0;
  index += SIZEOF_INT;
  if (metadataLength === -1) {
    metadataLength = readInt32(buf2, index) || 0;
    index += SIZEOF_INT;
  }
  if (metadataLength === 0) return null;
  const head = buf2.subarray(index, index += metadataLength);
  if (head.byteLength < metadataLength) {
    throw new Error(invalidMessageMetadata(metadataLength, head.byteLength));
  }
  const get = readObject(head, 0);
  const version = (
    /** @type {Version_} */
    get(4, readInt16, Version.V1)
  );
  const type = (
    /** @type {MessageHeader_} */
    get(6, readUint8, MessageHeader.NONE)
  );
  const offset = get(8, readOffset, 0);
  const bodyLength = get(10, readInt64, 0);
  let content;
  if (offset) {
    const decoder = type === MessageHeader.Schema ? decodeSchema : type === MessageHeader.DictionaryBatch ? decodeDictionaryBatch : type === MessageHeader.RecordBatch ? decodeRecordBatch : null;
    if (!decoder) throw new Error(invalidMessageType(type));
    content = decoder(head, offset, version);
    if (bodyLength > 0) {
      const body = buf2.subarray(index, index += bodyLength);
      if (body.byteLength < bodyLength) {
        throw new Error(invalidMessageBodyLength(bodyLength, body.byteLength));
      }
      content.body = body;
    } else if (type !== MessageHeader.Schema) {
      content.body = new Uint8Array(0);
    }
  }
  return { version, type, index, content };
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/decode/decode-ipc.js
function decodeIPC(data) {
  const source = isArrayBufferLike(data) ? new Uint8Array(data) : data;
  return isUint8Array(source) && isArrowFileFormat(source) ? decodeIPCFile(source) : decodeIPCStream(source);
}
function isArrowFileFormat(buf2) {
  if (!buf2 || buf2.length < 4) return false;
  for (let i = 0; i < 6; ++i) {
    if (MAGIC[i] !== buf2[i]) return false;
  }
  return true;
}
function decodeIPCStream(data) {
  const stream = [data].flat();
  let schema;
  const records = [];
  const dictionaries = [];
  const dictsBeforeRecord = [];
  for (const buf2 of stream) {
    if (!isUint8Array(buf2)) {
      throw new Error(`IPC data batch was not a Uint8Array.`);
    }
    let offset = 0;
    while (true) {
      const m = decodeMessage(buf2, offset);
      if (m === null) break;
      offset = m.index;
      if (!m.content) continue;
      switch (m.type) {
        case MessageHeader.Schema:
          if (!schema) schema = m.content;
          break;
        case MessageHeader.RecordBatch:
          records.push(m.content);
          dictsBeforeRecord.push(dictionaries.length);
          break;
        case MessageHeader.DictionaryBatch:
          dictionaries.push(m.content);
          break;
      }
    }
  }
  return (
    /** @type {ArrowData} */
    { schema, dictionaries, records, dictsBeforeRecord, metadata: null }
  );
}
function decodeIPCFile(data) {
  const offset = data.byteLength - (MAGIC.length + 4);
  const length = readInt32(data, offset);
  const get = readObject(data, offset - length);
  const version = (
    /** @type {Version_} */
    get(4, readInt16, Version.V1)
  );
  const dicts = get(8, decodeBlocks, []);
  const recs = get(10, decodeBlocks, []);
  const dictsBeforeRecord = recs.map(
    (rec) => dicts.filter((d) => d.offset < rec.offset).length
  );
  return (
    /** @type {ArrowData} */
    {
      schema: get(6, (buf2, index) => decodeSchema(buf2, index, version)),
      dictionaries: dicts.map(({ offset: offset2 }) => decodeMessage(data, offset2).content),
      records: recs.map(({ offset: offset2 }) => decodeMessage(data, offset2).content),
      dictsBeforeRecord,
      metadata: get(12, decodeMetadata)
    }
  );
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/decode/table-from-ipc.js
function tableFromIPC(data, options) {
  return createTable(decodeIPC(data), options);
}
function createTable(data, options = {}) {
  const { schema = { fields: [] }, dictionaries, records, dictsBeforeRecord } = data;
  const { version, fields } = schema;
  const dictionaryMap = /* @__PURE__ */ new Map();
  const context = contextGenerator(options, version, dictionaryMap);
  const dictionaryTypes = /* @__PURE__ */ new Map();
  visitSchemaFields(schema, (field2) => {
    const type = field2.type;
    if (type.typeId === Type.Dictionary) {
      dictionaryTypes.set(type.id, type.dictionary);
    }
  });
  const processDict = (dict) => {
    const { id, data: dictData, isDelta, body } = dict;
    const type = dictionaryTypes.get(id);
    const batch = visit(type, context({ ...dictData, body }));
    const existing = dictionaryMap.get(id);
    if (!existing) {
      if (isDelta) {
        throw new Error("Delta update can not be first dictionary batch.");
      }
      dictionaryMap.set(id, new Column([batch], type));
    } else if (isDelta) {
      dictionaryMap.set(id, new Column([...existing.data, batch], type));
    } else {
      dictionaryMap.set(id, new Column([batch], type));
    }
  };
  const cols = fields.map((f) => columnBuilder(f.type));
  let dictIdx = 0;
  for (let i = 0; i < records.length; i++) {
    const target = dictsBeforeRecord ? dictsBeforeRecord[i] : dictionaries.length;
    while (dictIdx < target) {
      processDict(dictionaries[dictIdx++]);
    }
    const ctx = context(records[i]);
    fields.forEach((f, idx) => cols[idx].add(visit(f.type, ctx)));
  }
  while (dictIdx < dictionaries.length) {
    processDict(dictionaries[dictIdx++]);
  }
  return new Table(schema, cols.map((c) => c.done()), options.useProxy);
}
function visitSchemaFields(schema, visitor) {
  schema.fields.forEach(function visitField(field2) {
    visitor(field2);
    field2.type.dictionary?.children?.forEach(visitField);
    field2.type.children?.forEach(visitField);
  });
}
function contextGenerator(options, version, dictionaryMap) {
  const base = {
    version,
    options,
    dictionary: (id) => dictionaryMap.get(id)
  };
  return (batch) => {
    const { length, nodes, regions, compression, variadic, body } = batch;
    let nodeIndex = -1;
    let bufferIndex = -1;
    let variadicIndex = -1;
    return {
      ...base,
      length,
      node: () => nodes[++nodeIndex],
      buffer: (ArrayType) => {
        const { bytes, length: length2, offset } = maybeDecompress(body, regions[++bufferIndex], compression);
        return ArrayType ? new ArrayType(bytes.buffer, bytes.byteOffset + offset, length2 / ArrayType.BYTES_PER_ELEMENT) : bytes.subarray(offset, offset + length2);
      },
      variadic: () => variadic[++variadicIndex],
      visit(children) {
        return children.map((f) => visit(f.type, this));
      }
    };
  };
}
function maybeDecompress(body, region, compression) {
  if (!compression) {
    return { bytes: body, ...region };
  } else if (compression.method !== BodyCompressionMethod.BUFFER) {
    throw new Error(`Unknown compression method (${compression.method})`);
  } else {
    const id = compression.codec;
    const codec = getCompressionCodec(id);
    if (!codec) throw new Error(missingCodec(id));
    return decompressBuffer(body, region, codec);
  }
}
function visit(type, ctx) {
  const { typeId } = type;
  const { options, node, buffer: buffer2, variadic, version } = ctx;
  const BatchType = batchType(type, options);
  const base = { ...node(), type };
  if (typeId === Type.Null) {
    return new BatchType({ ...base, nullCount: base.length });
  }
  switch (typeId) {
    // validity and data value buffers
    case Type.Bool:
    case Type.Int:
    case Type.Time:
    case Type.Duration:
    case Type.Float:
    case Type.Decimal:
    case Type.Date:
    case Type.Timestamp:
    case Type.Interval:
    case Type.FixedSizeBinary:
      return new BatchType({
        ...base,
        validity: buffer2(),
        values: buffer2(type.values)
      });
    // validity, offset, and value buffers
    case Type.Utf8:
    case Type.LargeUtf8:
    case Type.Binary:
    case Type.LargeBinary:
      return new BatchType({
        ...base,
        validity: buffer2(),
        offsets: buffer2(type.offsets),
        values: buffer2()
      });
    // views with variadic buffers
    case Type.BinaryView:
    case Type.Utf8View:
      return new BatchType({
        ...base,
        validity: buffer2(),
        values: buffer2(),
        // views buffer
        data: Array.from({ length: variadic() }, () => buffer2())
        // data buffers
      });
    // validity, offset, and list child
    case Type.List:
    case Type.LargeList:
    case Type.Map:
      return new BatchType({
        ...base,
        validity: buffer2(),
        offsets: buffer2(type.offsets),
        children: ctx.visit(type.children)
      });
    // validity, offset, size, and list child
    case Type.ListView:
    case Type.LargeListView:
      return new BatchType({
        ...base,
        validity: buffer2(),
        offsets: buffer2(type.offsets),
        sizes: buffer2(type.offsets),
        children: ctx.visit(type.children)
      });
    // validity and children
    case Type.FixedSizeList:
    case Type.Struct:
      return new BatchType({
        ...base,
        validity: buffer2(),
        children: ctx.visit(type.children)
      });
    // children only
    case Type.RunEndEncoded:
      return new BatchType({
        ...base,
        children: ctx.visit(type.children)
      });
    // dictionary
    case Type.Dictionary: {
      const { id, indices } = type;
      return new BatchType({
        ...base,
        validity: buffer2(),
        values: buffer2(indices.values)
      }).setDictionary(ctx.dictionary(id));
    }
    // union
    case Type.Union: {
      if (version < Version.V5) {
        buffer2();
      }
      return new BatchType({
        ...base,
        typeIds: buffer2(int8Array),
        offsets: type.mode === UnionMode.Sparse ? null : buffer2(type.offsets),
        children: ctx.visit(type.children)
      });
    }
    // unsupported type
    default:
      throw new Error(invalidDataType(typeId));
  }
}

// node_modules/.pnpm/@uwdata+flechette@2.5.0/node_modules/@uwdata/flechette/src/encode/schema.js
var isLittleEndian = new Uint16Array(new Uint8Array([1, 0]).buffer)[0] === 1;

// src/workers/parse.worker.ts
var import_papaparse = __toESM(require_papaparse_min());

// node_modules/.pnpm/udsv@0.7.3/node_modules/udsv/dist/uDSV.mjs
var comma = ",";
var quote = '"';
var tab = "	";
var pipe = "|";
var semi = ";";
var ISO8601 = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3,})?(?:Z|[-+]\d{2}:?\d{2}))?$/;
var BOOL_RE = /^(?:t(?:rue)?|f(?:alse)?|y(?:es)?|n(?:o)?|0|1)$/i;
var COL_DELIMS = [tab, pipe, semi, comma];
function stripBOM(str) {
  return str.charCodeAt(0) === 65279 ? str.slice(1) : str;
}
function boolTrue(v) {
  let [c0, c1 = ""] = v;
  return c0 == "1" || c0 == "0" ? "1" : c0 == "t" || c0 == "f" ? c1 == "" ? "t" : "true" : c0 == "T" || c0 == "F" ? c1 == "" ? "T" : c1 == "R" || c1 === "A" ? "TRUE" : "True" : c0 == "y" || c0 == "n" ? c1 == "" ? "y" : "yes" : c0 == "Y" || c0 == "N" ? c1 == "" ? "Y" : c1 == "E" || c1 === "O" ? "YES" : "Yes" : "";
}
function isJSON(v) {
  if (v[0] === "[" || v[0] === "{") {
    try {
      JSON.parse(v);
      return true;
    } catch {
    }
  }
  return false;
}
var T_STRING = "s";
var T_DATE = "d";
var T_TIME = "t";
var T_NUMBER = "n";
var T_JSON = "j";
var T_BOOLEAN = "b";
function guessType(ci, rows) {
  let row = rows.findLast(
    (r) => r[ci] !== "" && r[ci] !== "null" && r[ci] !== "Null" && r[ci] !== "NULL" && r[ci] !== "NaN" && r[ci] !== "undefined" && r[ci] !== "Undefined" && r[ci] !== "UNDEFINED"
  );
  let t = T_STRING;
  if (row != null) {
    let v = row[ci];
    t = ISO8601.test(v) ? T_DATE : +v === +v ? T_NUMBER : BOOL_RE.test(v) ? T_BOOLEAN + ":" + boolTrue(v) : isJSON(v) ? T_JSON : t;
  }
  return t;
}
var toJSON = JSON.stringify;
var onlyStrEsc = (v) => typeof v === "string" ? toJSON(v) : v;
function getValParseExpr(ci, col) {
  let { type, parse: parse2, repl } = col;
  let rv = `r[${ci}]`;
  let parseExpr = parse2 != null ? `c[${ci}].parse(${rv})` : type === T_DATE ? `new Date(${rv})` : type === T_TIME ? `Date.parse(${rv})` : type === T_JSON ? `JSON.parse(${rv})` : type === T_NUMBER ? `+${rv}` : type[0] === T_BOOLEAN ? `${rv} === ${toJSON(type.slice(2))} ? true : false` : rv;
  let nanExpr = repl.NaN !== void 0 && type === T_NUMBER ? `${rv} === 'NaN' ? ${onlyStrEsc(repl.NaN)} : ` : "";
  let nullExpr = repl.null !== void 0 ? `${rv} === 'null' || ${rv} === 'NULL' ? ${onlyStrEsc(repl.null)} : ` : "";
  let emptyExpr = repl.empty !== void 0 ? `${rv} === '' ? ${onlyStrEsc(repl.empty)} : ` : "";
  return `${emptyExpr} ${nullExpr} ${nanExpr} ${parseExpr}`;
}
var segsRe = /\w+(?:\[|\]?[\.\[]?|$)/gm;
function genToTypedRow(cols, objs = false, deep = false) {
  let buf2 = "";
  if (objs && deep) {
    let tplObj = {};
    let colIdx = 0;
    let paths = cols.map((c) => c.name.replace(/\.(\d+)\.?/gi, "[$1]"));
    do {
      let path = paths.shift();
      let segs = /\s/.test(path) ? [path] : [...path.matchAll(segsRe)].flatMap((m) => m.map((m2) => m2.replace("]", "")));
      let node = tplObj;
      do {
        let seg = segs.shift();
        let key = seg;
        let endChar = seg.at(-1);
        let hasKids = endChar == "." || endChar == "[";
        if (hasKids) {
          key = seg.slice(0, -1);
          let nextNode = node[key] ?? (endChar == "." ? {} : []);
          node = node[key] = nextNode;
        } else
          node[key] = `\xA6${colIdx}\xA6`;
      } while (segs.length > 0);
      colIdx++;
    } while (paths.length > 0);
    buf2 = toJSON(tplObj).replace(/"¦(\d+)¦"/g, (m, ci) => getValParseExpr(+ci, cols[+ci]));
  } else {
    if (!objs && cols.every((c) => c.type === T_STRING))
      buf2 = "r";
    else {
      buf2 = objs ? "{" : "[";
      cols.forEach((col, ci) => {
        buf2 += objs ? `${toJSON(col.name)}:` : "";
        let parseVal = getValParseExpr(ci, col);
        buf2 += `${parseVal},`;
      });
      buf2 += objs ? "}" : "]";
    }
  }
  return new Function("c", `return r => (${buf2});`)(cols);
}
function inferSchema(csvStr, opts, maxRows) {
  let {
    header: headerFn,
    col: colDelim,
    row: rowDelim,
    encl: colEncl,
    esc: escEncl,
    //	omit,  // #comments and empty lines (ignore:), needs callback for empty and comments?
    trim = false
  } = opts ?? {};
  headerFn ??= (firstRows2) => [firstRows2[0]];
  maxRows ??= 10;
  csvStr = stripBOM(csvStr);
  const rowRE = new RegExp(`(.*)(${rowDelim ?? "\r\n|\r|\n"})`);
  const firstRowMatch = csvStr.match(rowRE);
  const firstRowStr = firstRowMatch[1];
  rowDelim ??= firstRowMatch[2];
  colDelim ??= COL_DELIMS.find((delim) => firstRowStr.indexOf(delim) > -1) ?? comma;
  const schema = {
    skip: 1,
    // how many header rows to skip
    col: colDelim,
    row: rowDelim,
    encl: colEncl,
    esc: escEncl,
    trim,
    cols: []
  };
  const _maxCols = firstRowStr.split(colDelim).length;
  const firstRows = [];
  parse(csvStr, schema, 0, (row) => {
    firstRows.push(row);
    return firstRows.length < maxRows;
  }, true, _maxCols);
  let headerRows = headerFn(firstRows) ?? [];
  let skip = schema.skip = headerRows.length;
  let colNames = headerRows.find((row) => row != null) ?? [...Array(firstRows[0].length).keys()];
  firstRows.splice(0, skip);
  colNames.forEach((colName, colIdx) => {
    let type = guessType(colIdx, firstRows);
    let col = {
      name: colName,
      type,
      // this could be type-dependant (e.g. {empty: 0, null: 0, NaN: NaN} for numbers)
      repl: {
        empty: null,
        NaN: void 0,
        null: void 0
      }
    };
    schema.cols.push(col);
  });
  return schema;
}
function initParser(schema) {
  let { skip, cols } = schema;
  let _toStr = null;
  let _toArr = null;
  let _toObj = null;
  let _toDeep = null;
  let _toObjS = null;
  let streamState = 0;
  let streamParse = null;
  let streamCb = null;
  let prevUnparsed = "";
  let buf2 = null;
  function reset() {
    streamState = 0;
    prevUnparsed = "";
    streamParse = streamCb = buf2 = null;
  }
  let accum = (row, buf3, add) => {
    add(buf3, row);
    return true;
  };
  let initRows = () => [];
  let initCols = () => cols.map((c) => []);
  let addRow = (buf3, row) => {
    buf3.push(row);
  };
  let addCol = (buf3, row) => {
    for (let i = 0; i < cols.length; i++)
      buf3[i].push(row[i]);
  };
  function gen(accInit, accAppend, genConvertRow) {
    let convertRow = null;
    return (csvStr, cb = accum) => {
      convertRow ??= genConvertRow();
      let _skip = buf2 == null ? skip : 0;
      buf2 ??= accInit();
      let out = buf2;
      let withEOF = streamState === 0 || streamState === 2;
      let halted = false;
      if (Array.isArray(csvStr)) {
        for (let i = 0; i < csvStr.length; i++) {
          let row = csvStr[i];
          let res = cb(convertRow(row), out, accAppend);
          if (res === false) {
            halted = true;
            break;
          }
        }
      } else
        [prevUnparsed, halted] = parse(csvStr, schema, _skip, (row) => cb(convertRow(row), out, accAppend), withEOF);
      if (halted && streamState !== 0)
        reset();
      if (withEOF)
        buf2 = null;
      return out;
    };
  }
  const _toStrGen = () => {
    _toStr ??= (row) => row;
    return _toStr;
  };
  const _toArrGen = () => {
    _toArr ??= genToTypedRow(cols, false, false);
    return _toArr;
  };
  const stringArrs = gen(initRows, addRow, _toStrGen);
  const stringObjs = gen(initRows, addRow, () => {
    _toObjS ??= genToTypedRow(cols.map((col) => ({
      ...col,
      type: "s",
      repl: {
        ...col.repl,
        empty: void 0
      }
    })), true, false);
    return _toObjS;
  });
  const typedArrs = gen(initRows, addRow, _toArrGen);
  const typedObjs = gen(initRows, addRow, () => {
    _toObj ??= genToTypedRow(cols, true, false);
    return _toObj;
  });
  const typedDeep = gen(initRows, addRow, () => {
    _toDeep ??= genToTypedRow(cols, true, true);
    return _toDeep;
  });
  const typedCols = gen(initCols, addCol, _toArrGen);
  const stringCols = gen(initCols, addCol, _toStrGen);
  return {
    schema,
    stringArrs,
    stringObjs,
    stringCols,
    typedArrs,
    typedObjs,
    typedDeep,
    typedCols,
    chunk(csvStr, parse2 = stringArrs, cb = accum) {
      streamParse ??= parse2;
      streamCb ??= cb;
      streamState = 1;
      streamParse(prevUnparsed + csvStr, streamCb);
    },
    end() {
      streamState = 2;
      let out = streamParse(prevUnparsed, streamCb);
      reset();
      return out;
    }
  };
}
function parse(csvStr, schema, skip = 0, each = () => true, withEOF = true, _maxCols) {
  csvStr = stripBOM(csvStr);
  let {
    row: rowDelim,
    col: colDelim,
    encl: colEncl,
    esc: escEncl,
    trim
  } = schema;
  colEncl ??= csvStr.indexOf(quote) > -1 ? quote : "";
  escEncl ??= colEncl;
  let replEsc = `${escEncl}${colEncl}`;
  let numCols = _maxCols ?? schema.cols.length;
  let _probe = _maxCols != null;
  let rowDelimLen = rowDelim.length;
  let colDelimLen = colDelim.length;
  let colEnclChar = colEncl.charCodeAt(0);
  let escEnclChar = escEncl.charCodeAt(0);
  let rowDelimChar = rowDelim.charCodeAt(0);
  let colDelimChar = colDelim.charCodeAt(0);
  let spaceChar = 32;
  let out = ["", false];
  let pos = 0;
  let endPos = csvStr.length - 1;
  let linePos = 0;
  let rowTpl = Array(numCols).fill("");
  let row = rowTpl.slice();
  let colIdx = 0;
  let lastColIdx = numCols - 1;
  let filledColIdx = -1;
  if (colEncl === "") {
    while (pos <= endPos) {
      if (colIdx === lastColIdx) {
        let pos2 = csvStr.indexOf(rowDelim, pos);
        if (pos2 === -1) {
          if (!withEOF)
            break;
          pos2 = endPos + 1;
        }
        let s = csvStr.slice(pos, pos2);
        row[colIdx] = trim ? s.trim() : s;
        if (--skip < 0) {
          if (each(row) === false) {
            out[1] = true;
            return out;
          }
        }
        row = rowTpl.slice();
        colIdx = 0;
        filledColIdx = -1;
        pos = pos2 + rowDelimLen;
        linePos = pos;
      } else {
        if (colIdx === 0 && csvStr.charCodeAt(pos) === rowDelimChar) {
          pos += rowDelimLen;
        } else {
          let pos2 = csvStr.indexOf(colDelim, pos);
          if (pos2 === -1) {
            if (!withEOF)
              break;
          }
          let s = csvStr.slice(pos, pos2);
          row[colIdx] = trim ? s.trim() : s;
          pos = pos2 + colDelimLen;
          filledColIdx = colIdx++;
        }
      }
    }
    if (--skip < 0 && withEOF && colIdx === lastColIdx && filledColIdx > -1)
      each(row);
    out[0] = !withEOF ? csvStr.slice(linePos) : "";
    return out;
  }
  const takeToCommaOrEOL = _probe ? new RegExp(`[^${colDelim}${rowDelim}]+`, "my") : null;
  let inCol = 0;
  let v = "";
  let c = 0;
  let pos0 = pos;
  while (pos <= endPos) {
    c = csvStr.charCodeAt(pos);
    if (inCol === 0) {
      if (c === colEnclChar) {
        inCol = 2;
        pos += 1;
        pos0 = pos;
        if (pos > endPos)
          break;
        c = csvStr.charCodeAt(pos);
      } else if (c === colDelimChar || c === rowDelimChar) {
        if (c === rowDelimChar && colIdx === 0) {
          pos += rowDelimLen;
          continue;
        }
        row[colIdx] = v;
        filledColIdx = colIdx;
        colIdx += 1;
        pos += 1;
        v = "";
        if (c === rowDelimChar) {
          if (_probe && filledColIdx < lastColIdx && linePos === 0) {
            row.length = rowTpl.length = filledColIdx + 1;
            lastColIdx = filledColIdx;
          }
          if (--skip < 0) {
            if (each(row) === false) {
              out[1] = true;
              return out;
            }
          }
          row = rowTpl.slice();
          colIdx = 0;
          filledColIdx = -1;
          pos += rowDelimLen - 1;
          linePos = pos;
        }
        if (pos > endPos)
          break;
      } else {
        if (trim && c === spaceChar) {
          while (c === spaceChar)
            c = csvStr.charCodeAt(++pos);
        } else
          inCol = 1;
      }
    }
    if (inCol === 2) {
      let shouldRep = false;
      let posTo = 0;
      while (true) {
        if (c === colEnclChar) {
          if (colEnclChar === escEnclChar) {
            if (pos + 1 > endPos) {
              posTo = pos;
              pos = endPos + 1;
              break;
            }
            let cNext = csvStr.charCodeAt(pos + 1);
            if (cNext === colEnclChar) {
              pos += 2;
              shouldRep = true;
              if (pos > endPos)
                break;
              c = csvStr.charCodeAt(pos);
            } else {
              inCol = 0;
              posTo = pos;
              pos += 1;
              break;
            }
          } else {
            let cPrev = csvStr.charCodeAt(pos - 1);
            if (cPrev === escEnclChar) {
              pos += 1;
              shouldRep = true;
              if (pos > endPos)
                break;
              c = csvStr.charCodeAt(pos);
            } else {
              inCol = 0;
              posTo = pos;
              pos += 1;
              break;
            }
          }
        } else {
          let pos2 = csvStr.indexOf(colEncl, pos);
          if (pos2 === -1) {
            pos = endPos + 1;
            break;
          }
          pos = pos2;
          c = colEnclChar;
        }
      }
      if (inCol === 0 || pos > endPos) {
        v = shouldRep ? csvStr.slice(pos0, posTo).replaceAll(replEsc, colEncl) : csvStr.slice(pos0, posTo);
      }
    } else if (inCol === 1) {
      if (c === colDelimChar || c === rowDelimChar) {
        if (c === rowDelimChar && colIdx === 0) {
          pos += rowDelimLen;
          continue;
        }
        row[colIdx] = v;
        filledColIdx = colIdx;
        colIdx += 1;
        pos += 1;
        v = "";
        if (c === rowDelimChar) {
          if (_probe && filledColIdx < lastColIdx && linePos === 0) {
            row.length = rowTpl.length = filledColIdx + 1;
            lastColIdx = filledColIdx;
          }
          if (--skip < 0) {
            if (each(row) === false) {
              out[1] = true;
              return out;
            }
          }
          row = rowTpl.slice();
          colIdx = 0;
          filledColIdx = -1;
          pos += rowDelimLen - 1;
          linePos = pos;
        }
        inCol = 0;
      } else {
        if (_probe) {
          takeToCommaOrEOL.lastIndex = pos;
          let m = takeToCommaOrEOL.exec(csvStr)[0];
          v = m;
          pos += m.length;
        } else {
          let pos2 = csvStr.indexOf(colIdx === lastColIdx ? rowDelim : colDelim, pos);
          if (pos2 === -1)
            pos2 = endPos + 1;
          let s = csvStr.slice(pos, pos2);
          v = trim ? s.trim() : s;
          pos = pos2;
        }
      }
    }
  }
  if (withEOF && colIdx === lastColIdx) {
    row[colIdx] = v;
    if (--skip < 0)
      each(row);
    inCol = 0;
  }
  let partial = !withEOF && (inCol !== 0 || (filledColIdx === -1 ? v !== "" : (
    // partial first col OR
    filledColIdx < lastColIdx
  )));
  out[0] = partial ? csvStr.slice(linePos) : "";
  return out;
}

// src/workers/parse-cast.ts
var BOOLEAN_TRUE = /* @__PURE__ */ new Set(["true", "yes", "y", "1", "t"]);
var BOOLEAN_FALSE = /* @__PURE__ */ new Set(["false", "no", "n", "0", "f"]);
function isBooleanToken(s) {
  const l = s.toLowerCase();
  return BOOLEAN_TRUE.has(l) || BOOLEAN_FALSE.has(l);
}
function isNumeric(s) {
  if (s === "") return false;
  return Number.isFinite(Number(s));
}
function isDateLike(s) {
  if (s.length < 6) return false;
  if (isNumeric(s)) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}
function detectType(values) {
  let numeric = 0;
  let boolean = 0;
  let date2 = 0;
  let nonEmpty = 0;
  const sample = values.length > 1e3 ? values.slice(0, 1e3) : values;
  for (const raw of sample) {
    const v = (raw ?? "").trim();
    if (v === "") continue;
    nonEmpty++;
    if (isNumeric(v)) numeric++;
    else if (isBooleanToken(v)) boolean++;
    else if (isDateLike(v)) date2++;
  }
  if (nonEmpty === 0) return "string";
  const ratio = (c) => c / nonEmpty;
  if (ratio(numeric) >= 0.9) return "number";
  if (ratio(boolean) >= 0.9) return "boolean";
  if (ratio(date2) >= 0.8) return "date";
  return "string";
}
function castValue(value, type) {
  const v = (value ?? "").trim();
  if (v === "") return null;
  switch (type) {
    case "number": {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case "boolean": {
      const l = v.toLowerCase();
      if (BOOLEAN_TRUE.has(l)) return true;
      if (BOOLEAN_FALSE.has(l)) return false;
      return null;
    }
    case "date": {
      const t = Date.parse(v);
      return Number.isFinite(t) ? new Date(t).toISOString() : v;
    }
    default:
      return v;
  }
}
function mapUdsvType(code) {
  if (code === "n") return "number";
  if (code === "d" || code === "t") return "date";
  if (code.startsWith("b")) return "boolean";
  return "string";
}

// src/workers/parse.worker.ts
function parseStringUdsv(text, opts) {
  const start = performance.now();
  const schema = inferSchema(text, opts.delimiter ? { col: opts.delimiter } : void 0);
  const parser = initParser(schema);
  const stringCols = parser.stringCols(text);
  const colNames = schema.cols.map((c) => c.name);
  const columns = stringCols.map((col, i) => {
    const udsvType = mapUdsvType(schema.cols[i]?.type ?? "s");
    const type = udsvType === "string" ? detectType(col) : udsvType;
    return { name: colNames[i] ?? `col_${i + 1}`, type };
  });
  const data = stringCols.map(
    (col, i) => col.map((v) => castValue(v, columns[i].type))
  );
  const rowCount = stringCols[0]?.length ?? 0;
  return {
    columns,
    data,
    rowCount,
    rejects: [],
    elapsedMs: performance.now() - start
  };
}
function parseStringPapa(text, opts) {
  const start = performance.now();
  const result = import_papaparse.default.parse(text, {
    header: opts.hasHeader ?? true,
    delimiter: opts.delimiter || void 0,
    skipEmptyLines: opts.skipEmpty === false ? false : "greedy",
    dynamicTyping: false
  });
  const rejects = (result.errors ?? []).map((e) => ({
    row: e.row ?? -1,
    code: e.code,
    type: e.type,
    message: e.message
  }));
  const rows = result.data;
  const hasHeader = opts.hasHeader ?? true;
  const colNames = hasHeader && rows.length > 0 && !Array.isArray(rows[0]) ? Object.keys(rows[0]) : inferPositionalColumns(rows);
  const colCount = colNames.length;
  const stringCols = Array.from({ length: colCount }, () => []);
  for (const row of rows) {
    if (Array.isArray(row)) {
      for (let c = 0; c < colCount; c++) stringCols[c].push(String(row[c] ?? ""));
    } else {
      const obj = row;
      for (let c = 0; c < colCount; c++) stringCols[c].push(String(obj[colNames[c]] ?? ""));
    }
  }
  const columns = stringCols.map((col, i) => ({
    name: colNames[i] ?? `col_${i + 1}`,
    type: detectType(col)
  }));
  const data = stringCols.map((col, i) => col.map((v) => castValue(v, columns[i].type)));
  return {
    columns,
    data,
    rowCount: stringCols[0]?.length ?? 0,
    rejects,
    elapsedMs: performance.now() - start
  };
}
function inferPositionalColumns(rows) {
  const width = rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
  return Array.from({ length: width }, (_, i) => `col_${i + 1}`);
}
var api = {
  /** Whole-string parse → columnar result. uDSV by default, Papa on failure. */
  parseString(text, opts = {}) {
    try {
      return parseStringUdsv(text, opts);
    } catch (err) {
      const res = parseStringPapa(text, opts);
      res.rejects.unshift({
        row: -1,
        type: "engine-fallback",
        message: `uDSV failed (${String(err)}); used PapaParse`
      });
      return res;
    }
  },
  /** Explicit PapaParse path (robustness net). */
  parseWithPapa(text, opts = {}) {
    return parseStringPapa(text, opts);
  },
  /**
   * Streaming parse of a ReadableStream<string> (e.g. from
   * `file.stream().pipeThrough(new TextDecoderStream())`). Accumulates string
   * columns via uDSV `parser.chunk(..., parser.stringArrs)` (CSP-safe), then
   * casts once at the end. No full-string materialization.
   */
  async parseStream(stream, opts = {}) {
    const start = performance.now();
    let parser = null;
    let schema = null;
    const reader = stream.getReader();
    try {
      let prelude = "";
      while (prelude.length < 256 * 1024) {
        const { value, done } = await reader.read();
        if (done) break;
        prelude += value;
      }
      schema = inferSchema(prelude, opts.delimiter ? { col: opts.delimiter } : void 0);
      parser = initParser(schema);
      parser.chunk(prelude, parser.stringArrs);
      for (; ; ) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.chunk(value, parser.stringArrs);
      }
    } finally {
      reader.releaseLock();
    }
    const rows = parser?.end() ?? [];
    const colNames = schema?.cols.map((c) => c.name) ?? [];
    const colCount = colNames.length || (rows[0]?.length ?? 0);
    const stringCols = Array.from({ length: colCount }, () => []);
    for (const row of rows) {
      for (let c = 0; c < colCount; c++) stringCols[c].push(String(row[c] ?? ""));
    }
    const columns = stringCols.map((col, i) => {
      const udsvType = mapUdsvType(schema?.cols[i]?.type ?? "s");
      const type = udsvType === "string" ? detectType(col) : udsvType;
      return { name: colNames[i] ?? `col_${i + 1}`, type };
    });
    const data = stringCols.map((col, i) => col.map((v) => castValue(v, columns[i].type)));
    return {
      columns,
      data,
      rowCount: stringCols[0]?.length ?? 0,
      rejects: [],
      elapsedMs: performance.now() - start
    };
  },
  /** Schema-only inference (no full materialization). */
  inferColumnTypes(text, opts = {}) {
    const schema = inferSchema(text, opts.delimiter ? { col: opts.delimiter } : void 0);
    return schema.cols.map((c) => ({
      name: c.name,
      type: mapUdsvType(c.type)
    }));
  },
  /**
   * Decode an Arrow IPC ArrayBuffer (from native DuckDB `arrowIPCStream`) into
   * column names + row objects. flechette gives zero-copy typed columns; we
   * materialize objects lazily here only for previews — large windows should
   * stay columnar via `decodeArrowColumns`.
   */
  decodeArrowToRows(buffer2) {
    const table = tableFromIPC(buffer2);
    const columns = table.schema.fields.map((f) => f.name);
    const rows = table.toArray();
    return { columns, rows };
  },
  /** Decode Arrow IPC into columnar typed arrays (preferred — no row objects). */
  decodeArrowColumns(buffer2) {
    const table = tableFromIPC(buffer2);
    const columns = table.schema.fields.map((f) => f.name);
    const cols = table.toColumns();
    const data = columns.map((name) => Array.from(cols[name] ?? []));
    return { columns, data, rowCount: table.numRows };
  }
};
expose(api);
/*! Bundled license information:

papaparse/papaparse.min.js:
  (* @license
  Papa Parse
  v5.5.3
  https://github.com/mholt/PapaParse
  License: MIT
  *)

comlink/dist/esm/comlink.mjs:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: Apache-2.0
   *)
*/
//# sourceMappingURL=parse.worker.js.map
