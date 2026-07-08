'use strict';

var fs = require('fs/promises');
var path = require('path');
var electron = require('electron');
var fs3 = require('fs');
var os3 = require('os');
var betterAuth = require('better-auth');
var crypto = require('better-auth/crypto');
var z = require('zod');
var buffer = require('buffer');
var api = require('better-auth/api');
var cookies = require('better-auth/cookies');
var Conf = require('conf');
var client = require('better-auth/client');
var nodeApi = require('@duckdb/node-api');
var nanoid = require('nanoid');
var PQueue = require('p-queue');
var apacheArrow = require('apache-arrow');
var crypto$1 = require('crypto');
var promises = require('stream/promises');
var Database2 = require('better-sqlite3');
var drizzleOrm = require('drizzle-orm');
var betterSqlite3 = require('drizzle-orm/better-sqlite3');
var sqliteCore = require('drizzle-orm/sqlite-core');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var fs__default = /*#__PURE__*/_interopDefault(fs);
var path__default = /*#__PURE__*/_interopDefault(path);
var electron__default = /*#__PURE__*/_interopDefault(electron);
var fs3__default = /*#__PURE__*/_interopDefault(fs3);
var os3__default = /*#__PURE__*/_interopDefault(os3);
var z__namespace = /*#__PURE__*/_interopNamespace(z);
var Conf__default = /*#__PURE__*/_interopDefault(Conf);
var PQueue__default = /*#__PURE__*/_interopDefault(PQueue);
var crypto__default = /*#__PURE__*/_interopDefault(crypto$1);
var Database2__default = /*#__PURE__*/_interopDefault(Database2);

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc3) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc3 = __getOwnPropDesc(from, key)) || desc3.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  __defProp(target, "default", { value: mod, enumerable: true }) ,
  mod
));
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), member.set(obj, value), value);

// node_modules/.pnpm/ms@2.0.0/node_modules/ms/index.js
var require_ms = __commonJS({
  "node_modules/.pnpm/ms@2.0.0/node_modules/ms/index.js"(exports, module) {
    var s = 1e3;
    var m = s * 60;
    var h = m * 60;
    var d = h * 24;
    var y = d * 365.25;
    module.exports = function(val, options) {
      options = options || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse(val);
      } else if (type === "number" && isNaN(val) === false) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse(str) {
      str = String(str);
      if (str.length > 100) {
        return;
      }
      var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
        str
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      if (ms >= d) {
        return Math.round(ms / d) + "d";
      }
      if (ms >= h) {
        return Math.round(ms / h) + "h";
      }
      if (ms >= m) {
        return Math.round(ms / m) + "m";
      }
      if (ms >= s) {
        return Math.round(ms / s) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      return plural(ms, d, "day") || plural(ms, h, "hour") || plural(ms, m, "minute") || plural(ms, s, "second") || ms + " ms";
    }
    function plural(ms, n, name) {
      if (ms < n) {
        return;
      }
      if (ms < n * 1.5) {
        return Math.floor(ms / n) + " " + name;
      }
      return Math.ceil(ms / n) + " " + name + "s";
    }
  }
});

// node_modules/.pnpm/debug@2.6.9/node_modules/debug/src/debug.js
var require_debug = __commonJS({
  "node_modules/.pnpm/debug@2.6.9/node_modules/debug/src/debug.js"(exports, module) {
    exports = module.exports = createDebug.debug = createDebug["default"] = createDebug;
    exports.coerce = coerce;
    exports.disable = disable;
    exports.enable = enable;
    exports.enabled = enabled;
    exports.humanize = require_ms();
    exports.names = [];
    exports.skips = [];
    exports.formatters = {};
    var prevTime;
    function selectColor(namespace) {
      var hash = 0, i;
      for (i in namespace) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
      }
      return exports.colors[Math.abs(hash) % exports.colors.length];
    }
    function createDebug(namespace) {
      function debug() {
        if (!debug.enabled) return;
        var self2 = debug;
        var curr = +/* @__PURE__ */ new Date();
        var ms = curr - (prevTime || curr);
        self2.diff = ms;
        self2.prev = prevTime;
        self2.curr = curr;
        prevTime = curr;
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; i++) {
          args[i] = arguments[i];
        }
        args[0] = exports.coerce(args[0]);
        if ("string" !== typeof args[0]) {
          args.unshift("%O");
        }
        var index3 = 0;
        args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
          if (match === "%%") return match;
          index3++;
          var formatter = exports.formatters[format];
          if ("function" === typeof formatter) {
            var val = args[index3];
            match = formatter.call(self2, val);
            args.splice(index3, 1);
            index3--;
          }
          return match;
        });
        exports.formatArgs.call(self2, args);
        var logFn = debug.log || exports.log || console.log.bind(console);
        logFn.apply(self2, args);
      }
      debug.namespace = namespace;
      debug.enabled = exports.enabled(namespace);
      debug.useColors = exports.useColors();
      debug.color = selectColor(namespace);
      if ("function" === typeof exports.init) {
        exports.init(debug);
      }
      return debug;
    }
    function enable(namespaces) {
      exports.save(namespaces);
      exports.names = [];
      exports.skips = [];
      var split = (typeof namespaces === "string" ? namespaces : "").split(/[\s,]+/);
      var len = split.length;
      for (var i = 0; i < len; i++) {
        if (!split[i]) continue;
        namespaces = split[i].replace(/\*/g, ".*?");
        if (namespaces[0] === "-") {
          exports.skips.push(new RegExp("^" + namespaces.substr(1) + "$"));
        } else {
          exports.names.push(new RegExp("^" + namespaces + "$"));
        }
      }
    }
    function disable() {
      exports.enable("");
    }
    function enabled(name) {
      var i, len;
      for (i = 0, len = exports.skips.length; i < len; i++) {
        if (exports.skips[i].test(name)) {
          return false;
        }
      }
      for (i = 0, len = exports.names.length; i < len; i++) {
        if (exports.names[i].test(name)) {
          return true;
        }
      }
      return false;
    }
    function coerce(val) {
      if (val instanceof Error) return val.stack || val.message;
      return val;
    }
  }
});

// node_modules/.pnpm/debug@2.6.9/node_modules/debug/src/browser.js
var require_browser = __commonJS({
  "node_modules/.pnpm/debug@2.6.9/node_modules/debug/src/browser.js"(exports, module) {
    exports = module.exports = require_debug();
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = "undefined" != typeof chrome && "undefined" != typeof chrome.storage ? chrome.storage.local : localstorage();
    exports.colors = [
      "lightseagreen",
      "forestgreen",
      "goldenrod",
      "dodgerblue",
      "darkorchid",
      "crimson"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && window.process.type === "renderer") {
        return true;
      }
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31 || // double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    exports.formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (err) {
        return "[UnexpectedJSONParseError]: " + err.message;
      }
    };
    function formatArgs(args) {
      var useColors2 = this.useColors;
      args[0] = (useColors2 ? "%c" : "") + this.namespace + (useColors2 ? " %c" : " ") + args[0] + (useColors2 ? "%c " : " ") + "+" + exports.humanize(this.diff);
      if (!useColors2) return;
      var c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      var index3 = 0;
      var lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, function(match) {
        if ("%%" === match) return;
        index3++;
        if ("%c" === match) {
          lastC = index3;
        }
      });
      args.splice(lastC, 0, c);
    }
    function log() {
      return "object" === typeof console && console.log && Function.prototype.apply.call(console.log, console, arguments);
    }
    function save(namespaces) {
      try {
        if (null == namespaces) {
          exports.storage.removeItem("debug");
        } else {
          exports.storage.debug = namespaces;
        }
      } catch (e) {
      }
    }
    function load() {
      var r;
      try {
        r = exports.storage.debug;
      } catch (e) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    exports.enable(load());
    function localstorage() {
      try {
        return window.localStorage;
      } catch (e) {
      }
    }
  }
});

// node_modules/.pnpm/debug@2.6.9/node_modules/debug/src/node.js
var require_node = __commonJS({
  "node_modules/.pnpm/debug@2.6.9/node_modules/debug/src/node.js"(exports, module) {
    var tty = __require("tty");
    var util = __require("util");
    exports = module.exports = require_debug();
    exports.init = init2;
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.colors = [6, 2, 3, 4, 5, 1];
    exports.inspectOpts = Object.keys(process.env).filter(function(key) {
      return /^debug_/i.test(key);
    }).reduce(function(obj, key) {
      var prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, function(_, k) {
        return k.toUpperCase();
      });
      var val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) val = true;
      else if (/^(no|off|false|disabled)$/i.test(val)) val = false;
      else if (val === "null") val = null;
      else val = Number(val);
      obj[prop] = val;
      return obj;
    }, {});
    var fd = parseInt(process.env.DEBUG_FD, 10) || 2;
    if (1 !== fd && 2 !== fd) {
      util.deprecate(function() {
      }, "except for stderr(2) and stdout(1), any other usage of DEBUG_FD is deprecated. Override debug.log if you want to use a different log function (https://git.io/debug_fd)")();
    }
    var stream = 1 === fd ? process.stdout : 2 === fd ? process.stderr : createWritableStdioStream(fd);
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(fd);
    }
    exports.formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts).split("\n").map(function(str) {
        return str.trim();
      }).join(" ");
    };
    exports.formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts);
    };
    function formatArgs(args) {
      var name = this.namespace;
      var useColors2 = this.useColors;
      if (useColors2) {
        var c = this.color;
        var prefix = "  \x1B[3" + c + ";1m" + name + " \x1B[0m";
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push("\x1B[3" + c + "m+" + exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = (/* @__PURE__ */ new Date()).toUTCString() + " " + name + " " + args[0];
      }
    }
    function log() {
      return stream.write(util.format.apply(util, arguments) + "\n");
    }
    function save(namespaces) {
      if (null == namespaces) {
        delete process.env.DEBUG;
      } else {
        process.env.DEBUG = namespaces;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function createWritableStdioStream(fd2) {
      var stream2;
      var tty_wrap = process.binding("tty_wrap");
      switch (tty_wrap.guessHandleType(fd2)) {
        case "TTY":
          stream2 = new tty.WriteStream(fd2);
          stream2._type = "tty";
          if (stream2._handle && stream2._handle.unref) {
            stream2._handle.unref();
          }
          break;
        case "FILE":
          var fs5 = __require("fs");
          stream2 = new fs5.SyncWriteStream(fd2, { autoClose: false });
          stream2._type = "fs";
          break;
        case "PIPE":
        case "TCP":
          var net3 = __require("net");
          stream2 = new net3.Socket({
            fd: fd2,
            readable: false,
            writable: true
          });
          stream2.readable = false;
          stream2.read = null;
          stream2._type = "pipe";
          if (stream2._handle && stream2._handle.unref) {
            stream2._handle.unref();
          }
          break;
        default:
          throw new Error("Implement me. Unknown stream file type!");
      }
      stream2.fd = fd2;
      stream2._isStdio = true;
      return stream2;
    }
    function init2(debug) {
      debug.inspectOpts = {};
      var keys = Object.keys(exports.inspectOpts);
      for (var i = 0; i < keys.length; i++) {
        debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    exports.enable(load());
  }
});

// node_modules/.pnpm/debug@2.6.9/node_modules/debug/src/index.js
var require_src = __commonJS({
  "node_modules/.pnpm/debug@2.6.9/node_modules/debug/src/index.js"(exports, module) {
    if (typeof process !== "undefined" && process.type === "renderer") {
      module.exports = require_browser();
    } else {
      module.exports = require_node();
    }
  }
});

// node_modules/.pnpm/electron-squirrel-startup@1.0.1/node_modules/electron-squirrel-startup/index.js
var require_electron_squirrel_startup = __commonJS({
  "node_modules/.pnpm/electron-squirrel-startup@1.0.1/node_modules/electron-squirrel-startup/index.js"(exports, module) {
    var path13 = __require("path");
    var spawn = __require("child_process").spawn;
    var debug = require_src()("electron-squirrel-startup");
    var app10 = __require("electron").app;
    var run = function(args, done) {
      var updateExe = path13.resolve(path13.dirname(process.execPath), "..", "Update.exe");
      debug("Spawning `%s` with args `%s`", updateExe, args);
      spawn(updateExe, args, {
        detached: true
      }).on("close", done);
    };
    var check = function() {
      if (process.platform === "win32") {
        var cmd = process.argv[1];
        debug("processing squirrel command `%s`", cmd);
        var target = path13.basename(process.execPath);
        if (cmd === "--squirrel-install" || cmd === "--squirrel-updated") {
          run(["--createShortcut=" + target], app10.quit);
          return true;
        }
        if (cmd === "--squirrel-uninstall") {
          run(["--removeShortcut=" + target], app10.quit);
          return true;
        }
        if (cmd === "--squirrel-obsolete") {
          app10.quit();
          return true;
        }
      }
      return false;
    };
    module.exports = check();
  }
});

// node_modules/.pnpm/process-nextick-args@2.0.1/node_modules/process-nextick-args/index.js
var require_process_nextick_args = __commonJS({
  "node_modules/.pnpm/process-nextick-args@2.0.1/node_modules/process-nextick-args/index.js"(exports, module) {
    if (typeof process === "undefined" || !process.version || process.version.indexOf("v0.") === 0 || process.version.indexOf("v1.") === 0 && process.version.indexOf("v1.8.") !== 0) {
      module.exports = { nextTick };
    } else {
      module.exports = process;
    }
    function nextTick(fn, arg1, arg2, arg3) {
      if (typeof fn !== "function") {
        throw new TypeError('"callback" argument must be a function');
      }
      var len = arguments.length;
      var args, i;
      switch (len) {
        case 0:
        case 1:
          return process.nextTick(fn);
        case 2:
          return process.nextTick(function afterTickOne() {
            fn.call(null, arg1);
          });
        case 3:
          return process.nextTick(function afterTickTwo() {
            fn.call(null, arg1, arg2);
          });
        case 4:
          return process.nextTick(function afterTickThree() {
            fn.call(null, arg1, arg2, arg3);
          });
        default:
          args = new Array(len - 1);
          i = 0;
          while (i < args.length) {
            args[i++] = arguments[i];
          }
          return process.nextTick(function afterTick() {
            fn.apply(null, args);
          });
      }
    }
  }
});

// node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js
var require_isarray = __commonJS({
  "node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"(exports, module) {
    var toString = {}.toString;
    module.exports = Array.isArray || function(arr) {
      return toString.call(arr) == "[object Array]";
    };
  }
});

// node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/internal/streams/stream.js
var require_stream = __commonJS({
  "node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/internal/streams/stream.js"(exports, module) {
    module.exports = __require("stream");
  }
});

// node_modules/.pnpm/safe-buffer@5.1.2/node_modules/safe-buffer/index.js
var require_safe_buffer = __commonJS({
  "node_modules/.pnpm/safe-buffer@5.1.2/node_modules/safe-buffer/index.js"(exports, module) {
    var buffer = __require("buffer");
    var Buffer3 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer3.from && Buffer3.alloc && Buffer3.allocUnsafe && Buffer3.allocUnsafeSlow) {
      module.exports = buffer;
    } else {
      copyProps(buffer, exports);
      exports.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer3(arg, encodingOrOffset, length);
    }
    copyProps(Buffer3, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer3(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer3(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer3(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  }
});

// node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js
var require_util = __commonJS({
  "node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"(exports) {
    function isArray(arg) {
      if (Array.isArray) {
        return Array.isArray(arg);
      }
      return objectToString(arg) === "[object Array]";
    }
    exports.isArray = isArray;
    function isBoolean(arg) {
      return typeof arg === "boolean";
    }
    exports.isBoolean = isBoolean;
    function isNull(arg) {
      return arg === null;
    }
    exports.isNull = isNull;
    function isNullOrUndefined(arg) {
      return arg == null;
    }
    exports.isNullOrUndefined = isNullOrUndefined;
    function isNumber(arg) {
      return typeof arg === "number";
    }
    exports.isNumber = isNumber;
    function isString(arg) {
      return typeof arg === "string";
    }
    exports.isString = isString;
    function isSymbol(arg) {
      return typeof arg === "symbol";
    }
    exports.isSymbol = isSymbol;
    function isUndefined(arg) {
      return arg === void 0;
    }
    exports.isUndefined = isUndefined;
    function isRegExp(re) {
      return objectToString(re) === "[object RegExp]";
    }
    exports.isRegExp = isRegExp;
    function isObject(arg) {
      return typeof arg === "object" && arg !== null;
    }
    exports.isObject = isObject;
    function isDate(d) {
      return objectToString(d) === "[object Date]";
    }
    exports.isDate = isDate;
    function isError(e) {
      return objectToString(e) === "[object Error]" || e instanceof Error;
    }
    exports.isError = isError;
    function isFunction(arg) {
      return typeof arg === "function";
    }
    exports.isFunction = isFunction;
    function isPrimitive(arg) {
      return arg === null || typeof arg === "boolean" || typeof arg === "number" || typeof arg === "string" || typeof arg === "symbol" || // ES6 symbol
      typeof arg === "undefined";
    }
    exports.isPrimitive = isPrimitive;
    exports.isBuffer = __require("buffer").Buffer.isBuffer;
    function objectToString(o) {
      return Object.prototype.toString.call(o);
    }
  }
});

// node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits_browser.js
var require_inherits_browser = __commonJS({
  "node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits_browser.js"(exports, module) {
    if (typeof Object.create === "function") {
      module.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          ctor.prototype = Object.create(superCtor.prototype, {
            constructor: {
              value: ctor,
              enumerable: false,
              writable: true,
              configurable: true
            }
          });
        }
      };
    } else {
      module.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          var TempCtor = function() {
          };
          TempCtor.prototype = superCtor.prototype;
          ctor.prototype = new TempCtor();
          ctor.prototype.constructor = ctor;
        }
      };
    }
  }
});

// node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js
var require_inherits = __commonJS({
  "node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"(exports, module) {
    try {
      util = __require("util");
      if (typeof util.inherits !== "function") throw "";
      module.exports = util.inherits;
    } catch (e) {
      module.exports = require_inherits_browser();
    }
    var util;
  }
});

// node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/internal/streams/BufferList.js
var require_BufferList = __commonJS({
  "node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/internal/streams/BufferList.js"(exports, module) {
    function _classCallCheck(instance2, Constructor) {
      if (!(instance2 instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    }
    var Buffer3 = require_safe_buffer().Buffer;
    var util = __require("util");
    function copyBuffer(src, target, offset) {
      src.copy(target, offset);
    }
    module.exports = (function() {
      function BufferList() {
        _classCallCheck(this, BufferList);
        this.head = null;
        this.tail = null;
        this.length = 0;
      }
      BufferList.prototype.push = function push(v) {
        var entry = { data: v, next: null };
        if (this.length > 0) this.tail.next = entry;
        else this.head = entry;
        this.tail = entry;
        ++this.length;
      };
      BufferList.prototype.unshift = function unshift(v) {
        var entry = { data: v, next: this.head };
        if (this.length === 0) this.tail = entry;
        this.head = entry;
        ++this.length;
      };
      BufferList.prototype.shift = function shift() {
        if (this.length === 0) return;
        var ret = this.head.data;
        if (this.length === 1) this.head = this.tail = null;
        else this.head = this.head.next;
        --this.length;
        return ret;
      };
      BufferList.prototype.clear = function clear() {
        this.head = this.tail = null;
        this.length = 0;
      };
      BufferList.prototype.join = function join(s) {
        if (this.length === 0) return "";
        var p = this.head;
        var ret = "" + p.data;
        while (p = p.next) {
          ret += s + p.data;
        }
        return ret;
      };
      BufferList.prototype.concat = function concat(n) {
        if (this.length === 0) return Buffer3.alloc(0);
        var ret = Buffer3.allocUnsafe(n >>> 0);
        var p = this.head;
        var i = 0;
        while (p) {
          copyBuffer(p.data, ret, i);
          i += p.data.length;
          p = p.next;
        }
        return ret;
      };
      return BufferList;
    })();
    if (util && util.inspect && util.inspect.custom) {
      module.exports.prototype[util.inspect.custom] = function() {
        var obj = util.inspect({ length: this.length });
        return this.constructor.name + " " + obj;
      };
    }
  }
});

// node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/internal/streams/destroy.js
var require_destroy = __commonJS({
  "node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/internal/streams/destroy.js"(exports, module) {
    var pna = require_process_nextick_args();
    function destroy(err, cb) {
      var _this = this;
      var readableDestroyed = this._readableState && this._readableState.destroyed;
      var writableDestroyed = this._writableState && this._writableState.destroyed;
      if (readableDestroyed || writableDestroyed) {
        if (cb) {
          cb(err);
        } else if (err) {
          if (!this._writableState) {
            pna.nextTick(emitErrorNT, this, err);
          } else if (!this._writableState.errorEmitted) {
            this._writableState.errorEmitted = true;
            pna.nextTick(emitErrorNT, this, err);
          }
        }
        return this;
      }
      if (this._readableState) {
        this._readableState.destroyed = true;
      }
      if (this._writableState) {
        this._writableState.destroyed = true;
      }
      this._destroy(err || null, function(err2) {
        if (!cb && err2) {
          if (!_this._writableState) {
            pna.nextTick(emitErrorNT, _this, err2);
          } else if (!_this._writableState.errorEmitted) {
            _this._writableState.errorEmitted = true;
            pna.nextTick(emitErrorNT, _this, err2);
          }
        } else if (cb) {
          cb(err2);
        }
      });
      return this;
    }
    function undestroy() {
      if (this._readableState) {
        this._readableState.destroyed = false;
        this._readableState.reading = false;
        this._readableState.ended = false;
        this._readableState.endEmitted = false;
      }
      if (this._writableState) {
        this._writableState.destroyed = false;
        this._writableState.ended = false;
        this._writableState.ending = false;
        this._writableState.finalCalled = false;
        this._writableState.prefinished = false;
        this._writableState.finished = false;
        this._writableState.errorEmitted = false;
      }
    }
    function emitErrorNT(self2, err) {
      self2.emit("error", err);
    }
    module.exports = {
      destroy,
      undestroy
    };
  }
});

// node_modules/.pnpm/util-deprecate@1.0.2/node_modules/util-deprecate/node.js
var require_node2 = __commonJS({
  "node_modules/.pnpm/util-deprecate@1.0.2/node_modules/util-deprecate/node.js"(exports, module) {
    module.exports = __require("util").deprecate;
  }
});

// node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/_stream_writable.js
var require_stream_writable = __commonJS({
  "node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/_stream_writable.js"(exports, module) {
    var pna = require_process_nextick_args();
    module.exports = Writable;
    function CorkedRequest(state) {
      var _this = this;
      this.next = null;
      this.entry = null;
      this.finish = function() {
        onCorkedFinish(_this, state);
      };
    }
    var asyncWrite = !process.browser && ["v0.10", "v0.9."].indexOf(process.version.slice(0, 5)) > -1 ? setImmediate : pna.nextTick;
    var Duplex;
    Writable.WritableState = WritableState;
    var util = Object.create(require_util());
    util.inherits = require_inherits();
    var internalUtil = {
      deprecate: require_node2()
    };
    var Stream = require_stream();
    var Buffer3 = require_safe_buffer().Buffer;
    var OurUint8Array = (typeof global !== "undefined" ? global : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : {}).Uint8Array || function() {
    };
    function _uint8ArrayToBuffer(chunk) {
      return Buffer3.from(chunk);
    }
    function _isUint8Array(obj) {
      return Buffer3.isBuffer(obj) || obj instanceof OurUint8Array;
    }
    var destroyImpl = require_destroy();
    util.inherits(Writable, Stream);
    function nop() {
    }
    function WritableState(options, stream) {
      Duplex = Duplex || require_stream_duplex();
      options = options || {};
      var isDuplex = stream instanceof Duplex;
      this.objectMode = !!options.objectMode;
      if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode;
      var hwm = options.highWaterMark;
      var writableHwm = options.writableHighWaterMark;
      var defaultHwm = this.objectMode ? 16 : 16 * 1024;
      if (hwm || hwm === 0) this.highWaterMark = hwm;
      else if (isDuplex && (writableHwm || writableHwm === 0)) this.highWaterMark = writableHwm;
      else this.highWaterMark = defaultHwm;
      this.highWaterMark = Math.floor(this.highWaterMark);
      this.finalCalled = false;
      this.needDrain = false;
      this.ending = false;
      this.ended = false;
      this.finished = false;
      this.destroyed = false;
      var noDecode = options.decodeStrings === false;
      this.decodeStrings = !noDecode;
      this.defaultEncoding = options.defaultEncoding || "utf8";
      this.length = 0;
      this.writing = false;
      this.corked = 0;
      this.sync = true;
      this.bufferProcessing = false;
      this.onwrite = function(er) {
        onwrite(stream, er);
      };
      this.writecb = null;
      this.writelen = 0;
      this.bufferedRequest = null;
      this.lastBufferedRequest = null;
      this.pendingcb = 0;
      this.prefinished = false;
      this.errorEmitted = false;
      this.bufferedRequestCount = 0;
      this.corkedRequestsFree = new CorkedRequest(this);
    }
    WritableState.prototype.getBuffer = function getBuffer() {
      var current = this.bufferedRequest;
      var out = [];
      while (current) {
        out.push(current);
        current = current.next;
      }
      return out;
    };
    (function() {
      try {
        Object.defineProperty(WritableState.prototype, "buffer", {
          get: internalUtil.deprecate(function() {
            return this.getBuffer();
          }, "_writableState.buffer is deprecated. Use _writableState.getBuffer instead.", "DEP0003")
        });
      } catch (_) {
      }
    })();
    var realHasInstance;
    if (typeof Symbol === "function" && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === "function") {
      realHasInstance = Function.prototype[Symbol.hasInstance];
      Object.defineProperty(Writable, Symbol.hasInstance, {
        value: function(object2) {
          if (realHasInstance.call(this, object2)) return true;
          if (this !== Writable) return false;
          return object2 && object2._writableState instanceof WritableState;
        }
      });
    } else {
      realHasInstance = function(object2) {
        return object2 instanceof this;
      };
    }
    function Writable(options) {
      Duplex = Duplex || require_stream_duplex();
      if (!realHasInstance.call(Writable, this) && !(this instanceof Duplex)) {
        return new Writable(options);
      }
      this._writableState = new WritableState(options, this);
      this.writable = true;
      if (options) {
        if (typeof options.write === "function") this._write = options.write;
        if (typeof options.writev === "function") this._writev = options.writev;
        if (typeof options.destroy === "function") this._destroy = options.destroy;
        if (typeof options.final === "function") this._final = options.final;
      }
      Stream.call(this);
    }
    Writable.prototype.pipe = function() {
      this.emit("error", new Error("Cannot pipe, not readable"));
    };
    function writeAfterEnd(stream, cb) {
      var er = new Error("write after end");
      stream.emit("error", er);
      pna.nextTick(cb, er);
    }
    function validChunk(stream, state, chunk, cb) {
      var valid = true;
      var er = false;
      if (chunk === null) {
        er = new TypeError("May not write null values to stream");
      } else if (typeof chunk !== "string" && chunk !== void 0 && !state.objectMode) {
        er = new TypeError("Invalid non-string/buffer chunk");
      }
      if (er) {
        stream.emit("error", er);
        pna.nextTick(cb, er);
        valid = false;
      }
      return valid;
    }
    Writable.prototype.write = function(chunk, encoding, cb) {
      var state = this._writableState;
      var ret = false;
      var isBuf = !state.objectMode && _isUint8Array(chunk);
      if (isBuf && !Buffer3.isBuffer(chunk)) {
        chunk = _uint8ArrayToBuffer(chunk);
      }
      if (typeof encoding === "function") {
        cb = encoding;
        encoding = null;
      }
      if (isBuf) encoding = "buffer";
      else if (!encoding) encoding = state.defaultEncoding;
      if (typeof cb !== "function") cb = nop;
      if (state.ended) writeAfterEnd(this, cb);
      else if (isBuf || validChunk(this, state, chunk, cb)) {
        state.pendingcb++;
        ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
      }
      return ret;
    };
    Writable.prototype.cork = function() {
      var state = this._writableState;
      state.corked++;
    };
    Writable.prototype.uncork = function() {
      var state = this._writableState;
      if (state.corked) {
        state.corked--;
        if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
      }
    };
    Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
      if (typeof encoding === "string") encoding = encoding.toLowerCase();
      if (!(["hex", "utf8", "utf-8", "ascii", "binary", "base64", "ucs2", "ucs-2", "utf16le", "utf-16le", "raw"].indexOf((encoding + "").toLowerCase()) > -1)) throw new TypeError("Unknown encoding: " + encoding);
      this._writableState.defaultEncoding = encoding;
      return this;
    };
    function decodeChunk(state, chunk, encoding) {
      if (!state.objectMode && state.decodeStrings !== false && typeof chunk === "string") {
        chunk = Buffer3.from(chunk, encoding);
      }
      return chunk;
    }
    Object.defineProperty(Writable.prototype, "writableHighWaterMark", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function() {
        return this._writableState.highWaterMark;
      }
    });
    function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
      if (!isBuf) {
        var newChunk = decodeChunk(state, chunk, encoding);
        if (chunk !== newChunk) {
          isBuf = true;
          encoding = "buffer";
          chunk = newChunk;
        }
      }
      var len = state.objectMode ? 1 : chunk.length;
      state.length += len;
      var ret = state.length < state.highWaterMark;
      if (!ret) state.needDrain = true;
      if (state.writing || state.corked) {
        var last = state.lastBufferedRequest;
        state.lastBufferedRequest = {
          chunk,
          encoding,
          isBuf,
          callback: cb,
          next: null
        };
        if (last) {
          last.next = state.lastBufferedRequest;
        } else {
          state.bufferedRequest = state.lastBufferedRequest;
        }
        state.bufferedRequestCount += 1;
      } else {
        doWrite(stream, state, false, len, chunk, encoding, cb);
      }
      return ret;
    }
    function doWrite(stream, state, writev, len, chunk, encoding, cb) {
      state.writelen = len;
      state.writecb = cb;
      state.writing = true;
      state.sync = true;
      if (writev) stream._writev(chunk, state.onwrite);
      else stream._write(chunk, encoding, state.onwrite);
      state.sync = false;
    }
    function onwriteError(stream, state, sync, er, cb) {
      --state.pendingcb;
      if (sync) {
        pna.nextTick(cb, er);
        pna.nextTick(finishMaybe, stream, state);
        stream._writableState.errorEmitted = true;
        stream.emit("error", er);
      } else {
        cb(er);
        stream._writableState.errorEmitted = true;
        stream.emit("error", er);
        finishMaybe(stream, state);
      }
    }
    function onwriteStateUpdate(state) {
      state.writing = false;
      state.writecb = null;
      state.length -= state.writelen;
      state.writelen = 0;
    }
    function onwrite(stream, er) {
      var state = stream._writableState;
      var sync = state.sync;
      var cb = state.writecb;
      onwriteStateUpdate(state);
      if (er) onwriteError(stream, state, sync, er, cb);
      else {
        var finished = needFinish(state);
        if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
          clearBuffer(stream, state);
        }
        if (sync) {
          asyncWrite(afterWrite, stream, state, finished, cb);
        } else {
          afterWrite(stream, state, finished, cb);
        }
      }
    }
    function afterWrite(stream, state, finished, cb) {
      if (!finished) onwriteDrain(stream, state);
      state.pendingcb--;
      cb();
      finishMaybe(stream, state);
    }
    function onwriteDrain(stream, state) {
      if (state.length === 0 && state.needDrain) {
        state.needDrain = false;
        stream.emit("drain");
      }
    }
    function clearBuffer(stream, state) {
      state.bufferProcessing = true;
      var entry = state.bufferedRequest;
      if (stream._writev && entry && entry.next) {
        var l = state.bufferedRequestCount;
        var buffer = new Array(l);
        var holder = state.corkedRequestsFree;
        holder.entry = entry;
        var count = 0;
        var allBuffers = true;
        while (entry) {
          buffer[count] = entry;
          if (!entry.isBuf) allBuffers = false;
          entry = entry.next;
          count += 1;
        }
        buffer.allBuffers = allBuffers;
        doWrite(stream, state, true, state.length, buffer, "", holder.finish);
        state.pendingcb++;
        state.lastBufferedRequest = null;
        if (holder.next) {
          state.corkedRequestsFree = holder.next;
          holder.next = null;
        } else {
          state.corkedRequestsFree = new CorkedRequest(state);
        }
        state.bufferedRequestCount = 0;
      } else {
        while (entry) {
          var chunk = entry.chunk;
          var encoding = entry.encoding;
          var cb = entry.callback;
          var len = state.objectMode ? 1 : chunk.length;
          doWrite(stream, state, false, len, chunk, encoding, cb);
          entry = entry.next;
          state.bufferedRequestCount--;
          if (state.writing) {
            break;
          }
        }
        if (entry === null) state.lastBufferedRequest = null;
      }
      state.bufferedRequest = entry;
      state.bufferProcessing = false;
    }
    Writable.prototype._write = function(chunk, encoding, cb) {
      cb(new Error("_write() is not implemented"));
    };
    Writable.prototype._writev = null;
    Writable.prototype.end = function(chunk, encoding, cb) {
      var state = this._writableState;
      if (typeof chunk === "function") {
        cb = chunk;
        chunk = null;
        encoding = null;
      } else if (typeof encoding === "function") {
        cb = encoding;
        encoding = null;
      }
      if (chunk !== null && chunk !== void 0) this.write(chunk, encoding);
      if (state.corked) {
        state.corked = 1;
        this.uncork();
      }
      if (!state.ending) endWritable(this, state, cb);
    };
    function needFinish(state) {
      return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
    }
    function callFinal(stream, state) {
      stream._final(function(err) {
        state.pendingcb--;
        if (err) {
          stream.emit("error", err);
        }
        state.prefinished = true;
        stream.emit("prefinish");
        finishMaybe(stream, state);
      });
    }
    function prefinish(stream, state) {
      if (!state.prefinished && !state.finalCalled) {
        if (typeof stream._final === "function") {
          state.pendingcb++;
          state.finalCalled = true;
          pna.nextTick(callFinal, stream, state);
        } else {
          state.prefinished = true;
          stream.emit("prefinish");
        }
      }
    }
    function finishMaybe(stream, state) {
      var need = needFinish(state);
      if (need) {
        prefinish(stream, state);
        if (state.pendingcb === 0) {
          state.finished = true;
          stream.emit("finish");
        }
      }
      return need;
    }
    function endWritable(stream, state, cb) {
      state.ending = true;
      finishMaybe(stream, state);
      if (cb) {
        if (state.finished) pna.nextTick(cb);
        else stream.once("finish", cb);
      }
      state.ended = true;
      stream.writable = false;
    }
    function onCorkedFinish(corkReq, state, err) {
      var entry = corkReq.entry;
      corkReq.entry = null;
      while (entry) {
        var cb = entry.callback;
        state.pendingcb--;
        cb(err);
        entry = entry.next;
      }
      state.corkedRequestsFree.next = corkReq;
    }
    Object.defineProperty(Writable.prototype, "destroyed", {
      get: function() {
        if (this._writableState === void 0) {
          return false;
        }
        return this._writableState.destroyed;
      },
      set: function(value) {
        if (!this._writableState) {
          return;
        }
        this._writableState.destroyed = value;
      }
    });
    Writable.prototype.destroy = destroyImpl.destroy;
    Writable.prototype._undestroy = destroyImpl.undestroy;
    Writable.prototype._destroy = function(err, cb) {
      this.end();
      cb(err);
    };
  }
});

// node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/_stream_duplex.js
var require_stream_duplex = __commonJS({
  "node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/_stream_duplex.js"(exports, module) {
    var pna = require_process_nextick_args();
    var objectKeys = Object.keys || function(obj) {
      var keys2 = [];
      for (var key in obj) {
        keys2.push(key);
      }
      return keys2;
    };
    module.exports = Duplex;
    var util = Object.create(require_util());
    util.inherits = require_inherits();
    var Readable = require_stream_readable();
    var Writable = require_stream_writable();
    util.inherits(Duplex, Readable);
    {
      keys = objectKeys(Writable.prototype);
      for (v = 0; v < keys.length; v++) {
        method = keys[v];
        if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
      }
    }
    var keys;
    var method;
    var v;
    function Duplex(options) {
      if (!(this instanceof Duplex)) return new Duplex(options);
      Readable.call(this, options);
      Writable.call(this, options);
      if (options && options.readable === false) this.readable = false;
      if (options && options.writable === false) this.writable = false;
      this.allowHalfOpen = true;
      if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;
      this.once("end", onend);
    }
    Object.defineProperty(Duplex.prototype, "writableHighWaterMark", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function() {
        return this._writableState.highWaterMark;
      }
    });
    function onend() {
      if (this.allowHalfOpen || this._writableState.ended) return;
      pna.nextTick(onEndNT, this);
    }
    function onEndNT(self2) {
      self2.end();
    }
    Object.defineProperty(Duplex.prototype, "destroyed", {
      get: function() {
        if (this._readableState === void 0 || this._writableState === void 0) {
          return false;
        }
        return this._readableState.destroyed && this._writableState.destroyed;
      },
      set: function(value) {
        if (this._readableState === void 0 || this._writableState === void 0) {
          return;
        }
        this._readableState.destroyed = value;
        this._writableState.destroyed = value;
      }
    });
    Duplex.prototype._destroy = function(err, cb) {
      this.push(null);
      this.end();
      pna.nextTick(cb, err);
    };
  }
});

// node_modules/.pnpm/string_decoder@1.1.1/node_modules/string_decoder/lib/string_decoder.js
var require_string_decoder = __commonJS({
  "node_modules/.pnpm/string_decoder@1.1.1/node_modules/string_decoder/lib/string_decoder.js"(exports) {
    var Buffer3 = require_safe_buffer().Buffer;
    var isEncoding = Buffer3.isEncoding || function(encoding) {
      encoding = "" + encoding;
      switch (encoding && encoding.toLowerCase()) {
        case "hex":
        case "utf8":
        case "utf-8":
        case "ascii":
        case "binary":
        case "base64":
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
        case "raw":
          return true;
        default:
          return false;
      }
    };
    function _normalizeEncoding(enc) {
      if (!enc) return "utf8";
      var retried;
      while (true) {
        switch (enc) {
          case "utf8":
          case "utf-8":
            return "utf8";
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return "utf16le";
          case "latin1":
          case "binary":
            return "latin1";
          case "base64":
          case "ascii":
          case "hex":
            return enc;
          default:
            if (retried) return;
            enc = ("" + enc).toLowerCase();
            retried = true;
        }
      }
    }
    function normalizeEncoding(enc) {
      var nenc = _normalizeEncoding(enc);
      if (typeof nenc !== "string" && (Buffer3.isEncoding === isEncoding || !isEncoding(enc))) throw new Error("Unknown encoding: " + enc);
      return nenc || enc;
    }
    exports.StringDecoder = StringDecoder;
    function StringDecoder(encoding) {
      this.encoding = normalizeEncoding(encoding);
      var nb;
      switch (this.encoding) {
        case "utf16le":
          this.text = utf16Text;
          this.end = utf16End;
          nb = 4;
          break;
        case "utf8":
          this.fillLast = utf8FillLast;
          nb = 4;
          break;
        case "base64":
          this.text = base64Text;
          this.end = base64End;
          nb = 3;
          break;
        default:
          this.write = simpleWrite;
          this.end = simpleEnd;
          return;
      }
      this.lastNeed = 0;
      this.lastTotal = 0;
      this.lastChar = Buffer3.allocUnsafe(nb);
    }
    StringDecoder.prototype.write = function(buf) {
      if (buf.length === 0) return "";
      var r;
      var i;
      if (this.lastNeed) {
        r = this.fillLast(buf);
        if (r === void 0) return "";
        i = this.lastNeed;
        this.lastNeed = 0;
      } else {
        i = 0;
      }
      if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
      return r || "";
    };
    StringDecoder.prototype.end = utf8End;
    StringDecoder.prototype.text = utf8Text;
    StringDecoder.prototype.fillLast = function(buf) {
      if (this.lastNeed <= buf.length) {
        buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
        return this.lastChar.toString(this.encoding, 0, this.lastTotal);
      }
      buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
      this.lastNeed -= buf.length;
    };
    function utf8CheckByte(byte) {
      if (byte <= 127) return 0;
      else if (byte >> 5 === 6) return 2;
      else if (byte >> 4 === 14) return 3;
      else if (byte >> 3 === 30) return 4;
      return byte >> 6 === 2 ? -1 : -2;
    }
    function utf8CheckIncomplete(self2, buf, i) {
      var j = buf.length - 1;
      if (j < i) return 0;
      var nb = utf8CheckByte(buf[j]);
      if (nb >= 0) {
        if (nb > 0) self2.lastNeed = nb - 1;
        return nb;
      }
      if (--j < i || nb === -2) return 0;
      nb = utf8CheckByte(buf[j]);
      if (nb >= 0) {
        if (nb > 0) self2.lastNeed = nb - 2;
        return nb;
      }
      if (--j < i || nb === -2) return 0;
      nb = utf8CheckByte(buf[j]);
      if (nb >= 0) {
        if (nb > 0) {
          if (nb === 2) nb = 0;
          else self2.lastNeed = nb - 3;
        }
        return nb;
      }
      return 0;
    }
    function utf8CheckExtraBytes(self2, buf, p) {
      if ((buf[0] & 192) !== 128) {
        self2.lastNeed = 0;
        return "\uFFFD";
      }
      if (self2.lastNeed > 1 && buf.length > 1) {
        if ((buf[1] & 192) !== 128) {
          self2.lastNeed = 1;
          return "\uFFFD";
        }
        if (self2.lastNeed > 2 && buf.length > 2) {
          if ((buf[2] & 192) !== 128) {
            self2.lastNeed = 2;
            return "\uFFFD";
          }
        }
      }
    }
    function utf8FillLast(buf) {
      var p = this.lastTotal - this.lastNeed;
      var r = utf8CheckExtraBytes(this, buf);
      if (r !== void 0) return r;
      if (this.lastNeed <= buf.length) {
        buf.copy(this.lastChar, p, 0, this.lastNeed);
        return this.lastChar.toString(this.encoding, 0, this.lastTotal);
      }
      buf.copy(this.lastChar, p, 0, buf.length);
      this.lastNeed -= buf.length;
    }
    function utf8Text(buf, i) {
      var total = utf8CheckIncomplete(this, buf, i);
      if (!this.lastNeed) return buf.toString("utf8", i);
      this.lastTotal = total;
      var end = buf.length - (total - this.lastNeed);
      buf.copy(this.lastChar, 0, end);
      return buf.toString("utf8", i, end);
    }
    function utf8End(buf) {
      var r = buf && buf.length ? this.write(buf) : "";
      if (this.lastNeed) return r + "\uFFFD";
      return r;
    }
    function utf16Text(buf, i) {
      if ((buf.length - i) % 2 === 0) {
        var r = buf.toString("utf16le", i);
        if (r) {
          var c = r.charCodeAt(r.length - 1);
          if (c >= 55296 && c <= 56319) {
            this.lastNeed = 2;
            this.lastTotal = 4;
            this.lastChar[0] = buf[buf.length - 2];
            this.lastChar[1] = buf[buf.length - 1];
            return r.slice(0, -1);
          }
        }
        return r;
      }
      this.lastNeed = 1;
      this.lastTotal = 2;
      this.lastChar[0] = buf[buf.length - 1];
      return buf.toString("utf16le", i, buf.length - 1);
    }
    function utf16End(buf) {
      var r = buf && buf.length ? this.write(buf) : "";
      if (this.lastNeed) {
        var end = this.lastTotal - this.lastNeed;
        return r + this.lastChar.toString("utf16le", 0, end);
      }
      return r;
    }
    function base64Text(buf, i) {
      var n = (buf.length - i) % 3;
      if (n === 0) return buf.toString("base64", i);
      this.lastNeed = 3 - n;
      this.lastTotal = 3;
      if (n === 1) {
        this.lastChar[0] = buf[buf.length - 1];
      } else {
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
      }
      return buf.toString("base64", i, buf.length - n);
    }
    function base64End(buf) {
      var r = buf && buf.length ? this.write(buf) : "";
      if (this.lastNeed) return r + this.lastChar.toString("base64", 0, 3 - this.lastNeed);
      return r;
    }
    function simpleWrite(buf) {
      return buf.toString(this.encoding);
    }
    function simpleEnd(buf) {
      return buf && buf.length ? this.write(buf) : "";
    }
  }
});

// node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/_stream_readable.js
var require_stream_readable = __commonJS({
  "node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/_stream_readable.js"(exports, module) {
    var pna = require_process_nextick_args();
    module.exports = Readable;
    var isArray = require_isarray();
    var Duplex;
    Readable.ReadableState = ReadableState;
    __require("events").EventEmitter;
    var EElistenerCount = function(emitter, type) {
      return emitter.listeners(type).length;
    };
    var Stream = require_stream();
    var Buffer3 = require_safe_buffer().Buffer;
    var OurUint8Array = (typeof global !== "undefined" ? global : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : {}).Uint8Array || function() {
    };
    function _uint8ArrayToBuffer(chunk) {
      return Buffer3.from(chunk);
    }
    function _isUint8Array(obj) {
      return Buffer3.isBuffer(obj) || obj instanceof OurUint8Array;
    }
    var util = Object.create(require_util());
    util.inherits = require_inherits();
    var debugUtil = __require("util");
    var debug = void 0;
    if (debugUtil && debugUtil.debuglog) {
      debug = debugUtil.debuglog("stream");
    } else {
      debug = function() {
      };
    }
    var BufferList = require_BufferList();
    var destroyImpl = require_destroy();
    var StringDecoder;
    util.inherits(Readable, Stream);
    var kProxyEvents = ["error", "close", "destroy", "pause", "resume"];
    function prependListener(emitter, event, fn) {
      if (typeof emitter.prependListener === "function") return emitter.prependListener(event, fn);
      if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);
      else if (isArray(emitter._events[event])) emitter._events[event].unshift(fn);
      else emitter._events[event] = [fn, emitter._events[event]];
    }
    function ReadableState(options, stream) {
      Duplex = Duplex || require_stream_duplex();
      options = options || {};
      var isDuplex = stream instanceof Duplex;
      this.objectMode = !!options.objectMode;
      if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode;
      var hwm = options.highWaterMark;
      var readableHwm = options.readableHighWaterMark;
      var defaultHwm = this.objectMode ? 16 : 16 * 1024;
      if (hwm || hwm === 0) this.highWaterMark = hwm;
      else if (isDuplex && (readableHwm || readableHwm === 0)) this.highWaterMark = readableHwm;
      else this.highWaterMark = defaultHwm;
      this.highWaterMark = Math.floor(this.highWaterMark);
      this.buffer = new BufferList();
      this.length = 0;
      this.pipes = null;
      this.pipesCount = 0;
      this.flowing = null;
      this.ended = false;
      this.endEmitted = false;
      this.reading = false;
      this.sync = true;
      this.needReadable = false;
      this.emittedReadable = false;
      this.readableListening = false;
      this.resumeScheduled = false;
      this.destroyed = false;
      this.defaultEncoding = options.defaultEncoding || "utf8";
      this.awaitDrain = 0;
      this.readingMore = false;
      this.decoder = null;
      this.encoding = null;
      if (options.encoding) {
        if (!StringDecoder) StringDecoder = require_string_decoder().StringDecoder;
        this.decoder = new StringDecoder(options.encoding);
        this.encoding = options.encoding;
      }
    }
    function Readable(options) {
      Duplex = Duplex || require_stream_duplex();
      if (!(this instanceof Readable)) return new Readable(options);
      this._readableState = new ReadableState(options, this);
      this.readable = true;
      if (options) {
        if (typeof options.read === "function") this._read = options.read;
        if (typeof options.destroy === "function") this._destroy = options.destroy;
      }
      Stream.call(this);
    }
    Object.defineProperty(Readable.prototype, "destroyed", {
      get: function() {
        if (this._readableState === void 0) {
          return false;
        }
        return this._readableState.destroyed;
      },
      set: function(value) {
        if (!this._readableState) {
          return;
        }
        this._readableState.destroyed = value;
      }
    });
    Readable.prototype.destroy = destroyImpl.destroy;
    Readable.prototype._undestroy = destroyImpl.undestroy;
    Readable.prototype._destroy = function(err, cb) {
      this.push(null);
      cb(err);
    };
    Readable.prototype.push = function(chunk, encoding) {
      var state = this._readableState;
      var skipChunkCheck;
      if (!state.objectMode) {
        if (typeof chunk === "string") {
          encoding = encoding || state.defaultEncoding;
          if (encoding !== state.encoding) {
            chunk = Buffer3.from(chunk, encoding);
            encoding = "";
          }
          skipChunkCheck = true;
        }
      } else {
        skipChunkCheck = true;
      }
      return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
    };
    Readable.prototype.unshift = function(chunk) {
      return readableAddChunk(this, chunk, null, true, false);
    };
    function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
      var state = stream._readableState;
      if (chunk === null) {
        state.reading = false;
        onEofChunk(stream, state);
      } else {
        var er;
        if (!skipChunkCheck) er = chunkInvalid(state, chunk);
        if (er) {
          stream.emit("error", er);
        } else if (state.objectMode || chunk && chunk.length > 0) {
          if (typeof chunk !== "string" && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer3.prototype) {
            chunk = _uint8ArrayToBuffer(chunk);
          }
          if (addToFront) {
            if (state.endEmitted) stream.emit("error", new Error("stream.unshift() after end event"));
            else addChunk(stream, state, chunk, true);
          } else if (state.ended) {
            stream.emit("error", new Error("stream.push() after EOF"));
          } else {
            state.reading = false;
            if (state.decoder && !encoding) {
              chunk = state.decoder.write(chunk);
              if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);
              else maybeReadMore(stream, state);
            } else {
              addChunk(stream, state, chunk, false);
            }
          }
        } else if (!addToFront) {
          state.reading = false;
        }
      }
      return needMoreData(state);
    }
    function addChunk(stream, state, chunk, addToFront) {
      if (state.flowing && state.length === 0 && !state.sync) {
        stream.emit("data", chunk);
        stream.read(0);
      } else {
        state.length += state.objectMode ? 1 : chunk.length;
        if (addToFront) state.buffer.unshift(chunk);
        else state.buffer.push(chunk);
        if (state.needReadable) emitReadable(stream);
      }
      maybeReadMore(stream, state);
    }
    function chunkInvalid(state, chunk) {
      var er;
      if (!_isUint8Array(chunk) && typeof chunk !== "string" && chunk !== void 0 && !state.objectMode) {
        er = new TypeError("Invalid non-string/buffer chunk");
      }
      return er;
    }
    function needMoreData(state) {
      return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
    }
    Readable.prototype.isPaused = function() {
      return this._readableState.flowing === false;
    };
    Readable.prototype.setEncoding = function(enc) {
      if (!StringDecoder) StringDecoder = require_string_decoder().StringDecoder;
      this._readableState.decoder = new StringDecoder(enc);
      this._readableState.encoding = enc;
      return this;
    };
    var MAX_HWM = 8388608;
    function computeNewHighWaterMark(n) {
      if (n >= MAX_HWM) {
        n = MAX_HWM;
      } else {
        n--;
        n |= n >>> 1;
        n |= n >>> 2;
        n |= n >>> 4;
        n |= n >>> 8;
        n |= n >>> 16;
        n++;
      }
      return n;
    }
    function howMuchToRead(n, state) {
      if (n <= 0 || state.length === 0 && state.ended) return 0;
      if (state.objectMode) return 1;
      if (n !== n) {
        if (state.flowing && state.length) return state.buffer.head.data.length;
        else return state.length;
      }
      if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
      if (n <= state.length) return n;
      if (!state.ended) {
        state.needReadable = true;
        return 0;
      }
      return state.length;
    }
    Readable.prototype.read = function(n) {
      debug("read", n);
      n = parseInt(n, 10);
      var state = this._readableState;
      var nOrig = n;
      if (n !== 0) state.emittedReadable = false;
      if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
        debug("read: emitReadable", state.length, state.ended);
        if (state.length === 0 && state.ended) endReadable(this);
        else emitReadable(this);
        return null;
      }
      n = howMuchToRead(n, state);
      if (n === 0 && state.ended) {
        if (state.length === 0) endReadable(this);
        return null;
      }
      var doRead = state.needReadable;
      debug("need readable", doRead);
      if (state.length === 0 || state.length - n < state.highWaterMark) {
        doRead = true;
        debug("length less than watermark", doRead);
      }
      if (state.ended || state.reading) {
        doRead = false;
        debug("reading or ended", doRead);
      } else if (doRead) {
        debug("do read");
        state.reading = true;
        state.sync = true;
        if (state.length === 0) state.needReadable = true;
        this._read(state.highWaterMark);
        state.sync = false;
        if (!state.reading) n = howMuchToRead(nOrig, state);
      }
      var ret;
      if (n > 0) ret = fromList(n, state);
      else ret = null;
      if (ret === null) {
        state.needReadable = true;
        n = 0;
      } else {
        state.length -= n;
      }
      if (state.length === 0) {
        if (!state.ended) state.needReadable = true;
        if (nOrig !== n && state.ended) endReadable(this);
      }
      if (ret !== null) this.emit("data", ret);
      return ret;
    };
    function onEofChunk(stream, state) {
      if (state.ended) return;
      if (state.decoder) {
        var chunk = state.decoder.end();
        if (chunk && chunk.length) {
          state.buffer.push(chunk);
          state.length += state.objectMode ? 1 : chunk.length;
        }
      }
      state.ended = true;
      emitReadable(stream);
    }
    function emitReadable(stream) {
      var state = stream._readableState;
      state.needReadable = false;
      if (!state.emittedReadable) {
        debug("emitReadable", state.flowing);
        state.emittedReadable = true;
        if (state.sync) pna.nextTick(emitReadable_, stream);
        else emitReadable_(stream);
      }
    }
    function emitReadable_(stream) {
      debug("emit readable");
      stream.emit("readable");
      flow(stream);
    }
    function maybeReadMore(stream, state) {
      if (!state.readingMore) {
        state.readingMore = true;
        pna.nextTick(maybeReadMore_, stream, state);
      }
    }
    function maybeReadMore_(stream, state) {
      var len = state.length;
      while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
        debug("maybeReadMore read 0");
        stream.read(0);
        if (len === state.length)
          break;
        else len = state.length;
      }
      state.readingMore = false;
    }
    Readable.prototype._read = function(n) {
      this.emit("error", new Error("_read() is not implemented"));
    };
    Readable.prototype.pipe = function(dest, pipeOpts) {
      var src = this;
      var state = this._readableState;
      switch (state.pipesCount) {
        case 0:
          state.pipes = dest;
          break;
        case 1:
          state.pipes = [state.pipes, dest];
          break;
        default:
          state.pipes.push(dest);
          break;
      }
      state.pipesCount += 1;
      debug("pipe count=%d opts=%j", state.pipesCount, pipeOpts);
      var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;
      var endFn = doEnd ? onend : unpipe;
      if (state.endEmitted) pna.nextTick(endFn);
      else src.once("end", endFn);
      dest.on("unpipe", onunpipe);
      function onunpipe(readable, unpipeInfo) {
        debug("onunpipe");
        if (readable === src) {
          if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
            unpipeInfo.hasUnpiped = true;
            cleanup();
          }
        }
      }
      function onend() {
        debug("onend");
        dest.end();
      }
      var ondrain = pipeOnDrain(src);
      dest.on("drain", ondrain);
      var cleanedUp = false;
      function cleanup() {
        debug("cleanup");
        dest.removeListener("close", onclose);
        dest.removeListener("finish", onfinish);
        dest.removeListener("drain", ondrain);
        dest.removeListener("error", onerror);
        dest.removeListener("unpipe", onunpipe);
        src.removeListener("end", onend);
        src.removeListener("end", unpipe);
        src.removeListener("data", ondata);
        cleanedUp = true;
        if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
      }
      var increasedAwaitDrain = false;
      src.on("data", ondata);
      function ondata(chunk) {
        debug("ondata");
        increasedAwaitDrain = false;
        var ret = dest.write(chunk);
        if (false === ret && !increasedAwaitDrain) {
          if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
            debug("false write response, pause", state.awaitDrain);
            state.awaitDrain++;
            increasedAwaitDrain = true;
          }
          src.pause();
        }
      }
      function onerror(er) {
        debug("onerror", er);
        unpipe();
        dest.removeListener("error", onerror);
        if (EElistenerCount(dest, "error") === 0) dest.emit("error", er);
      }
      prependListener(dest, "error", onerror);
      function onclose() {
        dest.removeListener("finish", onfinish);
        unpipe();
      }
      dest.once("close", onclose);
      function onfinish() {
        debug("onfinish");
        dest.removeListener("close", onclose);
        unpipe();
      }
      dest.once("finish", onfinish);
      function unpipe() {
        debug("unpipe");
        src.unpipe(dest);
      }
      dest.emit("pipe", src);
      if (!state.flowing) {
        debug("pipe resume");
        src.resume();
      }
      return dest;
    };
    function pipeOnDrain(src) {
      return function() {
        var state = src._readableState;
        debug("pipeOnDrain", state.awaitDrain);
        if (state.awaitDrain) state.awaitDrain--;
        if (state.awaitDrain === 0 && EElistenerCount(src, "data")) {
          state.flowing = true;
          flow(src);
        }
      };
    }
    Readable.prototype.unpipe = function(dest) {
      var state = this._readableState;
      var unpipeInfo = { hasUnpiped: false };
      if (state.pipesCount === 0) return this;
      if (state.pipesCount === 1) {
        if (dest && dest !== state.pipes) return this;
        if (!dest) dest = state.pipes;
        state.pipes = null;
        state.pipesCount = 0;
        state.flowing = false;
        if (dest) dest.emit("unpipe", this, unpipeInfo);
        return this;
      }
      if (!dest) {
        var dests = state.pipes;
        var len = state.pipesCount;
        state.pipes = null;
        state.pipesCount = 0;
        state.flowing = false;
        for (var i = 0; i < len; i++) {
          dests[i].emit("unpipe", this, { hasUnpiped: false });
        }
        return this;
      }
      var index3 = indexOf(state.pipes, dest);
      if (index3 === -1) return this;
      state.pipes.splice(index3, 1);
      state.pipesCount -= 1;
      if (state.pipesCount === 1) state.pipes = state.pipes[0];
      dest.emit("unpipe", this, unpipeInfo);
      return this;
    };
    Readable.prototype.on = function(ev, fn) {
      var res = Stream.prototype.on.call(this, ev, fn);
      if (ev === "data") {
        if (this._readableState.flowing !== false) this.resume();
      } else if (ev === "readable") {
        var state = this._readableState;
        if (!state.endEmitted && !state.readableListening) {
          state.readableListening = state.needReadable = true;
          state.emittedReadable = false;
          if (!state.reading) {
            pna.nextTick(nReadingNextTick, this);
          } else if (state.length) {
            emitReadable(this);
          }
        }
      }
      return res;
    };
    Readable.prototype.addListener = Readable.prototype.on;
    function nReadingNextTick(self2) {
      debug("readable nexttick read 0");
      self2.read(0);
    }
    Readable.prototype.resume = function() {
      var state = this._readableState;
      if (!state.flowing) {
        debug("resume");
        state.flowing = true;
        resume(this, state);
      }
      return this;
    };
    function resume(stream, state) {
      if (!state.resumeScheduled) {
        state.resumeScheduled = true;
        pna.nextTick(resume_, stream, state);
      }
    }
    function resume_(stream, state) {
      if (!state.reading) {
        debug("resume read 0");
        stream.read(0);
      }
      state.resumeScheduled = false;
      state.awaitDrain = 0;
      stream.emit("resume");
      flow(stream);
      if (state.flowing && !state.reading) stream.read(0);
    }
    Readable.prototype.pause = function() {
      debug("call pause flowing=%j", this._readableState.flowing);
      if (false !== this._readableState.flowing) {
        debug("pause");
        this._readableState.flowing = false;
        this.emit("pause");
      }
      return this;
    };
    function flow(stream) {
      var state = stream._readableState;
      debug("flow", state.flowing);
      while (state.flowing && stream.read() !== null) {
      }
    }
    Readable.prototype.wrap = function(stream) {
      var _this = this;
      var state = this._readableState;
      var paused = false;
      stream.on("end", function() {
        debug("wrapped end");
        if (state.decoder && !state.ended) {
          var chunk = state.decoder.end();
          if (chunk && chunk.length) _this.push(chunk);
        }
        _this.push(null);
      });
      stream.on("data", function(chunk) {
        debug("wrapped data");
        if (state.decoder) chunk = state.decoder.write(chunk);
        if (state.objectMode && (chunk === null || chunk === void 0)) return;
        else if (!state.objectMode && (!chunk || !chunk.length)) return;
        var ret = _this.push(chunk);
        if (!ret) {
          paused = true;
          stream.pause();
        }
      });
      for (var i in stream) {
        if (this[i] === void 0 && typeof stream[i] === "function") {
          this[i] = /* @__PURE__ */ (function(method) {
            return function() {
              return stream[method].apply(stream, arguments);
            };
          })(i);
        }
      }
      for (var n = 0; n < kProxyEvents.length; n++) {
        stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
      }
      this._read = function(n2) {
        debug("wrapped _read", n2);
        if (paused) {
          paused = false;
          stream.resume();
        }
      };
      return this;
    };
    Object.defineProperty(Readable.prototype, "readableHighWaterMark", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function() {
        return this._readableState.highWaterMark;
      }
    });
    Readable._fromList = fromList;
    function fromList(n, state) {
      if (state.length === 0) return null;
      var ret;
      if (state.objectMode) ret = state.buffer.shift();
      else if (!n || n >= state.length) {
        if (state.decoder) ret = state.buffer.join("");
        else if (state.buffer.length === 1) ret = state.buffer.head.data;
        else ret = state.buffer.concat(state.length);
        state.buffer.clear();
      } else {
        ret = fromListPartial(n, state.buffer, state.decoder);
      }
      return ret;
    }
    function fromListPartial(n, list, hasStrings) {
      var ret;
      if (n < list.head.data.length) {
        ret = list.head.data.slice(0, n);
        list.head.data = list.head.data.slice(n);
      } else if (n === list.head.data.length) {
        ret = list.shift();
      } else {
        ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list);
      }
      return ret;
    }
    function copyFromBufferString(n, list) {
      var p = list.head;
      var c = 1;
      var ret = p.data;
      n -= ret.length;
      while (p = p.next) {
        var str = p.data;
        var nb = n > str.length ? str.length : n;
        if (nb === str.length) ret += str;
        else ret += str.slice(0, n);
        n -= nb;
        if (n === 0) {
          if (nb === str.length) {
            ++c;
            if (p.next) list.head = p.next;
            else list.head = list.tail = null;
          } else {
            list.head = p;
            p.data = str.slice(nb);
          }
          break;
        }
        ++c;
      }
      list.length -= c;
      return ret;
    }
    function copyFromBuffer(n, list) {
      var ret = Buffer3.allocUnsafe(n);
      var p = list.head;
      var c = 1;
      p.data.copy(ret);
      n -= p.data.length;
      while (p = p.next) {
        var buf = p.data;
        var nb = n > buf.length ? buf.length : n;
        buf.copy(ret, ret.length - n, 0, nb);
        n -= nb;
        if (n === 0) {
          if (nb === buf.length) {
            ++c;
            if (p.next) list.head = p.next;
            else list.head = list.tail = null;
          } else {
            list.head = p;
            p.data = buf.slice(nb);
          }
          break;
        }
        ++c;
      }
      list.length -= c;
      return ret;
    }
    function endReadable(stream) {
      var state = stream._readableState;
      if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');
      if (!state.endEmitted) {
        state.ended = true;
        pna.nextTick(endReadableNT, state, stream);
      }
    }
    function endReadableNT(state, stream) {
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit("end");
      }
    }
    function indexOf(xs, x) {
      for (var i = 0, l = xs.length; i < l; i++) {
        if (xs[i] === x) return i;
      }
      return -1;
    }
  }
});

// node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/_stream_transform.js
var require_stream_transform = __commonJS({
  "node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/_stream_transform.js"(exports, module) {
    module.exports = Transform;
    var Duplex = require_stream_duplex();
    var util = Object.create(require_util());
    util.inherits = require_inherits();
    util.inherits(Transform, Duplex);
    function afterTransform(er, data) {
      var ts = this._transformState;
      ts.transforming = false;
      var cb = ts.writecb;
      if (!cb) {
        return this.emit("error", new Error("write callback called multiple times"));
      }
      ts.writechunk = null;
      ts.writecb = null;
      if (data != null)
        this.push(data);
      cb(er);
      var rs = this._readableState;
      rs.reading = false;
      if (rs.needReadable || rs.length < rs.highWaterMark) {
        this._read(rs.highWaterMark);
      }
    }
    function Transform(options) {
      if (!(this instanceof Transform)) return new Transform(options);
      Duplex.call(this, options);
      this._transformState = {
        afterTransform: afterTransform.bind(this),
        needTransform: false,
        transforming: false,
        writecb: null,
        writechunk: null,
        writeencoding: null
      };
      this._readableState.needReadable = true;
      this._readableState.sync = false;
      if (options) {
        if (typeof options.transform === "function") this._transform = options.transform;
        if (typeof options.flush === "function") this._flush = options.flush;
      }
      this.on("prefinish", prefinish);
    }
    function prefinish() {
      var _this = this;
      if (typeof this._flush === "function") {
        this._flush(function(er, data) {
          done(_this, er, data);
        });
      } else {
        done(this, null, null);
      }
    }
    Transform.prototype.push = function(chunk, encoding) {
      this._transformState.needTransform = false;
      return Duplex.prototype.push.call(this, chunk, encoding);
    };
    Transform.prototype._transform = function(chunk, encoding, cb) {
      throw new Error("_transform() is not implemented");
    };
    Transform.prototype._write = function(chunk, encoding, cb) {
      var ts = this._transformState;
      ts.writecb = cb;
      ts.writechunk = chunk;
      ts.writeencoding = encoding;
      if (!ts.transforming) {
        var rs = this._readableState;
        if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
      }
    };
    Transform.prototype._read = function(n) {
      var ts = this._transformState;
      if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
        ts.transforming = true;
        this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
      } else {
        ts.needTransform = true;
      }
    };
    Transform.prototype._destroy = function(err, cb) {
      var _this2 = this;
      Duplex.prototype._destroy.call(this, err, function(err2) {
        cb(err2);
        _this2.emit("close");
      });
    };
    function done(stream, er, data) {
      if (er) return stream.emit("error", er);
      if (data != null)
        stream.push(data);
      if (stream._writableState.length) throw new Error("Calling transform done when ws.length != 0");
      if (stream._transformState.transforming) throw new Error("Calling transform done when still transforming");
      return stream.push(null);
    }
  }
});

// node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/_stream_passthrough.js
var require_stream_passthrough = __commonJS({
  "node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/lib/_stream_passthrough.js"(exports, module) {
    module.exports = PassThrough;
    var Transform = require_stream_transform();
    var util = Object.create(require_util());
    util.inherits = require_inherits();
    util.inherits(PassThrough, Transform);
    function PassThrough(options) {
      if (!(this instanceof PassThrough)) return new PassThrough(options);
      Transform.call(this, options);
    }
    PassThrough.prototype._transform = function(chunk, encoding, cb) {
      cb(null, chunk);
    };
  }
});

// node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/readable.js
var require_readable = __commonJS({
  "node_modules/.pnpm/readable-stream@2.3.8/node_modules/readable-stream/readable.js"(exports, module) {
    var Stream = __require("stream");
    if (process.env.READABLE_STREAM === "disable" && Stream) {
      module.exports = Stream;
      exports = module.exports = Stream.Readable;
      exports.Readable = Stream.Readable;
      exports.Writable = Stream.Writable;
      exports.Duplex = Stream.Duplex;
      exports.Transform = Stream.Transform;
      exports.PassThrough = Stream.PassThrough;
      exports.Stream = Stream;
    } else {
      exports = module.exports = require_stream_readable();
      exports.Stream = Stream || exports;
      exports.Readable = exports;
      exports.Writable = require_stream_writable();
      exports.Duplex = require_stream_duplex();
      exports.Transform = require_stream_transform();
      exports.PassThrough = require_stream_passthrough();
    }
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/support.js
var require_support = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/support.js"(exports) {
    exports.base64 = true;
    exports.array = true;
    exports.string = true;
    exports.arraybuffer = typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined";
    exports.nodebuffer = typeof Buffer !== "undefined";
    exports.uint8array = typeof Uint8Array !== "undefined";
    if (typeof ArrayBuffer === "undefined") {
      exports.blob = false;
    } else {
      buffer = new ArrayBuffer(0);
      try {
        exports.blob = new Blob([buffer], {
          type: "application/zip"
        }).size === 0;
      } catch (e) {
        try {
          Builder = self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder;
          builder = new Builder();
          builder.append(buffer);
          exports.blob = builder.getBlob("application/zip").size === 0;
        } catch (e2) {
          exports.blob = false;
        }
      }
    }
    var buffer;
    var Builder;
    var builder;
    try {
      exports.nodestream = !!require_readable().Readable;
    } catch (e) {
      exports.nodestream = false;
    }
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js
var require_base64 = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"(exports) {
    var utils = require_utils();
    var support = require_support();
    var _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    exports.encode = function(input) {
      var output = [];
      var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
      var i = 0, len = input.length, remainingBytes = len;
      var isArray = utils.getTypeOf(input) !== "string";
      while (i < input.length) {
        remainingBytes = len - i;
        if (!isArray) {
          chr1 = input.charCodeAt(i++);
          chr2 = i < len ? input.charCodeAt(i++) : 0;
          chr3 = i < len ? input.charCodeAt(i++) : 0;
        } else {
          chr1 = input[i++];
          chr2 = i < len ? input[i++] : 0;
          chr3 = i < len ? input[i++] : 0;
        }
        enc1 = chr1 >> 2;
        enc2 = (chr1 & 3) << 4 | chr2 >> 4;
        enc3 = remainingBytes > 1 ? (chr2 & 15) << 2 | chr3 >> 6 : 64;
        enc4 = remainingBytes > 2 ? chr3 & 63 : 64;
        output.push(_keyStr.charAt(enc1) + _keyStr.charAt(enc2) + _keyStr.charAt(enc3) + _keyStr.charAt(enc4));
      }
      return output.join("");
    };
    exports.decode = function(input) {
      var chr1, chr2, chr3;
      var enc1, enc2, enc3, enc4;
      var i = 0, resultIndex = 0;
      var dataUrlPrefix = "data:";
      if (input.substr(0, dataUrlPrefix.length) === dataUrlPrefix) {
        throw new Error("Invalid base64 input, it looks like a data url.");
      }
      input = input.replace(/[^A-Za-z0-9+/=]/g, "");
      var totalLength = input.length * 3 / 4;
      if (input.charAt(input.length - 1) === _keyStr.charAt(64)) {
        totalLength--;
      }
      if (input.charAt(input.length - 2) === _keyStr.charAt(64)) {
        totalLength--;
      }
      if (totalLength % 1 !== 0) {
        throw new Error("Invalid base64 input, bad content length.");
      }
      var output;
      if (support.uint8array) {
        output = new Uint8Array(totalLength | 0);
      } else {
        output = new Array(totalLength | 0);
      }
      while (i < input.length) {
        enc1 = _keyStr.indexOf(input.charAt(i++));
        enc2 = _keyStr.indexOf(input.charAt(i++));
        enc3 = _keyStr.indexOf(input.charAt(i++));
        enc4 = _keyStr.indexOf(input.charAt(i++));
        chr1 = enc1 << 2 | enc2 >> 4;
        chr2 = (enc2 & 15) << 4 | enc3 >> 2;
        chr3 = (enc3 & 3) << 6 | enc4;
        output[resultIndex++] = chr1;
        if (enc3 !== 64) {
          output[resultIndex++] = chr2;
        }
        if (enc4 !== 64) {
          output[resultIndex++] = chr3;
        }
      }
      return output;
    };
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/nodejsUtils.js
var require_nodejsUtils = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/nodejsUtils.js"(exports, module) {
    module.exports = {
      /**
       * True if this is running in Nodejs, will be undefined in a browser.
       * In a browser, browserify won't include this file and the whole module
       * will be resolved an empty object.
       */
      isNode: typeof Buffer !== "undefined",
      /**
       * Create a new nodejs Buffer from an existing content.
       * @param {Object} data the data to pass to the constructor.
       * @param {String} encoding the encoding to use.
       * @return {Buffer} a new Buffer.
       */
      newBufferFrom: function(data, encoding) {
        if (Buffer.from && Buffer.from !== Uint8Array.from) {
          return Buffer.from(data, encoding);
        } else {
          if (typeof data === "number") {
            throw new Error('The "data" argument must not be a number');
          }
          return new Buffer(data, encoding);
        }
      },
      /**
       * Create a new nodejs Buffer with the specified size.
       * @param {Integer} size the size of the buffer.
       * @return {Buffer} a new Buffer.
       */
      allocBuffer: function(size) {
        if (Buffer.alloc) {
          return Buffer.alloc(size);
        } else {
          var buf = new Buffer(size);
          buf.fill(0);
          return buf;
        }
      },
      /**
       * Find out if an object is a Buffer.
       * @param {Object} b the object to test.
       * @return {Boolean} true if the object is a Buffer, false otherwise.
       */
      isBuffer: function(b) {
        return Buffer.isBuffer(b);
      },
      isStream: function(obj) {
        return obj && typeof obj.on === "function" && typeof obj.pause === "function" && typeof obj.resume === "function";
      }
    };
  }
});

// node_modules/.pnpm/immediate@3.0.6/node_modules/immediate/lib/index.js
var require_lib = __commonJS({
  "node_modules/.pnpm/immediate@3.0.6/node_modules/immediate/lib/index.js"(exports, module) {
    var Mutation = global.MutationObserver || global.WebKitMutationObserver;
    var scheduleDrain;
    if (process.browser) {
      if (Mutation) {
        called = 0;
        observer = new Mutation(nextTick);
        element = global.document.createTextNode("");
        observer.observe(element, {
          characterData: true
        });
        scheduleDrain = function() {
          element.data = called = ++called % 2;
        };
      } else if (!global.setImmediate && typeof global.MessageChannel !== "undefined") {
        channel = new global.MessageChannel();
        channel.port1.onmessage = nextTick;
        scheduleDrain = function() {
          channel.port2.postMessage(0);
        };
      } else if ("document" in global && "onreadystatechange" in global.document.createElement("script")) {
        scheduleDrain = function() {
          var scriptEl = global.document.createElement("script");
          scriptEl.onreadystatechange = function() {
            nextTick();
            scriptEl.onreadystatechange = null;
            scriptEl.parentNode.removeChild(scriptEl);
            scriptEl = null;
          };
          global.document.documentElement.appendChild(scriptEl);
        };
      } else {
        scheduleDrain = function() {
          setTimeout(nextTick, 0);
        };
      }
    } else {
      scheduleDrain = function() {
        process.nextTick(nextTick);
      };
    }
    var called;
    var observer;
    var element;
    var channel;
    var draining;
    var queue = [];
    function nextTick() {
      draining = true;
      var i, oldQueue;
      var len = queue.length;
      while (len) {
        oldQueue = queue;
        queue = [];
        i = -1;
        while (++i < len) {
          oldQueue[i]();
        }
        len = queue.length;
      }
      draining = false;
    }
    module.exports = immediate;
    function immediate(task) {
      if (queue.push(task) === 1 && !draining) {
        scheduleDrain();
      }
    }
  }
});

// node_modules/.pnpm/lie@3.3.0/node_modules/lie/lib/index.js
var require_lib2 = __commonJS({
  "node_modules/.pnpm/lie@3.3.0/node_modules/lie/lib/index.js"(exports, module) {
    var immediate = require_lib();
    function INTERNAL() {
    }
    var handlers = {};
    var REJECTED = ["REJECTED"];
    var FULFILLED = ["FULFILLED"];
    var PENDING = ["PENDING"];
    if (!process.browser) {
      UNHANDLED = ["UNHANDLED"];
    }
    var UNHANDLED;
    module.exports = Promise2;
    function Promise2(resolver) {
      if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function");
      }
      this.state = PENDING;
      this.queue = [];
      this.outcome = void 0;
      if (!process.browser) {
        this.handled = UNHANDLED;
      }
      if (resolver !== INTERNAL) {
        safelyResolveThenable(this, resolver);
      }
    }
    Promise2.prototype.finally = function(callback) {
      if (typeof callback !== "function") {
        return this;
      }
      var p = this.constructor;
      return this.then(resolve3, reject2);
      function resolve3(value) {
        function yes() {
          return value;
        }
        return p.resolve(callback()).then(yes);
      }
      function reject2(reason) {
        function no() {
          throw reason;
        }
        return p.resolve(callback()).then(no);
      }
    };
    Promise2.prototype.catch = function(onRejected) {
      return this.then(null, onRejected);
    };
    Promise2.prototype.then = function(onFulfilled, onRejected) {
      if (typeof onFulfilled !== "function" && this.state === FULFILLED || typeof onRejected !== "function" && this.state === REJECTED) {
        return this;
      }
      var promise = new this.constructor(INTERNAL);
      if (!process.browser) {
        if (this.handled === UNHANDLED) {
          this.handled = null;
        }
      }
      if (this.state !== PENDING) {
        var resolver = this.state === FULFILLED ? onFulfilled : onRejected;
        unwrap(promise, resolver, this.outcome);
      } else {
        this.queue.push(new QueueItem(promise, onFulfilled, onRejected));
      }
      return promise;
    };
    function QueueItem(promise, onFulfilled, onRejected) {
      this.promise = promise;
      if (typeof onFulfilled === "function") {
        this.onFulfilled = onFulfilled;
        this.callFulfilled = this.otherCallFulfilled;
      }
      if (typeof onRejected === "function") {
        this.onRejected = onRejected;
        this.callRejected = this.otherCallRejected;
      }
    }
    QueueItem.prototype.callFulfilled = function(value) {
      handlers.resolve(this.promise, value);
    };
    QueueItem.prototype.otherCallFulfilled = function(value) {
      unwrap(this.promise, this.onFulfilled, value);
    };
    QueueItem.prototype.callRejected = function(value) {
      handlers.reject(this.promise, value);
    };
    QueueItem.prototype.otherCallRejected = function(value) {
      unwrap(this.promise, this.onRejected, value);
    };
    function unwrap(promise, func, value) {
      immediate(function() {
        var returnValue;
        try {
          returnValue = func(value);
        } catch (e) {
          return handlers.reject(promise, e);
        }
        if (returnValue === promise) {
          handlers.reject(promise, new TypeError("Cannot resolve promise with itself"));
        } else {
          handlers.resolve(promise, returnValue);
        }
      });
    }
    handlers.resolve = function(self2, value) {
      var result = tryCatch(getThen, value);
      if (result.status === "error") {
        return handlers.reject(self2, result.value);
      }
      var thenable = result.value;
      if (thenable) {
        safelyResolveThenable(self2, thenable);
      } else {
        self2.state = FULFILLED;
        self2.outcome = value;
        var i = -1;
        var len = self2.queue.length;
        while (++i < len) {
          self2.queue[i].callFulfilled(value);
        }
      }
      return self2;
    };
    handlers.reject = function(self2, error) {
      self2.state = REJECTED;
      self2.outcome = error;
      if (!process.browser) {
        if (self2.handled === UNHANDLED) {
          immediate(function() {
            if (self2.handled === UNHANDLED) {
              process.emit("unhandledRejection", error, self2);
            }
          });
        }
      }
      var i = -1;
      var len = self2.queue.length;
      while (++i < len) {
        self2.queue[i].callRejected(error);
      }
      return self2;
    };
    function getThen(obj) {
      var then = obj && obj.then;
      if (obj && (typeof obj === "object" || typeof obj === "function") && typeof then === "function") {
        return function appyThen() {
          then.apply(obj, arguments);
        };
      }
    }
    function safelyResolveThenable(self2, thenable) {
      var called = false;
      function onError(value) {
        if (called) {
          return;
        }
        called = true;
        handlers.reject(self2, value);
      }
      function onSuccess(value) {
        if (called) {
          return;
        }
        called = true;
        handlers.resolve(self2, value);
      }
      function tryToUnwrap() {
        thenable(onSuccess, onError);
      }
      var result = tryCatch(tryToUnwrap);
      if (result.status === "error") {
        onError(result.value);
      }
    }
    function tryCatch(func, value) {
      var out = {};
      try {
        out.value = func(value);
        out.status = "success";
      } catch (e) {
        out.status = "error";
        out.value = e;
      }
      return out;
    }
    Promise2.resolve = resolve2;
    function resolve2(value) {
      if (value instanceof this) {
        return value;
      }
      return handlers.resolve(new this(INTERNAL), value);
    }
    Promise2.reject = reject;
    function reject(reason) {
      var promise = new this(INTERNAL);
      return handlers.reject(promise, reason);
    }
    Promise2.all = all;
    function all(iterable) {
      var self2 = this;
      if (Object.prototype.toString.call(iterable) !== "[object Array]") {
        return this.reject(new TypeError("must be an array"));
      }
      var len = iterable.length;
      var called = false;
      if (!len) {
        return this.resolve([]);
      }
      var values = new Array(len);
      var resolved = 0;
      var i = -1;
      var promise = new this(INTERNAL);
      while (++i < len) {
        allResolver(iterable[i], i);
      }
      return promise;
      function allResolver(value, i2) {
        self2.resolve(value).then(resolveFromAll, function(error) {
          if (!called) {
            called = true;
            handlers.reject(promise, error);
          }
        });
        function resolveFromAll(outValue) {
          values[i2] = outValue;
          if (++resolved === len && !called) {
            called = true;
            handlers.resolve(promise, values);
          }
        }
      }
    }
    Promise2.race = race;
    function race(iterable) {
      var self2 = this;
      if (Object.prototype.toString.call(iterable) !== "[object Array]") {
        return this.reject(new TypeError("must be an array"));
      }
      var len = iterable.length;
      var called = false;
      if (!len) {
        return this.resolve([]);
      }
      var i = -1;
      var promise = new this(INTERNAL);
      while (++i < len) {
        resolver(iterable[i]);
      }
      return promise;
      function resolver(value) {
        self2.resolve(value).then(function(response) {
          if (!called) {
            called = true;
            handlers.resolve(promise, response);
          }
        }, function(error) {
          if (!called) {
            called = true;
            handlers.reject(promise, error);
          }
        });
      }
    }
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/external.js
var require_external = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/external.js"(exports, module) {
    var ES6Promise = null;
    if (typeof Promise !== "undefined") {
      ES6Promise = Promise;
    } else {
      ES6Promise = require_lib2();
    }
    module.exports = {
      Promise: ES6Promise
    };
  }
});

// node_modules/.pnpm/setimmediate@1.0.5/node_modules/setimmediate/setImmediate.js
var require_setImmediate = __commonJS({
  "node_modules/.pnpm/setimmediate@1.0.5/node_modules/setimmediate/setImmediate.js"(exports) {
    (function(global2, undefined2) {
      if (global2.setImmediate) {
        return;
      }
      var nextHandle = 1;
      var tasksByHandle = {};
      var currentlyRunningATask = false;
      var doc = global2.document;
      var registerImmediate;
      function setImmediate2(callback) {
        if (typeof callback !== "function") {
          callback = new Function("" + callback);
        }
        var args = new Array(arguments.length - 1);
        for (var i = 0; i < args.length; i++) {
          args[i] = arguments[i + 1];
        }
        var task = { callback, args };
        tasksByHandle[nextHandle] = task;
        registerImmediate(nextHandle);
        return nextHandle++;
      }
      function clearImmediate(handle2) {
        delete tasksByHandle[handle2];
      }
      function run(task) {
        var callback = task.callback;
        var args = task.args;
        switch (args.length) {
          case 0:
            callback();
            break;
          case 1:
            callback(args[0]);
            break;
          case 2:
            callback(args[0], args[1]);
            break;
          case 3:
            callback(args[0], args[1], args[2]);
            break;
          default:
            callback.apply(undefined2, args);
            break;
        }
      }
      function runIfPresent(handle2) {
        if (currentlyRunningATask) {
          setTimeout(runIfPresent, 0, handle2);
        } else {
          var task = tasksByHandle[handle2];
          if (task) {
            currentlyRunningATask = true;
            try {
              run(task);
            } finally {
              clearImmediate(handle2);
              currentlyRunningATask = false;
            }
          }
        }
      }
      function installNextTickImplementation() {
        registerImmediate = function(handle2) {
          process.nextTick(function() {
            runIfPresent(handle2);
          });
        };
      }
      function canUsePostMessage() {
        if (global2.postMessage && !global2.importScripts) {
          var postMessageIsAsynchronous = true;
          var oldOnMessage = global2.onmessage;
          global2.onmessage = function() {
            postMessageIsAsynchronous = false;
          };
          global2.postMessage("", "*");
          global2.onmessage = oldOnMessage;
          return postMessageIsAsynchronous;
        }
      }
      function installPostMessageImplementation() {
        var messagePrefix = "setImmediate$" + Math.random() + "$";
        var onGlobalMessage = function(event) {
          if (event.source === global2 && typeof event.data === "string" && event.data.indexOf(messagePrefix) === 0) {
            runIfPresent(+event.data.slice(messagePrefix.length));
          }
        };
        if (global2.addEventListener) {
          global2.addEventListener("message", onGlobalMessage, false);
        } else {
          global2.attachEvent("onmessage", onGlobalMessage);
        }
        registerImmediate = function(handle2) {
          global2.postMessage(messagePrefix + handle2, "*");
        };
      }
      function installMessageChannelImplementation() {
        var channel = new MessageChannel();
        channel.port1.onmessage = function(event) {
          var handle2 = event.data;
          runIfPresent(handle2);
        };
        registerImmediate = function(handle2) {
          channel.port2.postMessage(handle2);
        };
      }
      function installReadyStateChangeImplementation() {
        var html = doc.documentElement;
        registerImmediate = function(handle2) {
          var script = doc.createElement("script");
          script.onreadystatechange = function() {
            runIfPresent(handle2);
            script.onreadystatechange = null;
            html.removeChild(script);
            script = null;
          };
          html.appendChild(script);
        };
      }
      function installSetTimeoutImplementation() {
        registerImmediate = function(handle2) {
          setTimeout(runIfPresent, 0, handle2);
        };
      }
      var attachTo = Object.getPrototypeOf && Object.getPrototypeOf(global2);
      attachTo = attachTo && attachTo.setTimeout ? attachTo : global2;
      if ({}.toString.call(global2.process) === "[object process]") {
        installNextTickImplementation();
      } else if (canUsePostMessage()) {
        installPostMessageImplementation();
      } else if (global2.MessageChannel) {
        installMessageChannelImplementation();
      } else if (doc && "onreadystatechange" in doc.createElement("script")) {
        installReadyStateChangeImplementation();
      } else {
        installSetTimeoutImplementation();
      }
      attachTo.setImmediate = setImmediate2;
      attachTo.clearImmediate = clearImmediate;
    })(typeof self === "undefined" ? typeof global === "undefined" ? exports : global : self);
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/utils.js
var require_utils = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/utils.js"(exports) {
    var support = require_support();
    var base642 = require_base64();
    var nodejsUtils = require_nodejsUtils();
    var external = require_external();
    require_setImmediate();
    function string2binary(str) {
      var result = null;
      if (support.uint8array) {
        result = new Uint8Array(str.length);
      } else {
        result = new Array(str.length);
      }
      return stringToArrayLike(str, result);
    }
    exports.newBlob = function(part, type) {
      exports.checkSupport("blob");
      try {
        return new Blob([part], {
          type
        });
      } catch (e) {
        try {
          var Builder = self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder;
          var builder = new Builder();
          builder.append(part);
          return builder.getBlob(type);
        } catch (e2) {
          throw new Error("Bug : can't construct the Blob.");
        }
      }
    };
    function identity(input) {
      return input;
    }
    function stringToArrayLike(str, array) {
      for (var i = 0; i < str.length; ++i) {
        array[i] = str.charCodeAt(i) & 255;
      }
      return array;
    }
    var arrayToStringHelper = {
      /**
       * Transform an array of int into a string, chunk by chunk.
       * See the performances notes on arrayLikeToString.
       * @param {Array|ArrayBuffer|Uint8Array|Buffer} array the array to transform.
       * @param {String} type the type of the array.
       * @param {Integer} chunk the chunk size.
       * @return {String} the resulting string.
       * @throws Error if the chunk is too big for the stack.
       */
      stringifyByChunk: function(array, type, chunk) {
        var result = [], k = 0, len = array.length;
        if (len <= chunk) {
          return String.fromCharCode.apply(null, array);
        }
        while (k < len) {
          if (type === "array" || type === "nodebuffer") {
            result.push(String.fromCharCode.apply(null, array.slice(k, Math.min(k + chunk, len))));
          } else {
            result.push(String.fromCharCode.apply(null, array.subarray(k, Math.min(k + chunk, len))));
          }
          k += chunk;
        }
        return result.join("");
      },
      /**
       * Call String.fromCharCode on every item in the array.
       * This is the naive implementation, which generate A LOT of intermediate string.
       * This should be used when everything else fail.
       * @param {Array|ArrayBuffer|Uint8Array|Buffer} array the array to transform.
       * @return {String} the result.
       */
      stringifyByChar: function(array) {
        var resultStr = "";
        for (var i = 0; i < array.length; i++) {
          resultStr += String.fromCharCode(array[i]);
        }
        return resultStr;
      },
      applyCanBeUsed: {
        /**
         * true if the browser accepts to use String.fromCharCode on Uint8Array
         */
        uint8array: (function() {
          try {
            return support.uint8array && String.fromCharCode.apply(null, new Uint8Array(1)).length === 1;
          } catch (e) {
            return false;
          }
        })(),
        /**
         * true if the browser accepts to use String.fromCharCode on nodejs Buffer.
         */
        nodebuffer: (function() {
          try {
            return support.nodebuffer && String.fromCharCode.apply(null, nodejsUtils.allocBuffer(1)).length === 1;
          } catch (e) {
            return false;
          }
        })()
      }
    };
    function arrayLikeToString(array) {
      var chunk = 65536, type = exports.getTypeOf(array), canUseApply = true;
      if (type === "uint8array") {
        canUseApply = arrayToStringHelper.applyCanBeUsed.uint8array;
      } else if (type === "nodebuffer") {
        canUseApply = arrayToStringHelper.applyCanBeUsed.nodebuffer;
      }
      if (canUseApply) {
        while (chunk > 1) {
          try {
            return arrayToStringHelper.stringifyByChunk(array, type, chunk);
          } catch (e) {
            chunk = Math.floor(chunk / 2);
          }
        }
      }
      return arrayToStringHelper.stringifyByChar(array);
    }
    exports.applyFromCharCode = arrayLikeToString;
    function arrayLikeToArrayLike(arrayFrom, arrayTo) {
      for (var i = 0; i < arrayFrom.length; i++) {
        arrayTo[i] = arrayFrom[i];
      }
      return arrayTo;
    }
    var transform = {};
    transform["string"] = {
      "string": identity,
      "array": function(input) {
        return stringToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function(input) {
        return transform["string"]["uint8array"](input).buffer;
      },
      "uint8array": function(input) {
        return stringToArrayLike(input, new Uint8Array(input.length));
      },
      "nodebuffer": function(input) {
        return stringToArrayLike(input, nodejsUtils.allocBuffer(input.length));
      }
    };
    transform["array"] = {
      "string": arrayLikeToString,
      "array": identity,
      "arraybuffer": function(input) {
        return new Uint8Array(input).buffer;
      },
      "uint8array": function(input) {
        return new Uint8Array(input);
      },
      "nodebuffer": function(input) {
        return nodejsUtils.newBufferFrom(input);
      }
    };
    transform["arraybuffer"] = {
      "string": function(input) {
        return arrayLikeToString(new Uint8Array(input));
      },
      "array": function(input) {
        return arrayLikeToArrayLike(new Uint8Array(input), new Array(input.byteLength));
      },
      "arraybuffer": identity,
      "uint8array": function(input) {
        return new Uint8Array(input);
      },
      "nodebuffer": function(input) {
        return nodejsUtils.newBufferFrom(new Uint8Array(input));
      }
    };
    transform["uint8array"] = {
      "string": arrayLikeToString,
      "array": function(input) {
        return arrayLikeToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function(input) {
        return input.buffer;
      },
      "uint8array": identity,
      "nodebuffer": function(input) {
        return nodejsUtils.newBufferFrom(input);
      }
    };
    transform["nodebuffer"] = {
      "string": arrayLikeToString,
      "array": function(input) {
        return arrayLikeToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function(input) {
        return transform["nodebuffer"]["uint8array"](input).buffer;
      },
      "uint8array": function(input) {
        return arrayLikeToArrayLike(input, new Uint8Array(input.length));
      },
      "nodebuffer": identity
    };
    exports.transformTo = function(outputType, input) {
      if (!input) {
        input = "";
      }
      if (!outputType) {
        return input;
      }
      exports.checkSupport(outputType);
      var inputType = exports.getTypeOf(input);
      var result = transform[inputType][outputType](input);
      return result;
    };
    exports.resolve = function(path13) {
      var parts = path13.split("/");
      var result = [];
      for (var index3 = 0; index3 < parts.length; index3++) {
        var part = parts[index3];
        if (part === "." || part === "" && index3 !== 0 && index3 !== parts.length - 1) {
          continue;
        } else if (part === "..") {
          result.pop();
        } else {
          result.push(part);
        }
      }
      return result.join("/");
    };
    exports.getTypeOf = function(input) {
      if (typeof input === "string") {
        return "string";
      }
      if (Object.prototype.toString.call(input) === "[object Array]") {
        return "array";
      }
      if (support.nodebuffer && nodejsUtils.isBuffer(input)) {
        return "nodebuffer";
      }
      if (support.uint8array && input instanceof Uint8Array) {
        return "uint8array";
      }
      if (support.arraybuffer && input instanceof ArrayBuffer) {
        return "arraybuffer";
      }
    };
    exports.checkSupport = function(type) {
      var supported = support[type.toLowerCase()];
      if (!supported) {
        throw new Error(type + " is not supported by this platform");
      }
    };
    exports.MAX_VALUE_16BITS = 65535;
    exports.MAX_VALUE_32BITS = -1;
    exports.pretty = function(str) {
      var res = "", code, i;
      for (i = 0; i < (str || "").length; i++) {
        code = str.charCodeAt(i);
        res += "\\x" + (code < 16 ? "0" : "") + code.toString(16).toUpperCase();
      }
      return res;
    };
    exports.delay = function(callback, args, self2) {
      setImmediate(function() {
        callback.apply(self2 || null, args || []);
      });
    };
    exports.inherits = function(ctor, superCtor) {
      var Obj = function() {
      };
      Obj.prototype = superCtor.prototype;
      ctor.prototype = new Obj();
    };
    exports.extend = function() {
      var result = {}, i, attr;
      for (i = 0; i < arguments.length; i++) {
        for (attr in arguments[i]) {
          if (Object.prototype.hasOwnProperty.call(arguments[i], attr) && typeof result[attr] === "undefined") {
            result[attr] = arguments[i][attr];
          }
        }
      }
      return result;
    };
    exports.prepareContent = function(name, inputData, isBinary, isOptimizedBinaryString, isBase64) {
      var promise = external.Promise.resolve(inputData).then(function(data) {
        var isBlob = support.blob && (data instanceof Blob || ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(data)) !== -1);
        if (isBlob && typeof FileReader !== "undefined") {
          return new external.Promise(function(resolve2, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
              resolve2(e.target.result);
            };
            reader.onerror = function(e) {
              reject(e.target.error);
            };
            reader.readAsArrayBuffer(data);
          });
        } else {
          return data;
        }
      });
      return promise.then(function(data) {
        var dataType = exports.getTypeOf(data);
        if (!dataType) {
          return external.Promise.reject(
            new Error("Can't read the data of '" + name + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?")
          );
        }
        if (dataType === "arraybuffer") {
          data = exports.transformTo("uint8array", data);
        } else if (dataType === "string") {
          if (isBase64) {
            data = base642.decode(data);
          } else if (isBinary) {
            if (isOptimizedBinaryString !== true) {
              data = string2binary(data);
            }
          }
        }
        return data;
      });
    };
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/GenericWorker.js
var require_GenericWorker = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/GenericWorker.js"(exports, module) {
    function GenericWorker(name) {
      this.name = name || "default";
      this.streamInfo = {};
      this.generatedError = null;
      this.extraStreamInfo = {};
      this.isPaused = true;
      this.isFinished = false;
      this.isLocked = false;
      this._listeners = {
        "data": [],
        "end": [],
        "error": []
      };
      this.previous = null;
    }
    GenericWorker.prototype = {
      /**
       * Push a chunk to the next workers.
       * @param {Object} chunk the chunk to push
       */
      push: function(chunk) {
        this.emit("data", chunk);
      },
      /**
       * End the stream.
       * @return {Boolean} true if this call ended the worker, false otherwise.
       */
      end: function() {
        if (this.isFinished) {
          return false;
        }
        this.flush();
        try {
          this.emit("end");
          this.cleanUp();
          this.isFinished = true;
        } catch (e) {
          this.emit("error", e);
        }
        return true;
      },
      /**
       * End the stream with an error.
       * @param {Error} e the error which caused the premature end.
       * @return {Boolean} true if this call ended the worker with an error, false otherwise.
       */
      error: function(e) {
        if (this.isFinished) {
          return false;
        }
        if (this.isPaused) {
          this.generatedError = e;
        } else {
          this.isFinished = true;
          this.emit("error", e);
          if (this.previous) {
            this.previous.error(e);
          }
          this.cleanUp();
        }
        return true;
      },
      /**
       * Add a callback on an event.
       * @param {String} name the name of the event (data, end, error)
       * @param {Function} listener the function to call when the event is triggered
       * @return {GenericWorker} the current object for chainability
       */
      on: function(name, listener) {
        this._listeners[name].push(listener);
        return this;
      },
      /**
       * Clean any references when a worker is ending.
       */
      cleanUp: function() {
        this.streamInfo = this.generatedError = this.extraStreamInfo = null;
        this._listeners = [];
      },
      /**
       * Trigger an event. This will call registered callback with the provided arg.
       * @param {String} name the name of the event (data, end, error)
       * @param {Object} arg the argument to call the callback with.
       */
      emit: function(name, arg) {
        if (this._listeners[name]) {
          for (var i = 0; i < this._listeners[name].length; i++) {
            this._listeners[name][i].call(this, arg);
          }
        }
      },
      /**
       * Chain a worker with an other.
       * @param {Worker} next the worker receiving events from the current one.
       * @return {worker} the next worker for chainability
       */
      pipe: function(next) {
        return next.registerPrevious(this);
      },
      /**
       * Same as `pipe` in the other direction.
       * Using an API with `pipe(next)` is very easy.
       * Implementing the API with the point of view of the next one registering
       * a source is easier, see the ZipFileWorker.
       * @param {Worker} previous the previous worker, sending events to this one
       * @return {Worker} the current worker for chainability
       */
      registerPrevious: function(previous) {
        if (this.isLocked) {
          throw new Error("The stream '" + this + "' has already been used.");
        }
        this.streamInfo = previous.streamInfo;
        this.mergeStreamInfo();
        this.previous = previous;
        var self2 = this;
        previous.on("data", function(chunk) {
          self2.processChunk(chunk);
        });
        previous.on("end", function() {
          self2.end();
        });
        previous.on("error", function(e) {
          self2.error(e);
        });
        return this;
      },
      /**
       * Pause the stream so it doesn't send events anymore.
       * @return {Boolean} true if this call paused the worker, false otherwise.
       */
      pause: function() {
        if (this.isPaused || this.isFinished) {
          return false;
        }
        this.isPaused = true;
        if (this.previous) {
          this.previous.pause();
        }
        return true;
      },
      /**
       * Resume a paused stream.
       * @return {Boolean} true if this call resumed the worker, false otherwise.
       */
      resume: function() {
        if (!this.isPaused || this.isFinished) {
          return false;
        }
        this.isPaused = false;
        var withError = false;
        if (this.generatedError) {
          this.error(this.generatedError);
          withError = true;
        }
        if (this.previous) {
          this.previous.resume();
        }
        return !withError;
      },
      /**
       * Flush any remaining bytes as the stream is ending.
       */
      flush: function() {
      },
      /**
       * Process a chunk. This is usually the method overridden.
       * @param {Object} chunk the chunk to process.
       */
      processChunk: function(chunk) {
        this.push(chunk);
      },
      /**
       * Add a key/value to be added in the workers chain streamInfo once activated.
       * @param {String} key the key to use
       * @param {Object} value the associated value
       * @return {Worker} the current worker for chainability
       */
      withStreamInfo: function(key, value) {
        this.extraStreamInfo[key] = value;
        this.mergeStreamInfo();
        return this;
      },
      /**
       * Merge this worker's streamInfo into the chain's streamInfo.
       */
      mergeStreamInfo: function() {
        for (var key in this.extraStreamInfo) {
          if (!Object.prototype.hasOwnProperty.call(this.extraStreamInfo, key)) {
            continue;
          }
          this.streamInfo[key] = this.extraStreamInfo[key];
        }
      },
      /**
       * Lock the stream to prevent further updates on the workers chain.
       * After calling this method, all calls to pipe will fail.
       */
      lock: function() {
        if (this.isLocked) {
          throw new Error("The stream '" + this + "' has already been used.");
        }
        this.isLocked = true;
        if (this.previous) {
          this.previous.lock();
        }
      },
      /**
       *
       * Pretty print the workers chain.
       */
      toString: function() {
        var me = "Worker " + this.name;
        if (this.previous) {
          return this.previous + " -> " + me;
        } else {
          return me;
        }
      }
    };
    module.exports = GenericWorker;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/utf8.js
var require_utf8 = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/utf8.js"(exports) {
    var utils = require_utils();
    var support = require_support();
    var nodejsUtils = require_nodejsUtils();
    var GenericWorker = require_GenericWorker();
    var _utf8len = new Array(256);
    for (i = 0; i < 256; i++) {
      _utf8len[i] = i >= 252 ? 6 : i >= 248 ? 5 : i >= 240 ? 4 : i >= 224 ? 3 : i >= 192 ? 2 : 1;
    }
    var i;
    _utf8len[254] = _utf8len[254] = 1;
    var string2buf = function(str) {
      var buf, c, c2, m_pos, i2, str_len = str.length, buf_len = 0;
      for (m_pos = 0; m_pos < str_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
          c2 = str.charCodeAt(m_pos + 1);
          if ((c2 & 64512) === 56320) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            m_pos++;
          }
        }
        buf_len += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
      }
      if (support.uint8array) {
        buf = new Uint8Array(buf_len);
      } else {
        buf = new Array(buf_len);
      }
      for (i2 = 0, m_pos = 0; i2 < buf_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
          c2 = str.charCodeAt(m_pos + 1);
          if ((c2 & 64512) === 56320) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            m_pos++;
          }
        }
        if (c < 128) {
          buf[i2++] = c;
        } else if (c < 2048) {
          buf[i2++] = 192 | c >>> 6;
          buf[i2++] = 128 | c & 63;
        } else if (c < 65536) {
          buf[i2++] = 224 | c >>> 12;
          buf[i2++] = 128 | c >>> 6 & 63;
          buf[i2++] = 128 | c & 63;
        } else {
          buf[i2++] = 240 | c >>> 18;
          buf[i2++] = 128 | c >>> 12 & 63;
          buf[i2++] = 128 | c >>> 6 & 63;
          buf[i2++] = 128 | c & 63;
        }
      }
      return buf;
    };
    var utf8border = function(buf, max) {
      var pos;
      max = max || buf.length;
      if (max > buf.length) {
        max = buf.length;
      }
      pos = max - 1;
      while (pos >= 0 && (buf[pos] & 192) === 128) {
        pos--;
      }
      if (pos < 0) {
        return max;
      }
      if (pos === 0) {
        return max;
      }
      return pos + _utf8len[buf[pos]] > max ? pos : max;
    };
    var buf2string = function(buf) {
      var i2, out, c, c_len;
      var len = buf.length;
      var utf16buf = new Array(len * 2);
      for (out = 0, i2 = 0; i2 < len; ) {
        c = buf[i2++];
        if (c < 128) {
          utf16buf[out++] = c;
          continue;
        }
        c_len = _utf8len[c];
        if (c_len > 4) {
          utf16buf[out++] = 65533;
          i2 += c_len - 1;
          continue;
        }
        c &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
        while (c_len > 1 && i2 < len) {
          c = c << 6 | buf[i2++] & 63;
          c_len--;
        }
        if (c_len > 1) {
          utf16buf[out++] = 65533;
          continue;
        }
        if (c < 65536) {
          utf16buf[out++] = c;
        } else {
          c -= 65536;
          utf16buf[out++] = 55296 | c >> 10 & 1023;
          utf16buf[out++] = 56320 | c & 1023;
        }
      }
      if (utf16buf.length !== out) {
        if (utf16buf.subarray) {
          utf16buf = utf16buf.subarray(0, out);
        } else {
          utf16buf.length = out;
        }
      }
      return utils.applyFromCharCode(utf16buf);
    };
    exports.utf8encode = function utf8encode(str) {
      if (support.nodebuffer) {
        return nodejsUtils.newBufferFrom(str, "utf-8");
      }
      return string2buf(str);
    };
    exports.utf8decode = function utf8decode(buf) {
      if (support.nodebuffer) {
        return utils.transformTo("nodebuffer", buf).toString("utf-8");
      }
      buf = utils.transformTo(support.uint8array ? "uint8array" : "array", buf);
      return buf2string(buf);
    };
    function Utf8DecodeWorker() {
      GenericWorker.call(this, "utf-8 decode");
      this.leftOver = null;
    }
    utils.inherits(Utf8DecodeWorker, GenericWorker);
    Utf8DecodeWorker.prototype.processChunk = function(chunk) {
      var data = utils.transformTo(support.uint8array ? "uint8array" : "array", chunk.data);
      if (this.leftOver && this.leftOver.length) {
        if (support.uint8array) {
          var previousData = data;
          data = new Uint8Array(previousData.length + this.leftOver.length);
          data.set(this.leftOver, 0);
          data.set(previousData, this.leftOver.length);
        } else {
          data = this.leftOver.concat(data);
        }
        this.leftOver = null;
      }
      var nextBoundary = utf8border(data);
      var usableData = data;
      if (nextBoundary !== data.length) {
        if (support.uint8array) {
          usableData = data.subarray(0, nextBoundary);
          this.leftOver = data.subarray(nextBoundary, data.length);
        } else {
          usableData = data.slice(0, nextBoundary);
          this.leftOver = data.slice(nextBoundary, data.length);
        }
      }
      this.push({
        data: exports.utf8decode(usableData),
        meta: chunk.meta
      });
    };
    Utf8DecodeWorker.prototype.flush = function() {
      if (this.leftOver && this.leftOver.length) {
        this.push({
          data: exports.utf8decode(this.leftOver),
          meta: {}
        });
        this.leftOver = null;
      }
    };
    exports.Utf8DecodeWorker = Utf8DecodeWorker;
    function Utf8EncodeWorker() {
      GenericWorker.call(this, "utf-8 encode");
    }
    utils.inherits(Utf8EncodeWorker, GenericWorker);
    Utf8EncodeWorker.prototype.processChunk = function(chunk) {
      this.push({
        data: exports.utf8encode(chunk.data),
        meta: chunk.meta
      });
    };
    exports.Utf8EncodeWorker = Utf8EncodeWorker;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/ConvertWorker.js
var require_ConvertWorker = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/ConvertWorker.js"(exports, module) {
    var GenericWorker = require_GenericWorker();
    var utils = require_utils();
    function ConvertWorker(destType) {
      GenericWorker.call(this, "ConvertWorker to " + destType);
      this.destType = destType;
    }
    utils.inherits(ConvertWorker, GenericWorker);
    ConvertWorker.prototype.processChunk = function(chunk) {
      this.push({
        data: utils.transformTo(this.destType, chunk.data),
        meta: chunk.meta
      });
    };
    module.exports = ConvertWorker;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/nodejs/NodejsStreamOutputAdapter.js
var require_NodejsStreamOutputAdapter = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/nodejs/NodejsStreamOutputAdapter.js"(exports, module) {
    var Readable = require_readable().Readable;
    var utils = require_utils();
    utils.inherits(NodejsStreamOutputAdapter, Readable);
    function NodejsStreamOutputAdapter(helper, options, updateCb) {
      Readable.call(this, options);
      this._helper = helper;
      var self2 = this;
      helper.on("data", function(data, meta) {
        if (!self2.push(data)) {
          self2._helper.pause();
        }
        if (updateCb) {
          updateCb(meta);
        }
      }).on("error", function(e) {
        self2.emit("error", e);
      }).on("end", function() {
        self2.push(null);
      });
    }
    NodejsStreamOutputAdapter.prototype._read = function() {
      this._helper.resume();
    };
    module.exports = NodejsStreamOutputAdapter;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/StreamHelper.js
var require_StreamHelper = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/StreamHelper.js"(exports, module) {
    var utils = require_utils();
    var ConvertWorker = require_ConvertWorker();
    var GenericWorker = require_GenericWorker();
    var base642 = require_base64();
    var support = require_support();
    var external = require_external();
    var NodejsStreamOutputAdapter = null;
    if (support.nodestream) {
      try {
        NodejsStreamOutputAdapter = require_NodejsStreamOutputAdapter();
      } catch (e) {
      }
    }
    function transformZipOutput(type, content, mimeType) {
      switch (type) {
        case "blob":
          return utils.newBlob(utils.transformTo("arraybuffer", content), mimeType);
        case "base64":
          return base642.encode(content);
        default:
          return utils.transformTo(type, content);
      }
    }
    function concat(type, dataArray) {
      var i, index3 = 0, res = null, totalLength = 0;
      for (i = 0; i < dataArray.length; i++) {
        totalLength += dataArray[i].length;
      }
      switch (type) {
        case "string":
          return dataArray.join("");
        case "array":
          return Array.prototype.concat.apply([], dataArray);
        case "uint8array":
          res = new Uint8Array(totalLength);
          for (i = 0; i < dataArray.length; i++) {
            res.set(dataArray[i], index3);
            index3 += dataArray[i].length;
          }
          return res;
        case "nodebuffer":
          return Buffer.concat(dataArray);
        default:
          throw new Error("concat : unsupported type '" + type + "'");
      }
    }
    function accumulate(helper, updateCallback) {
      return new external.Promise(function(resolve2, reject) {
        var dataArray = [];
        var chunkType = helper._internalType, resultType = helper._outputType, mimeType = helper._mimeType;
        helper.on("data", function(data, meta) {
          dataArray.push(data);
          if (updateCallback) {
            updateCallback(meta);
          }
        }).on("error", function(err) {
          dataArray = [];
          reject(err);
        }).on("end", function() {
          try {
            var result = transformZipOutput(resultType, concat(chunkType, dataArray), mimeType);
            resolve2(result);
          } catch (e) {
            reject(e);
          }
          dataArray = [];
        }).resume();
      });
    }
    function StreamHelper(worker, outputType, mimeType) {
      var internalType = outputType;
      switch (outputType) {
        case "blob":
        case "arraybuffer":
          internalType = "uint8array";
          break;
        case "base64":
          internalType = "string";
          break;
      }
      try {
        this._internalType = internalType;
        this._outputType = outputType;
        this._mimeType = mimeType;
        utils.checkSupport(internalType);
        this._worker = worker.pipe(new ConvertWorker(internalType));
        worker.lock();
      } catch (e) {
        this._worker = new GenericWorker("error");
        this._worker.error(e);
      }
    }
    StreamHelper.prototype = {
      /**
       * Listen a StreamHelper, accumulate its content and concatenate it into a
       * complete block.
       * @param {Function} updateCb the update callback.
       * @return Promise the promise for the accumulation.
       */
      accumulate: function(updateCb) {
        return accumulate(this, updateCb);
      },
      /**
       * Add a listener on an event triggered on a stream.
       * @param {String} evt the name of the event
       * @param {Function} fn the listener
       * @return {StreamHelper} the current helper.
       */
      on: function(evt, fn) {
        var self2 = this;
        if (evt === "data") {
          this._worker.on(evt, function(chunk) {
            fn.call(self2, chunk.data, chunk.meta);
          });
        } else {
          this._worker.on(evt, function() {
            utils.delay(fn, arguments, self2);
          });
        }
        return this;
      },
      /**
       * Resume the flow of chunks.
       * @return {StreamHelper} the current helper.
       */
      resume: function() {
        utils.delay(this._worker.resume, [], this._worker);
        return this;
      },
      /**
       * Pause the flow of chunks.
       * @return {StreamHelper} the current helper.
       */
      pause: function() {
        this._worker.pause();
        return this;
      },
      /**
       * Return a nodejs stream for this helper.
       * @param {Function} updateCb the update callback.
       * @return {NodejsStreamOutputAdapter} the nodejs stream.
       */
      toNodejsStream: function(updateCb) {
        utils.checkSupport("nodestream");
        if (this._outputType !== "nodebuffer") {
          throw new Error(this._outputType + " is not supported by this method");
        }
        return new NodejsStreamOutputAdapter(this, {
          objectMode: this._outputType !== "nodebuffer"
        }, updateCb);
      }
    };
    module.exports = StreamHelper;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/defaults.js
var require_defaults = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/defaults.js"(exports) {
    exports.base64 = false;
    exports.binary = false;
    exports.dir = false;
    exports.createFolders = true;
    exports.date = null;
    exports.compression = null;
    exports.compressionOptions = null;
    exports.comment = null;
    exports.unixPermissions = null;
    exports.dosPermissions = null;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/DataWorker.js
var require_DataWorker = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/DataWorker.js"(exports, module) {
    var utils = require_utils();
    var GenericWorker = require_GenericWorker();
    var DEFAULT_BLOCK_SIZE = 16 * 1024;
    function DataWorker(dataP) {
      GenericWorker.call(this, "DataWorker");
      var self2 = this;
      this.dataIsReady = false;
      this.index = 0;
      this.max = 0;
      this.data = null;
      this.type = "";
      this._tickScheduled = false;
      dataP.then(function(data) {
        self2.dataIsReady = true;
        self2.data = data;
        self2.max = data && data.length || 0;
        self2.type = utils.getTypeOf(data);
        if (!self2.isPaused) {
          self2._tickAndRepeat();
        }
      }, function(e) {
        self2.error(e);
      });
    }
    utils.inherits(DataWorker, GenericWorker);
    DataWorker.prototype.cleanUp = function() {
      GenericWorker.prototype.cleanUp.call(this);
      this.data = null;
    };
    DataWorker.prototype.resume = function() {
      if (!GenericWorker.prototype.resume.call(this)) {
        return false;
      }
      if (!this._tickScheduled && this.dataIsReady) {
        this._tickScheduled = true;
        utils.delay(this._tickAndRepeat, [], this);
      }
      return true;
    };
    DataWorker.prototype._tickAndRepeat = function() {
      this._tickScheduled = false;
      if (this.isPaused || this.isFinished) {
        return;
      }
      this._tick();
      if (!this.isFinished) {
        utils.delay(this._tickAndRepeat, [], this);
        this._tickScheduled = true;
      }
    };
    DataWorker.prototype._tick = function() {
      if (this.isPaused || this.isFinished) {
        return false;
      }
      var size = DEFAULT_BLOCK_SIZE;
      var data = null, nextIndex = Math.min(this.max, this.index + size);
      if (this.index >= this.max) {
        return this.end();
      } else {
        switch (this.type) {
          case "string":
            data = this.data.substring(this.index, nextIndex);
            break;
          case "uint8array":
            data = this.data.subarray(this.index, nextIndex);
            break;
          case "array":
          case "nodebuffer":
            data = this.data.slice(this.index, nextIndex);
            break;
        }
        this.index = nextIndex;
        return this.push({
          data,
          meta: {
            percent: this.max ? this.index / this.max * 100 : 0
          }
        });
      }
    };
    module.exports = DataWorker;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/crc32.js
var require_crc32 = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/crc32.js"(exports, module) {
    var utils = require_utils();
    function makeTable() {
      var c, table = [];
      for (var n = 0; n < 256; n++) {
        c = n;
        for (var k = 0; k < 8; k++) {
          c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        }
        table[n] = c;
      }
      return table;
    }
    var crcTable = makeTable();
    function crc32(crc, buf, len, pos) {
      var t = crcTable, end = pos + len;
      crc = crc ^ -1;
      for (var i = pos; i < end; i++) {
        crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
      }
      return crc ^ -1;
    }
    function crc32str(crc, str, len, pos) {
      var t = crcTable, end = pos + len;
      crc = crc ^ -1;
      for (var i = pos; i < end; i++) {
        crc = crc >>> 8 ^ t[(crc ^ str.charCodeAt(i)) & 255];
      }
      return crc ^ -1;
    }
    module.exports = function crc32wrapper(input, crc) {
      if (typeof input === "undefined" || !input.length) {
        return 0;
      }
      var isArray = utils.getTypeOf(input) !== "string";
      if (isArray) {
        return crc32(crc | 0, input, input.length, 0);
      } else {
        return crc32str(crc | 0, input, input.length, 0);
      }
    };
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/Crc32Probe.js
var require_Crc32Probe = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/Crc32Probe.js"(exports, module) {
    var GenericWorker = require_GenericWorker();
    var crc32 = require_crc32();
    var utils = require_utils();
    function Crc32Probe() {
      GenericWorker.call(this, "Crc32Probe");
      this.withStreamInfo("crc32", 0);
    }
    utils.inherits(Crc32Probe, GenericWorker);
    Crc32Probe.prototype.processChunk = function(chunk) {
      this.streamInfo.crc32 = crc32(chunk.data, this.streamInfo.crc32 || 0);
      this.push(chunk);
    };
    module.exports = Crc32Probe;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/DataLengthProbe.js
var require_DataLengthProbe = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/stream/DataLengthProbe.js"(exports, module) {
    var utils = require_utils();
    var GenericWorker = require_GenericWorker();
    function DataLengthProbe(propName) {
      GenericWorker.call(this, "DataLengthProbe for " + propName);
      this.propName = propName;
      this.withStreamInfo(propName, 0);
    }
    utils.inherits(DataLengthProbe, GenericWorker);
    DataLengthProbe.prototype.processChunk = function(chunk) {
      if (chunk) {
        var length = this.streamInfo[this.propName] || 0;
        this.streamInfo[this.propName] = length + chunk.data.length;
      }
      GenericWorker.prototype.processChunk.call(this, chunk);
    };
    module.exports = DataLengthProbe;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js
var require_compressedObject = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"(exports, module) {
    var external = require_external();
    var DataWorker = require_DataWorker();
    var Crc32Probe = require_Crc32Probe();
    var DataLengthProbe = require_DataLengthProbe();
    function CompressedObject(compressedSize, uncompressedSize, crc32, compression, data) {
      this.compressedSize = compressedSize;
      this.uncompressedSize = uncompressedSize;
      this.crc32 = crc32;
      this.compression = compression;
      this.compressedContent = data;
    }
    CompressedObject.prototype = {
      /**
       * Create a worker to get the uncompressed content.
       * @return {GenericWorker} the worker.
       */
      getContentWorker: function() {
        var worker = new DataWorker(external.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new DataLengthProbe("data_length"));
        var that = this;
        worker.on("end", function() {
          if (this.streamInfo["data_length"] !== that.uncompressedSize) {
            throw new Error("Bug : uncompressed data size mismatch");
          }
        });
        return worker;
      },
      /**
       * Create a worker to get the compressed content.
       * @return {GenericWorker} the worker.
       */
      getCompressedWorker: function() {
        return new DataWorker(external.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
      }
    };
    CompressedObject.createWorkerFrom = function(uncompressedWorker, compression, compressionOptions) {
      return uncompressedWorker.pipe(new Crc32Probe()).pipe(new DataLengthProbe("uncompressedSize")).pipe(compression.compressWorker(compressionOptions)).pipe(new DataLengthProbe("compressedSize")).withStreamInfo("compression", compression);
    };
    module.exports = CompressedObject;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/zipObject.js
var require_zipObject = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/zipObject.js"(exports, module) {
    var StreamHelper = require_StreamHelper();
    var DataWorker = require_DataWorker();
    var utf8 = require_utf8();
    var CompressedObject = require_compressedObject();
    var GenericWorker = require_GenericWorker();
    var ZipObject = function(name, data, options) {
      this.name = name;
      this.dir = options.dir;
      this.date = options.date;
      this.comment = options.comment;
      this.unixPermissions = options.unixPermissions;
      this.dosPermissions = options.dosPermissions;
      this._data = data;
      this._dataBinary = options.binary;
      this.options = {
        compression: options.compression,
        compressionOptions: options.compressionOptions
      };
    };
    ZipObject.prototype = {
      /**
       * Create an internal stream for the content of this object.
       * @param {String} type the type of each chunk.
       * @return StreamHelper the stream.
       */
      internalStream: function(type) {
        var result = null, outputType = "string";
        try {
          if (!type) {
            throw new Error("No output type specified.");
          }
          outputType = type.toLowerCase();
          var askUnicodeString = outputType === "string" || outputType === "text";
          if (outputType === "binarystring" || outputType === "text") {
            outputType = "string";
          }
          result = this._decompressWorker();
          var isUnicodeString = !this._dataBinary;
          if (isUnicodeString && !askUnicodeString) {
            result = result.pipe(new utf8.Utf8EncodeWorker());
          }
          if (!isUnicodeString && askUnicodeString) {
            result = result.pipe(new utf8.Utf8DecodeWorker());
          }
        } catch (e) {
          result = new GenericWorker("error");
          result.error(e);
        }
        return new StreamHelper(result, outputType, "");
      },
      /**
       * Prepare the content in the asked type.
       * @param {String} type the type of the result.
       * @param {Function} onUpdate a function to call on each internal update.
       * @return Promise the promise of the result.
       */
      async: function(type, onUpdate) {
        return this.internalStream(type).accumulate(onUpdate);
      },
      /**
       * Prepare the content as a nodejs stream.
       * @param {String} type the type of each chunk.
       * @param {Function} onUpdate a function to call on each internal update.
       * @return Stream the stream.
       */
      nodeStream: function(type, onUpdate) {
        return this.internalStream(type || "nodebuffer").toNodejsStream(onUpdate);
      },
      /**
       * Return a worker for the compressed content.
       * @private
       * @param {Object} compression the compression object to use.
       * @param {Object} compressionOptions the options to use when compressing.
       * @return Worker the worker.
       */
      _compressWorker: function(compression, compressionOptions) {
        if (this._data instanceof CompressedObject && this._data.compression.magic === compression.magic) {
          return this._data.getCompressedWorker();
        } else {
          var result = this._decompressWorker();
          if (!this._dataBinary) {
            result = result.pipe(new utf8.Utf8EncodeWorker());
          }
          return CompressedObject.createWorkerFrom(result, compression, compressionOptions);
        }
      },
      /**
       * Return a worker for the decompressed content.
       * @private
       * @return Worker the worker.
       */
      _decompressWorker: function() {
        if (this._data instanceof CompressedObject) {
          return this._data.getContentWorker();
        } else if (this._data instanceof GenericWorker) {
          return this._data;
        } else {
          return new DataWorker(this._data);
        }
      }
    };
    var removedMethods = ["asText", "asBinary", "asNodeBuffer", "asUint8Array", "asArrayBuffer"];
    var removedFn = function() {
      throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
    };
    for (i = 0; i < removedMethods.length; i++) {
      ZipObject.prototype[removedMethods[i]] = removedFn;
    }
    var i;
    module.exports = ZipObject;
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/utils/common.js
var require_common = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/utils/common.js"(exports) {
    var TYPED_OK = typeof Uint8Array !== "undefined" && typeof Uint16Array !== "undefined" && typeof Int32Array !== "undefined";
    function _has(obj, key) {
      return Object.prototype.hasOwnProperty.call(obj, key);
    }
    exports.assign = function(obj) {
      var sources = Array.prototype.slice.call(arguments, 1);
      while (sources.length) {
        var source = sources.shift();
        if (!source) {
          continue;
        }
        if (typeof source !== "object") {
          throw new TypeError(source + "must be non-object");
        }
        for (var p in source) {
          if (_has(source, p)) {
            obj[p] = source[p];
          }
        }
      }
      return obj;
    };
    exports.shrinkBuf = function(buf, size) {
      if (buf.length === size) {
        return buf;
      }
      if (buf.subarray) {
        return buf.subarray(0, size);
      }
      buf.length = size;
      return buf;
    };
    var fnTyped = {
      arraySet: function(dest, src, src_offs, len, dest_offs) {
        if (src.subarray && dest.subarray) {
          dest.set(src.subarray(src_offs, src_offs + len), dest_offs);
          return;
        }
        for (var i = 0; i < len; i++) {
          dest[dest_offs + i] = src[src_offs + i];
        }
      },
      // Join array of chunks to single array.
      flattenChunks: function(chunks) {
        var i, l, len, pos, chunk, result;
        len = 0;
        for (i = 0, l = chunks.length; i < l; i++) {
          len += chunks[i].length;
        }
        result = new Uint8Array(len);
        pos = 0;
        for (i = 0, l = chunks.length; i < l; i++) {
          chunk = chunks[i];
          result.set(chunk, pos);
          pos += chunk.length;
        }
        return result;
      }
    };
    var fnUntyped = {
      arraySet: function(dest, src, src_offs, len, dest_offs) {
        for (var i = 0; i < len; i++) {
          dest[dest_offs + i] = src[src_offs + i];
        }
      },
      // Join array of chunks to single array.
      flattenChunks: function(chunks) {
        return [].concat.apply([], chunks);
      }
    };
    exports.setTyped = function(on) {
      if (on) {
        exports.Buf8 = Uint8Array;
        exports.Buf16 = Uint16Array;
        exports.Buf32 = Int32Array;
        exports.assign(exports, fnTyped);
      } else {
        exports.Buf8 = Array;
        exports.Buf16 = Array;
        exports.Buf32 = Array;
        exports.assign(exports, fnUntyped);
      }
    };
    exports.setTyped(TYPED_OK);
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/trees.js
var require_trees = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/trees.js"(exports) {
    var utils = require_common();
    var Z_FIXED = 4;
    var Z_BINARY = 0;
    var Z_TEXT = 1;
    var Z_UNKNOWN = 2;
    function zero(buf) {
      var len = buf.length;
      while (--len >= 0) {
        buf[len] = 0;
      }
    }
    var STORED_BLOCK = 0;
    var STATIC_TREES = 1;
    var DYN_TREES = 2;
    var MIN_MATCH = 3;
    var MAX_MATCH = 258;
    var LENGTH_CODES = 29;
    var LITERALS = 256;
    var L_CODES = LITERALS + 1 + LENGTH_CODES;
    var D_CODES = 30;
    var BL_CODES = 19;
    var HEAP_SIZE = 2 * L_CODES + 1;
    var MAX_BITS = 15;
    var Buf_size = 16;
    var MAX_BL_BITS = 7;
    var END_BLOCK = 256;
    var REP_3_6 = 16;
    var REPZ_3_10 = 17;
    var REPZ_11_138 = 18;
    var extra_lbits = (
      /* extra bits for each length code */
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
    );
    var extra_dbits = (
      /* extra bits for each distance code */
      [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
    );
    var extra_blbits = (
      /* extra bits for each bit length code */
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7]
    );
    var bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
    var DIST_CODE_LEN = 512;
    var static_ltree = new Array((L_CODES + 2) * 2);
    zero(static_ltree);
    var static_dtree = new Array(D_CODES * 2);
    zero(static_dtree);
    var _dist_code = new Array(DIST_CODE_LEN);
    zero(_dist_code);
    var _length_code = new Array(MAX_MATCH - MIN_MATCH + 1);
    zero(_length_code);
    var base_length = new Array(LENGTH_CODES);
    zero(base_length);
    var base_dist = new Array(D_CODES);
    zero(base_dist);
    function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {
      this.static_tree = static_tree;
      this.extra_bits = extra_bits;
      this.extra_base = extra_base;
      this.elems = elems;
      this.max_length = max_length;
      this.has_stree = static_tree && static_tree.length;
    }
    var static_l_desc;
    var static_d_desc;
    var static_bl_desc;
    function TreeDesc(dyn_tree, stat_desc) {
      this.dyn_tree = dyn_tree;
      this.max_code = 0;
      this.stat_desc = stat_desc;
    }
    function d_code(dist) {
      return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
    }
    function put_short(s, w) {
      s.pending_buf[s.pending++] = w & 255;
      s.pending_buf[s.pending++] = w >>> 8 & 255;
    }
    function send_bits(s, value, length) {
      if (s.bi_valid > Buf_size - length) {
        s.bi_buf |= value << s.bi_valid & 65535;
        put_short(s, s.bi_buf);
        s.bi_buf = value >> Buf_size - s.bi_valid;
        s.bi_valid += length - Buf_size;
      } else {
        s.bi_buf |= value << s.bi_valid & 65535;
        s.bi_valid += length;
      }
    }
    function send_code(s, c, tree) {
      send_bits(
        s,
        tree[c * 2],
        tree[c * 2 + 1]
        /*.Len*/
      );
    }
    function bi_reverse(code, len) {
      var res = 0;
      do {
        res |= code & 1;
        code >>>= 1;
        res <<= 1;
      } while (--len > 0);
      return res >>> 1;
    }
    function bi_flush(s) {
      if (s.bi_valid === 16) {
        put_short(s, s.bi_buf);
        s.bi_buf = 0;
        s.bi_valid = 0;
      } else if (s.bi_valid >= 8) {
        s.pending_buf[s.pending++] = s.bi_buf & 255;
        s.bi_buf >>= 8;
        s.bi_valid -= 8;
      }
    }
    function gen_bitlen(s, desc3) {
      var tree = desc3.dyn_tree;
      var max_code = desc3.max_code;
      var stree = desc3.stat_desc.static_tree;
      var has_stree = desc3.stat_desc.has_stree;
      var extra = desc3.stat_desc.extra_bits;
      var base = desc3.stat_desc.extra_base;
      var max_length = desc3.stat_desc.max_length;
      var h;
      var n, m;
      var bits;
      var xbits;
      var f;
      var overflow = 0;
      for (bits = 0; bits <= MAX_BITS; bits++) {
        s.bl_count[bits] = 0;
      }
      tree[s.heap[s.heap_max] * 2 + 1] = 0;
      for (h = s.heap_max + 1; h < HEAP_SIZE; h++) {
        n = s.heap[h];
        bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
        if (bits > max_length) {
          bits = max_length;
          overflow++;
        }
        tree[n * 2 + 1] = bits;
        if (n > max_code) {
          continue;
        }
        s.bl_count[bits]++;
        xbits = 0;
        if (n >= base) {
          xbits = extra[n - base];
        }
        f = tree[n * 2];
        s.opt_len += f * (bits + xbits);
        if (has_stree) {
          s.static_len += f * (stree[n * 2 + 1] + xbits);
        }
      }
      if (overflow === 0) {
        return;
      }
      do {
        bits = max_length - 1;
        while (s.bl_count[bits] === 0) {
          bits--;
        }
        s.bl_count[bits]--;
        s.bl_count[bits + 1] += 2;
        s.bl_count[max_length]--;
        overflow -= 2;
      } while (overflow > 0);
      for (bits = max_length; bits !== 0; bits--) {
        n = s.bl_count[bits];
        while (n !== 0) {
          m = s.heap[--h];
          if (m > max_code) {
            continue;
          }
          if (tree[m * 2 + 1] !== bits) {
            s.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
            tree[m * 2 + 1] = bits;
          }
          n--;
        }
      }
    }
    function gen_codes(tree, max_code, bl_count) {
      var next_code = new Array(MAX_BITS + 1);
      var code = 0;
      var bits;
      var n;
      for (bits = 1; bits <= MAX_BITS; bits++) {
        next_code[bits] = code = code + bl_count[bits - 1] << 1;
      }
      for (n = 0; n <= max_code; n++) {
        var len = tree[n * 2 + 1];
        if (len === 0) {
          continue;
        }
        tree[n * 2] = bi_reverse(next_code[len]++, len);
      }
    }
    function tr_static_init() {
      var n;
      var bits;
      var length;
      var code;
      var dist;
      var bl_count = new Array(MAX_BITS + 1);
      length = 0;
      for (code = 0; code < LENGTH_CODES - 1; code++) {
        base_length[code] = length;
        for (n = 0; n < 1 << extra_lbits[code]; n++) {
          _length_code[length++] = code;
        }
      }
      _length_code[length - 1] = code;
      dist = 0;
      for (code = 0; code < 16; code++) {
        base_dist[code] = dist;
        for (n = 0; n < 1 << extra_dbits[code]; n++) {
          _dist_code[dist++] = code;
        }
      }
      dist >>= 7;
      for (; code < D_CODES; code++) {
        base_dist[code] = dist << 7;
        for (n = 0; n < 1 << extra_dbits[code] - 7; n++) {
          _dist_code[256 + dist++] = code;
        }
      }
      for (bits = 0; bits <= MAX_BITS; bits++) {
        bl_count[bits] = 0;
      }
      n = 0;
      while (n <= 143) {
        static_ltree[n * 2 + 1] = 8;
        n++;
        bl_count[8]++;
      }
      while (n <= 255) {
        static_ltree[n * 2 + 1] = 9;
        n++;
        bl_count[9]++;
      }
      while (n <= 279) {
        static_ltree[n * 2 + 1] = 7;
        n++;
        bl_count[7]++;
      }
      while (n <= 287) {
        static_ltree[n * 2 + 1] = 8;
        n++;
        bl_count[8]++;
      }
      gen_codes(static_ltree, L_CODES + 1, bl_count);
      for (n = 0; n < D_CODES; n++) {
        static_dtree[n * 2 + 1] = 5;
        static_dtree[n * 2] = bi_reverse(n, 5);
      }
      static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);
      static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES, MAX_BITS);
      static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES, MAX_BL_BITS);
    }
    function init_block(s) {
      var n;
      for (n = 0; n < L_CODES; n++) {
        s.dyn_ltree[n * 2] = 0;
      }
      for (n = 0; n < D_CODES; n++) {
        s.dyn_dtree[n * 2] = 0;
      }
      for (n = 0; n < BL_CODES; n++) {
        s.bl_tree[n * 2] = 0;
      }
      s.dyn_ltree[END_BLOCK * 2] = 1;
      s.opt_len = s.static_len = 0;
      s.last_lit = s.matches = 0;
    }
    function bi_windup(s) {
      if (s.bi_valid > 8) {
        put_short(s, s.bi_buf);
      } else if (s.bi_valid > 0) {
        s.pending_buf[s.pending++] = s.bi_buf;
      }
      s.bi_buf = 0;
      s.bi_valid = 0;
    }
    function copy_block(s, buf, len, header) {
      bi_windup(s);
      {
        put_short(s, len);
        put_short(s, ~len);
      }
      utils.arraySet(s.pending_buf, s.window, buf, len, s.pending);
      s.pending += len;
    }
    function smaller(tree, n, m, depth) {
      var _n2 = n * 2;
      var _m2 = m * 2;
      return tree[_n2] < tree[_m2] || tree[_n2] === tree[_m2] && depth[n] <= depth[m];
    }
    function pqdownheap(s, tree, k) {
      var v = s.heap[k];
      var j = k << 1;
      while (j <= s.heap_len) {
        if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
          j++;
        }
        if (smaller(tree, v, s.heap[j], s.depth)) {
          break;
        }
        s.heap[k] = s.heap[j];
        k = j;
        j <<= 1;
      }
      s.heap[k] = v;
    }
    function compress_block(s, ltree, dtree) {
      var dist;
      var lc;
      var lx = 0;
      var code;
      var extra;
      if (s.last_lit !== 0) {
        do {
          dist = s.pending_buf[s.d_buf + lx * 2] << 8 | s.pending_buf[s.d_buf + lx * 2 + 1];
          lc = s.pending_buf[s.l_buf + lx];
          lx++;
          if (dist === 0) {
            send_code(s, lc, ltree);
          } else {
            code = _length_code[lc];
            send_code(s, code + LITERALS + 1, ltree);
            extra = extra_lbits[code];
            if (extra !== 0) {
              lc -= base_length[code];
              send_bits(s, lc, extra);
            }
            dist--;
            code = d_code(dist);
            send_code(s, code, dtree);
            extra = extra_dbits[code];
            if (extra !== 0) {
              dist -= base_dist[code];
              send_bits(s, dist, extra);
            }
          }
        } while (lx < s.last_lit);
      }
      send_code(s, END_BLOCK, ltree);
    }
    function build_tree(s, desc3) {
      var tree = desc3.dyn_tree;
      var stree = desc3.stat_desc.static_tree;
      var has_stree = desc3.stat_desc.has_stree;
      var elems = desc3.stat_desc.elems;
      var n, m;
      var max_code = -1;
      var node;
      s.heap_len = 0;
      s.heap_max = HEAP_SIZE;
      for (n = 0; n < elems; n++) {
        if (tree[n * 2] !== 0) {
          s.heap[++s.heap_len] = max_code = n;
          s.depth[n] = 0;
        } else {
          tree[n * 2 + 1] = 0;
        }
      }
      while (s.heap_len < 2) {
        node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
        tree[node * 2] = 1;
        s.depth[node] = 0;
        s.opt_len--;
        if (has_stree) {
          s.static_len -= stree[node * 2 + 1];
        }
      }
      desc3.max_code = max_code;
      for (n = s.heap_len >> 1; n >= 1; n--) {
        pqdownheap(s, tree, n);
      }
      node = elems;
      do {
        n = s.heap[
          1
          /*SMALLEST*/
        ];
        s.heap[
          1
          /*SMALLEST*/
        ] = s.heap[s.heap_len--];
        pqdownheap(
          s,
          tree,
          1
          /*SMALLEST*/
        );
        m = s.heap[
          1
          /*SMALLEST*/
        ];
        s.heap[--s.heap_max] = n;
        s.heap[--s.heap_max] = m;
        tree[node * 2] = tree[n * 2] + tree[m * 2];
        s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
        tree[n * 2 + 1] = tree[m * 2 + 1] = node;
        s.heap[
          1
          /*SMALLEST*/
        ] = node++;
        pqdownheap(
          s,
          tree,
          1
          /*SMALLEST*/
        );
      } while (s.heap_len >= 2);
      s.heap[--s.heap_max] = s.heap[
        1
        /*SMALLEST*/
      ];
      gen_bitlen(s, desc3);
      gen_codes(tree, max_code, s.bl_count);
    }
    function scan_tree(s, tree, max_code) {
      var n;
      var prevlen = -1;
      var curlen;
      var nextlen = tree[0 * 2 + 1];
      var count = 0;
      var max_count = 7;
      var min_count = 4;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      }
      tree[(max_code + 1) * 2 + 1] = 65535;
      for (n = 0; n <= max_code; n++) {
        curlen = nextlen;
        nextlen = tree[(n + 1) * 2 + 1];
        if (++count < max_count && curlen === nextlen) {
          continue;
        } else if (count < min_count) {
          s.bl_tree[curlen * 2] += count;
        } else if (curlen !== 0) {
          if (curlen !== prevlen) {
            s.bl_tree[curlen * 2]++;
          }
          s.bl_tree[REP_3_6 * 2]++;
        } else if (count <= 10) {
          s.bl_tree[REPZ_3_10 * 2]++;
        } else {
          s.bl_tree[REPZ_11_138 * 2]++;
        }
        count = 0;
        prevlen = curlen;
        if (nextlen === 0) {
          max_count = 138;
          min_count = 3;
        } else if (curlen === nextlen) {
          max_count = 6;
          min_count = 3;
        } else {
          max_count = 7;
          min_count = 4;
        }
      }
    }
    function send_tree(s, tree, max_code) {
      var n;
      var prevlen = -1;
      var curlen;
      var nextlen = tree[0 * 2 + 1];
      var count = 0;
      var max_count = 7;
      var min_count = 4;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      }
      for (n = 0; n <= max_code; n++) {
        curlen = nextlen;
        nextlen = tree[(n + 1) * 2 + 1];
        if (++count < max_count && curlen === nextlen) {
          continue;
        } else if (count < min_count) {
          do {
            send_code(s, curlen, s.bl_tree);
          } while (--count !== 0);
        } else if (curlen !== 0) {
          if (curlen !== prevlen) {
            send_code(s, curlen, s.bl_tree);
            count--;
          }
          send_code(s, REP_3_6, s.bl_tree);
          send_bits(s, count - 3, 2);
        } else if (count <= 10) {
          send_code(s, REPZ_3_10, s.bl_tree);
          send_bits(s, count - 3, 3);
        } else {
          send_code(s, REPZ_11_138, s.bl_tree);
          send_bits(s, count - 11, 7);
        }
        count = 0;
        prevlen = curlen;
        if (nextlen === 0) {
          max_count = 138;
          min_count = 3;
        } else if (curlen === nextlen) {
          max_count = 6;
          min_count = 3;
        } else {
          max_count = 7;
          min_count = 4;
        }
      }
    }
    function build_bl_tree(s) {
      var max_blindex;
      scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
      scan_tree(s, s.dyn_dtree, s.d_desc.max_code);
      build_tree(s, s.bl_desc);
      for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
        if (s.bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) {
          break;
        }
      }
      s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
      return max_blindex;
    }
    function send_all_trees(s, lcodes, dcodes, blcodes) {
      var rank;
      send_bits(s, lcodes - 257, 5);
      send_bits(s, dcodes - 1, 5);
      send_bits(s, blcodes - 4, 4);
      for (rank = 0; rank < blcodes; rank++) {
        send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1], 3);
      }
      send_tree(s, s.dyn_ltree, lcodes - 1);
      send_tree(s, s.dyn_dtree, dcodes - 1);
    }
    function detect_data_type(s) {
      var black_mask = 4093624447;
      var n;
      for (n = 0; n <= 31; n++, black_mask >>>= 1) {
        if (black_mask & 1 && s.dyn_ltree[n * 2] !== 0) {
          return Z_BINARY;
        }
      }
      if (s.dyn_ltree[9 * 2] !== 0 || s.dyn_ltree[10 * 2] !== 0 || s.dyn_ltree[13 * 2] !== 0) {
        return Z_TEXT;
      }
      for (n = 32; n < LITERALS; n++) {
        if (s.dyn_ltree[n * 2] !== 0) {
          return Z_TEXT;
        }
      }
      return Z_BINARY;
    }
    var static_init_done = false;
    function _tr_init(s) {
      if (!static_init_done) {
        tr_static_init();
        static_init_done = true;
      }
      s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
      s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
      s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);
      s.bi_buf = 0;
      s.bi_valid = 0;
      init_block(s);
    }
    function _tr_stored_block(s, buf, stored_len, last) {
      send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);
      copy_block(s, buf, stored_len);
    }
    function _tr_align(s) {
      send_bits(s, STATIC_TREES << 1, 3);
      send_code(s, END_BLOCK, static_ltree);
      bi_flush(s);
    }
    function _tr_flush_block(s, buf, stored_len, last) {
      var opt_lenb, static_lenb;
      var max_blindex = 0;
      if (s.level > 0) {
        if (s.strm.data_type === Z_UNKNOWN) {
          s.strm.data_type = detect_data_type(s);
        }
        build_tree(s, s.l_desc);
        build_tree(s, s.d_desc);
        max_blindex = build_bl_tree(s);
        opt_lenb = s.opt_len + 3 + 7 >>> 3;
        static_lenb = s.static_len + 3 + 7 >>> 3;
        if (static_lenb <= opt_lenb) {
          opt_lenb = static_lenb;
        }
      } else {
        opt_lenb = static_lenb = stored_len + 5;
      }
      if (stored_len + 4 <= opt_lenb && buf !== -1) {
        _tr_stored_block(s, buf, stored_len, last);
      } else if (s.strategy === Z_FIXED || static_lenb === opt_lenb) {
        send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
        compress_block(s, static_ltree, static_dtree);
      } else {
        send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
        send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
        compress_block(s, s.dyn_ltree, s.dyn_dtree);
      }
      init_block(s);
      if (last) {
        bi_windup(s);
      }
    }
    function _tr_tally(s, dist, lc) {
      s.pending_buf[s.d_buf + s.last_lit * 2] = dist >>> 8 & 255;
      s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 255;
      s.pending_buf[s.l_buf + s.last_lit] = lc & 255;
      s.last_lit++;
      if (dist === 0) {
        s.dyn_ltree[lc * 2]++;
      } else {
        s.matches++;
        dist--;
        s.dyn_ltree[(_length_code[lc] + LITERALS + 1) * 2]++;
        s.dyn_dtree[d_code(dist) * 2]++;
      }
      return s.last_lit === s.lit_bufsize - 1;
    }
    exports._tr_init = _tr_init;
    exports._tr_stored_block = _tr_stored_block;
    exports._tr_flush_block = _tr_flush_block;
    exports._tr_tally = _tr_tally;
    exports._tr_align = _tr_align;
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/adler32.js
var require_adler32 = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/adler32.js"(exports, module) {
    function adler32(adler, buf, len, pos) {
      var s1 = adler & 65535 | 0, s2 = adler >>> 16 & 65535 | 0, n = 0;
      while (len !== 0) {
        n = len > 2e3 ? 2e3 : len;
        len -= n;
        do {
          s1 = s1 + buf[pos++] | 0;
          s2 = s2 + s1 | 0;
        } while (--n);
        s1 %= 65521;
        s2 %= 65521;
      }
      return s1 | s2 << 16 | 0;
    }
    module.exports = adler32;
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/crc32.js
var require_crc322 = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/crc32.js"(exports, module) {
    function makeTable() {
      var c, table = [];
      for (var n = 0; n < 256; n++) {
        c = n;
        for (var k = 0; k < 8; k++) {
          c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        }
        table[n] = c;
      }
      return table;
    }
    var crcTable = makeTable();
    function crc32(crc, buf, len, pos) {
      var t = crcTable, end = pos + len;
      crc ^= -1;
      for (var i = pos; i < end; i++) {
        crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
      }
      return crc ^ -1;
    }
    module.exports = crc32;
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/messages.js
var require_messages = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/messages.js"(exports, module) {
    module.exports = {
      2: "need dictionary",
      /* Z_NEED_DICT       2  */
      1: "stream end",
      /* Z_STREAM_END      1  */
      0: "",
      /* Z_OK              0  */
      "-1": "file error",
      /* Z_ERRNO         (-1) */
      "-2": "stream error",
      /* Z_STREAM_ERROR  (-2) */
      "-3": "data error",
      /* Z_DATA_ERROR    (-3) */
      "-4": "insufficient memory",
      /* Z_MEM_ERROR     (-4) */
      "-5": "buffer error",
      /* Z_BUF_ERROR     (-5) */
      "-6": "incompatible version"
      /* Z_VERSION_ERROR (-6) */
    };
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/deflate.js
var require_deflate = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/deflate.js"(exports) {
    var utils = require_common();
    var trees = require_trees();
    var adler32 = require_adler32();
    var crc32 = require_crc322();
    var msg = require_messages();
    var Z_NO_FLUSH = 0;
    var Z_PARTIAL_FLUSH = 1;
    var Z_FULL_FLUSH = 3;
    var Z_FINISH = 4;
    var Z_BLOCK = 5;
    var Z_OK = 0;
    var Z_STREAM_END = 1;
    var Z_STREAM_ERROR = -2;
    var Z_DATA_ERROR = -3;
    var Z_BUF_ERROR = -5;
    var Z_DEFAULT_COMPRESSION = -1;
    var Z_FILTERED = 1;
    var Z_HUFFMAN_ONLY = 2;
    var Z_RLE = 3;
    var Z_FIXED = 4;
    var Z_DEFAULT_STRATEGY = 0;
    var Z_UNKNOWN = 2;
    var Z_DEFLATED = 8;
    var MAX_MEM_LEVEL = 9;
    var MAX_WBITS = 15;
    var DEF_MEM_LEVEL = 8;
    var LENGTH_CODES = 29;
    var LITERALS = 256;
    var L_CODES = LITERALS + 1 + LENGTH_CODES;
    var D_CODES = 30;
    var BL_CODES = 19;
    var HEAP_SIZE = 2 * L_CODES + 1;
    var MAX_BITS = 15;
    var MIN_MATCH = 3;
    var MAX_MATCH = 258;
    var MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
    var PRESET_DICT = 32;
    var INIT_STATE = 42;
    var EXTRA_STATE = 69;
    var NAME_STATE = 73;
    var COMMENT_STATE = 91;
    var HCRC_STATE = 103;
    var BUSY_STATE = 113;
    var FINISH_STATE = 666;
    var BS_NEED_MORE = 1;
    var BS_BLOCK_DONE = 2;
    var BS_FINISH_STARTED = 3;
    var BS_FINISH_DONE = 4;
    var OS_CODE = 3;
    function err(strm, errorCode) {
      strm.msg = msg[errorCode];
      return errorCode;
    }
    function rank(f) {
      return (f << 1) - (f > 4 ? 9 : 0);
    }
    function zero(buf) {
      var len = buf.length;
      while (--len >= 0) {
        buf[len] = 0;
      }
    }
    function flush_pending(strm) {
      var s = strm.state;
      var len = s.pending;
      if (len > strm.avail_out) {
        len = strm.avail_out;
      }
      if (len === 0) {
        return;
      }
      utils.arraySet(strm.output, s.pending_buf, s.pending_out, len, strm.next_out);
      strm.next_out += len;
      s.pending_out += len;
      strm.total_out += len;
      strm.avail_out -= len;
      s.pending -= len;
      if (s.pending === 0) {
        s.pending_out = 0;
      }
    }
    function flush_block_only(s, last) {
      trees._tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last);
      s.block_start = s.strstart;
      flush_pending(s.strm);
    }
    function put_byte(s, b) {
      s.pending_buf[s.pending++] = b;
    }
    function putShortMSB(s, b) {
      s.pending_buf[s.pending++] = b >>> 8 & 255;
      s.pending_buf[s.pending++] = b & 255;
    }
    function read_buf(strm, buf, start, size) {
      var len = strm.avail_in;
      if (len > size) {
        len = size;
      }
      if (len === 0) {
        return 0;
      }
      strm.avail_in -= len;
      utils.arraySet(buf, strm.input, strm.next_in, len, start);
      if (strm.state.wrap === 1) {
        strm.adler = adler32(strm.adler, buf, len, start);
      } else if (strm.state.wrap === 2) {
        strm.adler = crc32(strm.adler, buf, len, start);
      }
      strm.next_in += len;
      strm.total_in += len;
      return len;
    }
    function longest_match(s, cur_match) {
      var chain_length = s.max_chain_length;
      var scan = s.strstart;
      var match;
      var len;
      var best_len = s.prev_length;
      var nice_match = s.nice_match;
      var limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0;
      var _win = s.window;
      var wmask = s.w_mask;
      var prev = s.prev;
      var strend = s.strstart + MAX_MATCH;
      var scan_end1 = _win[scan + best_len - 1];
      var scan_end = _win[scan + best_len];
      if (s.prev_length >= s.good_match) {
        chain_length >>= 2;
      }
      if (nice_match > s.lookahead) {
        nice_match = s.lookahead;
      }
      do {
        match = cur_match;
        if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) {
          continue;
        }
        scan += 2;
        match++;
        do {
        } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend);
        len = MAX_MATCH - (strend - scan);
        scan = strend - MAX_MATCH;
        if (len > best_len) {
          s.match_start = cur_match;
          best_len = len;
          if (len >= nice_match) {
            break;
          }
          scan_end1 = _win[scan + best_len - 1];
          scan_end = _win[scan + best_len];
        }
      } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);
      if (best_len <= s.lookahead) {
        return best_len;
      }
      return s.lookahead;
    }
    function fill_window(s) {
      var _w_size = s.w_size;
      var p, n, m, more, str;
      do {
        more = s.window_size - s.lookahead - s.strstart;
        if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
          utils.arraySet(s.window, s.window, _w_size, _w_size, 0);
          s.match_start -= _w_size;
          s.strstart -= _w_size;
          s.block_start -= _w_size;
          n = s.hash_size;
          p = n;
          do {
            m = s.head[--p];
            s.head[p] = m >= _w_size ? m - _w_size : 0;
          } while (--n);
          n = _w_size;
          p = n;
          do {
            m = s.prev[--p];
            s.prev[p] = m >= _w_size ? m - _w_size : 0;
          } while (--n);
          more += _w_size;
        }
        if (s.strm.avail_in === 0) {
          break;
        }
        n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
        s.lookahead += n;
        if (s.lookahead + s.insert >= MIN_MATCH) {
          str = s.strstart - s.insert;
          s.ins_h = s.window[str];
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + 1]) & s.hash_mask;
          while (s.insert) {
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;
            s.prev[str & s.w_mask] = s.head[s.ins_h];
            s.head[s.ins_h] = str;
            str++;
            s.insert--;
            if (s.lookahead + s.insert < MIN_MATCH) {
              break;
            }
          }
        }
      } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);
    }
    function deflate_stored(s, flush) {
      var max_block_size = 65535;
      if (max_block_size > s.pending_buf_size - 5) {
        max_block_size = s.pending_buf_size - 5;
      }
      for (; ; ) {
        if (s.lookahead <= 1) {
          fill_window(s);
          if (s.lookahead === 0 && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        s.strstart += s.lookahead;
        s.lookahead = 0;
        var max_start = s.block_start + max_block_size;
        if (s.strstart === 0 || s.strstart >= max_start) {
          s.lookahead = s.strstart - max_start;
          s.strstart = max_start;
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
        if (s.strstart - s.block_start >= s.w_size - MIN_LOOKAHEAD) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = 0;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.strstart > s.block_start) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_NEED_MORE;
    }
    function deflate_fast(s, flush) {
      var hash_head;
      var bflush;
      for (; ; ) {
        if (s.lookahead < MIN_LOOKAHEAD) {
          fill_window(s);
          if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        hash_head = 0;
        if (s.lookahead >= MIN_MATCH) {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
        }
        if (hash_head !== 0 && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
          s.match_length = longest_match(s, hash_head);
        }
        if (s.match_length >= MIN_MATCH) {
          bflush = trees._tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);
          s.lookahead -= s.match_length;
          if (s.match_length <= s.max_lazy_match && s.lookahead >= MIN_MATCH) {
            s.match_length--;
            do {
              s.strstart++;
              s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
              hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
              s.head[s.ins_h] = s.strstart;
            } while (--s.match_length !== 0);
            s.strstart++;
          } else {
            s.strstart += s.match_length;
            s.match_length = 0;
            s.ins_h = s.window[s.strstart];
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + 1]) & s.hash_mask;
          }
        } else {
          bflush = trees._tr_tally(s, 0, s.window[s.strstart]);
          s.lookahead--;
          s.strstart++;
        }
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function deflate_slow(s, flush) {
      var hash_head;
      var bflush;
      var max_insert;
      for (; ; ) {
        if (s.lookahead < MIN_LOOKAHEAD) {
          fill_window(s);
          if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        hash_head = 0;
        if (s.lookahead >= MIN_MATCH) {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
        }
        s.prev_length = s.match_length;
        s.prev_match = s.match_start;
        s.match_length = MIN_MATCH - 1;
        if (hash_head !== 0 && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
          s.match_length = longest_match(s, hash_head);
          if (s.match_length <= 5 && (s.strategy === Z_FILTERED || s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096)) {
            s.match_length = MIN_MATCH - 1;
          }
        }
        if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
          max_insert = s.strstart + s.lookahead - MIN_MATCH;
          bflush = trees._tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
          s.lookahead -= s.prev_length - 1;
          s.prev_length -= 2;
          do {
            if (++s.strstart <= max_insert) {
              s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
              hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
              s.head[s.ins_h] = s.strstart;
            }
          } while (--s.prev_length !== 0);
          s.match_available = 0;
          s.match_length = MIN_MATCH - 1;
          s.strstart++;
          if (bflush) {
            flush_block_only(s, false);
            if (s.strm.avail_out === 0) {
              return BS_NEED_MORE;
            }
          }
        } else if (s.match_available) {
          bflush = trees._tr_tally(s, 0, s.window[s.strstart - 1]);
          if (bflush) {
            flush_block_only(s, false);
          }
          s.strstart++;
          s.lookahead--;
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        } else {
          s.match_available = 1;
          s.strstart++;
          s.lookahead--;
        }
      }
      if (s.match_available) {
        bflush = trees._tr_tally(s, 0, s.window[s.strstart - 1]);
        s.match_available = 0;
      }
      s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function deflate_rle(s, flush) {
      var bflush;
      var prev;
      var scan, strend;
      var _win = s.window;
      for (; ; ) {
        if (s.lookahead <= MAX_MATCH) {
          fill_window(s);
          if (s.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        s.match_length = 0;
        if (s.lookahead >= MIN_MATCH && s.strstart > 0) {
          scan = s.strstart - 1;
          prev = _win[scan];
          if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
            strend = s.strstart + MAX_MATCH;
            do {
            } while (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && scan < strend);
            s.match_length = MAX_MATCH - (strend - scan);
            if (s.match_length > s.lookahead) {
              s.match_length = s.lookahead;
            }
          }
        }
        if (s.match_length >= MIN_MATCH) {
          bflush = trees._tr_tally(s, 1, s.match_length - MIN_MATCH);
          s.lookahead -= s.match_length;
          s.strstart += s.match_length;
          s.match_length = 0;
        } else {
          bflush = trees._tr_tally(s, 0, s.window[s.strstart]);
          s.lookahead--;
          s.strstart++;
        }
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = 0;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function deflate_huff(s, flush) {
      var bflush;
      for (; ; ) {
        if (s.lookahead === 0) {
          fill_window(s);
          if (s.lookahead === 0) {
            if (flush === Z_NO_FLUSH) {
              return BS_NEED_MORE;
            }
            break;
          }
        }
        s.match_length = 0;
        bflush = trees._tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = 0;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function Config(good_length, max_lazy, nice_length, max_chain, func) {
      this.good_length = good_length;
      this.max_lazy = max_lazy;
      this.nice_length = nice_length;
      this.max_chain = max_chain;
      this.func = func;
    }
    var configuration_table;
    configuration_table = [
      /*      good lazy nice chain */
      new Config(0, 0, 0, 0, deflate_stored),
      /* 0 store only */
      new Config(4, 4, 8, 4, deflate_fast),
      /* 1 max speed, no lazy matches */
      new Config(4, 5, 16, 8, deflate_fast),
      /* 2 */
      new Config(4, 6, 32, 32, deflate_fast),
      /* 3 */
      new Config(4, 4, 16, 16, deflate_slow),
      /* 4 lazy matches */
      new Config(8, 16, 32, 32, deflate_slow),
      /* 5 */
      new Config(8, 16, 128, 128, deflate_slow),
      /* 6 */
      new Config(8, 32, 128, 256, deflate_slow),
      /* 7 */
      new Config(32, 128, 258, 1024, deflate_slow),
      /* 8 */
      new Config(32, 258, 258, 4096, deflate_slow)
      /* 9 max compression */
    ];
    function lm_init(s) {
      s.window_size = 2 * s.w_size;
      zero(s.head);
      s.max_lazy_match = configuration_table[s.level].max_lazy;
      s.good_match = configuration_table[s.level].good_length;
      s.nice_match = configuration_table[s.level].nice_length;
      s.max_chain_length = configuration_table[s.level].max_chain;
      s.strstart = 0;
      s.block_start = 0;
      s.lookahead = 0;
      s.insert = 0;
      s.match_length = s.prev_length = MIN_MATCH - 1;
      s.match_available = 0;
      s.ins_h = 0;
    }
    function DeflateState() {
      this.strm = null;
      this.status = 0;
      this.pending_buf = null;
      this.pending_buf_size = 0;
      this.pending_out = 0;
      this.pending = 0;
      this.wrap = 0;
      this.gzhead = null;
      this.gzindex = 0;
      this.method = Z_DEFLATED;
      this.last_flush = -1;
      this.w_size = 0;
      this.w_bits = 0;
      this.w_mask = 0;
      this.window = null;
      this.window_size = 0;
      this.prev = null;
      this.head = null;
      this.ins_h = 0;
      this.hash_size = 0;
      this.hash_bits = 0;
      this.hash_mask = 0;
      this.hash_shift = 0;
      this.block_start = 0;
      this.match_length = 0;
      this.prev_match = 0;
      this.match_available = 0;
      this.strstart = 0;
      this.match_start = 0;
      this.lookahead = 0;
      this.prev_length = 0;
      this.max_chain_length = 0;
      this.max_lazy_match = 0;
      this.level = 0;
      this.strategy = 0;
      this.good_match = 0;
      this.nice_match = 0;
      this.dyn_ltree = new utils.Buf16(HEAP_SIZE * 2);
      this.dyn_dtree = new utils.Buf16((2 * D_CODES + 1) * 2);
      this.bl_tree = new utils.Buf16((2 * BL_CODES + 1) * 2);
      zero(this.dyn_ltree);
      zero(this.dyn_dtree);
      zero(this.bl_tree);
      this.l_desc = null;
      this.d_desc = null;
      this.bl_desc = null;
      this.bl_count = new utils.Buf16(MAX_BITS + 1);
      this.heap = new utils.Buf16(2 * L_CODES + 1);
      zero(this.heap);
      this.heap_len = 0;
      this.heap_max = 0;
      this.depth = new utils.Buf16(2 * L_CODES + 1);
      zero(this.depth);
      this.l_buf = 0;
      this.lit_bufsize = 0;
      this.last_lit = 0;
      this.d_buf = 0;
      this.opt_len = 0;
      this.static_len = 0;
      this.matches = 0;
      this.insert = 0;
      this.bi_buf = 0;
      this.bi_valid = 0;
    }
    function deflateResetKeep(strm) {
      var s;
      if (!strm || !strm.state) {
        return err(strm, Z_STREAM_ERROR);
      }
      strm.total_in = strm.total_out = 0;
      strm.data_type = Z_UNKNOWN;
      s = strm.state;
      s.pending = 0;
      s.pending_out = 0;
      if (s.wrap < 0) {
        s.wrap = -s.wrap;
      }
      s.status = s.wrap ? INIT_STATE : BUSY_STATE;
      strm.adler = s.wrap === 2 ? 0 : 1;
      s.last_flush = Z_NO_FLUSH;
      trees._tr_init(s);
      return Z_OK;
    }
    function deflateReset(strm) {
      var ret = deflateResetKeep(strm);
      if (ret === Z_OK) {
        lm_init(strm.state);
      }
      return ret;
    }
    function deflateSetHeader(strm, head) {
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      if (strm.state.wrap !== 2) {
        return Z_STREAM_ERROR;
      }
      strm.state.gzhead = head;
      return Z_OK;
    }
    function deflateInit2(strm, level, method, windowBits, memLevel, strategy) {
      if (!strm) {
        return Z_STREAM_ERROR;
      }
      var wrap = 1;
      if (level === Z_DEFAULT_COMPRESSION) {
        level = 6;
      }
      if (windowBits < 0) {
        wrap = 0;
        windowBits = -windowBits;
      } else if (windowBits > 15) {
        wrap = 2;
        windowBits -= 16;
      }
      if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > Z_FIXED) {
        return err(strm, Z_STREAM_ERROR);
      }
      if (windowBits === 8) {
        windowBits = 9;
      }
      var s = new DeflateState();
      strm.state = s;
      s.strm = strm;
      s.wrap = wrap;
      s.gzhead = null;
      s.w_bits = windowBits;
      s.w_size = 1 << s.w_bits;
      s.w_mask = s.w_size - 1;
      s.hash_bits = memLevel + 7;
      s.hash_size = 1 << s.hash_bits;
      s.hash_mask = s.hash_size - 1;
      s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH);
      s.window = new utils.Buf8(s.w_size * 2);
      s.head = new utils.Buf16(s.hash_size);
      s.prev = new utils.Buf16(s.w_size);
      s.lit_bufsize = 1 << memLevel + 6;
      s.pending_buf_size = s.lit_bufsize * 4;
      s.pending_buf = new utils.Buf8(s.pending_buf_size);
      s.d_buf = 1 * s.lit_bufsize;
      s.l_buf = (1 + 2) * s.lit_bufsize;
      s.level = level;
      s.strategy = strategy;
      s.method = method;
      return deflateReset(strm);
    }
    function deflateInit(strm, level) {
      return deflateInit2(strm, level, Z_DEFLATED, MAX_WBITS, DEF_MEM_LEVEL, Z_DEFAULT_STRATEGY);
    }
    function deflate(strm, flush) {
      var old_flush, s;
      var beg, val;
      if (!strm || !strm.state || flush > Z_BLOCK || flush < 0) {
        return strm ? err(strm, Z_STREAM_ERROR) : Z_STREAM_ERROR;
      }
      s = strm.state;
      if (!strm.output || !strm.input && strm.avail_in !== 0 || s.status === FINISH_STATE && flush !== Z_FINISH) {
        return err(strm, strm.avail_out === 0 ? Z_BUF_ERROR : Z_STREAM_ERROR);
      }
      s.strm = strm;
      old_flush = s.last_flush;
      s.last_flush = flush;
      if (s.status === INIT_STATE) {
        if (s.wrap === 2) {
          strm.adler = 0;
          put_byte(s, 31);
          put_byte(s, 139);
          put_byte(s, 8);
          if (!s.gzhead) {
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
            put_byte(s, OS_CODE);
            s.status = BUSY_STATE;
          } else {
            put_byte(
              s,
              (s.gzhead.text ? 1 : 0) + (s.gzhead.hcrc ? 2 : 0) + (!s.gzhead.extra ? 0 : 4) + (!s.gzhead.name ? 0 : 8) + (!s.gzhead.comment ? 0 : 16)
            );
            put_byte(s, s.gzhead.time & 255);
            put_byte(s, s.gzhead.time >> 8 & 255);
            put_byte(s, s.gzhead.time >> 16 & 255);
            put_byte(s, s.gzhead.time >> 24 & 255);
            put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
            put_byte(s, s.gzhead.os & 255);
            if (s.gzhead.extra && s.gzhead.extra.length) {
              put_byte(s, s.gzhead.extra.length & 255);
              put_byte(s, s.gzhead.extra.length >> 8 & 255);
            }
            if (s.gzhead.hcrc) {
              strm.adler = crc32(strm.adler, s.pending_buf, s.pending, 0);
            }
            s.gzindex = 0;
            s.status = EXTRA_STATE;
          }
        } else {
          var header = Z_DEFLATED + (s.w_bits - 8 << 4) << 8;
          var level_flags = -1;
          if (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2) {
            level_flags = 0;
          } else if (s.level < 6) {
            level_flags = 1;
          } else if (s.level === 6) {
            level_flags = 2;
          } else {
            level_flags = 3;
          }
          header |= level_flags << 6;
          if (s.strstart !== 0) {
            header |= PRESET_DICT;
          }
          header += 31 - header % 31;
          s.status = BUSY_STATE;
          putShortMSB(s, header);
          if (s.strstart !== 0) {
            putShortMSB(s, strm.adler >>> 16);
            putShortMSB(s, strm.adler & 65535);
          }
          strm.adler = 1;
        }
      }
      if (s.status === EXTRA_STATE) {
        if (s.gzhead.extra) {
          beg = s.pending;
          while (s.gzindex < (s.gzhead.extra.length & 65535)) {
            if (s.pending === s.pending_buf_size) {
              if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
              }
              flush_pending(strm);
              beg = s.pending;
              if (s.pending === s.pending_buf_size) {
                break;
              }
            }
            put_byte(s, s.gzhead.extra[s.gzindex] & 255);
            s.gzindex++;
          }
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          if (s.gzindex === s.gzhead.extra.length) {
            s.gzindex = 0;
            s.status = NAME_STATE;
          }
        } else {
          s.status = NAME_STATE;
        }
      }
      if (s.status === NAME_STATE) {
        if (s.gzhead.name) {
          beg = s.pending;
          do {
            if (s.pending === s.pending_buf_size) {
              if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
              }
              flush_pending(strm);
              beg = s.pending;
              if (s.pending === s.pending_buf_size) {
                val = 1;
                break;
              }
            }
            if (s.gzindex < s.gzhead.name.length) {
              val = s.gzhead.name.charCodeAt(s.gzindex++) & 255;
            } else {
              val = 0;
            }
            put_byte(s, val);
          } while (val !== 0);
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          if (val === 0) {
            s.gzindex = 0;
            s.status = COMMENT_STATE;
          }
        } else {
          s.status = COMMENT_STATE;
        }
      }
      if (s.status === COMMENT_STATE) {
        if (s.gzhead.comment) {
          beg = s.pending;
          do {
            if (s.pending === s.pending_buf_size) {
              if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
              }
              flush_pending(strm);
              beg = s.pending;
              if (s.pending === s.pending_buf_size) {
                val = 1;
                break;
              }
            }
            if (s.gzindex < s.gzhead.comment.length) {
              val = s.gzhead.comment.charCodeAt(s.gzindex++) & 255;
            } else {
              val = 0;
            }
            put_byte(s, val);
          } while (val !== 0);
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          if (val === 0) {
            s.status = HCRC_STATE;
          }
        } else {
          s.status = HCRC_STATE;
        }
      }
      if (s.status === HCRC_STATE) {
        if (s.gzhead.hcrc) {
          if (s.pending + 2 > s.pending_buf_size) {
            flush_pending(strm);
          }
          if (s.pending + 2 <= s.pending_buf_size) {
            put_byte(s, strm.adler & 255);
            put_byte(s, strm.adler >> 8 & 255);
            strm.adler = 0;
            s.status = BUSY_STATE;
          }
        } else {
          s.status = BUSY_STATE;
        }
      }
      if (s.pending !== 0) {
        flush_pending(strm);
        if (strm.avail_out === 0) {
          s.last_flush = -1;
          return Z_OK;
        }
      } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== Z_FINISH) {
        return err(strm, Z_BUF_ERROR);
      }
      if (s.status === FINISH_STATE && strm.avail_in !== 0) {
        return err(strm, Z_BUF_ERROR);
      }
      if (strm.avail_in !== 0 || s.lookahead !== 0 || flush !== Z_NO_FLUSH && s.status !== FINISH_STATE) {
        var bstate = s.strategy === Z_HUFFMAN_ONLY ? deflate_huff(s, flush) : s.strategy === Z_RLE ? deflate_rle(s, flush) : configuration_table[s.level].func(s, flush);
        if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
          s.status = FINISH_STATE;
        }
        if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
          if (strm.avail_out === 0) {
            s.last_flush = -1;
          }
          return Z_OK;
        }
        if (bstate === BS_BLOCK_DONE) {
          if (flush === Z_PARTIAL_FLUSH) {
            trees._tr_align(s);
          } else if (flush !== Z_BLOCK) {
            trees._tr_stored_block(s, 0, 0, false);
            if (flush === Z_FULL_FLUSH) {
              zero(s.head);
              if (s.lookahead === 0) {
                s.strstart = 0;
                s.block_start = 0;
                s.insert = 0;
              }
            }
          }
          flush_pending(strm);
          if (strm.avail_out === 0) {
            s.last_flush = -1;
            return Z_OK;
          }
        }
      }
      if (flush !== Z_FINISH) {
        return Z_OK;
      }
      if (s.wrap <= 0) {
        return Z_STREAM_END;
      }
      if (s.wrap === 2) {
        put_byte(s, strm.adler & 255);
        put_byte(s, strm.adler >> 8 & 255);
        put_byte(s, strm.adler >> 16 & 255);
        put_byte(s, strm.adler >> 24 & 255);
        put_byte(s, strm.total_in & 255);
        put_byte(s, strm.total_in >> 8 & 255);
        put_byte(s, strm.total_in >> 16 & 255);
        put_byte(s, strm.total_in >> 24 & 255);
      } else {
        putShortMSB(s, strm.adler >>> 16);
        putShortMSB(s, strm.adler & 65535);
      }
      flush_pending(strm);
      if (s.wrap > 0) {
        s.wrap = -s.wrap;
      }
      return s.pending !== 0 ? Z_OK : Z_STREAM_END;
    }
    function deflateEnd(strm) {
      var status;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      status = strm.state.status;
      if (status !== INIT_STATE && status !== EXTRA_STATE && status !== NAME_STATE && status !== COMMENT_STATE && status !== HCRC_STATE && status !== BUSY_STATE && status !== FINISH_STATE) {
        return err(strm, Z_STREAM_ERROR);
      }
      strm.state = null;
      return status === BUSY_STATE ? err(strm, Z_DATA_ERROR) : Z_OK;
    }
    function deflateSetDictionary(strm, dictionary) {
      var dictLength = dictionary.length;
      var s;
      var str, n;
      var wrap;
      var avail;
      var next;
      var input;
      var tmpDict;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      s = strm.state;
      wrap = s.wrap;
      if (wrap === 2 || wrap === 1 && s.status !== INIT_STATE || s.lookahead) {
        return Z_STREAM_ERROR;
      }
      if (wrap === 1) {
        strm.adler = adler32(strm.adler, dictionary, dictLength, 0);
      }
      s.wrap = 0;
      if (dictLength >= s.w_size) {
        if (wrap === 0) {
          zero(s.head);
          s.strstart = 0;
          s.block_start = 0;
          s.insert = 0;
        }
        tmpDict = new utils.Buf8(s.w_size);
        utils.arraySet(tmpDict, dictionary, dictLength - s.w_size, s.w_size, 0);
        dictionary = tmpDict;
        dictLength = s.w_size;
      }
      avail = strm.avail_in;
      next = strm.next_in;
      input = strm.input;
      strm.avail_in = dictLength;
      strm.next_in = 0;
      strm.input = dictionary;
      fill_window(s);
      while (s.lookahead >= MIN_MATCH) {
        str = s.strstart;
        n = s.lookahead - (MIN_MATCH - 1);
        do {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;
          s.prev[str & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = str;
          str++;
        } while (--n);
        s.strstart = str;
        s.lookahead = MIN_MATCH - 1;
        fill_window(s);
      }
      s.strstart += s.lookahead;
      s.block_start = s.strstart;
      s.insert = s.lookahead;
      s.lookahead = 0;
      s.match_length = s.prev_length = MIN_MATCH - 1;
      s.match_available = 0;
      strm.next_in = next;
      strm.input = input;
      strm.avail_in = avail;
      s.wrap = wrap;
      return Z_OK;
    }
    exports.deflateInit = deflateInit;
    exports.deflateInit2 = deflateInit2;
    exports.deflateReset = deflateReset;
    exports.deflateResetKeep = deflateResetKeep;
    exports.deflateSetHeader = deflateSetHeader;
    exports.deflate = deflate;
    exports.deflateEnd = deflateEnd;
    exports.deflateSetDictionary = deflateSetDictionary;
    exports.deflateInfo = "pako deflate (from Nodeca project)";
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/utils/strings.js
var require_strings = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/utils/strings.js"(exports) {
    var utils = require_common();
    var STR_APPLY_OK = true;
    var STR_APPLY_UIA_OK = true;
    try {
      String.fromCharCode.apply(null, [0]);
    } catch (__) {
      STR_APPLY_OK = false;
    }
    try {
      String.fromCharCode.apply(null, new Uint8Array(1));
    } catch (__) {
      STR_APPLY_UIA_OK = false;
    }
    var _utf8len = new utils.Buf8(256);
    for (q = 0; q < 256; q++) {
      _utf8len[q] = q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1;
    }
    var q;
    _utf8len[254] = _utf8len[254] = 1;
    exports.string2buf = function(str) {
      var buf, c, c2, m_pos, i, str_len = str.length, buf_len = 0;
      for (m_pos = 0; m_pos < str_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
          c2 = str.charCodeAt(m_pos + 1);
          if ((c2 & 64512) === 56320) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            m_pos++;
          }
        }
        buf_len += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
      }
      buf = new utils.Buf8(buf_len);
      for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
          c2 = str.charCodeAt(m_pos + 1);
          if ((c2 & 64512) === 56320) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            m_pos++;
          }
        }
        if (c < 128) {
          buf[i++] = c;
        } else if (c < 2048) {
          buf[i++] = 192 | c >>> 6;
          buf[i++] = 128 | c & 63;
        } else if (c < 65536) {
          buf[i++] = 224 | c >>> 12;
          buf[i++] = 128 | c >>> 6 & 63;
          buf[i++] = 128 | c & 63;
        } else {
          buf[i++] = 240 | c >>> 18;
          buf[i++] = 128 | c >>> 12 & 63;
          buf[i++] = 128 | c >>> 6 & 63;
          buf[i++] = 128 | c & 63;
        }
      }
      return buf;
    };
    function buf2binstring(buf, len) {
      if (len < 65534) {
        if (buf.subarray && STR_APPLY_UIA_OK || !buf.subarray && STR_APPLY_OK) {
          return String.fromCharCode.apply(null, utils.shrinkBuf(buf, len));
        }
      }
      var result = "";
      for (var i = 0; i < len; i++) {
        result += String.fromCharCode(buf[i]);
      }
      return result;
    }
    exports.buf2binstring = function(buf) {
      return buf2binstring(buf, buf.length);
    };
    exports.binstring2buf = function(str) {
      var buf = new utils.Buf8(str.length);
      for (var i = 0, len = buf.length; i < len; i++) {
        buf[i] = str.charCodeAt(i);
      }
      return buf;
    };
    exports.buf2string = function(buf, max) {
      var i, out, c, c_len;
      var len = max || buf.length;
      var utf16buf = new Array(len * 2);
      for (out = 0, i = 0; i < len; ) {
        c = buf[i++];
        if (c < 128) {
          utf16buf[out++] = c;
          continue;
        }
        c_len = _utf8len[c];
        if (c_len > 4) {
          utf16buf[out++] = 65533;
          i += c_len - 1;
          continue;
        }
        c &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
        while (c_len > 1 && i < len) {
          c = c << 6 | buf[i++] & 63;
          c_len--;
        }
        if (c_len > 1) {
          utf16buf[out++] = 65533;
          continue;
        }
        if (c < 65536) {
          utf16buf[out++] = c;
        } else {
          c -= 65536;
          utf16buf[out++] = 55296 | c >> 10 & 1023;
          utf16buf[out++] = 56320 | c & 1023;
        }
      }
      return buf2binstring(utf16buf, out);
    };
    exports.utf8border = function(buf, max) {
      var pos;
      max = max || buf.length;
      if (max > buf.length) {
        max = buf.length;
      }
      pos = max - 1;
      while (pos >= 0 && (buf[pos] & 192) === 128) {
        pos--;
      }
      if (pos < 0) {
        return max;
      }
      if (pos === 0) {
        return max;
      }
      return pos + _utf8len[buf[pos]] > max ? pos : max;
    };
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/zstream.js
var require_zstream = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/zstream.js"(exports, module) {
    function ZStream() {
      this.input = null;
      this.next_in = 0;
      this.avail_in = 0;
      this.total_in = 0;
      this.output = null;
      this.next_out = 0;
      this.avail_out = 0;
      this.total_out = 0;
      this.msg = "";
      this.state = null;
      this.data_type = 2;
      this.adler = 0;
    }
    module.exports = ZStream;
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/deflate.js
var require_deflate2 = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/deflate.js"(exports) {
    var zlib_deflate = require_deflate();
    var utils = require_common();
    var strings = require_strings();
    var msg = require_messages();
    var ZStream = require_zstream();
    var toString = Object.prototype.toString;
    var Z_NO_FLUSH = 0;
    var Z_FINISH = 4;
    var Z_OK = 0;
    var Z_STREAM_END = 1;
    var Z_SYNC_FLUSH = 2;
    var Z_DEFAULT_COMPRESSION = -1;
    var Z_DEFAULT_STRATEGY = 0;
    var Z_DEFLATED = 8;
    function Deflate(options) {
      if (!(this instanceof Deflate)) return new Deflate(options);
      this.options = utils.assign({
        level: Z_DEFAULT_COMPRESSION,
        method: Z_DEFLATED,
        chunkSize: 16384,
        windowBits: 15,
        memLevel: 8,
        strategy: Z_DEFAULT_STRATEGY,
        to: ""
      }, options || {});
      var opt = this.options;
      if (opt.raw && opt.windowBits > 0) {
        opt.windowBits = -opt.windowBits;
      } else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) {
        opt.windowBits += 16;
      }
      this.err = 0;
      this.msg = "";
      this.ended = false;
      this.chunks = [];
      this.strm = new ZStream();
      this.strm.avail_out = 0;
      var status = zlib_deflate.deflateInit2(
        this.strm,
        opt.level,
        opt.method,
        opt.windowBits,
        opt.memLevel,
        opt.strategy
      );
      if (status !== Z_OK) {
        throw new Error(msg[status]);
      }
      if (opt.header) {
        zlib_deflate.deflateSetHeader(this.strm, opt.header);
      }
      if (opt.dictionary) {
        var dict;
        if (typeof opt.dictionary === "string") {
          dict = strings.string2buf(opt.dictionary);
        } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
          dict = new Uint8Array(opt.dictionary);
        } else {
          dict = opt.dictionary;
        }
        status = zlib_deflate.deflateSetDictionary(this.strm, dict);
        if (status !== Z_OK) {
          throw new Error(msg[status]);
        }
        this._dict_set = true;
      }
    }
    Deflate.prototype.push = function(data, mode) {
      var strm = this.strm;
      var chunkSize = this.options.chunkSize;
      var status, _mode;
      if (this.ended) {
        return false;
      }
      _mode = mode === ~~mode ? mode : mode === true ? Z_FINISH : Z_NO_FLUSH;
      if (typeof data === "string") {
        strm.input = strings.string2buf(data);
      } else if (toString.call(data) === "[object ArrayBuffer]") {
        strm.input = new Uint8Array(data);
      } else {
        strm.input = data;
      }
      strm.next_in = 0;
      strm.avail_in = strm.input.length;
      do {
        if (strm.avail_out === 0) {
          strm.output = new utils.Buf8(chunkSize);
          strm.next_out = 0;
          strm.avail_out = chunkSize;
        }
        status = zlib_deflate.deflate(strm, _mode);
        if (status !== Z_STREAM_END && status !== Z_OK) {
          this.onEnd(status);
          this.ended = true;
          return false;
        }
        if (strm.avail_out === 0 || strm.avail_in === 0 && (_mode === Z_FINISH || _mode === Z_SYNC_FLUSH)) {
          if (this.options.to === "string") {
            this.onData(strings.buf2binstring(utils.shrinkBuf(strm.output, strm.next_out)));
          } else {
            this.onData(utils.shrinkBuf(strm.output, strm.next_out));
          }
        }
      } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== Z_STREAM_END);
      if (_mode === Z_FINISH) {
        status = zlib_deflate.deflateEnd(this.strm);
        this.onEnd(status);
        this.ended = true;
        return status === Z_OK;
      }
      if (_mode === Z_SYNC_FLUSH) {
        this.onEnd(Z_OK);
        strm.avail_out = 0;
        return true;
      }
      return true;
    };
    Deflate.prototype.onData = function(chunk) {
      this.chunks.push(chunk);
    };
    Deflate.prototype.onEnd = function(status) {
      if (status === Z_OK) {
        if (this.options.to === "string") {
          this.result = this.chunks.join("");
        } else {
          this.result = utils.flattenChunks(this.chunks);
        }
      }
      this.chunks = [];
      this.err = status;
      this.msg = this.strm.msg;
    };
    function deflate(input, options) {
      var deflator = new Deflate(options);
      deflator.push(input, true);
      if (deflator.err) {
        throw deflator.msg || msg[deflator.err];
      }
      return deflator.result;
    }
    function deflateRaw(input, options) {
      options = options || {};
      options.raw = true;
      return deflate(input, options);
    }
    function gzip(input, options) {
      options = options || {};
      options.gzip = true;
      return deflate(input, options);
    }
    exports.Deflate = Deflate;
    exports.deflate = deflate;
    exports.deflateRaw = deflateRaw;
    exports.gzip = gzip;
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/inffast.js
var require_inffast = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/inffast.js"(exports, module) {
    var BAD = 30;
    var TYPE = 12;
    module.exports = function inflate_fast(strm, start) {
      var state;
      var _in;
      var last;
      var _out;
      var beg;
      var end;
      var dmax;
      var wsize;
      var whave;
      var wnext;
      var s_window;
      var hold;
      var bits;
      var lcode;
      var dcode;
      var lmask;
      var dmask;
      var here;
      var op;
      var len;
      var dist;
      var from;
      var from_source;
      var input, output;
      state = strm.state;
      _in = strm.next_in;
      input = strm.input;
      last = _in + (strm.avail_in - 5);
      _out = strm.next_out;
      output = strm.output;
      beg = _out - (start - strm.avail_out);
      end = _out + (strm.avail_out - 257);
      dmax = state.dmax;
      wsize = state.wsize;
      whave = state.whave;
      wnext = state.wnext;
      s_window = state.window;
      hold = state.hold;
      bits = state.bits;
      lcode = state.lencode;
      dcode = state.distcode;
      lmask = (1 << state.lenbits) - 1;
      dmask = (1 << state.distbits) - 1;
      top:
        do {
          if (bits < 15) {
            hold += input[_in++] << bits;
            bits += 8;
            hold += input[_in++] << bits;
            bits += 8;
          }
          here = lcode[hold & lmask];
          dolen:
            for (; ; ) {
              op = here >>> 24;
              hold >>>= op;
              bits -= op;
              op = here >>> 16 & 255;
              if (op === 0) {
                output[_out++] = here & 65535;
              } else if (op & 16) {
                len = here & 65535;
                op &= 15;
                if (op) {
                  if (bits < op) {
                    hold += input[_in++] << bits;
                    bits += 8;
                  }
                  len += hold & (1 << op) - 1;
                  hold >>>= op;
                  bits -= op;
                }
                if (bits < 15) {
                  hold += input[_in++] << bits;
                  bits += 8;
                  hold += input[_in++] << bits;
                  bits += 8;
                }
                here = dcode[hold & dmask];
                dodist:
                  for (; ; ) {
                    op = here >>> 24;
                    hold >>>= op;
                    bits -= op;
                    op = here >>> 16 & 255;
                    if (op & 16) {
                      dist = here & 65535;
                      op &= 15;
                      if (bits < op) {
                        hold += input[_in++] << bits;
                        bits += 8;
                        if (bits < op) {
                          hold += input[_in++] << bits;
                          bits += 8;
                        }
                      }
                      dist += hold & (1 << op) - 1;
                      if (dist > dmax) {
                        strm.msg = "invalid distance too far back";
                        state.mode = BAD;
                        break top;
                      }
                      hold >>>= op;
                      bits -= op;
                      op = _out - beg;
                      if (dist > op) {
                        op = dist - op;
                        if (op > whave) {
                          if (state.sane) {
                            strm.msg = "invalid distance too far back";
                            state.mode = BAD;
                            break top;
                          }
                        }
                        from = 0;
                        from_source = s_window;
                        if (wnext === 0) {
                          from += wsize - op;
                          if (op < len) {
                            len -= op;
                            do {
                              output[_out++] = s_window[from++];
                            } while (--op);
                            from = _out - dist;
                            from_source = output;
                          }
                        } else if (wnext < op) {
                          from += wsize + wnext - op;
                          op -= wnext;
                          if (op < len) {
                            len -= op;
                            do {
                              output[_out++] = s_window[from++];
                            } while (--op);
                            from = 0;
                            if (wnext < len) {
                              op = wnext;
                              len -= op;
                              do {
                                output[_out++] = s_window[from++];
                              } while (--op);
                              from = _out - dist;
                              from_source = output;
                            }
                          }
                        } else {
                          from += wnext - op;
                          if (op < len) {
                            len -= op;
                            do {
                              output[_out++] = s_window[from++];
                            } while (--op);
                            from = _out - dist;
                            from_source = output;
                          }
                        }
                        while (len > 2) {
                          output[_out++] = from_source[from++];
                          output[_out++] = from_source[from++];
                          output[_out++] = from_source[from++];
                          len -= 3;
                        }
                        if (len) {
                          output[_out++] = from_source[from++];
                          if (len > 1) {
                            output[_out++] = from_source[from++];
                          }
                        }
                      } else {
                        from = _out - dist;
                        do {
                          output[_out++] = output[from++];
                          output[_out++] = output[from++];
                          output[_out++] = output[from++];
                          len -= 3;
                        } while (len > 2);
                        if (len) {
                          output[_out++] = output[from++];
                          if (len > 1) {
                            output[_out++] = output[from++];
                          }
                        }
                      }
                    } else if ((op & 64) === 0) {
                      here = dcode[(here & 65535) + (hold & (1 << op) - 1)];
                      continue dodist;
                    } else {
                      strm.msg = "invalid distance code";
                      state.mode = BAD;
                      break top;
                    }
                    break;
                  }
              } else if ((op & 64) === 0) {
                here = lcode[(here & 65535) + (hold & (1 << op) - 1)];
                continue dolen;
              } else if (op & 32) {
                state.mode = TYPE;
                break top;
              } else {
                strm.msg = "invalid literal/length code";
                state.mode = BAD;
                break top;
              }
              break;
            }
        } while (_in < last && _out < end);
      len = bits >> 3;
      _in -= len;
      bits -= len << 3;
      hold &= (1 << bits) - 1;
      strm.next_in = _in;
      strm.next_out = _out;
      strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
      strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end);
      state.hold = hold;
      state.bits = bits;
      return;
    };
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/inftrees.js
var require_inftrees = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/inftrees.js"(exports, module) {
    var utils = require_common();
    var MAXBITS = 15;
    var ENOUGH_LENS = 852;
    var ENOUGH_DISTS = 592;
    var CODES = 0;
    var LENS = 1;
    var DISTS = 2;
    var lbase = [
      /* Length codes 257..285 base */
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      13,
      15,
      17,
      19,
      23,
      27,
      31,
      35,
      43,
      51,
      59,
      67,
      83,
      99,
      115,
      131,
      163,
      195,
      227,
      258,
      0,
      0
    ];
    var lext = [
      /* Length codes 257..285 extra */
      16,
      16,
      16,
      16,
      16,
      16,
      16,
      16,
      17,
      17,
      17,
      17,
      18,
      18,
      18,
      18,
      19,
      19,
      19,
      19,
      20,
      20,
      20,
      20,
      21,
      21,
      21,
      21,
      16,
      72,
      78
    ];
    var dbase = [
      /* Distance codes 0..29 base */
      1,
      2,
      3,
      4,
      5,
      7,
      9,
      13,
      17,
      25,
      33,
      49,
      65,
      97,
      129,
      193,
      257,
      385,
      513,
      769,
      1025,
      1537,
      2049,
      3073,
      4097,
      6145,
      8193,
      12289,
      16385,
      24577,
      0,
      0
    ];
    var dext = [
      /* Distance codes 0..29 extra */
      16,
      16,
      16,
      16,
      17,
      17,
      18,
      18,
      19,
      19,
      20,
      20,
      21,
      21,
      22,
      22,
      23,
      23,
      24,
      24,
      25,
      25,
      26,
      26,
      27,
      27,
      28,
      28,
      29,
      29,
      64,
      64
    ];
    module.exports = function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts) {
      var bits = opts.bits;
      var len = 0;
      var sym = 0;
      var min = 0, max = 0;
      var root = 0;
      var curr = 0;
      var drop = 0;
      var left = 0;
      var used = 0;
      var huff = 0;
      var incr;
      var fill;
      var low;
      var mask;
      var next;
      var base = null;
      var base_index = 0;
      var end;
      var count = new utils.Buf16(MAXBITS + 1);
      var offs = new utils.Buf16(MAXBITS + 1);
      var extra = null;
      var extra_index = 0;
      var here_bits, here_op, here_val;
      for (len = 0; len <= MAXBITS; len++) {
        count[len] = 0;
      }
      for (sym = 0; sym < codes; sym++) {
        count[lens[lens_index + sym]]++;
      }
      root = bits;
      for (max = MAXBITS; max >= 1; max--) {
        if (count[max] !== 0) {
          break;
        }
      }
      if (root > max) {
        root = max;
      }
      if (max === 0) {
        table[table_index++] = 1 << 24 | 64 << 16 | 0;
        table[table_index++] = 1 << 24 | 64 << 16 | 0;
        opts.bits = 1;
        return 0;
      }
      for (min = 1; min < max; min++) {
        if (count[min] !== 0) {
          break;
        }
      }
      if (root < min) {
        root = min;
      }
      left = 1;
      for (len = 1; len <= MAXBITS; len++) {
        left <<= 1;
        left -= count[len];
        if (left < 0) {
          return -1;
        }
      }
      if (left > 0 && (type === CODES || max !== 1)) {
        return -1;
      }
      offs[1] = 0;
      for (len = 1; len < MAXBITS; len++) {
        offs[len + 1] = offs[len] + count[len];
      }
      for (sym = 0; sym < codes; sym++) {
        if (lens[lens_index + sym] !== 0) {
          work[offs[lens[lens_index + sym]]++] = sym;
        }
      }
      if (type === CODES) {
        base = extra = work;
        end = 19;
      } else if (type === LENS) {
        base = lbase;
        base_index -= 257;
        extra = lext;
        extra_index -= 257;
        end = 256;
      } else {
        base = dbase;
        extra = dext;
        end = -1;
      }
      huff = 0;
      sym = 0;
      len = min;
      next = table_index;
      curr = root;
      drop = 0;
      low = -1;
      used = 1 << root;
      mask = used - 1;
      if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
        return 1;
      }
      for (; ; ) {
        here_bits = len - drop;
        if (work[sym] < end) {
          here_op = 0;
          here_val = work[sym];
        } else if (work[sym] > end) {
          here_op = extra[extra_index + work[sym]];
          here_val = base[base_index + work[sym]];
        } else {
          here_op = 32 + 64;
          here_val = 0;
        }
        incr = 1 << len - drop;
        fill = 1 << curr;
        min = fill;
        do {
          fill -= incr;
          table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
        } while (fill !== 0);
        incr = 1 << len - 1;
        while (huff & incr) {
          incr >>= 1;
        }
        if (incr !== 0) {
          huff &= incr - 1;
          huff += incr;
        } else {
          huff = 0;
        }
        sym++;
        if (--count[len] === 0) {
          if (len === max) {
            break;
          }
          len = lens[lens_index + work[sym]];
        }
        if (len > root && (huff & mask) !== low) {
          if (drop === 0) {
            drop = root;
          }
          next += min;
          curr = len - drop;
          left = 1 << curr;
          while (curr + drop < max) {
            left -= count[curr + drop];
            if (left <= 0) {
              break;
            }
            curr++;
            left <<= 1;
          }
          used += 1 << curr;
          if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
            return 1;
          }
          low = huff & mask;
          table[low] = root << 24 | curr << 16 | next - table_index | 0;
        }
      }
      if (huff !== 0) {
        table[next + huff] = len - drop << 24 | 64 << 16 | 0;
      }
      opts.bits = root;
      return 0;
    };
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/inflate.js
var require_inflate = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/inflate.js"(exports) {
    var utils = require_common();
    var adler32 = require_adler32();
    var crc32 = require_crc322();
    var inflate_fast = require_inffast();
    var inflate_table = require_inftrees();
    var CODES = 0;
    var LENS = 1;
    var DISTS = 2;
    var Z_FINISH = 4;
    var Z_BLOCK = 5;
    var Z_TREES = 6;
    var Z_OK = 0;
    var Z_STREAM_END = 1;
    var Z_NEED_DICT = 2;
    var Z_STREAM_ERROR = -2;
    var Z_DATA_ERROR = -3;
    var Z_MEM_ERROR = -4;
    var Z_BUF_ERROR = -5;
    var Z_DEFLATED = 8;
    var HEAD = 1;
    var FLAGS = 2;
    var TIME = 3;
    var OS = 4;
    var EXLEN = 5;
    var EXTRA = 6;
    var NAME = 7;
    var COMMENT = 8;
    var HCRC = 9;
    var DICTID = 10;
    var DICT = 11;
    var TYPE = 12;
    var TYPEDO = 13;
    var STORED = 14;
    var COPY_ = 15;
    var COPY = 16;
    var TABLE = 17;
    var LENLENS = 18;
    var CODELENS = 19;
    var LEN_ = 20;
    var LEN = 21;
    var LENEXT = 22;
    var DIST = 23;
    var DISTEXT = 24;
    var MATCH = 25;
    var LIT = 26;
    var CHECK = 27;
    var LENGTH = 28;
    var DONE = 29;
    var BAD = 30;
    var MEM = 31;
    var SYNC = 32;
    var ENOUGH_LENS = 852;
    var ENOUGH_DISTS = 592;
    var MAX_WBITS = 15;
    var DEF_WBITS = MAX_WBITS;
    function zswap32(q) {
      return (q >>> 24 & 255) + (q >>> 8 & 65280) + ((q & 65280) << 8) + ((q & 255) << 24);
    }
    function InflateState() {
      this.mode = 0;
      this.last = false;
      this.wrap = 0;
      this.havedict = false;
      this.flags = 0;
      this.dmax = 0;
      this.check = 0;
      this.total = 0;
      this.head = null;
      this.wbits = 0;
      this.wsize = 0;
      this.whave = 0;
      this.wnext = 0;
      this.window = null;
      this.hold = 0;
      this.bits = 0;
      this.length = 0;
      this.offset = 0;
      this.extra = 0;
      this.lencode = null;
      this.distcode = null;
      this.lenbits = 0;
      this.distbits = 0;
      this.ncode = 0;
      this.nlen = 0;
      this.ndist = 0;
      this.have = 0;
      this.next = null;
      this.lens = new utils.Buf16(320);
      this.work = new utils.Buf16(288);
      this.lendyn = null;
      this.distdyn = null;
      this.sane = 0;
      this.back = 0;
      this.was = 0;
    }
    function inflateResetKeep(strm) {
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      strm.total_in = strm.total_out = state.total = 0;
      strm.msg = "";
      if (state.wrap) {
        strm.adler = state.wrap & 1;
      }
      state.mode = HEAD;
      state.last = 0;
      state.havedict = 0;
      state.dmax = 32768;
      state.head = null;
      state.hold = 0;
      state.bits = 0;
      state.lencode = state.lendyn = new utils.Buf32(ENOUGH_LENS);
      state.distcode = state.distdyn = new utils.Buf32(ENOUGH_DISTS);
      state.sane = 1;
      state.back = -1;
      return Z_OK;
    }
    function inflateReset(strm) {
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      state.wsize = 0;
      state.whave = 0;
      state.wnext = 0;
      return inflateResetKeep(strm);
    }
    function inflateReset2(strm, windowBits) {
      var wrap;
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if (windowBits < 0) {
        wrap = 0;
        windowBits = -windowBits;
      } else {
        wrap = (windowBits >> 4) + 1;
        if (windowBits < 48) {
          windowBits &= 15;
        }
      }
      if (windowBits && (windowBits < 8 || windowBits > 15)) {
        return Z_STREAM_ERROR;
      }
      if (state.window !== null && state.wbits !== windowBits) {
        state.window = null;
      }
      state.wrap = wrap;
      state.wbits = windowBits;
      return inflateReset(strm);
    }
    function inflateInit2(strm, windowBits) {
      var ret;
      var state;
      if (!strm) {
        return Z_STREAM_ERROR;
      }
      state = new InflateState();
      strm.state = state;
      state.window = null;
      ret = inflateReset2(strm, windowBits);
      if (ret !== Z_OK) {
        strm.state = null;
      }
      return ret;
    }
    function inflateInit(strm) {
      return inflateInit2(strm, DEF_WBITS);
    }
    var virgin = true;
    var lenfix;
    var distfix;
    function fixedtables(state) {
      if (virgin) {
        var sym;
        lenfix = new utils.Buf32(512);
        distfix = new utils.Buf32(32);
        sym = 0;
        while (sym < 144) {
          state.lens[sym++] = 8;
        }
        while (sym < 256) {
          state.lens[sym++] = 9;
        }
        while (sym < 280) {
          state.lens[sym++] = 7;
        }
        while (sym < 288) {
          state.lens[sym++] = 8;
        }
        inflate_table(LENS, state.lens, 0, 288, lenfix, 0, state.work, { bits: 9 });
        sym = 0;
        while (sym < 32) {
          state.lens[sym++] = 5;
        }
        inflate_table(DISTS, state.lens, 0, 32, distfix, 0, state.work, { bits: 5 });
        virgin = false;
      }
      state.lencode = lenfix;
      state.lenbits = 9;
      state.distcode = distfix;
      state.distbits = 5;
    }
    function updatewindow(strm, src, end, copy) {
      var dist;
      var state = strm.state;
      if (state.window === null) {
        state.wsize = 1 << state.wbits;
        state.wnext = 0;
        state.whave = 0;
        state.window = new utils.Buf8(state.wsize);
      }
      if (copy >= state.wsize) {
        utils.arraySet(state.window, src, end - state.wsize, state.wsize, 0);
        state.wnext = 0;
        state.whave = state.wsize;
      } else {
        dist = state.wsize - state.wnext;
        if (dist > copy) {
          dist = copy;
        }
        utils.arraySet(state.window, src, end - copy, dist, state.wnext);
        copy -= dist;
        if (copy) {
          utils.arraySet(state.window, src, end - copy, copy, 0);
          state.wnext = copy;
          state.whave = state.wsize;
        } else {
          state.wnext += dist;
          if (state.wnext === state.wsize) {
            state.wnext = 0;
          }
          if (state.whave < state.wsize) {
            state.whave += dist;
          }
        }
      }
      return 0;
    }
    function inflate(strm, flush) {
      var state;
      var input, output;
      var next;
      var put;
      var have, left;
      var hold;
      var bits;
      var _in, _out;
      var copy;
      var from;
      var from_source;
      var here = 0;
      var here_bits, here_op, here_val;
      var last_bits, last_op, last_val;
      var len;
      var ret;
      var hbuf = new utils.Buf8(4);
      var opts;
      var n;
      var order = (
        /* permutation of code lengths */
        [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
      );
      if (!strm || !strm.state || !strm.output || !strm.input && strm.avail_in !== 0) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if (state.mode === TYPE) {
        state.mode = TYPEDO;
      }
      put = strm.next_out;
      output = strm.output;
      left = strm.avail_out;
      next = strm.next_in;
      input = strm.input;
      have = strm.avail_in;
      hold = state.hold;
      bits = state.bits;
      _in = have;
      _out = left;
      ret = Z_OK;
      inf_leave:
        for (; ; ) {
          switch (state.mode) {
            case HEAD:
              if (state.wrap === 0) {
                state.mode = TYPEDO;
                break;
              }
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (state.wrap & 2 && hold === 35615) {
                state.check = 0;
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                state.check = crc32(state.check, hbuf, 2, 0);
                hold = 0;
                bits = 0;
                state.mode = FLAGS;
                break;
              }
              state.flags = 0;
              if (state.head) {
                state.head.done = false;
              }
              if (!(state.wrap & 1) || /* check if zlib header allowed */
              (((hold & 255) << 8) + (hold >> 8)) % 31) {
                strm.msg = "incorrect header check";
                state.mode = BAD;
                break;
              }
              if ((hold & 15) !== Z_DEFLATED) {
                strm.msg = "unknown compression method";
                state.mode = BAD;
                break;
              }
              hold >>>= 4;
              bits -= 4;
              len = (hold & 15) + 8;
              if (state.wbits === 0) {
                state.wbits = len;
              } else if (len > state.wbits) {
                strm.msg = "invalid window size";
                state.mode = BAD;
                break;
              }
              state.dmax = 1 << len;
              strm.adler = state.check = 1;
              state.mode = hold & 512 ? DICTID : TYPE;
              hold = 0;
              bits = 0;
              break;
            case FLAGS:
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.flags = hold;
              if ((state.flags & 255) !== Z_DEFLATED) {
                strm.msg = "unknown compression method";
                state.mode = BAD;
                break;
              }
              if (state.flags & 57344) {
                strm.msg = "unknown header flags set";
                state.mode = BAD;
                break;
              }
              if (state.head) {
                state.head.text = hold >> 8 & 1;
              }
              if (state.flags & 512) {
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                state.check = crc32(state.check, hbuf, 2, 0);
              }
              hold = 0;
              bits = 0;
              state.mode = TIME;
            /* falls through */
            case TIME:
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (state.head) {
                state.head.time = hold;
              }
              if (state.flags & 512) {
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                hbuf[2] = hold >>> 16 & 255;
                hbuf[3] = hold >>> 24 & 255;
                state.check = crc32(state.check, hbuf, 4, 0);
              }
              hold = 0;
              bits = 0;
              state.mode = OS;
            /* falls through */
            case OS:
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (state.head) {
                state.head.xflags = hold & 255;
                state.head.os = hold >> 8;
              }
              if (state.flags & 512) {
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                state.check = crc32(state.check, hbuf, 2, 0);
              }
              hold = 0;
              bits = 0;
              state.mode = EXLEN;
            /* falls through */
            case EXLEN:
              if (state.flags & 1024) {
                while (bits < 16) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.length = hold;
                if (state.head) {
                  state.head.extra_len = hold;
                }
                if (state.flags & 512) {
                  hbuf[0] = hold & 255;
                  hbuf[1] = hold >>> 8 & 255;
                  state.check = crc32(state.check, hbuf, 2, 0);
                }
                hold = 0;
                bits = 0;
              } else if (state.head) {
                state.head.extra = null;
              }
              state.mode = EXTRA;
            /* falls through */
            case EXTRA:
              if (state.flags & 1024) {
                copy = state.length;
                if (copy > have) {
                  copy = have;
                }
                if (copy) {
                  if (state.head) {
                    len = state.head.extra_len - state.length;
                    if (!state.head.extra) {
                      state.head.extra = new Array(state.head.extra_len);
                    }
                    utils.arraySet(
                      state.head.extra,
                      input,
                      next,
                      // extra field is limited to 65536 bytes
                      // - no need for additional size check
                      copy,
                      /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                      len
                    );
                  }
                  if (state.flags & 512) {
                    state.check = crc32(state.check, input, copy, next);
                  }
                  have -= copy;
                  next += copy;
                  state.length -= copy;
                }
                if (state.length) {
                  break inf_leave;
                }
              }
              state.length = 0;
              state.mode = NAME;
            /* falls through */
            case NAME:
              if (state.flags & 2048) {
                if (have === 0) {
                  break inf_leave;
                }
                copy = 0;
                do {
                  len = input[next + copy++];
                  if (state.head && len && state.length < 65536) {
                    state.head.name += String.fromCharCode(len);
                  }
                } while (len && copy < have);
                if (state.flags & 512) {
                  state.check = crc32(state.check, input, copy, next);
                }
                have -= copy;
                next += copy;
                if (len) {
                  break inf_leave;
                }
              } else if (state.head) {
                state.head.name = null;
              }
              state.length = 0;
              state.mode = COMMENT;
            /* falls through */
            case COMMENT:
              if (state.flags & 4096) {
                if (have === 0) {
                  break inf_leave;
                }
                copy = 0;
                do {
                  len = input[next + copy++];
                  if (state.head && len && state.length < 65536) {
                    state.head.comment += String.fromCharCode(len);
                  }
                } while (len && copy < have);
                if (state.flags & 512) {
                  state.check = crc32(state.check, input, copy, next);
                }
                have -= copy;
                next += copy;
                if (len) {
                  break inf_leave;
                }
              } else if (state.head) {
                state.head.comment = null;
              }
              state.mode = HCRC;
            /* falls through */
            case HCRC:
              if (state.flags & 512) {
                while (bits < 16) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                if (hold !== (state.check & 65535)) {
                  strm.msg = "header crc mismatch";
                  state.mode = BAD;
                  break;
                }
                hold = 0;
                bits = 0;
              }
              if (state.head) {
                state.head.hcrc = state.flags >> 9 & 1;
                state.head.done = true;
              }
              strm.adler = state.check = 0;
              state.mode = TYPE;
              break;
            case DICTID:
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              strm.adler = state.check = zswap32(hold);
              hold = 0;
              bits = 0;
              state.mode = DICT;
            /* falls through */
            case DICT:
              if (state.havedict === 0) {
                strm.next_out = put;
                strm.avail_out = left;
                strm.next_in = next;
                strm.avail_in = have;
                state.hold = hold;
                state.bits = bits;
                return Z_NEED_DICT;
              }
              strm.adler = state.check = 1;
              state.mode = TYPE;
            /* falls through */
            case TYPE:
              if (flush === Z_BLOCK || flush === Z_TREES) {
                break inf_leave;
              }
            /* falls through */
            case TYPEDO:
              if (state.last) {
                hold >>>= bits & 7;
                bits -= bits & 7;
                state.mode = CHECK;
                break;
              }
              while (bits < 3) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.last = hold & 1;
              hold >>>= 1;
              bits -= 1;
              switch (hold & 3) {
                case 0:
                  state.mode = STORED;
                  break;
                case 1:
                  fixedtables(state);
                  state.mode = LEN_;
                  if (flush === Z_TREES) {
                    hold >>>= 2;
                    bits -= 2;
                    break inf_leave;
                  }
                  break;
                case 2:
                  state.mode = TABLE;
                  break;
                case 3:
                  strm.msg = "invalid block type";
                  state.mode = BAD;
              }
              hold >>>= 2;
              bits -= 2;
              break;
            case STORED:
              hold >>>= bits & 7;
              bits -= bits & 7;
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if ((hold & 65535) !== (hold >>> 16 ^ 65535)) {
                strm.msg = "invalid stored block lengths";
                state.mode = BAD;
                break;
              }
              state.length = hold & 65535;
              hold = 0;
              bits = 0;
              state.mode = COPY_;
              if (flush === Z_TREES) {
                break inf_leave;
              }
            /* falls through */
            case COPY_:
              state.mode = COPY;
            /* falls through */
            case COPY:
              copy = state.length;
              if (copy) {
                if (copy > have) {
                  copy = have;
                }
                if (copy > left) {
                  copy = left;
                }
                if (copy === 0) {
                  break inf_leave;
                }
                utils.arraySet(output, input, next, copy, put);
                have -= copy;
                next += copy;
                left -= copy;
                put += copy;
                state.length -= copy;
                break;
              }
              state.mode = TYPE;
              break;
            case TABLE:
              while (bits < 14) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.nlen = (hold & 31) + 257;
              hold >>>= 5;
              bits -= 5;
              state.ndist = (hold & 31) + 1;
              hold >>>= 5;
              bits -= 5;
              state.ncode = (hold & 15) + 4;
              hold >>>= 4;
              bits -= 4;
              if (state.nlen > 286 || state.ndist > 30) {
                strm.msg = "too many length or distance symbols";
                state.mode = BAD;
                break;
              }
              state.have = 0;
              state.mode = LENLENS;
            /* falls through */
            case LENLENS:
              while (state.have < state.ncode) {
                while (bits < 3) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.lens[order[state.have++]] = hold & 7;
                hold >>>= 3;
                bits -= 3;
              }
              while (state.have < 19) {
                state.lens[order[state.have++]] = 0;
              }
              state.lencode = state.lendyn;
              state.lenbits = 7;
              opts = { bits: state.lenbits };
              ret = inflate_table(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
              state.lenbits = opts.bits;
              if (ret) {
                strm.msg = "invalid code lengths set";
                state.mode = BAD;
                break;
              }
              state.have = 0;
              state.mode = CODELENS;
            /* falls through */
            case CODELENS:
              while (state.have < state.nlen + state.ndist) {
                for (; ; ) {
                  here = state.lencode[hold & (1 << state.lenbits) - 1];
                  here_bits = here >>> 24;
                  here_op = here >>> 16 & 255;
                  here_val = here & 65535;
                  if (here_bits <= bits) {
                    break;
                  }
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                if (here_val < 16) {
                  hold >>>= here_bits;
                  bits -= here_bits;
                  state.lens[state.have++] = here_val;
                } else {
                  if (here_val === 16) {
                    n = here_bits + 2;
                    while (bits < n) {
                      if (have === 0) {
                        break inf_leave;
                      }
                      have--;
                      hold += input[next++] << bits;
                      bits += 8;
                    }
                    hold >>>= here_bits;
                    bits -= here_bits;
                    if (state.have === 0) {
                      strm.msg = "invalid bit length repeat";
                      state.mode = BAD;
                      break;
                    }
                    len = state.lens[state.have - 1];
                    copy = 3 + (hold & 3);
                    hold >>>= 2;
                    bits -= 2;
                  } else if (here_val === 17) {
                    n = here_bits + 3;
                    while (bits < n) {
                      if (have === 0) {
                        break inf_leave;
                      }
                      have--;
                      hold += input[next++] << bits;
                      bits += 8;
                    }
                    hold >>>= here_bits;
                    bits -= here_bits;
                    len = 0;
                    copy = 3 + (hold & 7);
                    hold >>>= 3;
                    bits -= 3;
                  } else {
                    n = here_bits + 7;
                    while (bits < n) {
                      if (have === 0) {
                        break inf_leave;
                      }
                      have--;
                      hold += input[next++] << bits;
                      bits += 8;
                    }
                    hold >>>= here_bits;
                    bits -= here_bits;
                    len = 0;
                    copy = 11 + (hold & 127);
                    hold >>>= 7;
                    bits -= 7;
                  }
                  if (state.have + copy > state.nlen + state.ndist) {
                    strm.msg = "invalid bit length repeat";
                    state.mode = BAD;
                    break;
                  }
                  while (copy--) {
                    state.lens[state.have++] = len;
                  }
                }
              }
              if (state.mode === BAD) {
                break;
              }
              if (state.lens[256] === 0) {
                strm.msg = "invalid code -- missing end-of-block";
                state.mode = BAD;
                break;
              }
              state.lenbits = 9;
              opts = { bits: state.lenbits };
              ret = inflate_table(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
              state.lenbits = opts.bits;
              if (ret) {
                strm.msg = "invalid literal/lengths set";
                state.mode = BAD;
                break;
              }
              state.distbits = 6;
              state.distcode = state.distdyn;
              opts = { bits: state.distbits };
              ret = inflate_table(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
              state.distbits = opts.bits;
              if (ret) {
                strm.msg = "invalid distances set";
                state.mode = BAD;
                break;
              }
              state.mode = LEN_;
              if (flush === Z_TREES) {
                break inf_leave;
              }
            /* falls through */
            case LEN_:
              state.mode = LEN;
            /* falls through */
            case LEN:
              if (have >= 6 && left >= 258) {
                strm.next_out = put;
                strm.avail_out = left;
                strm.next_in = next;
                strm.avail_in = have;
                state.hold = hold;
                state.bits = bits;
                inflate_fast(strm, _out);
                put = strm.next_out;
                output = strm.output;
                left = strm.avail_out;
                next = strm.next_in;
                input = strm.input;
                have = strm.avail_in;
                hold = state.hold;
                bits = state.bits;
                if (state.mode === TYPE) {
                  state.back = -1;
                }
                break;
              }
              state.back = 0;
              for (; ; ) {
                here = state.lencode[hold & (1 << state.lenbits) - 1];
                here_bits = here >>> 24;
                here_op = here >>> 16 & 255;
                here_val = here & 65535;
                if (here_bits <= bits) {
                  break;
                }
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (here_op && (here_op & 240) === 0) {
                last_bits = here_bits;
                last_op = here_op;
                last_val = here_val;
                for (; ; ) {
                  here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                  here_bits = here >>> 24;
                  here_op = here >>> 16 & 255;
                  here_val = here & 65535;
                  if (last_bits + here_bits <= bits) {
                    break;
                  }
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= last_bits;
                bits -= last_bits;
                state.back += last_bits;
              }
              hold >>>= here_bits;
              bits -= here_bits;
              state.back += here_bits;
              state.length = here_val;
              if (here_op === 0) {
                state.mode = LIT;
                break;
              }
              if (here_op & 32) {
                state.back = -1;
                state.mode = TYPE;
                break;
              }
              if (here_op & 64) {
                strm.msg = "invalid literal/length code";
                state.mode = BAD;
                break;
              }
              state.extra = here_op & 15;
              state.mode = LENEXT;
            /* falls through */
            case LENEXT:
              if (state.extra) {
                n = state.extra;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.length += hold & (1 << state.extra) - 1;
                hold >>>= state.extra;
                bits -= state.extra;
                state.back += state.extra;
              }
              state.was = state.length;
              state.mode = DIST;
            /* falls through */
            case DIST:
              for (; ; ) {
                here = state.distcode[hold & (1 << state.distbits) - 1];
                here_bits = here >>> 24;
                here_op = here >>> 16 & 255;
                here_val = here & 65535;
                if (here_bits <= bits) {
                  break;
                }
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if ((here_op & 240) === 0) {
                last_bits = here_bits;
                last_op = here_op;
                last_val = here_val;
                for (; ; ) {
                  here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                  here_bits = here >>> 24;
                  here_op = here >>> 16 & 255;
                  here_val = here & 65535;
                  if (last_bits + here_bits <= bits) {
                    break;
                  }
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= last_bits;
                bits -= last_bits;
                state.back += last_bits;
              }
              hold >>>= here_bits;
              bits -= here_bits;
              state.back += here_bits;
              if (here_op & 64) {
                strm.msg = "invalid distance code";
                state.mode = BAD;
                break;
              }
              state.offset = here_val;
              state.extra = here_op & 15;
              state.mode = DISTEXT;
            /* falls through */
            case DISTEXT:
              if (state.extra) {
                n = state.extra;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.offset += hold & (1 << state.extra) - 1;
                hold >>>= state.extra;
                bits -= state.extra;
                state.back += state.extra;
              }
              if (state.offset > state.dmax) {
                strm.msg = "invalid distance too far back";
                state.mode = BAD;
                break;
              }
              state.mode = MATCH;
            /* falls through */
            case MATCH:
              if (left === 0) {
                break inf_leave;
              }
              copy = _out - left;
              if (state.offset > copy) {
                copy = state.offset - copy;
                if (copy > state.whave) {
                  if (state.sane) {
                    strm.msg = "invalid distance too far back";
                    state.mode = BAD;
                    break;
                  }
                }
                if (copy > state.wnext) {
                  copy -= state.wnext;
                  from = state.wsize - copy;
                } else {
                  from = state.wnext - copy;
                }
                if (copy > state.length) {
                  copy = state.length;
                }
                from_source = state.window;
              } else {
                from_source = output;
                from = put - state.offset;
                copy = state.length;
              }
              if (copy > left) {
                copy = left;
              }
              left -= copy;
              state.length -= copy;
              do {
                output[put++] = from_source[from++];
              } while (--copy);
              if (state.length === 0) {
                state.mode = LEN;
              }
              break;
            case LIT:
              if (left === 0) {
                break inf_leave;
              }
              output[put++] = state.length;
              left--;
              state.mode = LEN;
              break;
            case CHECK:
              if (state.wrap) {
                while (bits < 32) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold |= input[next++] << bits;
                  bits += 8;
                }
                _out -= left;
                strm.total_out += _out;
                state.total += _out;
                if (_out) {
                  strm.adler = state.check = /*UPDATE(state.check, put - _out, _out);*/
                  state.flags ? crc32(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out);
                }
                _out = left;
                if ((state.flags ? hold : zswap32(hold)) !== state.check) {
                  strm.msg = "incorrect data check";
                  state.mode = BAD;
                  break;
                }
                hold = 0;
                bits = 0;
              }
              state.mode = LENGTH;
            /* falls through */
            case LENGTH:
              if (state.wrap && state.flags) {
                while (bits < 32) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                if (hold !== (state.total & 4294967295)) {
                  strm.msg = "incorrect length check";
                  state.mode = BAD;
                  break;
                }
                hold = 0;
                bits = 0;
              }
              state.mode = DONE;
            /* falls through */
            case DONE:
              ret = Z_STREAM_END;
              break inf_leave;
            case BAD:
              ret = Z_DATA_ERROR;
              break inf_leave;
            case MEM:
              return Z_MEM_ERROR;
            case SYNC:
            /* falls through */
            default:
              return Z_STREAM_ERROR;
          }
        }
      strm.next_out = put;
      strm.avail_out = left;
      strm.next_in = next;
      strm.avail_in = have;
      state.hold = hold;
      state.bits = bits;
      if (state.wsize || _out !== strm.avail_out && state.mode < BAD && (state.mode < CHECK || flush !== Z_FINISH)) {
        if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) ;
      }
      _in -= strm.avail_in;
      _out -= strm.avail_out;
      strm.total_in += _in;
      strm.total_out += _out;
      state.total += _out;
      if (state.wrap && _out) {
        strm.adler = state.check = /*UPDATE(state.check, strm.next_out - _out, _out);*/
        state.flags ? crc32(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out);
      }
      strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
      if ((_in === 0 && _out === 0 || flush === Z_FINISH) && ret === Z_OK) {
        ret = Z_BUF_ERROR;
      }
      return ret;
    }
    function inflateEnd(strm) {
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      var state = strm.state;
      if (state.window) {
        state.window = null;
      }
      strm.state = null;
      return Z_OK;
    }
    function inflateGetHeader(strm, head) {
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if ((state.wrap & 2) === 0) {
        return Z_STREAM_ERROR;
      }
      state.head = head;
      head.done = false;
      return Z_OK;
    }
    function inflateSetDictionary(strm, dictionary) {
      var dictLength = dictionary.length;
      var state;
      var dictid;
      var ret;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if (state.wrap !== 0 && state.mode !== DICT) {
        return Z_STREAM_ERROR;
      }
      if (state.mode === DICT) {
        dictid = 1;
        dictid = adler32(dictid, dictionary, dictLength, 0);
        if (dictid !== state.check) {
          return Z_DATA_ERROR;
        }
      }
      ret = updatewindow(strm, dictionary, dictLength, dictLength);
      if (ret) {
        state.mode = MEM;
        return Z_MEM_ERROR;
      }
      state.havedict = 1;
      return Z_OK;
    }
    exports.inflateReset = inflateReset;
    exports.inflateReset2 = inflateReset2;
    exports.inflateResetKeep = inflateResetKeep;
    exports.inflateInit = inflateInit;
    exports.inflateInit2 = inflateInit2;
    exports.inflate = inflate;
    exports.inflateEnd = inflateEnd;
    exports.inflateGetHeader = inflateGetHeader;
    exports.inflateSetDictionary = inflateSetDictionary;
    exports.inflateInfo = "pako inflate (from Nodeca project)";
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/constants.js
var require_constants = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/constants.js"(exports, module) {
    module.exports = {
      /* Allowed flush values; see deflate() and inflate() below for details */
      Z_NO_FLUSH: 0,
      Z_PARTIAL_FLUSH: 1,
      Z_SYNC_FLUSH: 2,
      Z_FULL_FLUSH: 3,
      Z_FINISH: 4,
      Z_BLOCK: 5,
      Z_TREES: 6,
      /* Return codes for the compression/decompression functions. Negative values
      * are errors, positive values are used for special but normal events.
      */
      Z_OK: 0,
      Z_STREAM_END: 1,
      Z_NEED_DICT: 2,
      Z_ERRNO: -1,
      Z_STREAM_ERROR: -2,
      Z_DATA_ERROR: -3,
      //Z_MEM_ERROR:     -4,
      Z_BUF_ERROR: -5,
      //Z_VERSION_ERROR: -6,
      /* compression levels */
      Z_NO_COMPRESSION: 0,
      Z_BEST_SPEED: 1,
      Z_BEST_COMPRESSION: 9,
      Z_DEFAULT_COMPRESSION: -1,
      Z_FILTERED: 1,
      Z_HUFFMAN_ONLY: 2,
      Z_RLE: 3,
      Z_FIXED: 4,
      Z_DEFAULT_STRATEGY: 0,
      /* Possible values of the data_type field (though see inflate()) */
      Z_BINARY: 0,
      Z_TEXT: 1,
      //Z_ASCII:                1, // = Z_TEXT (deprecated)
      Z_UNKNOWN: 2,
      /* The deflate compression method */
      Z_DEFLATED: 8
      //Z_NULL:                 null // Use -1 or null inline, depending on var type
    };
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/gzheader.js
var require_gzheader = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/zlib/gzheader.js"(exports, module) {
    function GZheader() {
      this.text = 0;
      this.time = 0;
      this.xflags = 0;
      this.os = 0;
      this.extra = null;
      this.extra_len = 0;
      this.name = "";
      this.comment = "";
      this.hcrc = 0;
      this.done = false;
    }
    module.exports = GZheader;
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/inflate.js
var require_inflate2 = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/lib/inflate.js"(exports) {
    var zlib_inflate = require_inflate();
    var utils = require_common();
    var strings = require_strings();
    var c = require_constants();
    var msg = require_messages();
    var ZStream = require_zstream();
    var GZheader = require_gzheader();
    var toString = Object.prototype.toString;
    function Inflate(options) {
      if (!(this instanceof Inflate)) return new Inflate(options);
      this.options = utils.assign({
        chunkSize: 16384,
        windowBits: 0,
        to: ""
      }, options || {});
      var opt = this.options;
      if (opt.raw && opt.windowBits >= 0 && opt.windowBits < 16) {
        opt.windowBits = -opt.windowBits;
        if (opt.windowBits === 0) {
          opt.windowBits = -15;
        }
      }
      if (opt.windowBits >= 0 && opt.windowBits < 16 && !(options && options.windowBits)) {
        opt.windowBits += 32;
      }
      if (opt.windowBits > 15 && opt.windowBits < 48) {
        if ((opt.windowBits & 15) === 0) {
          opt.windowBits |= 15;
        }
      }
      this.err = 0;
      this.msg = "";
      this.ended = false;
      this.chunks = [];
      this.strm = new ZStream();
      this.strm.avail_out = 0;
      var status = zlib_inflate.inflateInit2(
        this.strm,
        opt.windowBits
      );
      if (status !== c.Z_OK) {
        throw new Error(msg[status]);
      }
      this.header = new GZheader();
      zlib_inflate.inflateGetHeader(this.strm, this.header);
      if (opt.dictionary) {
        if (typeof opt.dictionary === "string") {
          opt.dictionary = strings.string2buf(opt.dictionary);
        } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
          opt.dictionary = new Uint8Array(opt.dictionary);
        }
        if (opt.raw) {
          status = zlib_inflate.inflateSetDictionary(this.strm, opt.dictionary);
          if (status !== c.Z_OK) {
            throw new Error(msg[status]);
          }
        }
      }
    }
    Inflate.prototype.push = function(data, mode) {
      var strm = this.strm;
      var chunkSize = this.options.chunkSize;
      var dictionary = this.options.dictionary;
      var status, _mode;
      var next_out_utf8, tail, utf8str;
      var allowBufError = false;
      if (this.ended) {
        return false;
      }
      _mode = mode === ~~mode ? mode : mode === true ? c.Z_FINISH : c.Z_NO_FLUSH;
      if (typeof data === "string") {
        strm.input = strings.binstring2buf(data);
      } else if (toString.call(data) === "[object ArrayBuffer]") {
        strm.input = new Uint8Array(data);
      } else {
        strm.input = data;
      }
      strm.next_in = 0;
      strm.avail_in = strm.input.length;
      do {
        if (strm.avail_out === 0) {
          strm.output = new utils.Buf8(chunkSize);
          strm.next_out = 0;
          strm.avail_out = chunkSize;
        }
        status = zlib_inflate.inflate(strm, c.Z_NO_FLUSH);
        if (status === c.Z_NEED_DICT && dictionary) {
          status = zlib_inflate.inflateSetDictionary(this.strm, dictionary);
        }
        if (status === c.Z_BUF_ERROR && allowBufError === true) {
          status = c.Z_OK;
          allowBufError = false;
        }
        if (status !== c.Z_STREAM_END && status !== c.Z_OK) {
          this.onEnd(status);
          this.ended = true;
          return false;
        }
        if (strm.next_out) {
          if (strm.avail_out === 0 || status === c.Z_STREAM_END || strm.avail_in === 0 && (_mode === c.Z_FINISH || _mode === c.Z_SYNC_FLUSH)) {
            if (this.options.to === "string") {
              next_out_utf8 = strings.utf8border(strm.output, strm.next_out);
              tail = strm.next_out - next_out_utf8;
              utf8str = strings.buf2string(strm.output, next_out_utf8);
              strm.next_out = tail;
              strm.avail_out = chunkSize - tail;
              if (tail) {
                utils.arraySet(strm.output, strm.output, next_out_utf8, tail, 0);
              }
              this.onData(utf8str);
            } else {
              this.onData(utils.shrinkBuf(strm.output, strm.next_out));
            }
          }
        }
        if (strm.avail_in === 0 && strm.avail_out === 0) {
          allowBufError = true;
        }
      } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== c.Z_STREAM_END);
      if (status === c.Z_STREAM_END) {
        _mode = c.Z_FINISH;
      }
      if (_mode === c.Z_FINISH) {
        status = zlib_inflate.inflateEnd(this.strm);
        this.onEnd(status);
        this.ended = true;
        return status === c.Z_OK;
      }
      if (_mode === c.Z_SYNC_FLUSH) {
        this.onEnd(c.Z_OK);
        strm.avail_out = 0;
        return true;
      }
      return true;
    };
    Inflate.prototype.onData = function(chunk) {
      this.chunks.push(chunk);
    };
    Inflate.prototype.onEnd = function(status) {
      if (status === c.Z_OK) {
        if (this.options.to === "string") {
          this.result = this.chunks.join("");
        } else {
          this.result = utils.flattenChunks(this.chunks);
        }
      }
      this.chunks = [];
      this.err = status;
      this.msg = this.strm.msg;
    };
    function inflate(input, options) {
      var inflator = new Inflate(options);
      inflator.push(input, true);
      if (inflator.err) {
        throw inflator.msg || msg[inflator.err];
      }
      return inflator.result;
    }
    function inflateRaw(input, options) {
      options = options || {};
      options.raw = true;
      return inflate(input, options);
    }
    exports.Inflate = Inflate;
    exports.inflate = inflate;
    exports.inflateRaw = inflateRaw;
    exports.ungzip = inflate;
  }
});

// node_modules/.pnpm/pako@1.0.11/node_modules/pako/index.js
var require_pako = __commonJS({
  "node_modules/.pnpm/pako@1.0.11/node_modules/pako/index.js"(exports, module) {
    var assign = require_common().assign;
    var deflate = require_deflate2();
    var inflate = require_inflate2();
    var constants = require_constants();
    var pako = {};
    assign(pako, deflate, inflate, constants);
    module.exports = pako;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/flate.js
var require_flate = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/flate.js"(exports) {
    var USE_TYPEDARRAY = typeof Uint8Array !== "undefined" && typeof Uint16Array !== "undefined" && typeof Uint32Array !== "undefined";
    var pako = require_pako();
    var utils = require_utils();
    var GenericWorker = require_GenericWorker();
    var ARRAY_TYPE = USE_TYPEDARRAY ? "uint8array" : "array";
    exports.magic = "\b\0";
    function FlateWorker(action, options) {
      GenericWorker.call(this, "FlateWorker/" + action);
      this._pako = null;
      this._pakoAction = action;
      this._pakoOptions = options;
      this.meta = {};
    }
    utils.inherits(FlateWorker, GenericWorker);
    FlateWorker.prototype.processChunk = function(chunk) {
      this.meta = chunk.meta;
      if (this._pako === null) {
        this._createPako();
      }
      this._pako.push(utils.transformTo(ARRAY_TYPE, chunk.data), false);
    };
    FlateWorker.prototype.flush = function() {
      GenericWorker.prototype.flush.call(this);
      if (this._pako === null) {
        this._createPako();
      }
      this._pako.push([], true);
    };
    FlateWorker.prototype.cleanUp = function() {
      GenericWorker.prototype.cleanUp.call(this);
      this._pako = null;
    };
    FlateWorker.prototype._createPako = function() {
      this._pako = new pako[this._pakoAction]({
        raw: true,
        level: this._pakoOptions.level || -1
        // default compression
      });
      var self2 = this;
      this._pako.onData = function(data) {
        self2.push({
          data,
          meta: self2.meta
        });
      };
    };
    exports.compressWorker = function(compressionOptions) {
      return new FlateWorker("Deflate", compressionOptions);
    };
    exports.uncompressWorker = function() {
      return new FlateWorker("Inflate", {});
    };
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressions.js
var require_compressions = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressions.js"(exports) {
    var GenericWorker = require_GenericWorker();
    exports.STORE = {
      magic: "\0\0",
      compressWorker: function() {
        return new GenericWorker("STORE compression");
      },
      uncompressWorker: function() {
        return new GenericWorker("STORE decompression");
      }
    };
    exports.DEFLATE = require_flate();
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/signature.js
var require_signature = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/signature.js"(exports) {
    exports.LOCAL_FILE_HEADER = "PK";
    exports.CENTRAL_FILE_HEADER = "PK";
    exports.CENTRAL_DIRECTORY_END = "PK";
    exports.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07";
    exports.ZIP64_CENTRAL_DIRECTORY_END = "PK";
    exports.DATA_DESCRIPTOR = "PK\x07\b";
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/generate/ZipFileWorker.js
var require_ZipFileWorker = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/generate/ZipFileWorker.js"(exports, module) {
    var utils = require_utils();
    var GenericWorker = require_GenericWorker();
    var utf8 = require_utf8();
    var crc32 = require_crc32();
    var signature = require_signature();
    var decToHex = function(dec, bytes) {
      var hex = "", i;
      for (i = 0; i < bytes; i++) {
        hex += String.fromCharCode(dec & 255);
        dec = dec >>> 8;
      }
      return hex;
    };
    var generateUnixExternalFileAttr = function(unixPermissions, isDir) {
      var result = unixPermissions;
      if (!unixPermissions) {
        result = isDir ? 16893 : 33204;
      }
      return (result & 65535) << 16;
    };
    var generateDosExternalFileAttr = function(dosPermissions) {
      return (dosPermissions || 0) & 63;
    };
    var generateZipParts = function(streamInfo, streamedContent, streamingEnded, offset, platform, encodeFileName) {
      var file = streamInfo["file"], compression = streamInfo["compression"], useCustomEncoding = encodeFileName !== utf8.utf8encode, encodedFileName = utils.transformTo("string", encodeFileName(file.name)), utfEncodedFileName = utils.transformTo("string", utf8.utf8encode(file.name)), comment = file.comment, encodedComment = utils.transformTo("string", encodeFileName(comment)), utfEncodedComment = utils.transformTo("string", utf8.utf8encode(comment)), useUTF8ForFileName = utfEncodedFileName.length !== file.name.length, useUTF8ForComment = utfEncodedComment.length !== comment.length, dosTime, dosDate, extraFields = "", unicodePathExtraField = "", unicodeCommentExtraField = "", dir = file.dir, date = file.date;
      var dataInfo = {
        crc32: 0,
        compressedSize: 0,
        uncompressedSize: 0
      };
      if (!streamedContent || streamingEnded) {
        dataInfo.crc32 = streamInfo["crc32"];
        dataInfo.compressedSize = streamInfo["compressedSize"];
        dataInfo.uncompressedSize = streamInfo["uncompressedSize"];
      }
      var bitflag = 0;
      if (streamedContent) {
        bitflag |= 8;
      }
      if (!useCustomEncoding && (useUTF8ForFileName || useUTF8ForComment)) {
        bitflag |= 2048;
      }
      var extFileAttr = 0;
      var versionMadeBy = 0;
      if (dir) {
        extFileAttr |= 16;
      }
      if (platform === "UNIX") {
        versionMadeBy = 798;
        extFileAttr |= generateUnixExternalFileAttr(file.unixPermissions, dir);
      } else {
        versionMadeBy = 20;
        extFileAttr |= generateDosExternalFileAttr(file.dosPermissions);
      }
      dosTime = date.getUTCHours();
      dosTime = dosTime << 6;
      dosTime = dosTime | date.getUTCMinutes();
      dosTime = dosTime << 5;
      dosTime = dosTime | date.getUTCSeconds() / 2;
      dosDate = date.getUTCFullYear() - 1980;
      dosDate = dosDate << 4;
      dosDate = dosDate | date.getUTCMonth() + 1;
      dosDate = dosDate << 5;
      dosDate = dosDate | date.getUTCDate();
      if (useUTF8ForFileName) {
        unicodePathExtraField = // Version
        decToHex(1, 1) + // NameCRC32
        decToHex(crc32(encodedFileName), 4) + // UnicodeName
        utfEncodedFileName;
        extraFields += // Info-ZIP Unicode Path Extra Field
        "up" + // size
        decToHex(unicodePathExtraField.length, 2) + // content
        unicodePathExtraField;
      }
      if (useUTF8ForComment) {
        unicodeCommentExtraField = // Version
        decToHex(1, 1) + // CommentCRC32
        decToHex(crc32(encodedComment), 4) + // UnicodeName
        utfEncodedComment;
        extraFields += // Info-ZIP Unicode Path Extra Field
        "uc" + // size
        decToHex(unicodeCommentExtraField.length, 2) + // content
        unicodeCommentExtraField;
      }
      var header = "";
      header += "\n\0";
      header += decToHex(bitflag, 2);
      header += compression.magic;
      header += decToHex(dosTime, 2);
      header += decToHex(dosDate, 2);
      header += decToHex(dataInfo.crc32, 4);
      header += decToHex(dataInfo.compressedSize, 4);
      header += decToHex(dataInfo.uncompressedSize, 4);
      header += decToHex(encodedFileName.length, 2);
      header += decToHex(extraFields.length, 2);
      var fileRecord = signature.LOCAL_FILE_HEADER + header + encodedFileName + extraFields;
      var dirRecord = signature.CENTRAL_FILE_HEADER + // version made by (00: DOS)
      decToHex(versionMadeBy, 2) + // file header (common to file and central directory)
      header + // file comment length
      decToHex(encodedComment.length, 2) + // disk number start
      "\0\0\0\0" + // external file attributes
      decToHex(extFileAttr, 4) + // relative offset of local header
      decToHex(offset, 4) + // file name
      encodedFileName + // extra field
      extraFields + // file comment
      encodedComment;
      return {
        fileRecord,
        dirRecord
      };
    };
    var generateCentralDirectoryEnd = function(entriesCount, centralDirLength, localDirLength, comment, encodeFileName) {
      var dirEnd = "";
      var encodedComment = utils.transformTo("string", encodeFileName(comment));
      dirEnd = signature.CENTRAL_DIRECTORY_END + // number of this disk
      "\0\0\0\0" + // total number of entries in the central directory on this disk
      decToHex(entriesCount, 2) + // total number of entries in the central directory
      decToHex(entriesCount, 2) + // size of the central directory   4 bytes
      decToHex(centralDirLength, 4) + // offset of start of central directory with respect to the starting disk number
      decToHex(localDirLength, 4) + // .ZIP file comment length
      decToHex(encodedComment.length, 2) + // .ZIP file comment
      encodedComment;
      return dirEnd;
    };
    var generateDataDescriptors = function(streamInfo) {
      var descriptor = "";
      descriptor = signature.DATA_DESCRIPTOR + // crc-32                          4 bytes
      decToHex(streamInfo["crc32"], 4) + // compressed size                 4 bytes
      decToHex(streamInfo["compressedSize"], 4) + // uncompressed size               4 bytes
      decToHex(streamInfo["uncompressedSize"], 4);
      return descriptor;
    };
    function ZipFileWorker(streamFiles, comment, platform, encodeFileName) {
      GenericWorker.call(this, "ZipFileWorker");
      this.bytesWritten = 0;
      this.zipComment = comment;
      this.zipPlatform = platform;
      this.encodeFileName = encodeFileName;
      this.streamFiles = streamFiles;
      this.accumulate = false;
      this.contentBuffer = [];
      this.dirRecords = [];
      this.currentSourceOffset = 0;
      this.entriesCount = 0;
      this.currentFile = null;
      this._sources = [];
    }
    utils.inherits(ZipFileWorker, GenericWorker);
    ZipFileWorker.prototype.push = function(chunk) {
      var currentFilePercent = chunk.meta.percent || 0;
      var entriesCount = this.entriesCount;
      var remainingFiles = this._sources.length;
      if (this.accumulate) {
        this.contentBuffer.push(chunk);
      } else {
        this.bytesWritten += chunk.data.length;
        GenericWorker.prototype.push.call(this, {
          data: chunk.data,
          meta: {
            currentFile: this.currentFile,
            percent: entriesCount ? (currentFilePercent + 100 * (entriesCount - remainingFiles - 1)) / entriesCount : 100
          }
        });
      }
    };
    ZipFileWorker.prototype.openedSource = function(streamInfo) {
      this.currentSourceOffset = this.bytesWritten;
      this.currentFile = streamInfo["file"].name;
      var streamedContent = this.streamFiles && !streamInfo["file"].dir;
      if (streamedContent) {
        var record = generateZipParts(streamInfo, streamedContent, false, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
        this.push({
          data: record.fileRecord,
          meta: { percent: 0 }
        });
      } else {
        this.accumulate = true;
      }
    };
    ZipFileWorker.prototype.closedSource = function(streamInfo) {
      this.accumulate = false;
      var streamedContent = this.streamFiles && !streamInfo["file"].dir;
      var record = generateZipParts(streamInfo, streamedContent, true, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
      this.dirRecords.push(record.dirRecord);
      if (streamedContent) {
        this.push({
          data: generateDataDescriptors(streamInfo),
          meta: { percent: 100 }
        });
      } else {
        this.push({
          data: record.fileRecord,
          meta: { percent: 0 }
        });
        while (this.contentBuffer.length) {
          this.push(this.contentBuffer.shift());
        }
      }
      this.currentFile = null;
    };
    ZipFileWorker.prototype.flush = function() {
      var localDirLength = this.bytesWritten;
      for (var i = 0; i < this.dirRecords.length; i++) {
        this.push({
          data: this.dirRecords[i],
          meta: { percent: 100 }
        });
      }
      var centralDirLength = this.bytesWritten - localDirLength;
      var dirEnd = generateCentralDirectoryEnd(this.dirRecords.length, centralDirLength, localDirLength, this.zipComment, this.encodeFileName);
      this.push({
        data: dirEnd,
        meta: { percent: 100 }
      });
    };
    ZipFileWorker.prototype.prepareNextSource = function() {
      this.previous = this._sources.shift();
      this.openedSource(this.previous.streamInfo);
      if (this.isPaused) {
        this.previous.pause();
      } else {
        this.previous.resume();
      }
    };
    ZipFileWorker.prototype.registerPrevious = function(previous) {
      this._sources.push(previous);
      var self2 = this;
      previous.on("data", function(chunk) {
        self2.processChunk(chunk);
      });
      previous.on("end", function() {
        self2.closedSource(self2.previous.streamInfo);
        if (self2._sources.length) {
          self2.prepareNextSource();
        } else {
          self2.end();
        }
      });
      previous.on("error", function(e) {
        self2.error(e);
      });
      return this;
    };
    ZipFileWorker.prototype.resume = function() {
      if (!GenericWorker.prototype.resume.call(this)) {
        return false;
      }
      if (!this.previous && this._sources.length) {
        this.prepareNextSource();
        return true;
      }
      if (!this.previous && !this._sources.length && !this.generatedError) {
        this.end();
        return true;
      }
    };
    ZipFileWorker.prototype.error = function(e) {
      var sources = this._sources;
      if (!GenericWorker.prototype.error.call(this, e)) {
        return false;
      }
      for (var i = 0; i < sources.length; i++) {
        try {
          sources[i].error(e);
        } catch (e2) {
        }
      }
      return true;
    };
    ZipFileWorker.prototype.lock = function() {
      GenericWorker.prototype.lock.call(this);
      var sources = this._sources;
      for (var i = 0; i < sources.length; i++) {
        sources[i].lock();
      }
    };
    module.exports = ZipFileWorker;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/generate/index.js
var require_generate = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/generate/index.js"(exports) {
    var compressions = require_compressions();
    var ZipFileWorker = require_ZipFileWorker();
    var getCompression = function(fileCompression, zipCompression) {
      var compressionName = fileCompression || zipCompression;
      var compression = compressions[compressionName];
      if (!compression) {
        throw new Error(compressionName + " is not a valid compression method !");
      }
      return compression;
    };
    exports.generateWorker = function(zip, options, comment) {
      var zipFileWorker = new ZipFileWorker(options.streamFiles, comment, options.platform, options.encodeFileName);
      var entriesCount = 0;
      try {
        zip.forEach(function(relativePath, file) {
          entriesCount++;
          var compression = getCompression(file.options.compression, options.compression);
          var compressionOptions = file.options.compressionOptions || options.compressionOptions || {};
          var dir = file.dir, date = file.date;
          file._compressWorker(compression, compressionOptions).withStreamInfo("file", {
            name: relativePath,
            dir,
            date,
            comment: file.comment || "",
            unixPermissions: file.unixPermissions,
            dosPermissions: file.dosPermissions
          }).pipe(zipFileWorker);
        });
        zipFileWorker.entriesCount = entriesCount;
      } catch (e) {
        zipFileWorker.error(e);
      }
      return zipFileWorker;
    };
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/nodejs/NodejsStreamInputAdapter.js
var require_NodejsStreamInputAdapter = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/nodejs/NodejsStreamInputAdapter.js"(exports, module) {
    var utils = require_utils();
    var GenericWorker = require_GenericWorker();
    function NodejsStreamInputAdapter(filename, stream) {
      GenericWorker.call(this, "Nodejs stream input adapter for " + filename);
      this._upstreamEnded = false;
      this._bindStream(stream);
    }
    utils.inherits(NodejsStreamInputAdapter, GenericWorker);
    NodejsStreamInputAdapter.prototype._bindStream = function(stream) {
      var self2 = this;
      this._stream = stream;
      stream.pause();
      stream.on("data", function(chunk) {
        self2.push({
          data: chunk,
          meta: {
            percent: 0
          }
        });
      }).on("error", function(e) {
        if (self2.isPaused) {
          this.generatedError = e;
        } else {
          self2.error(e);
        }
      }).on("end", function() {
        if (self2.isPaused) {
          self2._upstreamEnded = true;
        } else {
          self2.end();
        }
      });
    };
    NodejsStreamInputAdapter.prototype.pause = function() {
      if (!GenericWorker.prototype.pause.call(this)) {
        return false;
      }
      this._stream.pause();
      return true;
    };
    NodejsStreamInputAdapter.prototype.resume = function() {
      if (!GenericWorker.prototype.resume.call(this)) {
        return false;
      }
      if (this._upstreamEnded) {
        this.end();
      } else {
        this._stream.resume();
      }
      return true;
    };
    module.exports = NodejsStreamInputAdapter;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/object.js
var require_object = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/object.js"(exports, module) {
    var utf8 = require_utf8();
    var utils = require_utils();
    var GenericWorker = require_GenericWorker();
    var StreamHelper = require_StreamHelper();
    var defaults = require_defaults();
    var CompressedObject = require_compressedObject();
    var ZipObject = require_zipObject();
    var generate2 = require_generate();
    var nodejsUtils = require_nodejsUtils();
    var NodejsStreamInputAdapter = require_NodejsStreamInputAdapter();
    var fileAdd = function(name, data, originalOptions) {
      var dataType = utils.getTypeOf(data), parent;
      var o = utils.extend(originalOptions || {}, defaults);
      o.date = o.date || /* @__PURE__ */ new Date();
      if (o.compression !== null) {
        o.compression = o.compression.toUpperCase();
      }
      if (typeof o.unixPermissions === "string") {
        o.unixPermissions = parseInt(o.unixPermissions, 8);
      }
      if (o.unixPermissions && o.unixPermissions & 16384) {
        o.dir = true;
      }
      if (o.dosPermissions && o.dosPermissions & 16) {
        o.dir = true;
      }
      if (o.dir) {
        name = forceTrailingSlash(name);
      }
      if (o.createFolders && (parent = parentFolder(name))) {
        folderAdd.call(this, parent, true);
      }
      var isUnicodeString = dataType === "string" && o.binary === false && o.base64 === false;
      if (!originalOptions || typeof originalOptions.binary === "undefined") {
        o.binary = !isUnicodeString;
      }
      var isCompressedEmpty = data instanceof CompressedObject && data.uncompressedSize === 0;
      if (isCompressedEmpty || o.dir || !data || data.length === 0) {
        o.base64 = false;
        o.binary = true;
        data = "";
        o.compression = "STORE";
        dataType = "string";
      }
      var zipObjectContent = null;
      if (data instanceof CompressedObject || data instanceof GenericWorker) {
        zipObjectContent = data;
      } else if (nodejsUtils.isNode && nodejsUtils.isStream(data)) {
        zipObjectContent = new NodejsStreamInputAdapter(name, data);
      } else {
        zipObjectContent = utils.prepareContent(name, data, o.binary, o.optimizedBinaryString, o.base64);
      }
      var object2 = new ZipObject(name, zipObjectContent, o);
      this.files[name] = object2;
    };
    var parentFolder = function(path13) {
      if (path13.slice(-1) === "/") {
        path13 = path13.substring(0, path13.length - 1);
      }
      var lastSlash = path13.lastIndexOf("/");
      return lastSlash > 0 ? path13.substring(0, lastSlash) : "";
    };
    var forceTrailingSlash = function(path13) {
      if (path13.slice(-1) !== "/") {
        path13 += "/";
      }
      return path13;
    };
    var folderAdd = function(name, createFolders) {
      createFolders = typeof createFolders !== "undefined" ? createFolders : defaults.createFolders;
      name = forceTrailingSlash(name);
      if (!this.files[name]) {
        fileAdd.call(this, name, null, {
          dir: true,
          createFolders
        });
      }
      return this.files[name];
    };
    function isRegExp(object2) {
      return Object.prototype.toString.call(object2) === "[object RegExp]";
    }
    var out = {
      /**
       * @see loadAsync
       */
      load: function() {
        throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
      },
      /**
       * Call a callback function for each entry at this folder level.
       * @param {Function} cb the callback function:
       * function (relativePath, file) {...}
       * It takes 2 arguments : the relative path and the file.
       */
      forEach: function(cb) {
        var filename, relativePath, file;
        for (filename in this.files) {
          file = this.files[filename];
          relativePath = filename.slice(this.root.length, filename.length);
          if (relativePath && filename.slice(0, this.root.length) === this.root) {
            cb(relativePath, file);
          }
        }
      },
      /**
       * Filter nested files/folders with the specified function.
       * @param {Function} search the predicate to use :
       * function (relativePath, file) {...}
       * It takes 2 arguments : the relative path and the file.
       * @return {Array} An array of matching elements.
       */
      filter: function(search) {
        var result = [];
        this.forEach(function(relativePath, entry) {
          if (search(relativePath, entry)) {
            result.push(entry);
          }
        });
        return result;
      },
      /**
       * Add a file to the zip file, or search a file.
       * @param   {string|RegExp} name The name of the file to add (if data is defined),
       * the name of the file to find (if no data) or a regex to match files.
       * @param   {String|ArrayBuffer|Uint8Array|Buffer} data  The file data, either raw or base64 encoded
       * @param   {Object} o     File options
       * @return  {JSZip|Object|Array} this JSZip object (when adding a file),
       * a file (when searching by string) or an array of files (when searching by regex).
       */
      file: function(name, data, o) {
        if (arguments.length === 1) {
          if (isRegExp(name)) {
            var regexp = name;
            return this.filter(function(relativePath, file) {
              return !file.dir && regexp.test(relativePath);
            });
          } else {
            var obj = this.files[this.root + name];
            if (obj && !obj.dir) {
              return obj;
            } else {
              return null;
            }
          }
        } else {
          name = this.root + name;
          fileAdd.call(this, name, data, o);
        }
        return this;
      },
      /**
       * Add a directory to the zip file, or search.
       * @param   {String|RegExp} arg The name of the directory to add, or a regex to search folders.
       * @return  {JSZip} an object with the new directory as the root, or an array containing matching folders.
       */
      folder: function(arg) {
        if (!arg) {
          return this;
        }
        if (isRegExp(arg)) {
          return this.filter(function(relativePath, file) {
            return file.dir && arg.test(relativePath);
          });
        }
        var name = this.root + arg;
        var newFolder = folderAdd.call(this, name);
        var ret = this.clone();
        ret.root = newFolder.name;
        return ret;
      },
      /**
       * Delete a file, or a directory and all sub-files, from the zip
       * @param {string} name the name of the file to delete
       * @return {JSZip} this JSZip object
       */
      remove: function(name) {
        name = this.root + name;
        var file = this.files[name];
        if (!file) {
          if (name.slice(-1) !== "/") {
            name += "/";
          }
          file = this.files[name];
        }
        if (file && !file.dir) {
          delete this.files[name];
        } else {
          var kids = this.filter(function(relativePath, file2) {
            return file2.name.slice(0, name.length) === name;
          });
          for (var i = 0; i < kids.length; i++) {
            delete this.files[kids[i].name];
          }
        }
        return this;
      },
      /**
       * @deprecated This method has been removed in JSZip 3.0, please check the upgrade guide.
       */
      generate: function() {
        throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
      },
      /**
       * Generate the complete zip file as an internal stream.
       * @param {Object} options the options to generate the zip file :
       * - compression, "STORE" by default.
       * - type, "base64" by default. Values are : string, base64, uint8array, arraybuffer, blob.
       * @return {StreamHelper} the streamed zip file.
       */
      generateInternalStream: function(options) {
        var worker, opts = {};
        try {
          opts = utils.extend(options || {}, {
            streamFiles: false,
            compression: "STORE",
            compressionOptions: null,
            type: "",
            platform: "DOS",
            comment: null,
            mimeType: "application/zip",
            encodeFileName: utf8.utf8encode
          });
          opts.type = opts.type.toLowerCase();
          opts.compression = opts.compression.toUpperCase();
          if (opts.type === "binarystring") {
            opts.type = "string";
          }
          if (!opts.type) {
            throw new Error("No output type specified.");
          }
          utils.checkSupport(opts.type);
          if (opts.platform === "darwin" || opts.platform === "freebsd" || opts.platform === "linux" || opts.platform === "sunos") {
            opts.platform = "UNIX";
          }
          if (opts.platform === "win32") {
            opts.platform = "DOS";
          }
          var comment = opts.comment || this.comment || "";
          worker = generate2.generateWorker(this, opts, comment);
        } catch (e) {
          worker = new GenericWorker("error");
          worker.error(e);
        }
        return new StreamHelper(worker, opts.type || "string", opts.mimeType);
      },
      /**
       * Generate the complete zip file asynchronously.
       * @see generateInternalStream
       */
      generateAsync: function(options, onUpdate) {
        return this.generateInternalStream(options).accumulate(onUpdate);
      },
      /**
       * Generate the complete zip file asynchronously.
       * @see generateInternalStream
       */
      generateNodeStream: function(options, onUpdate) {
        options = options || {};
        if (!options.type) {
          options.type = "nodebuffer";
        }
        return this.generateInternalStream(options).toNodejsStream(onUpdate);
      }
    };
    module.exports = out;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/DataReader.js
var require_DataReader = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/DataReader.js"(exports, module) {
    var utils = require_utils();
    function DataReader(data) {
      this.data = data;
      this.length = data.length;
      this.index = 0;
      this.zero = 0;
    }
    DataReader.prototype = {
      /**
       * Check that the offset will not go too far.
       * @param {string} offset the additional offset to check.
       * @throws {Error} an Error if the offset is out of bounds.
       */
      checkOffset: function(offset) {
        this.checkIndex(this.index + offset);
      },
      /**
       * Check that the specified index will not be too far.
       * @param {string} newIndex the index to check.
       * @throws {Error} an Error if the index is out of bounds.
       */
      checkIndex: function(newIndex) {
        if (this.length < this.zero + newIndex || newIndex < 0) {
          throw new Error("End of data reached (data length = " + this.length + ", asked index = " + newIndex + "). Corrupted zip ?");
        }
      },
      /**
       * Change the index.
       * @param {number} newIndex The new index.
       * @throws {Error} if the new index is out of the data.
       */
      setIndex: function(newIndex) {
        this.checkIndex(newIndex);
        this.index = newIndex;
      },
      /**
       * Skip the next n bytes.
       * @param {number} n the number of bytes to skip.
       * @throws {Error} if the new index is out of the data.
       */
      skip: function(n) {
        this.setIndex(this.index + n);
      },
      /**
       * Get the byte at the specified index.
       * @param {number} i the index to use.
       * @return {number} a byte.
       */
      byteAt: function() {
      },
      /**
       * Get the next number with a given byte size.
       * @param {number} size the number of bytes to read.
       * @return {number} the corresponding number.
       */
      readInt: function(size) {
        var result = 0, i;
        this.checkOffset(size);
        for (i = this.index + size - 1; i >= this.index; i--) {
          result = (result << 8) + this.byteAt(i);
        }
        this.index += size;
        return result;
      },
      /**
       * Get the next string with a given byte size.
       * @param {number} size the number of bytes to read.
       * @return {string} the corresponding string.
       */
      readString: function(size) {
        return utils.transformTo("string", this.readData(size));
      },
      /**
       * Get raw data without conversion, <size> bytes.
       * @param {number} size the number of bytes to read.
       * @return {Object} the raw data, implementation specific.
       */
      readData: function() {
      },
      /**
       * Find the last occurrence of a zip signature (4 bytes).
       * @param {string} sig the signature to find.
       * @return {number} the index of the last occurrence, -1 if not found.
       */
      lastIndexOfSignature: function() {
      },
      /**
       * Read the signature (4 bytes) at the current position and compare it with sig.
       * @param {string} sig the expected signature
       * @return {boolean} true if the signature matches, false otherwise.
       */
      readAndCheckSignature: function() {
      },
      /**
       * Get the next date.
       * @return {Date} the date.
       */
      readDate: function() {
        var dostime = this.readInt(4);
        return new Date(Date.UTC(
          (dostime >> 25 & 127) + 1980,
          // year
          (dostime >> 21 & 15) - 1,
          // month
          dostime >> 16 & 31,
          // day
          dostime >> 11 & 31,
          // hour
          dostime >> 5 & 63,
          // minute
          (dostime & 31) << 1
        ));
      }
    };
    module.exports = DataReader;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/ArrayReader.js
var require_ArrayReader = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/ArrayReader.js"(exports, module) {
    var DataReader = require_DataReader();
    var utils = require_utils();
    function ArrayReader(data) {
      DataReader.call(this, data);
      for (var i = 0; i < this.data.length; i++) {
        data[i] = data[i] & 255;
      }
    }
    utils.inherits(ArrayReader, DataReader);
    ArrayReader.prototype.byteAt = function(i) {
      return this.data[this.zero + i];
    };
    ArrayReader.prototype.lastIndexOfSignature = function(sig) {
      var sig0 = sig.charCodeAt(0), sig1 = sig.charCodeAt(1), sig2 = sig.charCodeAt(2), sig3 = sig.charCodeAt(3);
      for (var i = this.length - 4; i >= 0; --i) {
        if (this.data[i] === sig0 && this.data[i + 1] === sig1 && this.data[i + 2] === sig2 && this.data[i + 3] === sig3) {
          return i - this.zero;
        }
      }
      return -1;
    };
    ArrayReader.prototype.readAndCheckSignature = function(sig) {
      var sig0 = sig.charCodeAt(0), sig1 = sig.charCodeAt(1), sig2 = sig.charCodeAt(2), sig3 = sig.charCodeAt(3), data = this.readData(4);
      return sig0 === data[0] && sig1 === data[1] && sig2 === data[2] && sig3 === data[3];
    };
    ArrayReader.prototype.readData = function(size) {
      this.checkOffset(size);
      if (size === 0) {
        return [];
      }
      var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
      this.index += size;
      return result;
    };
    module.exports = ArrayReader;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/StringReader.js
var require_StringReader = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/StringReader.js"(exports, module) {
    var DataReader = require_DataReader();
    var utils = require_utils();
    function StringReader(data) {
      DataReader.call(this, data);
    }
    utils.inherits(StringReader, DataReader);
    StringReader.prototype.byteAt = function(i) {
      return this.data.charCodeAt(this.zero + i);
    };
    StringReader.prototype.lastIndexOfSignature = function(sig) {
      return this.data.lastIndexOf(sig) - this.zero;
    };
    StringReader.prototype.readAndCheckSignature = function(sig) {
      var data = this.readData(4);
      return sig === data;
    };
    StringReader.prototype.readData = function(size) {
      this.checkOffset(size);
      var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
      this.index += size;
      return result;
    };
    module.exports = StringReader;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/Uint8ArrayReader.js
var require_Uint8ArrayReader = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/Uint8ArrayReader.js"(exports, module) {
    var ArrayReader = require_ArrayReader();
    var utils = require_utils();
    function Uint8ArrayReader(data) {
      ArrayReader.call(this, data);
    }
    utils.inherits(Uint8ArrayReader, ArrayReader);
    Uint8ArrayReader.prototype.readData = function(size) {
      this.checkOffset(size);
      if (size === 0) {
        return new Uint8Array(0);
      }
      var result = this.data.subarray(this.zero + this.index, this.zero + this.index + size);
      this.index += size;
      return result;
    };
    module.exports = Uint8ArrayReader;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/NodeBufferReader.js
var require_NodeBufferReader = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/NodeBufferReader.js"(exports, module) {
    var Uint8ArrayReader = require_Uint8ArrayReader();
    var utils = require_utils();
    function NodeBufferReader(data) {
      Uint8ArrayReader.call(this, data);
    }
    utils.inherits(NodeBufferReader, Uint8ArrayReader);
    NodeBufferReader.prototype.readData = function(size) {
      this.checkOffset(size);
      var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
      this.index += size;
      return result;
    };
    module.exports = NodeBufferReader;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/readerFor.js
var require_readerFor = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/reader/readerFor.js"(exports, module) {
    var utils = require_utils();
    var support = require_support();
    var ArrayReader = require_ArrayReader();
    var StringReader = require_StringReader();
    var NodeBufferReader = require_NodeBufferReader();
    var Uint8ArrayReader = require_Uint8ArrayReader();
    module.exports = function(data) {
      var type = utils.getTypeOf(data);
      utils.checkSupport(type);
      if (type === "string" && !support.uint8array) {
        return new StringReader(data);
      }
      if (type === "nodebuffer") {
        return new NodeBufferReader(data);
      }
      if (support.uint8array) {
        return new Uint8ArrayReader(utils.transformTo("uint8array", data));
      }
      return new ArrayReader(utils.transformTo("array", data));
    };
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/zipEntry.js
var require_zipEntry = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/zipEntry.js"(exports, module) {
    var readerFor = require_readerFor();
    var utils = require_utils();
    var CompressedObject = require_compressedObject();
    var crc32fn = require_crc32();
    var utf8 = require_utf8();
    var compressions = require_compressions();
    var support = require_support();
    var MADE_BY_DOS = 0;
    var MADE_BY_UNIX = 3;
    var findCompression = function(compressionMethod) {
      for (var method in compressions) {
        if (!Object.prototype.hasOwnProperty.call(compressions, method)) {
          continue;
        }
        if (compressions[method].magic === compressionMethod) {
          return compressions[method];
        }
      }
      return null;
    };
    function ZipEntry(options, loadOptions) {
      this.options = options;
      this.loadOptions = loadOptions;
    }
    ZipEntry.prototype = {
      /**
       * say if the file is encrypted.
       * @return {boolean} true if the file is encrypted, false otherwise.
       */
      isEncrypted: function() {
        return (this.bitFlag & 1) === 1;
      },
      /**
       * say if the file has utf-8 filename/comment.
       * @return {boolean} true if the filename/comment is in utf-8, false otherwise.
       */
      useUTF8: function() {
        return (this.bitFlag & 2048) === 2048;
      },
      /**
       * Read the local part of a zip file and add the info in this object.
       * @param {DataReader} reader the reader to use.
       */
      readLocalPart: function(reader) {
        var compression, localExtraFieldsLength;
        reader.skip(22);
        this.fileNameLength = reader.readInt(2);
        localExtraFieldsLength = reader.readInt(2);
        this.fileName = reader.readData(this.fileNameLength);
        reader.skip(localExtraFieldsLength);
        if (this.compressedSize === -1 || this.uncompressedSize === -1) {
          throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
        }
        compression = findCompression(this.compressionMethod);
        if (compression === null) {
          throw new Error("Corrupted zip : compression " + utils.pretty(this.compressionMethod) + " unknown (inner file : " + utils.transformTo("string", this.fileName) + ")");
        }
        this.decompressed = new CompressedObject(this.compressedSize, this.uncompressedSize, this.crc32, compression, reader.readData(this.compressedSize));
      },
      /**
       * Read the central part of a zip file and add the info in this object.
       * @param {DataReader} reader the reader to use.
       */
      readCentralPart: function(reader) {
        this.versionMadeBy = reader.readInt(2);
        reader.skip(2);
        this.bitFlag = reader.readInt(2);
        this.compressionMethod = reader.readString(2);
        this.date = reader.readDate();
        this.crc32 = reader.readInt(4);
        this.compressedSize = reader.readInt(4);
        this.uncompressedSize = reader.readInt(4);
        var fileNameLength = reader.readInt(2);
        this.extraFieldsLength = reader.readInt(2);
        this.fileCommentLength = reader.readInt(2);
        this.diskNumberStart = reader.readInt(2);
        this.internalFileAttributes = reader.readInt(2);
        this.externalFileAttributes = reader.readInt(4);
        this.localHeaderOffset = reader.readInt(4);
        if (this.isEncrypted()) {
          throw new Error("Encrypted zip are not supported");
        }
        reader.skip(fileNameLength);
        this.readExtraFields(reader);
        this.parseZIP64ExtraField(reader);
        this.fileComment = reader.readData(this.fileCommentLength);
      },
      /**
       * Parse the external file attributes and get the unix/dos permissions.
       */
      processAttributes: function() {
        this.unixPermissions = null;
        this.dosPermissions = null;
        var madeBy = this.versionMadeBy >> 8;
        this.dir = this.externalFileAttributes & 16 ? true : false;
        if (madeBy === MADE_BY_DOS) {
          this.dosPermissions = this.externalFileAttributes & 63;
        }
        if (madeBy === MADE_BY_UNIX) {
          this.unixPermissions = this.externalFileAttributes >> 16 & 65535;
        }
        if (!this.dir && this.fileNameStr.slice(-1) === "/") {
          this.dir = true;
        }
      },
      /**
       * Parse the ZIP64 extra field and merge the info in the current ZipEntry.
       * @param {DataReader} reader the reader to use.
       */
      parseZIP64ExtraField: function() {
        if (!this.extraFields[1]) {
          return;
        }
        var extraReader = readerFor(this.extraFields[1].value);
        if (this.uncompressedSize === utils.MAX_VALUE_32BITS) {
          this.uncompressedSize = extraReader.readInt(8);
        }
        if (this.compressedSize === utils.MAX_VALUE_32BITS) {
          this.compressedSize = extraReader.readInt(8);
        }
        if (this.localHeaderOffset === utils.MAX_VALUE_32BITS) {
          this.localHeaderOffset = extraReader.readInt(8);
        }
        if (this.diskNumberStart === utils.MAX_VALUE_32BITS) {
          this.diskNumberStart = extraReader.readInt(4);
        }
      },
      /**
       * Read the central part of a zip file and add the info in this object.
       * @param {DataReader} reader the reader to use.
       */
      readExtraFields: function(reader) {
        var end = reader.index + this.extraFieldsLength, extraFieldId, extraFieldLength, extraFieldValue;
        if (!this.extraFields) {
          this.extraFields = {};
        }
        while (reader.index + 4 < end) {
          extraFieldId = reader.readInt(2);
          extraFieldLength = reader.readInt(2);
          extraFieldValue = reader.readData(extraFieldLength);
          this.extraFields[extraFieldId] = {
            id: extraFieldId,
            length: extraFieldLength,
            value: extraFieldValue
          };
        }
        reader.setIndex(end);
      },
      /**
       * Apply an UTF8 transformation if needed.
       */
      handleUTF8: function() {
        var decodeParamType = support.uint8array ? "uint8array" : "array";
        if (this.useUTF8()) {
          this.fileNameStr = utf8.utf8decode(this.fileName);
          this.fileCommentStr = utf8.utf8decode(this.fileComment);
        } else {
          var upath = this.findExtraFieldUnicodePath();
          if (upath !== null) {
            this.fileNameStr = upath;
          } else {
            var fileNameByteArray = utils.transformTo(decodeParamType, this.fileName);
            this.fileNameStr = this.loadOptions.decodeFileName(fileNameByteArray);
          }
          var ucomment = this.findExtraFieldUnicodeComment();
          if (ucomment !== null) {
            this.fileCommentStr = ucomment;
          } else {
            var commentByteArray = utils.transformTo(decodeParamType, this.fileComment);
            this.fileCommentStr = this.loadOptions.decodeFileName(commentByteArray);
          }
        }
      },
      /**
       * Find the unicode path declared in the extra field, if any.
       * @return {String} the unicode path, null otherwise.
       */
      findExtraFieldUnicodePath: function() {
        var upathField = this.extraFields[28789];
        if (upathField) {
          var extraReader = readerFor(upathField.value);
          if (extraReader.readInt(1) !== 1) {
            return null;
          }
          if (crc32fn(this.fileName) !== extraReader.readInt(4)) {
            return null;
          }
          return utf8.utf8decode(extraReader.readData(upathField.length - 5));
        }
        return null;
      },
      /**
       * Find the unicode comment declared in the extra field, if any.
       * @return {String} the unicode comment, null otherwise.
       */
      findExtraFieldUnicodeComment: function() {
        var ucommentField = this.extraFields[25461];
        if (ucommentField) {
          var extraReader = readerFor(ucommentField.value);
          if (extraReader.readInt(1) !== 1) {
            return null;
          }
          if (crc32fn(this.fileComment) !== extraReader.readInt(4)) {
            return null;
          }
          return utf8.utf8decode(extraReader.readData(ucommentField.length - 5));
        }
        return null;
      }
    };
    module.exports = ZipEntry;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/zipEntries.js
var require_zipEntries = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/zipEntries.js"(exports, module) {
    var readerFor = require_readerFor();
    var utils = require_utils();
    var sig = require_signature();
    var ZipEntry = require_zipEntry();
    var support = require_support();
    function ZipEntries(loadOptions) {
      this.files = [];
      this.loadOptions = loadOptions;
    }
    ZipEntries.prototype = {
      /**
       * Check that the reader is on the specified signature.
       * @param {string} expectedSignature the expected signature.
       * @throws {Error} if it is an other signature.
       */
      checkSignature: function(expectedSignature) {
        if (!this.reader.readAndCheckSignature(expectedSignature)) {
          this.reader.index -= 4;
          var signature = this.reader.readString(4);
          throw new Error("Corrupted zip or bug: unexpected signature (" + utils.pretty(signature) + ", expected " + utils.pretty(expectedSignature) + ")");
        }
      },
      /**
       * Check if the given signature is at the given index.
       * @param {number} askedIndex the index to check.
       * @param {string} expectedSignature the signature to expect.
       * @return {boolean} true if the signature is here, false otherwise.
       */
      isSignature: function(askedIndex, expectedSignature) {
        var currentIndex = this.reader.index;
        this.reader.setIndex(askedIndex);
        var signature = this.reader.readString(4);
        var result = signature === expectedSignature;
        this.reader.setIndex(currentIndex);
        return result;
      },
      /**
       * Read the end of the central directory.
       */
      readBlockEndOfCentral: function() {
        this.diskNumber = this.reader.readInt(2);
        this.diskWithCentralDirStart = this.reader.readInt(2);
        this.centralDirRecordsOnThisDisk = this.reader.readInt(2);
        this.centralDirRecords = this.reader.readInt(2);
        this.centralDirSize = this.reader.readInt(4);
        this.centralDirOffset = this.reader.readInt(4);
        this.zipCommentLength = this.reader.readInt(2);
        var zipComment = this.reader.readData(this.zipCommentLength);
        var decodeParamType = support.uint8array ? "uint8array" : "array";
        var decodeContent = utils.transformTo(decodeParamType, zipComment);
        this.zipComment = this.loadOptions.decodeFileName(decodeContent);
      },
      /**
       * Read the end of the Zip 64 central directory.
       * Not merged with the method readEndOfCentral :
       * The end of central can coexist with its Zip64 brother,
       * I don't want to read the wrong number of bytes !
       */
      readBlockZip64EndOfCentral: function() {
        this.zip64EndOfCentralSize = this.reader.readInt(8);
        this.reader.skip(4);
        this.diskNumber = this.reader.readInt(4);
        this.diskWithCentralDirStart = this.reader.readInt(4);
        this.centralDirRecordsOnThisDisk = this.reader.readInt(8);
        this.centralDirRecords = this.reader.readInt(8);
        this.centralDirSize = this.reader.readInt(8);
        this.centralDirOffset = this.reader.readInt(8);
        this.zip64ExtensibleData = {};
        var extraDataSize = this.zip64EndOfCentralSize - 44, index3 = 0, extraFieldId, extraFieldLength, extraFieldValue;
        while (index3 < extraDataSize) {
          extraFieldId = this.reader.readInt(2);
          extraFieldLength = this.reader.readInt(4);
          extraFieldValue = this.reader.readData(extraFieldLength);
          this.zip64ExtensibleData[extraFieldId] = {
            id: extraFieldId,
            length: extraFieldLength,
            value: extraFieldValue
          };
        }
      },
      /**
       * Read the end of the Zip 64 central directory locator.
       */
      readBlockZip64EndOfCentralLocator: function() {
        this.diskWithZip64CentralDirStart = this.reader.readInt(4);
        this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8);
        this.disksCount = this.reader.readInt(4);
        if (this.disksCount > 1) {
          throw new Error("Multi-volumes zip are not supported");
        }
      },
      /**
       * Read the local files, based on the offset read in the central part.
       */
      readLocalFiles: function() {
        var i, file;
        for (i = 0; i < this.files.length; i++) {
          file = this.files[i];
          this.reader.setIndex(file.localHeaderOffset);
          this.checkSignature(sig.LOCAL_FILE_HEADER);
          file.readLocalPart(this.reader);
          file.handleUTF8();
          file.processAttributes();
        }
      },
      /**
       * Read the central directory.
       */
      readCentralDir: function() {
        var file;
        this.reader.setIndex(this.centralDirOffset);
        while (this.reader.readAndCheckSignature(sig.CENTRAL_FILE_HEADER)) {
          file = new ZipEntry({
            zip64: this.zip64
          }, this.loadOptions);
          file.readCentralPart(this.reader);
          this.files.push(file);
        }
        if (this.centralDirRecords !== this.files.length) {
          if (this.centralDirRecords !== 0 && this.files.length === 0) {
            throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
          }
        }
      },
      /**
       * Read the end of central directory.
       */
      readEndOfCentral: function() {
        var offset = this.reader.lastIndexOfSignature(sig.CENTRAL_DIRECTORY_END);
        if (offset < 0) {
          var isGarbage = !this.isSignature(0, sig.LOCAL_FILE_HEADER);
          if (isGarbage) {
            throw new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html");
          } else {
            throw new Error("Corrupted zip: can't find end of central directory");
          }
        }
        this.reader.setIndex(offset);
        var endOfCentralDirOffset = offset;
        this.checkSignature(sig.CENTRAL_DIRECTORY_END);
        this.readBlockEndOfCentral();
        if (this.diskNumber === utils.MAX_VALUE_16BITS || this.diskWithCentralDirStart === utils.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === utils.MAX_VALUE_16BITS || this.centralDirRecords === utils.MAX_VALUE_16BITS || this.centralDirSize === utils.MAX_VALUE_32BITS || this.centralDirOffset === utils.MAX_VALUE_32BITS) {
          this.zip64 = true;
          offset = this.reader.lastIndexOfSignature(sig.ZIP64_CENTRAL_DIRECTORY_LOCATOR);
          if (offset < 0) {
            throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
          }
          this.reader.setIndex(offset);
          this.checkSignature(sig.ZIP64_CENTRAL_DIRECTORY_LOCATOR);
          this.readBlockZip64EndOfCentralLocator();
          if (!this.isSignature(this.relativeOffsetEndOfZip64CentralDir, sig.ZIP64_CENTRAL_DIRECTORY_END)) {
            this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(sig.ZIP64_CENTRAL_DIRECTORY_END);
            if (this.relativeOffsetEndOfZip64CentralDir < 0) {
              throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
            }
          }
          this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir);
          this.checkSignature(sig.ZIP64_CENTRAL_DIRECTORY_END);
          this.readBlockZip64EndOfCentral();
        }
        var expectedEndOfCentralDirOffset = this.centralDirOffset + this.centralDirSize;
        if (this.zip64) {
          expectedEndOfCentralDirOffset += 20;
          expectedEndOfCentralDirOffset += 12 + this.zip64EndOfCentralSize;
        }
        var extraBytes = endOfCentralDirOffset - expectedEndOfCentralDirOffset;
        if (extraBytes > 0) {
          if (this.isSignature(endOfCentralDirOffset, sig.CENTRAL_FILE_HEADER)) ; else {
            this.reader.zero = extraBytes;
          }
        } else if (extraBytes < 0) {
          throw new Error("Corrupted zip: missing " + Math.abs(extraBytes) + " bytes.");
        }
      },
      prepareReader: function(data) {
        this.reader = readerFor(data);
      },
      /**
       * Read a zip file and create ZipEntries.
       * @param {String|ArrayBuffer|Uint8Array|Buffer} data the binary string representing a zip file.
       */
      load: function(data) {
        this.prepareReader(data);
        this.readEndOfCentral();
        this.readCentralDir();
        this.readLocalFiles();
      }
    };
    module.exports = ZipEntries;
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/load.js
var require_load = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/load.js"(exports, module) {
    var utils = require_utils();
    var external = require_external();
    var utf8 = require_utf8();
    var ZipEntries = require_zipEntries();
    var Crc32Probe = require_Crc32Probe();
    var nodejsUtils = require_nodejsUtils();
    function checkEntryCRC32(zipEntry) {
      return new external.Promise(function(resolve2, reject) {
        var worker = zipEntry.decompressed.getContentWorker().pipe(new Crc32Probe());
        worker.on("error", function(e) {
          reject(e);
        }).on("end", function() {
          if (worker.streamInfo.crc32 !== zipEntry.decompressed.crc32) {
            reject(new Error("Corrupted zip : CRC32 mismatch"));
          } else {
            resolve2();
          }
        }).resume();
      });
    }
    module.exports = function(data, options) {
      var zip = this;
      options = utils.extend(options || {}, {
        base64: false,
        checkCRC32: false,
        optimizedBinaryString: false,
        createFolders: false,
        decodeFileName: utf8.utf8decode
      });
      if (nodejsUtils.isNode && nodejsUtils.isStream(data)) {
        return external.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file."));
      }
      return utils.prepareContent("the loaded zip file", data, true, options.optimizedBinaryString, options.base64).then(function(data2) {
        var zipEntries = new ZipEntries(options);
        zipEntries.load(data2);
        return zipEntries;
      }).then(function checkCRC32(zipEntries) {
        var promises = [external.Promise.resolve(zipEntries)];
        var files = zipEntries.files;
        if (options.checkCRC32) {
          for (var i = 0; i < files.length; i++) {
            promises.push(checkEntryCRC32(files[i]));
          }
        }
        return external.Promise.all(promises);
      }).then(function addFiles(results) {
        var zipEntries = results.shift();
        var files = zipEntries.files;
        for (var i = 0; i < files.length; i++) {
          var input = files[i];
          var unsafeName = input.fileNameStr;
          var safeName = utils.resolve(input.fileNameStr);
          zip.file(safeName, input.decompressed, {
            binary: true,
            optimizedBinaryString: true,
            date: input.date,
            dir: input.dir,
            comment: input.fileCommentStr.length ? input.fileCommentStr : null,
            unixPermissions: input.unixPermissions,
            dosPermissions: input.dosPermissions,
            createFolders: options.createFolders
          });
          if (!input.dir) {
            zip.file(safeName).unsafeOriginalName = unsafeName;
          }
        }
        if (zipEntries.zipComment.length) {
          zip.comment = zipEntries.zipComment;
        }
        return zip;
      });
    };
  }
});

// node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/index.js
var require_lib3 = __commonJS({
  "node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/index.js"(exports, module) {
    function JSZip() {
      if (!(this instanceof JSZip)) {
        return new JSZip();
      }
      if (arguments.length) {
        throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
      }
      this.files = /* @__PURE__ */ Object.create(null);
      this.comment = null;
      this.root = "";
      this.clone = function() {
        var newObj = new JSZip();
        for (var i in this) {
          if (typeof this[i] !== "function") {
            newObj[i] = this[i];
          }
        }
        return newObj;
      };
    }
    JSZip.prototype = require_object();
    JSZip.prototype.loadAsync = require_load();
    JSZip.support = require_support();
    JSZip.defaults = require_defaults();
    JSZip.version = "3.10.1";
    JSZip.loadAsync = function(content, options) {
      return new JSZip().loadAsync(content, options);
    };
    JSZip.external = require_external();
    module.exports = JSZip;
  }
});
function mkdirp(path22) {
  return fs__default.default.mkdir(path22, { recursive: true });
}
function crxToZip(buf) {
  function calcLength(a, b, c, d) {
    let length = 0;
    length += a << 0;
    length += b << 8;
    length += c << 16;
    length += d << 24 >>> 0;
    return length;
  }
  if (buf[0] === 80 && buf[1] === 75 && buf[2] === 3 && buf[3] === 4) {
    return buf;
  }
  if (buf[0] !== 67 || buf[1] !== 114 || buf[2] !== 50 || buf[3] !== 52) {
    throw new Error("Invalid header: Does not start with Cr24");
  }
  const isV3 = buf[4] === 3;
  const isV2 = buf[4] === 2;
  if (!isV2 && !isV3 || buf[5] || buf[6] || buf[7]) {
    throw new Error("Unexpected crx format version number.");
  }
  if (isV2) {
    const publicKeyLength = calcLength(buf[8], buf[9], buf[10], buf[11]);
    const signatureLength = calcLength(buf[12], buf[13], buf[14], buf[15]);
    const zipStartOffset2 = 16 + publicKeyLength + signatureLength;
    return buf.slice(zipStartOffset2, buf.length);
  }
  const headerSize = calcLength(buf[8], buf[9], buf[10], buf[11]);
  const zipStartOffset = 12 + headerSize;
  return buf.slice(zipStartOffset, buf.length);
}
async function unzip(crxFilePath, destination) {
  const filePath = path__default.default.resolve(crxFilePath);
  let dest;
  if (destination) {
    dest = destination;
  } else {
    const extname = path__default.default.extname(crxFilePath);
    const basename = path__default.default.basename(crxFilePath, extname);
    const dirname = path__default.default.dirname(crxFilePath);
    dest = path__default.default.resolve(dirname, basename);
  }
  const buf = await fs__default.default.readFile(filePath);
  const { files } = await import_jszip.default.loadAsync(crxToZip(buf));
  return Promise.all(
    Object.keys(files).map(async (filename) => {
      const isFile = !files[filename].dir;
      const fullPath = path__default.default.join(dest, filename);
      const directory = isFile && path__default.default.dirname(fullPath) || fullPath;
      await mkdirp(directory);
      if (isFile) {
        const content = await files[filename].async("nodebuffer");
        await fs__default.default.writeFile(fullPath, content);
      }
    })
  );
}
var import_jszip, src_default;
var init_dist = __esm({
  "node_modules/.pnpm/@tomjs+unzip-crx@1.1.3/node_modules/@tomjs/unzip-crx/dist/index.mjs"() {
    import_jszip = __toESM(require_lib3());
    src_default = unzip;
  }
});

// node_modules/.pnpm/@tomjs+electron-devtools-installer@4.0.1_electron@43.0.0/node_modules/@tomjs/electron-devtools-installer/dist/index.mjs
var dist_exports = {};
__export(dist_exports, {
  ANGULAR_DEVTOOLS: () => ANGULAR_DEVTOOLS,
  APOLLO_CLIENT_TOOLS: () => APOLLO_CLIENT_TOOLS,
  BACKBONE_DEBUGGER: () => BACKBONE_DEBUGGER,
  EMBER_INSPECTOR: () => EMBER_INSPECTOR,
  EXTENSIONS: () => EXTENSIONS,
  MOBX_DEVTOOLS: () => MOBX_DEVTOOLS,
  PREACT_DEVELOPER_TOOLS: () => PREACT_DEVELOPER_TOOLS,
  REACT_DEVELOPER_TOOLS: () => REACT_DEVELOPER_TOOLS,
  REDUX_DEVTOOLS: () => REDUX_DEVTOOLS,
  SOLID_DEVTOOLS: () => SOLID_DEVTOOLS,
  SVELTE_DEVTOOLS: () => SVELTE_DEVTOOLS,
  VUEJS_DEVTOOLS: () => VUEJS_DEVTOOLS,
  VUEJS_DEVTOOLS_BETA: () => VUEJS_DEVTOOLS_BETA,
  VUEJS_DEVTOOLS_V5: () => VUEJS_DEVTOOLS_V5,
  VUEJS_DEVTOOLS_V6: () => VUEJS_DEVTOOLS_V6,
  default: () => src_default2,
  downloadExtension: () => downloadExtension,
  downloadFile: () => downloadFile,
  installExtension: () => installExtension
});
function mkdirp2(path$1, empty) {
  if (fs3__default.default.existsSync(path$1)) {
    if (empty) rmSync(path$1);
    return;
  }
  fs3__default.default.mkdirSync(path$1, { recursive: true });
}
function rmSync(path$1) {
  if (!fs3__default.default.existsSync(path$1)) return;
  fs3__default.default.rmSync(path$1, { recursive: true });
}
function downloadFile(url, filePath) {
  return new Promise((resolve2, reject) => {
    const request2 = electron.net.request(url);
    request2.on("response", (response) => {
      if (response.statusCode !== 200) {
        reject(/* @__PURE__ */ new Error(`File download failed, status code: ${response.statusCode}`));
        return;
      }
      const fileStream = fs3__default.default.createWriteStream(filePath);
      response.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close();
        resolve2();
      });
      fileStream.on("error", (err) => {
        fs3__default.default.unlink(filePath, () => reject(err));
      });
      response.on("error", (err) => {
        fs3__default.default.unlink(filePath, () => reject(err));
      });
    });
    request2.on("error", reject);
    request2.end();
  });
}
function changePermissions(dir, mode) {
  fs3__default.default.readdirSync(dir).forEach((file) => {
    const filePath = path__default.default.join(dir, file);
    fs3__default.default.chmodSync(filePath, Number.parseInt(`${mode}`, 8));
    if (fs3__default.default.statSync(filePath).isDirectory()) changePermissions(filePath, mode);
  });
}
function getExtensionPath() {
  return path__default.default.join(electron.app.getPath("userData"), "extensions");
}
async function downloadExtension(extensionId, options) {
  const opts = Object.assign({
    attempts: 5,
    unzip: true
  }, options);
  const attempts = opts.attempts || 5;
  const outPath = opts.outPath || getExtensionPath();
  const source = opts.source || (new Intl.NumberFormat().resolvedOptions().locale === "zh-CN" ? "npmmirror" : "unpkg");
  mkdirp2(outPath);
  const unzipPath = path__default.default.join(outPath, extensionId);
  return new Promise((resolve2, reject) => {
    const filePath = path__default.default.resolve(`${unzipPath}.crx`);
    const unzipExtension = () => {
      mkdirp2(unzipPath, true);
      src_default(filePath, unzipPath).then(() => {
        changePermissions(unzipPath, 755);
        return resolve2({
          filePath,
          unzipPath
        });
      }).catch((err) => {
        if (!fs3__default.default.existsSync(path__default.default.resolve(unzipPath, "manifest.json"))) return reject(err);
      });
    };
    if (fs3__default.default.existsSync(filePath) && !opts.force) {
      if (!fs3__default.default.existsSync(unzipPath)) {
        unzipExtension();
        return;
      }
      return resolve2({
        filePath,
        unzipPath
      });
    }
    let fileUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=135.0.0.0&x=id%3D${extensionId}%26installsource%3Dondemand%26uc&nacl_arch=${os3__default.default.arch() === "arm64" ? "arm64" : "x86-64"}&acceptformat=crx2,crx3`;
    if ([
      "unpkg",
      "jsdelivr",
      "npmmirror"
    ].includes(source) && EXTENSIONS.includes(extensionId)) switch (source) {
      case "npmmirror":
        fileUrl = `https://registry.npmmirror.com/@tomjs/electron-devtools-files/latest/files/extensions/${extensionId}.crx`;
        break;
      case "jsdelivr":
        fileUrl = `https://cdn.jsdelivr.net/npm/@tomjs/electron-devtools-files/extensions/${extensionId}.crx`;
        break;
      case "unpkg":
        fileUrl = `https://unpkg.com/@tomjs/electron-devtools-files/extensions/${extensionId}.crx`;
        break;
    }
    downloadFile(fileUrl, filePath).then(() => {
      if (!opts.unzip) return resolve2({ filePath });
      unzipExtension();
    }).catch((err) => {
      console.log(`Failed to fetch extension, trying ${attempts - 1} more times`);
      if (attempts <= 1) return reject(err);
      setTimeout(() => {
        downloadExtension(extensionId, {
          ...opts,
          attempts: attempts - 1
        }).then(resolve2).catch(reject);
      }, 200);
    });
  });
}
async function installExtension(extensionIds, options) {
  const opts = Object.assign({}, options);
  const { loadExtensionOptions = {}, forceDownload } = opts;
  const targetSession = typeof opts.session === "string" ? electron.session.fromPartition(opts.session) : opts.session || electron.session.defaultSession;
  const loadExtensionOpts = Object.assign({ allowFileAccess: true }, loadExtensionOptions);
  if (process.type !== "browser") return Promise.reject(/* @__PURE__ */ new Error("electron-devtools-installer can only be used from the main process"));
  if (Array.isArray(extensionIds)) {
    const exts = [];
    for (let i = 0; i < extensionIds.length; i++) {
      const id = extensionIds[i];
      await installExtension(id, options).then((ext) => {
        exts.push(ext);
      });
    }
    return exts;
  }
  let crxId;
  if (typeof extensionIds === "string") crxId = extensionIds;
  else return Promise.reject(/* @__PURE__ */ new Error(`Invalid extensionReference passed in: "${extensionIds}"`));
  return downloadExtension(crxId, {
    force: forceDownload,
    source: opts.source
  }).then((result) => {
    return targetSession.extensions ? targetSession.extensions.loadExtension(result.unzipPath, loadExtensionOpts) : targetSession.loadExtension(result.unzipPath, loadExtensionOpts).catch((err) => {
      console.error(`Failed to install extension: ${crxId}`);
      console.error(err);
      return Promise.reject(err);
    });
  });
}
var ANGULAR_DEVTOOLS, APOLLO_CLIENT_TOOLS, BACKBONE_DEBUGGER, EMBER_INSPECTOR, MOBX_DEVTOOLS, PREACT_DEVELOPER_TOOLS, REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS, SOLID_DEVTOOLS, SVELTE_DEVTOOLS, VUEJS_DEVTOOLS, VUEJS_DEVTOOLS_BETA, VUEJS_DEVTOOLS_V5, VUEJS_DEVTOOLS_V6, EXTENSIONS, src_default2;
var init_dist2 = __esm({
  "node_modules/.pnpm/@tomjs+electron-devtools-installer@4.0.1_electron@43.0.0/node_modules/@tomjs/electron-devtools-installer/dist/index.mjs"() {
    init_dist();
    ANGULAR_DEVTOOLS = "ienfalfjdbdpebioblfackkekamfmbnh";
    APOLLO_CLIENT_TOOLS = "jdkknkkbebbapilgoeccciglkfbmbnfm";
    BACKBONE_DEBUGGER = "bhljhndlimiafopmmhjlgfpnnchjjbhd";
    EMBER_INSPECTOR = "bmdblncegkenkacieihfhpjfppoconhi";
    MOBX_DEVTOOLS = "pfgnfdagidkfgccljigdamigbcnndkod";
    PREACT_DEVELOPER_TOOLS = "ilcajpmogmhpliinlbcdebhbcanbghmd";
    REACT_DEVELOPER_TOOLS = "fmkadmapgofadopljbjfkapdkoienihi";
    REDUX_DEVTOOLS = "lmhkpmbekcpmknklioeibfkpmmfibljd";
    SOLID_DEVTOOLS = "kmcfjchnmmaeeagadbhoofajiopoceel";
    SVELTE_DEVTOOLS = "kfidecgcdjjfpeckbblhmfkhmlgecoff";
    VUEJS_DEVTOOLS = "nhdogjmejiglipccpnnnanhbledajbpd";
    VUEJS_DEVTOOLS_BETA = "ljjemllljcmogpfapbkkighbhhppjdbg";
    VUEJS_DEVTOOLS_V5 = "hkddcnbhifppgmfgflgaelippbigjpjo";
    VUEJS_DEVTOOLS_V6 = "iaajmlceplecbljialhhkmedjlpdblhp";
    EXTENSIONS = [
      ANGULAR_DEVTOOLS,
      APOLLO_CLIENT_TOOLS,
      BACKBONE_DEBUGGER,
      EMBER_INSPECTOR,
      MOBX_DEVTOOLS,
      PREACT_DEVELOPER_TOOLS,
      REACT_DEVELOPER_TOOLS,
      REDUX_DEVTOOLS,
      SOLID_DEVTOOLS,
      SVELTE_DEVTOOLS,
      VUEJS_DEVTOOLS,
      VUEJS_DEVTOOLS_BETA,
      VUEJS_DEVTOOLS_V5,
      VUEJS_DEVTOOLS_V6
    ];
    src_default2 = installExtension;
  }
});

// src/platform/auth/auth-db-encryption.ts
var ENCRYPT_AUTH_DB_FLAG = "DN_ENCRYPT_AUTH_DB";
function isAuthDbEncryptionRequested(env2 = process.env) {
  const raw = env2[ENCRYPT_AUTH_DB_FLAG];
  if (raw === void 0) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

// src/platform/auth/electron-options.ts
var BETTER_AUTH_BASE_URL = process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
var ELECTRON_AUTH_PROTOCOL = "com.data-navigator.app";
var ELECTRON_AUTH_CALLBACK_PATH = "/auth/callback";
var ELECTRON_AUTH_CLIENT_ID = "electron";
var ELECTRON_AUTH_SIGN_IN_URL = `${BETTER_AUTH_BASE_URL}/login`;

// node_modules/.pnpm/@better-auth+electron@1.6.2_1f1b2cb4d9853db6d87b61ee3b987d7d/node_modules/@better-auth/electron/dist/version-YIydhdrs.mjs
var PACKAGE_VERSION = "1.6.23";

// node_modules/.pnpm/@better-auth+electron@1.6.2_1f1b2cb4d9853db6d87b61ee3b987d7d/node_modules/@better-auth/electron/dist/utils-DxDKRT6e.mjs
function isProcessType(type) {
  return typeof process !== "undefined" && process.type === type;
}
function parseProtocolScheme(protocolOption) {
  if (typeof protocolOption === "string") return {
    scheme: protocolOption,
    privileges: {}
  };
  return {
    scheme: protocolOption.scheme,
    privileges: protocolOption.privileges || {}
  };
}
function getChannelPrefixWithDelimiter(ns = "better-auth") {
  return ns.length > 0 ? ns + ":" : ns;
}

// node_modules/.pnpm/@better-auth+core@1.6.23_@b_732fb2bd717cfae2764ea0575be42412/node_modules/@better-auth/core/dist/error/index.mjs
var BetterAuthError = class extends Error {
  constructor(message2, options) {
    super(message2, options);
    this.name = "BetterAuthError";
    this.message = message2;
    this.stack = "";
  }
};

// node_modules/.pnpm/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/base64.mjs
function getAlphabet(urlSafe) {
  return urlSafe ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
}
function base64Encode(data, alphabet, padding) {
  let result = "";
  let buffer = 0;
  let shift = 0;
  for (const byte of data) {
    buffer = buffer << 8 | byte;
    shift += 8;
    while (shift >= 6) {
      shift -= 6;
      result += alphabet[buffer >> shift & 63];
    }
  }
  if (shift > 0) {
    result += alphabet[buffer << 6 - shift & 63];
  }
  if (padding) {
    const padCount = (4 - result.length % 4) % 4;
    result += "=".repeat(padCount);
  }
  return result;
}
function base64Decode(data, alphabet) {
  const decodeMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < alphabet.length; i++) {
    decodeMap.set(alphabet[i], i);
  }
  const result = [];
  let buffer = 0;
  let bitsCollected = 0;
  for (const char of data) {
    if (char === "=")
      break;
    const value = decodeMap.get(char);
    if (value === void 0) {
      throw new Error(`Invalid Base64 character: ${char}`);
    }
    buffer = buffer << 6 | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      result.push(buffer >> bitsCollected & 255);
    }
  }
  return Uint8Array.from(result);
}
var base64 = {
  encode(data, options = {}) {
    const alphabet = getAlphabet(false);
    const buffer = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    return base64Encode(buffer, alphabet, options.padding ?? true);
  },
  decode(data) {
    if (typeof data !== "string") {
      data = new TextDecoder().decode(data);
    }
    const urlSafe = data.includes("-") || data.includes("_");
    const alphabet = getAlphabet(urlSafe);
    return base64Decode(data, alphabet);
  }
};
var base64Url = {
  encode(data, options = {}) {
    const alphabet = getAlphabet(true);
    const buffer = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    return base64Encode(buffer, alphabet, options.padding ?? true);
  },
  decode(data) {
    const urlSafe = data.includes("-") || data.includes("_");
    const alphabet = getAlphabet(urlSafe);
    return base64Decode(data, alphabet);
  }
};

// node_modules/.pnpm/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/index.mjs
function getWebcryptoSubtle() {
  const cr = typeof globalThis !== "undefined" && globalThis.crypto;
  if (cr && typeof cr.subtle === "object" && cr.subtle != null)
    return cr.subtle;
  throw new Error("crypto.subtle must be defined");
}

// node_modules/.pnpm/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/hash.mjs
function createHash(algorithm, encoding) {
  return {
    digest: async (input) => {
      const encoder = new TextEncoder();
      const data = typeof input === "string" ? encoder.encode(input) : input;
      const hashBuffer = await getWebcryptoSubtle().digest(algorithm, data);
      return hashBuffer;
    }
  };
}

// node_modules/.pnpm/@better-auth+core@1.6.23_@b_732fb2bd717cfae2764ea0575be42412/node_modules/@better-auth/core/dist/env/env-impl.mjs
var _envShim = /* @__PURE__ */ Object.create(null);
var _getEnv = (useShim) => globalThis.process?.env || globalThis.Deno?.env.toObject() || globalThis.__env__ || (useShim ? _envShim : globalThis);
var env = new Proxy(_envShim, {
  get(_, prop) {
    return _getEnv()[prop] ?? _envShim[prop];
  },
  has(_, prop) {
    return prop in _getEnv() || prop in _envShim;
  },
  set(_, prop, value) {
    const env2 = _getEnv(true);
    env2[prop] = value;
    return true;
  },
  deleteProperty(_, prop) {
    if (!prop) return false;
    const env2 = _getEnv(true);
    delete env2[prop];
    return true;
  },
  ownKeys() {
    const env2 = _getEnv(true);
    return Object.keys(env2);
  }
});
var nodeENV = env.NODE_ENV ?? "";
var isDevelopment = () => nodeENV === "dev" || nodeENV === "development";
function isValidIP(ip) {
  return z__namespace.ipv4().safeParse(ip).success || z__namespace.ipv6().safeParse(ip).success;
}
function isIPv6(ip) {
  return z__namespace.ipv6().safeParse(ip).success;
}
function extractIPv4FromMapped(ipv62) {
  const lower = ipv62.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const ipv4Part = lower.substring(7);
    if (z__namespace.ipv4().safeParse(ipv4Part).success) return ipv4Part;
  }
  const parts = ipv62.split(":");
  if (parts.length === 7 && parts[5]?.toLowerCase() === "ffff") {
    const ipv4Part = parts[6];
    if (ipv4Part && z__namespace.ipv4().safeParse(ipv4Part).success) return ipv4Part;
  }
  if (lower.includes("::ffff:") || lower.includes(":ffff:")) {
    const groups = expandIPv6(ipv62);
    if (groups.length === 8 && groups[0] === "0000" && groups[1] === "0000" && groups[2] === "0000" && groups[3] === "0000" && groups[4] === "0000" && groups[5] === "ffff" && groups[6] && groups[7]) return `${Number.parseInt(groups[6].substring(0, 2), 16)}.${Number.parseInt(groups[6].substring(2, 4), 16)}.${Number.parseInt(groups[7].substring(0, 2), 16)}.${Number.parseInt(groups[7].substring(2, 4), 16)}`;
  }
  return null;
}
function expandIPv6(ipv62) {
  if (ipv62.includes("::")) {
    const sides = ipv62.split("::");
    const left = sides[0] ? sides[0].split(":") : [];
    const right = sides[1] ? sides[1].split(":") : [];
    const missingGroups = 8 - left.length - right.length;
    const zeros = Array(missingGroups).fill("0000");
    const paddedLeft = left.map((g) => g.padStart(4, "0"));
    const paddedRight = right.map((g) => g.padStart(4, "0"));
    return [
      ...paddedLeft,
      ...zeros,
      ...paddedRight
    ];
  }
  return ipv62.split(":").map((g) => g.padStart(4, "0"));
}
function normalizeIPv6(ipv62, subnetPrefix) {
  const groups = expandIPv6(ipv62);
  if (subnetPrefix !== void 0 && subnetPrefix < 128) {
    let bitsRemaining = Math.max(0, Math.floor(subnetPrefix));
    return groups.map((group) => {
      if (bitsRemaining <= 0) return "0000";
      if (bitsRemaining >= 16) {
        bitsRemaining -= 16;
        return group;
      }
      const masked = Number.parseInt(group, 16) & (65535 << 16 - bitsRemaining & 65535);
      bitsRemaining = 0;
      return masked.toString(16).padStart(4, "0");
    }).join(":").toLowerCase();
  }
  return groups.join(":").toLowerCase();
}
function normalizeIP(ip, options = {}) {
  if (z__namespace.ipv4().safeParse(ip).success) return ip.toLowerCase();
  if (!isIPv6(ip)) return ip.toLowerCase();
  const ipv42 = extractIPv4FromMapped(ip);
  if (ipv42) return ipv42.toLowerCase();
  return normalizeIPv6(ip, options.ipv6Subnet ?? 64);
}

// node_modules/.pnpm/@better-auth+core@1.6.23_@b_732fb2bd717cfae2764ea0575be42412/node_modules/@better-auth/core/dist/utils/host.mjs
var CLOUD_METADATA_HOSTS = /* @__PURE__ */ new Set([
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
  "instance-data",
  "instance-data.ec2.internal"
]);
function stripBrackets(host) {
  if (host.length >= 2 && host.startsWith("[") && host.endsWith("]")) return host.slice(1, -1);
  return host;
}
function stripPort(host) {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end === -1) return host;
    return host.slice(0, end + 1);
  }
  const firstColon = host.indexOf(":");
  if (firstColon === -1) return host;
  if (host.indexOf(":", firstColon + 1) !== -1) return host;
  return host.slice(0, firstColon);
}
function stripZoneId(host) {
  const zone = host.indexOf("%");
  if (zone === -1) return host;
  return host.slice(0, zone);
}
function stripTrailingDot(host) {
  return host.replace(/\.+$/, "");
}
function looksLikeIPv4(host) {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}
function ipv4ToUint32(ip) {
  const parts = ip.split(".");
  return (Number(parts[0]) << 24 | Number(parts[1]) << 16 | Number(parts[2]) << 8 | Number(parts[3])) >>> 0;
}
function inIPv4Range(value, prefix, length) {
  if (length === 0) return true;
  const mask = length === 32 ? 4294967295 : -1 << 32 - length >>> 0;
  return (value & mask) === (prefix & mask);
}
function classifyIPv4(ip) {
  if (ip === "0.0.0.0") return "unspecified";
  if (ip === "255.255.255.255") return "broadcast";
  const n = ipv4ToUint32(ip);
  if (inIPv4Range(n, ipv4ToUint32("127.0.0.0"), 8)) return "loopback";
  if (inIPv4Range(n, ipv4ToUint32("10.0.0.0"), 8)) return "private";
  if (inIPv4Range(n, ipv4ToUint32("172.16.0.0"), 12)) return "private";
  if (inIPv4Range(n, ipv4ToUint32("192.168.0.0"), 16)) return "private";
  if (inIPv4Range(n, ipv4ToUint32("169.254.0.0"), 16)) return "linkLocal";
  if (inIPv4Range(n, ipv4ToUint32("100.64.0.0"), 10)) return "sharedAddressSpace";
  if (inIPv4Range(n, ipv4ToUint32("192.0.2.0"), 24)) return "documentation";
  if (inIPv4Range(n, ipv4ToUint32("198.51.100.0"), 24)) return "documentation";
  if (inIPv4Range(n, ipv4ToUint32("203.0.113.0"), 24)) return "documentation";
  if (inIPv4Range(n, ipv4ToUint32("198.18.0.0"), 15)) return "benchmarking";
  if (inIPv4Range(n, ipv4ToUint32("224.0.0.0"), 4)) return "multicast";
  if (inIPv4Range(n, ipv4ToUint32("0.0.0.0"), 8)) return "reserved";
  if (inIPv4Range(n, ipv4ToUint32("192.0.0.0"), 24)) return "reserved";
  if (inIPv4Range(n, ipv4ToUint32("240.0.0.0"), 4)) return "reserved";
  return "public";
}
function extractEmbeddedIPv4(expanded, startGroup, options = {}) {
  const offset = startGroup * 5;
  const g1 = Number.parseInt(expanded.slice(offset, offset + 4), 16);
  const g2 = Number.parseInt(expanded.slice(offset + 5, offset + 9), 16);
  if (!Number.isFinite(g1) || !Number.isFinite(g2)) return null;
  let combined = (g1 << 16 | g2) >>> 0;
  if (options.xor) combined = (combined ^ 4294967295) >>> 0;
  return `${combined >>> 24 & 255}.${combined >>> 16 & 255}.${combined >>> 8 & 255}.${combined & 255}`;
}
function classifyIPv6(expanded) {
  if (expanded === "0000:0000:0000:0000:0000:0000:0000:0000") return "unspecified";
  if (expanded === "0000:0000:0000:0000:0000:0000:0000:0001") return "loopback";
  const firstByte = Number.parseInt(expanded.slice(0, 2), 16);
  const secondByte = Number.parseInt(expanded.slice(2, 4), 16);
  if (firstByte === 255) return "multicast";
  if (firstByte === 254 && (secondByte & 192) === 128) return "linkLocal";
  if ((firstByte & 254) === 252) return "private";
  if (expanded.startsWith("2001:0db8:")) return "documentation";
  if (expanded.startsWith("2001:0002:0000:")) return "benchmarking";
  if (expanded.startsWith("2002:")) {
    const embedded = extractEmbeddedIPv4(expanded, 1);
    if (embedded && classifyIPv4(embedded) !== "public") return "reserved";
    return "public";
  }
  if (expanded.startsWith("0064:ff9b:0000:0000:0000:0000:")) {
    const embedded = extractEmbeddedIPv4(expanded, 6);
    if (embedded && classifyIPv4(embedded) !== "public") return "reserved";
    return "reserved";
  }
  if (expanded.startsWith("0064:ff9b:0001:")) return "reserved";
  if (expanded.startsWith("2001:0000:")) {
    const embedded = extractEmbeddedIPv4(expanded, 6, { xor: true });
    if (embedded && classifyIPv4(embedded) !== "public") return "reserved";
    return "reserved";
  }
  if (expanded.startsWith("0100:0000:0000:0000:")) return "reserved";
  if (expanded.startsWith("3fff:0")) return "documentation";
  if (expanded.startsWith("5f00:")) return "reserved";
  return "public";
}
function classifyHost(host) {
  const lowered = stripTrailingDot(stripZoneId(stripBrackets(stripPort(host.trim())))).toLowerCase();
  if (lowered === "") return {
    kind: "reserved",
    literal: "fqdn",
    canonical: ""
  };
  if (!isValidIP(lowered)) {
    if (lowered === "localhost" || lowered.endsWith(".localhost")) return {
      kind: "localhost",
      literal: "fqdn",
      canonical: lowered
    };
    if (CLOUD_METADATA_HOSTS.has(lowered)) return {
      kind: "cloudMetadata",
      literal: "fqdn",
      canonical: lowered
    };
    return {
      kind: "public",
      literal: "fqdn",
      canonical: lowered
    };
  }
  if (looksLikeIPv4(lowered)) return {
    kind: classifyIPv4(lowered),
    literal: "ipv4",
    canonical: lowered
  };
  const canonical = normalizeIP(lowered, { ipv6Subnet: 128 });
  if (looksLikeIPv4(canonical)) return {
    kind: classifyIPv4(canonical),
    literal: "ipv4",
    canonical
  };
  return {
    kind: classifyIPv6(canonical),
    literal: "ipv6",
    canonical
  };
}
function isPublicRoutableHost(host) {
  return classifyHost(host).kind === "public";
}
var { net } = electron__default.default;
var DEFAULT_MAX_BYTES = 1024 * 1024 * 5;
async function fetchUserImage(baseURL, url, options) {
  if (options?.userImageProxy?.enabled === false) return null;
  const decoded = await decodeDataImageUrl(url, options);
  if (decoded) return {
    stream: new ReadableStream({ start(controller) {
      controller.enqueue(decoded.bytes);
      controller.close();
    } }),
    mimeType: decoded.mimeType
  };
  let resolvedUrl;
  try {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      if (!baseURL) return null;
      const base = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
      const relative = url.startsWith("/") ? url.slice(1) : url;
      parsed = new URL(relative, base);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!isDevelopment() && !isPublicRoutableHost(parsed.hostname)) return null;
    resolvedUrl = parsed.href;
  } catch {
    return null;
  }
  const { maxSize = DEFAULT_MAX_BYTES, accept = "image/*", customValidator: validateImage = detectImageType } = options?.userImageProxy ?? {};
  const response = await net.fetch(resolvedUrl, {
    method: "GET",
    headers: { accept }
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type");
  if (!contentType?.startsWith("image/") || contentType.startsWith("image/svg")) return null;
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxSize) return null;
  const body = response.body;
  if (!body) return null;
  const mimeType = contentType.split(";")[0]?.trim() || "image/png";
  const reader = body.getReader();
  let totalSize = 0;
  let firstChunk = true;
  return {
    stream: new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        totalSize += value.byteLength;
        if (totalSize > maxSize) {
          reader.cancel();
          controller.error(/* @__PURE__ */ new Error("Image exceeds maximum size"));
          return;
        }
        if (firstChunk) {
          firstChunk = false;
          if (!validateImage(value)) {
            reader.cancel();
            controller.error(/* @__PURE__ */ new Error("Invalid image type"));
            return;
          }
        }
        controller.enqueue(value);
      },
      cancel() {
        reader.cancel();
      }
    }),
    mimeType
  };
}
function normalizeUserOutput(user, options) {
  const result = { ...user };
  if (result.image && options?.userImageProxy?.enabled !== false) result.image = `${options?.userImageProxy?.scheme || "user-image"}://${result.id}`;
  return result;
}
async function decodeDataImageUrl(url, options) {
  const maxSize = options?.userImageProxy?.maxSize ?? DEFAULT_MAX_BYTES;
  const maxBase64Size = Math.ceil(maxSize * 4 / 3);
  const lower = url.toLowerCase();
  if (!lower.startsWith("data:image/") || lower.startsWith("data:image/svg")) return null;
  const markerIdx = lower.indexOf(";base64,");
  if (markerIdx === -1) return null;
  const mimeType = url.substring(5, markerIdx);
  const payload = url.substring(markerIdx + 8);
  if (!payload || payload.length > maxBase64Size) return null;
  try {
    const bytes = base64.decode(payload);
    const { customValidator: validateImage = detectImageType } = options?.userImageProxy ?? {};
    if (!await validateImage(bytes)) return null;
    return {
      bytes,
      mimeType
    };
  } catch {
    return null;
  }
}
function detectImageType(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpg";
  if (bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 56 && (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97) return "image/gif";
  if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
  if (bytes[0] === 66 && bytes[1] === 77) return "image/bmp";
  if (bytes[0] === 73 && bytes[1] === 73 && bytes[2] === 42 && bytes[3] === 0 || bytes[0] === 77 && bytes[1] === 77 && bytes[2] === 0 && bytes[3] === 42) return "image/tiff";
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return "image/x-icon";
  if (bytes.length < 16) return null;
  if (String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") return null;
  const brand = String.fromCharCode(...bytes.slice(8, 12));
  if (brand === "avif" || brand === "heic" || brand === "heif") return `image/${brand}`;
  if (brand === "heix" || brand === "hevc" || brand === "mif1" || brand === "msf1") return "image/heic";
  return null;
}
var kElectron = /* @__PURE__ */ Symbol.for("better-auth:electron");
(() => {
  const { provider, idToken, loginHint, ...signInSocialBody } = api.signInSocial().options.body.shape;
  return z__namespace.object({
    ...signInSocialBody,
    provider: z__namespace.string().nonempty().optional()
  });
})();
async function requestAuth(clientOptions, options, cfg) {
  if (!isProcessType("browser")) throw new BetterAuthError("`requestAuth` can only be called in the main process");
  const { randomBytes } = await import('crypto');
  const state = crypto.generateRandomString(16, "A-Z", "a-z", "0-9");
  const codeVerifier = base64Url.encode(randomBytes(32));
  const codeChallenge = base64Url.encode(await createHash("SHA-256").digest(codeVerifier));
  (globalThis[kElectron] ?? (globalThis[kElectron] = /* @__PURE__ */ new Map())).set(state, codeVerifier);
  let url = null;
  if (cfg?.provider) {
    const baseURL = betterAuth.getBaseURL(clientOptions?.baseURL, clientOptions?.basePath, void 0, true);
    if (!baseURL) {
      console.log("No base URL found in client options");
      throw betterAuth.APIError.from("INTERNAL_SERVER_ERROR", {
        code: "NO_BASE_URL",
        message: "Base URL is required to use provider-based sign-in."
      });
    }
    url = new URL(`${baseURL}/electron/init-oauth-proxy`);
    for (const [key, value] of Object.entries(cfg)) url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  } else url = new URL(options.signInURL);
  url.searchParams.set("client_id", options.clientID || "electron");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  await electron.shell.openExternal(url.toString(), { activate: true });
}
async function authenticate({ $fetch, options, token, getWindow, fetchOptions }) {
  if (!isProcessType("browser")) throw new BetterAuthError("`authenticate` can only be called in the main process.");
  const decoded = betterAuth.safeJSONParse(new TextDecoder().decode(base64Url.decode(decodeURIComponent(token))));
  const codeVerifier = globalThis[kElectron]?.get(decoded?.state);
  globalThis[kElectron]?.delete(decoded?.state);
  if (!codeVerifier) throw new BetterAuthError("Code verifier not found.");
  return await $fetch("/electron/token", {
    ...fetchOptions,
    method: "POST",
    body: {
      ...fetchOptions?.body || {},
      token: decoded.identifier,
      state: decoded.state,
      code_verifier: codeVerifier
    },
    onSuccess: async (ctx) => {
      let user = ctx.data?.user ?? null;
      if (user !== null && typeof options.sanitizeUser === "function") try {
        user = await options.sanitizeUser(user);
      } catch (error) {
        console.error("Error while sanitizing user", error);
        user = null;
      }
      if (user === null) return;
      user = normalizeUserOutput(user, options);
      await fetchOptions?.onSuccess?.(ctx);
      getWindow()?.webContents.send(`${getChannelPrefixWithDelimiter(options.channelPrefix)}authenticated`, user);
    }
  });
}
var { app: app$1, session, protocol, BrowserWindow, ipcMain, webContents: webContents$1 } = electron__default.default;
function withGetWindowFallback(win) {
  return win ?? (() => {
    const allWindows = BrowserWindow.getAllWindows();
    return allWindows.length > 0 ? allWindows[0] : null;
  });
}
function setupMain($fetch, $store, getCookie2, opts, clientOptions, cfg) {
  if (!isProcessType("browser")) throw new BetterAuthError("setupMain can only be called in the main process.");
  const getWindow = withGetWindowFallback(cfg?.getWindow);
  if (!cfg || cfg.csp === true) setupCSP(clientOptions, opts);
  if (!cfg || cfg.scheme === true) registerProtocolScheme($fetch, opts, getWindow, clientOptions);
  if (!cfg || cfg.bridges === true) setupBridges({
    $fetch,
    $store,
    getCookie: getCookie2,
    getWindow
  }, opts, clientOptions);
  if (opts.userImageProxy?.enabled !== false) setupUserImageProxy({
    $fetch,
    getCookie: getCookie2
  }, opts, clientOptions);
}
async function handleDeepLink({ $fetch, options, url, getWindow, clientOptions }) {
  if (!isProcessType("browser")) throw new BetterAuthError("`handleDeepLink` can only be called in the main process.");
  let parsedURL = null;
  try {
    parsedURL = new URL(url);
  } catch {
  }
  if (!parsedURL) return;
  const { scheme } = parseProtocolScheme(options.protocol);
  if (!url.startsWith(`${scheme}:/`)) return;
  const { protocol: protocol2, pathname, hostname, hash } = parsedURL;
  if (protocol2 !== `${scheme}:`) return;
  if ("/" + hostname + pathname !== (options.callbackPath || "/auth/callback")) return;
  if (!hash.startsWith("#token=")) return;
  await authenticate({
    $fetch,
    fetchOptions: { throw: true },
    token: hash.substring(7),
    getWindow: withGetWindowFallback(getWindow),
    options
  });
}
function registerProtocolScheme($fetch, options, getWindow, clientOptions) {
  const { scheme, privileges = {} } = typeof options.protocol === "string" ? { scheme: options.protocol } : options.protocol;
  protocol.registerSchemesAsPrivileged([{
    scheme,
    privileges: {
      standard: false,
      secure: true,
      ...privileges
    }
  }]);
  let hasSetupProtocolClient = false;
  if (process?.defaultApp) {
    if (process.argv.length >= 2 && typeof process.argv[1] === "string") hasSetupProtocolClient = app$1.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])]);
  } else hasSetupProtocolClient = app$1.setAsDefaultProtocolClient(scheme);
  if (!hasSetupProtocolClient) console.error(`Failed to register protocol ${scheme} as default protocol client.`);
  if (!app$1.requestSingleInstanceLock()) app$1.quit();
  else {
    app$1.on("second-instance", async (_event, commandLine, _workingDir, url) => {
      const win = getWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
      if (!url) {
        const maybeURL = commandLine.pop();
        if (typeof maybeURL === "string" && maybeURL.trim() !== "") try {
          url = new URL(maybeURL).toString();
        } catch {
        }
      }
      if (process?.platform !== "darwin" && typeof url === "string") await handleDeepLink({
        $fetch,
        options,
        url,
        getWindow,
        clientOptions
      });
    });
    app$1.on("open-url", async (_event, url) => {
      if (process?.platform === "darwin") await handleDeepLink({
        $fetch,
        options,
        url,
        getWindow,
        clientOptions
      });
    });
    app$1.whenReady().then(async () => {
      if (process?.platform !== "darwin" && typeof process.argv[1] === "string") await handleDeepLink({
        $fetch,
        options,
        url: process.argv[1],
        getWindow,
        clientOptions
      });
    });
  }
}
function setupCSP(clientOptions, options) {
  app$1.whenReady().then(() => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const origin = new URL(clientOptions?.baseURL || "", "http://localhost").origin;
      const cspKey = Object.keys(details.responseHeaders || {}).find((k) => k.toLowerCase() === "content-security-policy");
      if (!cspKey) return callback({ responseHeaders: {
        ...details.responseHeaders || {},
        "content-security-policy": `connect-src 'self' ${origin}`
      } });
      const policy = details.responseHeaders?.[cspKey]?.toString() || "";
      const csp = /* @__PURE__ */ new Map();
      for (let token of policy.split(";")) {
        token = token.trim();
        if (!token || !/^[\x00-\x7f]*$/.test(token)) continue;
        const [rawDirectiveName, ...directiveValue] = token.split(/\s+/);
        const directiveName = rawDirectiveName?.toLowerCase();
        if (!directiveName) continue;
        if (csp.has(directiveName)) continue;
        csp.set(directiveName, directiveValue);
      }
      if (csp.has("connect-src")) {
        const values = csp.get("connect-src") || [];
        if (!values.includes(origin)) values.push(origin);
        csp.set("connect-src", values);
      } else csp.set("connect-src", ["'self'", origin]);
      const userImageScheme = (options.userImageProxy?.scheme || "user-image") + ":";
      if (csp.has("img-src")) {
        const values = csp.get("img-src") || [];
        if (!values.includes(userImageScheme)) values.push(userImageScheme);
        csp.set("img-src", values);
      } else csp.set("img-src", ["'self'", userImageScheme]);
      callback({ responseHeaders: {
        ...details.responseHeaders,
        "content-security-policy": Array.from(csp.entries()).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ")
      } });
    });
  });
}
function setupBridges(ctx, opts, clientOptions) {
  const prefix = getChannelPrefixWithDelimiter(opts.channelPrefix);
  ctx.$store?.atoms.session?.subscribe(async (state) => {
    if (state.isPending === true) return;
    let user = state.data?.user ?? null;
    if (user !== null && typeof opts.sanitizeUser === "function") try {
      user = await opts.sanitizeUser(user);
    } catch (error) {
      console.error("Error while sanitizing user", error);
      user = null;
    }
    if (user !== null) user = normalizeUserOutput(user, opts);
    webContents$1.getFocusedWebContents()?.send(`${prefix}user-updated`, user);
  });
  ipcMain.handle(`${prefix}getUser`, async () => {
    let user = (await ctx.$fetch("/get-session", {
      method: "GET",
      headers: {
        cookie: ctx.getCookie(),
        "content-type": "application/json"
      }
    })).data?.user ?? null;
    if (user !== null && typeof opts.sanitizeUser === "function") try {
      user = await opts.sanitizeUser(user);
    } catch (error) {
      console.error("Error while sanitizing user", error);
      user = null;
    }
    if (user !== null) user = normalizeUserOutput(user, opts);
    return user ?? null;
  });
  ipcMain.handle(`${prefix}requestAuth`, async (_evt, options) => requestAuth(clientOptions, opts, options));
  ipcMain.handle(`${prefix}authenticate`, async (_evt, data) => {
    await authenticate({
      $fetch: ctx.$fetch,
      getWindow: ctx.getWindow,
      options: opts,
      token: data.token
    });
  });
  ipcMain.handle(`${prefix}signOut`, async () => {
    await ctx.$fetch("/sign-out", {
      method: "POST",
      body: "{}",
      headers: {
        cookie: ctx.getCookie(),
        "content-type": "application/json"
      }
    });
  });
}
function setupUserImageProxy(ctx, opts, clientOptions) {
  const hasAdminPlugin = clientOptions?.plugins?.some((plugin) => plugin.id === "admin") ?? false;
  const scheme = opts.userImageProxy?.scheme || "user-image";
  protocol.registerSchemesAsPrivileged([{
    scheme,
    privileges: {
      standard: false,
      secure: true,
      bypassCSP: true,
      stream: true
    }
  }]);
  app$1.whenReady().then(() => {
    protocol.handle(scheme, async (request2) => {
      try {
        const userId = new URL(request2.url).hostname;
        if (!userId) return new Response(null, { status: 400 });
        const headers = {
          cookie: ctx.getCookie(),
          "content-type": "application/json"
        };
        let imageUrl = null;
        const sessionResult = await ctx.$fetch("/get-session", {
          method: "GET",
          headers
        });
        if (sessionResult.data?.user?.id === userId) imageUrl = sessionResult.data.user.image;
        else if (hasAdminPlugin) imageUrl = (await ctx.$fetch(`/admin/get-user?id=${encodeURIComponent(userId)}`, {
          method: "GET",
          headers
        })).data?.user?.image;
        if (!imageUrl) return new Response(null, { status: 404 });
        const result = await fetchUserImage(clientOptions?.baseURL, imageUrl, opts);
        if (!result) return new Response(null, { status: 404 });
        return new Response(result.stream, { headers: {
          "content-type": result.mimeType,
          "cache-control": "private, max-age=3600"
        } });
      } catch {
        return new Response(null, { status: 500 });
      }
    });
  });
}
function getSetCookie(header, prevCookie) {
  const parsed = cookies.parseSetCookieHeader(header);
  let toSetCookie = {};
  parsed.forEach((cookie, key) => {
    const expiresAt = cookie["expires"];
    const maxAge = cookie["max-age"];
    const expires = maxAge ? new Date(Date.now() + Number(maxAge) * 1e3) : expiresAt ? new Date(String(expiresAt)) : null;
    toSetCookie[key] = {
      value: cookie["value"],
      expires: expires ? expires.toISOString() : null
    };
  });
  if (prevCookie) try {
    toSetCookie = {
      ...JSON.parse(prevCookie),
      ...toSetCookie
    };
  } catch {
  }
  return JSON.stringify(toSetCookie);
}
function getCookie(cookie) {
  let parsed = {};
  try {
    parsed = JSON.parse(cookie);
  } catch (_e) {
  }
  const pairs = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (value.expires && new Date(value.expires) < /* @__PURE__ */ new Date()) continue;
    if (!cookies.cookieNameRegex.test(key)) continue;
    pairs.push(`${key}=${encodeURIComponent(value.value)}`);
  }
  return pairs.join("; ");
}
function hasSessionCookieChanged(prevCookie, newCookie) {
  if (!prevCookie) return true;
  try {
    const prev = JSON.parse(prevCookie);
    const next = JSON.parse(newCookie);
    const sessionKeys = /* @__PURE__ */ new Set();
    Object.keys(prev).forEach((key) => {
      if (key.includes("session_token") || key.includes("session_data")) sessionKeys.add(key);
    });
    Object.keys(next).forEach((key) => {
      if (key.includes("session_token") || key.includes("session_data")) sessionKeys.add(key);
    });
    for (const key of sessionKeys) if (prev[key]?.value !== next[key]?.value) return true;
    return false;
  } catch {
    return true;
  }
}
function hasBetterAuthCookies(setCookieHeader, cookiePrefix) {
  const cookies$1 = cookies.parseSetCookieHeader(setCookieHeader);
  const cookieSuffixes = ["session_token", "session_data"];
  const prefixes = Array.isArray(cookiePrefix) ? cookiePrefix : [cookiePrefix];
  for (const name of cookies$1.keys()) {
    const nameWithoutSecure = name.startsWith("__Secure-") ? name.slice(9) : name;
    for (const prefix of prefixes) if (prefix) {
      if (nameWithoutSecure.startsWith(prefix)) return true;
    } else for (const suffix of cookieSuffixes) if (nameWithoutSecure.endsWith(suffix)) return true;
  }
  return false;
}
var { app, safeStorage, webContents } = electron__default.default;
var storageAdapter = (storage2, sessionKeys) => {
  const memory = /* @__PURE__ */ new Map();
  return {
    ...storage2,
    getDecrypted: (name) => {
      if (sessionKeys.has(name) && memory.has(name)) return memory.get(name) ?? null;
      if (!safeStorage.isEncryptionAvailable()) return null;
      const item = storage2.getItem(name);
      if (!item || typeof item !== "string") return null;
      try {
        return safeStorage.decryptString(buffer.Buffer.from(base64.decode(item)));
      } catch {
        return null;
      }
    },
    setEncrypted: (name, value) => {
      if (!safeStorage.isEncryptionAvailable()) {
        if (sessionKeys.has(name)) memory.set(name, value);
        return;
      }
      try {
        storage2.setItem(name, base64.encode(safeStorage.encryptString(value)));
      } catch {
        return;
      }
    }
  };
};
var electronClient = (options) => {
  const opts = {
    storagePrefix: "better-auth",
    cookiePrefix: "better-auth",
    channelPrefix: "better-auth",
    callbackPath: "/auth/callback",
    ...options
  };
  const { scheme } = parseProtocolScheme(opts.protocol);
  let store = null;
  const cookieName = `${opts.storagePrefix}.cookie`;
  const localCacheName = `${opts.storagePrefix}.local_cache`;
  const { getDecrypted, setEncrypted } = storageAdapter(opts.storage, /* @__PURE__ */ new Set([cookieName, localCacheName]));
  const clearSessionCache = () => {
    setEncrypted(cookieName, "{}");
    store?.atoms.session?.set({
      ...store.atoms.session.get(),
      data: null,
      error: null,
      isPending: false
    });
    setEncrypted(localCacheName, "{}");
  };
  if ((betterAuth.isDevelopment() || betterAuth.isTest()) && /^(?!\.)(?!.*\.\.)(?!.*\.$)[^.]+\.[^.]+$/.test(scheme)) console.warn("The provided scheme does not follow the reverse domain name notation. For example: `app.example.com` -> `com.example.app`.");
  return {
    id: "electron",
    version: PACKAGE_VERSION,
    fetchPlugins: [{
      id: "electron",
      name: "Electron",
      async init(url, options2) {
        if (!isProcessType("browser")) throw new Error("Requests must be made from the Electron main process");
        const cookie = getCookie(getDecrypted(cookieName) || "{}");
        options2 || (options2 = {});
        options2.credentials = "omit";
        options2.headers = {
          ...options2.headers,
          cookie,
          "user-agent": app.userAgentFallback,
          "electron-origin": `${scheme}:/`,
          "x-skip-oauth-proxy": "true"
        };
        if (url.endsWith("/sign-out")) clearSessionCache();
        return {
          url,
          options: options2
        };
      },
      hooks: {
        onSuccess: async (context) => {
          const setCookie = context.response.headers.get("set-cookie");
          if (setCookie) {
            if (hasBetterAuthCookies(setCookie, opts.cookiePrefix)) {
              const prevCookie = getDecrypted(cookieName);
              const toSetCookie = getSetCookie(setCookie || "{}", prevCookie ?? void 0);
              if (hasSessionCookieChanged(prevCookie, toSetCookie)) {
                setEncrypted(cookieName, toSetCookie);
                store?.notify("$sessionSignal");
              } else setEncrypted(cookieName, toSetCookie);
            }
          }
          if (context.request.url.toString().includes("/get-session") && !opts.disableCache) {
            const data = context.data;
            setEncrypted(localCacheName, JSON.stringify(data));
          }
          if (context.request.url.toString().includes("/sign-out")) clearSessionCache();
        },
        onError: async (context) => {
          webContents.getFocusedWebContents()?.send(`${getChannelPrefixWithDelimiter(opts.channelPrefix)}error`, {
            ...context.error,
            path: context.request.url
          });
        }
      }
    }],
    getActions: ($fetch, $store, clientOptions) => {
      store = $store;
      let getWindow = () => null;
      const getCookieFn = () => {
        return getCookie(getDecrypted(cookieName) || "{}");
      };
      return {
        getCookie: getCookieFn,
        authenticate: async (data) => {
          return await authenticate({
            ...data,
            $fetch,
            options,
            getWindow: withGetWindowFallback(getWindow)
          });
        },
        requestAuth: (options2) => requestAuth(clientOptions, opts, options2),
        setupMain: (cfg) => {
          if (cfg?.getWindow) getWindow = cfg.getWindow;
          return setupMain($fetch, store, getCookieFn, opts, clientOptions, cfg);
        },
        $Infer: {}
      };
    }
  };
};
var { app: app2 } = electron__default.default;
var storage = (opts) => {
  if (!app2) return {
    getItem: () => null,
    setItem: () => {
    }
  };
  const config = new Conf__default.default({
    cwd: app2.getPath("userData"),
    projectName: app2.getName(),
    projectVersion: app2.getVersion(),
    ...opts
  });
  return {
    getItem: (key) => {
      return config.get(key, null);
    },
    setItem: (key, value) => {
      config.set(key, value);
    }
  };
};
var authClient = client.createAuthClient({
  baseURL: BETTER_AUTH_BASE_URL,
  plugins: [
    electronClient({
      callbackPath: ELECTRON_AUTH_CALLBACK_PATH,
      clientID: ELECTRON_AUTH_CLIENT_ID,
      protocol: {
        scheme: ELECTRON_AUTH_PROTOCOL
      },
      signInURL: ELECTRON_AUTH_SIGN_IN_URL,
      storage: storage(),
      // Offline/defense-in-depth: never register the bypassCSP "user-image://"
      // proxy that net.fetches a remote avatar URL from the main process. Auth is
      // local email/password (no remote avatars), so this only closes a latent,
      // un-CSP'd egress surface.
      userImageProxy: { enabled: false }
    })
  ]
});
function normalizeColumnsForArrow(cols, _types) {
  const out = {};
  for (const [name, values] of Object.entries(cols)) {
    out[name] = values.map((v) => normalizeValue(v));
  }
  return out;
}
function normalizeValue(v) {
  if (v === null || v === void 0) return v;
  if (typeof v === "bigint") {
    if (v <= MAX_SAFE_BIGINT && v >= MIN_SAFE_BIGINT) {
      return Number(v);
    }
    return v;
  }
  if (v instanceof Date) return v;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return v;
  return stringifyComplex(v);
}
function stringifyComplex(v) {
  try {
    return JSON.stringify(v, bigintReplacer);
  } catch {
    return String(v);
  }
}
function bigintReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}
var MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
var MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
function encodeColumnsToArrowIPC(columns, types) {
  const normalized = normalizeColumnsForArrow(columns);
  const table = apacheArrow.tableFromArrays(normalized);
  return apacheArrow.tableToIPC(table, "stream");
}

// electron/duckdb-service.ts
var READ_CONN_COUNT = 3;
var MAX_METRICS = 200;
var DEFAULT_PREVIEW_LIMIT = 100;
var MAX_PREVIEW_LIMIT = 500;
var DEFAULT_CSV_SAMPLE_SIZE = 20480;
var MAX_CSV_SAMPLE_SIZE = 1e6;
var DatasetIdSchema = z.z.string().regex(/^ds_[A-Za-z0-9_-]{8,32}$/, "Invalid dataset id");
var CsvEncodingSchema = z.z.enum(["utf-8", "utf-16", "latin-1"]);
var RegisterCSVPathDatasetSchema = z.z.object({
  filePath: z.z.string().min(1),
  displayName: z.z.string().min(1).max(255).optional(),
  hasHeader: z.z.boolean().optional(),
  delimiter: z.z.string().min(1).max(4).optional(),
  sampleSize: z.z.number().int().positive().max(MAX_CSV_SAMPLE_SIZE).optional(),
  previewLimit: z.z.number().int().positive().max(MAX_PREVIEW_LIMIT).optional(),
  /** Detected/overridden text encoding (the data-import cluster detects it). */
  encoding: CsvEncodingSchema.optional(),
  /** Capture coerced/skipped rows into reject_scans/reject_errors temp tables. */
  storeRejects: z.z.boolean().optional()
});
var RegisterParquetPathDatasetSchema = z.z.object({
  filePath: z.z.string().min(1),
  displayName: z.z.string().min(1).max(255).optional(),
  previewLimit: z.z.number().int().positive().max(MAX_PREVIEW_LIMIT).optional()
});
var PreviewDatasetSchema = z.z.object({
  datasetId: DatasetIdSchema,
  limit: z.z.number().int().positive().max(MAX_PREVIEW_LIMIT).optional(),
  offset: z.z.number().int().min(0).optional()
});
var DatasetOnlySchema = z.z.object({
  datasetId: DatasetIdSchema
});
var ExportDatasetSchema = z.z.object({
  datasetId: DatasetIdSchema,
  targetPath: z.z.string().min(1)
});
var ColumnNameSchema = z.z.string().min(1).max(255);
var CancelTokenSchema = z.z.string().min(1).max(128).optional();
var ProfileDatasetSchema = z.z.object({
  datasetId: DatasetIdSchema,
  cancelToken: CancelTokenSchema
});
var ProfileColumnDetailSchema = z.z.object({
  datasetId: DatasetIdSchema,
  column: ColumnNameSchema,
  topK: z.z.number().int().positive().max(100).optional(),
  binCount: z.z.number().int().positive().max(200).optional(),
  cancelToken: CancelTokenSchema
});
var CountRowsSchema = z.z.object({
  datasetId: DatasetIdSchema,
  where: z.z.string().max(1e4).optional(),
  force: z.z.boolean().optional(),
  cancelToken: CancelTokenSchema
});
var KeysetSortKeySchema = z.z.object({
  column: ColumnNameSchema,
  direction: z.z.enum(["ASC", "DESC"]).default("ASC")
});
var KeysetCursorSchema = z.z.object({
  sortValues: z.z.array(z.z.unknown()),
  rowid: z.z.number()
});
var KeysetPageSchema = z.z.object({
  datasetId: DatasetIdSchema,
  sortKeys: z.z.array(KeysetSortKeySchema).min(1).max(8),
  limit: z.z.number().int().positive().max(1e5),
  where: z.z.string().max(1e4).optional(),
  cursor: KeysetCursorSchema.optional(),
  columns: z.z.array(ColumnNameSchema).max(512).optional(),
  cancelToken: CancelTokenSchema
});
var instance = null;
var writeConn = null;
var readConns = [];
var initPromise = null;
var activeDbPath = null;
var activeDatasetsDir = null;
var readConnIndex = 0;
var writeQueue = new PQueue__default.default({ concurrency: 1 });
var readQueue = new PQueue__default.default({ concurrency: READ_CONN_COUNT });
var queryMetrics = [];
function truncateSql(sql3, maxLen = 240) {
  return sql3.length > maxLen ? `${sql3.slice(0, maxLen)}...` : sql3;
}
function pushMetric(metric) {
  queryMetrics.unshift(metric);
  if (queryMetrics.length > MAX_METRICS) {
    queryMetrics.pop();
  }
}
async function measureRows(conn, sql3) {
  const start = performance.now();
  const result = await conn.run(sql3);
  const rows = await result.getRowObjectsJS();
  const durationMs = Math.round(performance.now() - start);
  pushMetric({
    sql: truncateSql(sql3),
    durationMs,
    timestamp: Date.now(),
    rowCount: rows.length
  });
  return rows;
}
async function measureRun(conn, sql3) {
  const start = performance.now();
  await conn.run(sql3);
  const durationMs = Math.round(performance.now() - start);
  pushMetric({
    sql: truncateSql(sql3),
    durationMs,
    timestamp: Date.now(),
    rowCount: 0
  });
}
function enqueueWrite(operation) {
  return writeQueue.add(operation);
}
function enqueueRead(operation) {
  return readQueue.add(operation);
}
function getDuckDBRootDir() {
  return path__default.default.join(electron.app.getPath("userData"), "data-navigator");
}
function getDuckDBPath() {
  return path__default.default.join(getDuckDBRootDir(), "data-navigator.duckdb");
}
function getDatasetsDirPath() {
  return path__default.default.join(getDuckDBRootDir(), "datasets");
}
async function ensureDirectory(dir) {
  await fs__default.default.mkdir(dir, { recursive: true });
}
async function assertReadableFile(filePath) {
  const resolved = path__default.default.resolve(filePath);
  const stat = await fs__default.default.stat(resolved);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${resolved}`);
  }
  return resolved;
}
async function assertManagedCachePath(cachePath) {
  const datasetsDir = path__default.default.resolve(getDatasetsDirPath());
  const resolved = path__default.default.resolve(cachePath);
  const relative = path__default.default.relative(datasetsDir, resolved);
  const isInsideDatasetsDir = relative !== "" && !relative.startsWith("..") && !path__default.default.isAbsolute(relative);
  if (!isInsideDatasetsDir) {
    throw new Error(`Refusing to access unmanaged cache path: ${resolved}`);
  }
  return resolved;
}
async function ensureParentDirectory(filePath) {
  await fs__default.default.mkdir(path__default.default.dirname(path__default.default.resolve(filePath)), { recursive: true });
}
function quoteSqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
function quoteSqlPathList(paths) {
  return `[${paths.map((p) => quoteSqlString(p)).join(", ")}]`;
}
async function applyReadConnectionSandbox(conn, allowedDirs) {
  const resolvedDirs = allowedDirs.filter((dir) => typeof dir === "string" && dir.length > 0).map((dir) => path__default.default.resolve(dir));
  if (resolvedDirs.length === 0) return;
  const setting = `SET allowed_directories = ${quoteSqlPathList(resolvedDirs)}`;
  try {
    await conn.run(setting);
  } catch (error) {
    console.warn(
      `[duckdb] read-connection sandbox skipped (SET allowed_directories): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
function makeDatasetId() {
  return `ds_${nanoid.nanoid(12)}`;
}
function datasetViewName(datasetId2) {
  return DatasetIdSchema.parse(datasetId2);
}
function buildCsvOptions(options) {
  const parts = [
    "auto_detect = true",
    `header = ${options.hasHeader ?? true}`,
    "strict_mode = false",
    "null_padding = true",
    `sample_size = ${options.sampleSize ?? DEFAULT_CSV_SAMPLE_SIZE}`,
    "max_line_size = 10000000"
  ];
  if (options.delimiter) {
    parts.push(`delim = ${quoteSqlString(options.delimiter)}`);
  }
  if (options.encoding) {
    parts.push(`encoding = ${quoteSqlString(options.encoding)}`);
  }
  if (options.storeRejects) {
    parts.push("store_rejects = true");
  }
  return parts.join(", ");
}
function normalizeColumns(rows) {
  return rows.map((row) => ({
    name: String(row.column_name ?? row.name),
    type: String(row.column_type ?? row.type),
    nullable: row.null !== "NO" && row.null !== false
  }));
}
function parseColumns(value) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((column) => ({
      name: String(column.name),
      type: String(column.type),
      nullable: Boolean(column.nullable)
    }));
  } catch {
    return [];
  }
}
function getReadConnection() {
  if (readConns.length === 0) {
    if (!writeConn) {
      throw new Error("DuckDB connection not initialized");
    }
    return writeConn;
  }
  const conn = readConns[readConnIndex % readConns.length];
  readConnIndex += 1;
  return conn;
}
function getWriteConnection() {
  if (!writeConn) {
    throw new Error("DuckDB connection not initialized");
  }
  return writeConn;
}
async function ensureDatasetCatalog() {
  const conn = getWriteConnection();
  await measureRun(
    conn,
    `
      CREATE TABLE IF NOT EXISTS app_datasets (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        view_name TEXT NOT NULL UNIQUE,
        source_path TEXT NOT NULL,
        cache_path TEXT NOT NULL,
        source_format TEXT NOT NULL,
        row_count BIGINT NOT NULL DEFAULT 0,
        schema_json TEXT NOT NULL DEFAULT '[]',
        csv_options_json TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `
  );
}
async function restoreDatasetViews() {
  const conn = getWriteConnection();
  const datasets = await measureRows(
    conn,
    `
      SELECT id, view_name, cache_path
      FROM app_datasets
      ORDER BY created_at ASC
    `
  );
  for (const dataset of datasets) {
    const id = String(dataset.id);
    const viewName = String(dataset.view_name);
    const cachePath = String(dataset.cache_path);
    try {
      await assertManagedCachePath(cachePath);
      await fs__default.default.access(cachePath);
      await measureRun(
        conn,
        `
          CREATE OR REPLACE VIEW ${quoteIdentifier(viewName)} AS
          SELECT *
          FROM read_parquet(${quoteSqlString(cachePath)})
        `
      );
    } catch {
      await measureRun(
        conn,
        `
          UPDATE app_datasets
          SET updated_at = now()
          WHERE id = ${quoteSqlString(id)}
        `
      );
    }
  }
}
async function getDatasetById(conn, datasetId2) {
  const id = DatasetIdSchema.parse(datasetId2);
  const rows = await measureRows(
    conn,
    `
      SELECT
        id,
        display_name,
        view_name,
        source_path,
        cache_path,
        source_format,
        row_count,
        schema_json,
        created_at,
        updated_at
      FROM app_datasets
      WHERE id = ${quoteSqlString(id)}
      LIMIT 1
    `
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    viewName: String(row.view_name),
    sourcePath: String(row.source_path),
    cachePath: String(row.cache_path),
    sourceFormat: String(row.source_format),
    rowCount: Number(row.row_count ?? 0),
    columns: parseColumns(row.schema_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}
function stripSqlWrapping(sql3) {
  let s = sql3.trim();
  const fence = s.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) s = fence[1].trim();
  s = s.replace(/^(\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)+/i, "").trim();
  s = s.replace(/;+\s*$/, "").trim();
  return s;
}
function assertReadOnlySql(sql3) {
  const trimmed = stripSqlWrapping(sql3);
  const upper = trimmed.toUpperCase();
  const allowed = upper.startsWith("SELECT") || upper.startsWith("WITH") || upper.startsWith("SHOW") || upper.startsWith("DESCRIBE") || upper.startsWith("DESC ") || upper.startsWith("SUMMARIZE") || upper.startsWith("EXPLAIN") || // DuckDB read-only shorthands the 1.5B model sometimes emits.
  upper.startsWith("FROM") || upper.startsWith("TABLE") || upper.startsWith("VALUES") || upper.startsWith("PIVOT") || upper.startsWith("UNPIVOT");
  if (!allowed) {
    const preview = trimmed.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `Only read-only DuckDB queries are allowed from renderer. Got: ${preview || "<empty>"}`
    );
  }
  const blocked = /\b(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|COPY|EXPORT|IMPORT|ATTACH|DETACH|INSTALL|LOAD|CALL|PRAGMA)\b/i;
  if (blocked.test(trimmed)) {
    throw new Error("Unsafe SQL statement blocked.");
  }
  const blockedFunctions = /\b(read_csv(_auto)?|read_parquet|parquet_scan|parquet_metadata|parquet_schema|parquet_file_metadata|parquet_kv_metadata|read_json(_auto|_objects)?|read_ndjson(_auto)?|read_text|read_blob|sniff_csv|glob|getenv)\s*\(/i;
  if (blockedFunctions.test(trimmed)) {
    throw new Error("Unsafe SQL function blocked (file/IO/env access).");
  }
  const fromStringLiteral = /\b(FROM|JOIN)\s+'/i;
  if (fromStringLiteral.test(trimmed)) {
    throw new Error("Unsafe SQL: string-literal table source blocked.");
  }
  const setConfig = /\bSET\s+(SESSION\s+|GLOBAL\s+|LOCAL\s+)?[A-Za-z_][\w]*\s*=/i;
  if (setConfig.test(trimmed)) {
    throw new Error("Unsafe SQL: SET configuration blocked.");
  }
  return trimmed;
}
async function describeView(conn, viewName) {
  const rows = await measureRows(conn, `DESCRIBE ${quoteIdentifier(viewName)}`);
  return normalizeColumns(rows);
}
async function countViewRows(conn, viewName) {
  const rows = await measureRows(
    conn,
    `
      SELECT count(*) AS row_count
      FROM ${quoteIdentifier(viewName)}
    `
  );
  return Number(rows[0]?.row_count ?? 0);
}
var REJECT_SAMPLE_LIMIT = 50;
async function collectRejectSummary(conn) {
  try {
    const countRows2 = await measureRows(conn, "SELECT count(*) AS bad_rows FROM reject_errors");
    const rejectedRowCount = Number(countRows2[0]?.bad_rows ?? 0);
    if (rejectedRowCount === 0) {
      return { rejectedRowCount: 0, sample: [] };
    }
    const sampleRows = await measureRows(
      conn,
      `
        SELECT line, column_name, error_type, error_message
        FROM reject_errors
        ORDER BY line
        LIMIT ${REJECT_SAMPLE_LIMIT}
      `
    );
    const sample = sampleRows.map((row) => ({
      line: row.line === null || row.line === void 0 ? null : Number(row.line),
      columnName: row.column_name === null || row.column_name === void 0 ? null : String(row.column_name),
      errorType: row.error_type === null || row.error_type === void 0 ? null : String(row.error_type),
      errorMessage: row.error_message === null || row.error_message === void 0 ? null : String(row.error_message)
    }));
    return { rejectedRowCount, sample };
  } catch {
    return { rejectedRowCount: 0, sample: [] };
  }
}
async function ensureInit() {
  if (instance && writeConn) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const rootDir = getDuckDBRootDir();
      const datasetsDir = getDatasetsDirPath();
      const dbPath = getDuckDBPath();
      await ensureDirectory(rootDir);
      await ensureDirectory(datasetsDir);
      const tmpSpillDir = path__default.default.join(rootDir, "tmp");
      await ensureDirectory(tmpSpillDir);
      const cores = os3__default.default.availableParallelism?.() ?? 4;
      const threads = String(Math.max(2, Math.min(cores - 1, 6)));
      instance = await nodeApi.DuckDBInstance.create(dbPath, {
        threads,
        // enable_external_access is a startup-only GLOBAL setting in DuckDB 1.x;
        // it cannot be changed via SET after the database is open. Default is
        // already true, but we set it explicitly so the intent is clear.
        enable_external_access: "true"
      });
      writeConn = await instance.connect();
      readConns = [];
      for (let i = 0; i < READ_CONN_COUNT; i += 1) {
        readConns.push(await instance.connect());
      }
      activeDbPath = dbPath;
      activeDatasetsDir = datasetsDir;
      const pragmas = [
        `PRAGMA threads = ${threads}`,
        "PRAGMA enable_progress_bar = false",
        // Cap RAM so a big scan can't OOM 8 GB; spill to disk past the limit.
        "PRAGMA memory_limit = '4GB'",
        `PRAGMA temp_directory = ${quoteSqlString(tmpSpillDir)}`,
        "PRAGMA max_temp_directory_size = '20GB'",
        // Cache Parquet footers across queries.
        "PRAGMA enable_object_cache"
      ];
      for (const pragma of pragmas) {
        await writeConn.run(pragma);
        for (const readConn of readConns) {
          await readConn.run(pragma);
        }
      }
      const readSandboxDirs = [datasetsDir, tmpSpillDir];
      for (const readConn of readConns) {
        await applyReadConnectionSandbox(readConn, readSandboxDirs);
      }
      await ensureDatasetCatalog();
      await restoreDatasetViews();
    } catch (error) {
      instance = null;
      writeConn = null;
      readConns = [];
      readConnIndex = 0;
      activeDbPath = null;
      activeDatasetsDir = null;
      initPromise = null;
      throw error;
    }
  })();
  return initPromise;
}
async function init() {
  await ensureInit();
}
async function registerCSVPathDataset(rawInput) {
  const input = RegisterCSVPathDatasetSchema.parse(rawInput);
  return enqueueWrite(async () => {
    await ensureInit();
    const conn = getWriteConnection();
    const sourcePath = await assertReadableFile(input.filePath);
    const datasetsDir = getDatasetsDirPath();
    await ensureDirectory(datasetsDir);
    const id = makeDatasetId();
    const viewName = datasetViewName(id);
    const displayName = input.displayName ?? path__default.default.basename(sourcePath);
    const cachePath = path__default.default.join(datasetsDir, `${id}.parquet`);
    const csvOptions = buildCsvOptions({
      hasHeader: input.hasHeader,
      delimiter: input.delimiter,
      sampleSize: input.sampleSize,
      encoding: input.encoding,
      storeRejects: input.storeRejects
    });
    await measureRun(
      conn,
      `
        COPY (
          SELECT *
          FROM read_csv(${quoteSqlString(sourcePath)}, ${csvOptions})
        )
        TO ${quoteSqlString(cachePath)}
        (
          FORMAT parquet,
          COMPRESSION zstd,
          COMPRESSION_LEVEL 1
        )
      `
    );
    const rejects = input.storeRejects ? await collectRejectSummary(conn) : void 0;
    await measureRun(
      conn,
      `
        CREATE OR REPLACE VIEW ${quoteIdentifier(viewName)} AS
        SELECT *
        FROM read_parquet(${quoteSqlString(cachePath)})
      `
    );
    const columns = await describeView(conn, viewName);
    const rowCount = await countViewRows(conn, viewName);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await measureRun(
      conn,
      `
        INSERT INTO app_datasets (
          id,
          display_name,
          view_name,
          source_path,
          cache_path,
          source_format,
          row_count,
          schema_json,
          csv_options_json,
          updated_at
        )
        VALUES (
          ${quoteSqlString(id)},
          ${quoteSqlString(displayName)},
          ${quoteSqlString(viewName)},
          ${quoteSqlString(sourcePath)},
          ${quoteSqlString(cachePath)},
          'csv',
          ${rowCount},
          ${quoteSqlString(JSON.stringify(columns))},
          ${quoteSqlString(
        JSON.stringify({
          auto_detect: true,
          header: input.hasHeader ?? true,
          delimiter: input.delimiter ?? null,
          sample_size: input.sampleSize ?? DEFAULT_CSV_SAMPLE_SIZE
        })
      )},
          now()
        )
      `
    );
    const previewLimit = input.previewLimit ?? DEFAULT_PREVIEW_LIMIT;
    const previewRows = await measureRows(
      conn,
      `
        SELECT *
        FROM ${quoteIdentifier(viewName)}
        LIMIT ${previewLimit}
      `
    );
    return {
      id,
      displayName,
      viewName,
      sourcePath,
      cachePath,
      sourceFormat: "csv",
      rowCount,
      columns,
      createdAt: now,
      updatedAt: now,
      previewRows,
      ...rejects ? { rejects } : {}
    };
  });
}
async function registerParquetPathDataset(rawInput) {
  const input = RegisterParquetPathDatasetSchema.parse(rawInput);
  return enqueueWrite(async () => {
    await ensureInit();
    const conn = getWriteConnection();
    const sourcePath = await assertReadableFile(input.filePath);
    const datasetsDir = getDatasetsDirPath();
    await ensureDirectory(datasetsDir);
    const id = makeDatasetId();
    const viewName = datasetViewName(id);
    const displayName = input.displayName ?? path__default.default.basename(sourcePath);
    const cachePath = path__default.default.join(datasetsDir, `${id}.parquet`);
    await fs__default.default.copyFile(sourcePath, cachePath);
    await measureRun(
      conn,
      `
        CREATE OR REPLACE VIEW ${quoteIdentifier(viewName)} AS
        SELECT *
        FROM read_parquet(${quoteSqlString(cachePath)})
      `
    );
    const columns = await describeView(conn, viewName);
    const rowCount = await countViewRows(conn, viewName);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await measureRun(
      conn,
      `
        INSERT INTO app_datasets (
          id,
          display_name,
          view_name,
          source_path,
          cache_path,
          source_format,
          row_count,
          schema_json,
          csv_options_json,
          updated_at
        )
        VALUES (
          ${quoteSqlString(id)},
          ${quoteSqlString(displayName)},
          ${quoteSqlString(viewName)},
          ${quoteSqlString(sourcePath)},
          ${quoteSqlString(cachePath)},
          'parquet',
          ${rowCount},
          ${quoteSqlString(JSON.stringify(columns))},
          NULL,
          now()
        )
      `
    );
    const previewLimit = input.previewLimit ?? DEFAULT_PREVIEW_LIMIT;
    const previewRows = await measureRows(
      conn,
      `
        SELECT *
        FROM ${quoteIdentifier(viewName)}
        LIMIT ${previewLimit}
      `
    );
    return {
      id,
      displayName,
      viewName,
      sourcePath,
      cachePath,
      sourceFormat: "parquet",
      rowCount,
      columns,
      createdAt: now,
      updatedAt: now,
      previewRows
    };
  });
}
async function listDatasets() {
  return enqueueRead(async () => {
    await ensureInit();
    const conn = getReadConnection();
    const rows = await measureRows(
      conn,
      `
        SELECT
          id,
          display_name,
          view_name,
          source_path,
          cache_path,
          source_format,
          row_count,
          schema_json,
          created_at,
          updated_at
        FROM app_datasets
        ORDER BY created_at DESC
      `
    );
    return rows.map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name),
      viewName: String(row.view_name),
      sourcePath: String(row.source_path),
      cachePath: String(row.cache_path),
      sourceFormat: String(row.source_format),
      rowCount: Number(row.row_count ?? 0),
      columns: parseColumns(row.schema_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    }));
  });
}
async function previewDataset(rawInput) {
  const input = PreviewDatasetSchema.parse(rawInput);
  return enqueueRead(async () => {
    await ensureInit();
    const conn = getReadConnection();
    const viewName = datasetViewName(input.datasetId);
    const limit = input.limit ?? DEFAULT_PREVIEW_LIMIT;
    const offset = input.offset ?? 0;
    return measureRows(
      conn,
      `
        SELECT *
        FROM ${quoteIdentifier(viewName)}
        LIMIT ${limit}
        OFFSET ${offset}
      `
    );
  });
}
async function summarizeDataset(rawInput) {
  const input = DatasetOnlySchema.parse(rawInput);
  return enqueueRead(async () => {
    await ensureInit();
    const conn = getReadConnection();
    const viewName = datasetViewName(input.datasetId);
    return measureRows(
      conn,
      `
        SUMMARIZE
        SELECT *
        FROM ${quoteIdentifier(viewName)}
      `
    );
  });
}
async function exportDataset(rawInput) {
  const input = ExportDatasetSchema.parse(rawInput);
  return enqueueRead(async () => {
    await ensureInit();
    const conn = getReadConnection();
    const dataset = await getDatasetById(conn, input.datasetId);
    if (!dataset) {
      throw new Error("Dataset not found.");
    }
    const sourceCachePath = await assertManagedCachePath(dataset.cachePath);
    await fs__default.default.access(sourceCachePath);
    await ensureParentDirectory(input.targetPath);
    await fs__default.default.copyFile(sourceCachePath, path__default.default.resolve(input.targetPath));
  });
}
async function deleteDataset(rawInput) {
  const input = DatasetOnlySchema.parse(rawInput);
  return enqueueWrite(async () => {
    await ensureInit();
    const conn = getWriteConnection();
    const dataset = await getDatasetById(conn, input.datasetId);
    if (!dataset) {
      return;
    }
    const cachePath = await assertManagedCachePath(dataset.cachePath);
    invalidateCountCache(dataset.viewName);
    await measureRun(
      conn,
      `
        DROP VIEW IF EXISTS ${quoteIdentifier(dataset.viewName)}
      `
    );
    await measureRun(
      conn,
      `
        DELETE FROM app_datasets
        WHERE id = ${quoteSqlString(input.datasetId)}
      `
    );
    try {
      await fs__default.default.unlink(cachePath);
    } catch {
    }
  });
}
function getStatus() {
  return {
    active: Boolean(instance && writeConn),
    dbPath: activeDbPath,
    datasetsDir: activeDatasetsDir,
    readConnections: readConns.length,
    pendingReads: readQueue.size + readQueue.pending,
    pendingWrites: writeQueue.size + writeQueue.pending
  };
}
function getQueryMetrics() {
  return queryMetrics.slice();
}
function clearQueryMetrics() {
  queryMetrics.length = 0;
}
async function runReadOnlyQuery(sql3) {
  return enqueueRead(async () => {
    await ensureInit();
    const conn = getReadConnection();
    const safeSql = assertReadOnlySql(sql3);
    return measureRows(conn, safeSql);
  });
}
var cancelledTokens = /* @__PURE__ */ new Set();
var activeTokenConns = /* @__PURE__ */ new Map();
var QueryCancelledError = class extends Error {
  constructor(token) {
    super(`DuckDB query cancelled (token: ${token}).`);
    this.name = "QueryCancelledError";
    this.token = token;
  }
};
function bindTokenConn(token, conn) {
  let set = activeTokenConns.get(token);
  if (!set) {
    set = /* @__PURE__ */ new Set();
    activeTokenConns.set(token, set);
  }
  set.add(conn);
}
function unbindTokenConn(token, conn) {
  const set = activeTokenConns.get(token);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) {
    activeTokenConns.delete(token);
  }
}
function cancelQueries(token) {
  if (!token) return;
  cancelledTokens.add(token);
  const conns = activeTokenConns.get(token);
  if (conns) {
    for (const conn of conns) {
      try {
        conn.interrupt();
      } catch {
      }
    }
  }
}
function resetCancelToken(token) {
  cancelledTokens.delete(token);
}
function assertNotCancelled(token) {
  if (token && cancelledTokens.has(token)) {
    throw new QueryCancelledError(token);
  }
}
async function runCancellableRead(token, body) {
  return enqueueRead(async () => {
    await ensureInit();
    assertNotCancelled(token);
    const conn = getReadConnection();
    if (token) bindTokenConn(token, conn);
    try {
      return await body(conn);
    } finally {
      if (token) unbindTokenConn(token, conn);
    }
  });
}
async function measureArrow(conn, sql3) {
  const start = performance.now();
  const reader = await conn.runAndReadAll(sql3);
  const cols = reader.getColumnsObjectJS();
  reader.columnTypes();
  const bytes = encodeColumnsToArrowIPC(cols);
  const durationMs = Math.round(performance.now() - start);
  const firstCol = Object.values(cols)[0];
  const rowCount = Array.isArray(firstCol) ? firstCol.length : 0;
  pushMetric({
    sql: truncateSql(sql3),
    durationMs,
    timestamp: Date.now(),
    rowCount
  });
  return bytes;
}
async function runReadOnlyQueryArrow(sql3, cancelToken2) {
  const safeSql = assertReadOnlySql(sql3);
  return runCancellableRead(cancelToken2, (conn) => measureArrow(conn, safeSql));
}
async function profileDataset(rawInput) {
  const input = ProfileDatasetSchema.parse(rawInput);
  const viewName = datasetViewName(input.datasetId);
  return runCancellableRead(input.cancelToken, async (conn) => {
    const rows = await measureRows(
      conn,
      `
        SELECT
          column_name, column_type, min, max, approx_unique,
          avg, std, q25, q50, q75, count, null_percentage
        FROM (SUMMARIZE SELECT * FROM ${quoteIdentifier(viewName)})
      `
    );
    return rows.map((row) => ({
      column_name: String(row.column_name ?? ""),
      column_type: String(row.column_type ?? ""),
      min: row.min ?? null,
      max: row.max ?? null,
      approx_unique: numOrNull(row.approx_unique),
      avg: numOrNull(row.avg),
      std: numOrNull(row.std),
      q25: numOrNull(row.q25),
      q50: numOrNull(row.q50),
      q75: numOrNull(row.q75),
      count: Number(row.count ?? 0),
      null_percentage: numOrNull(row.null_percentage)
    }));
  });
}
async function profileColumnDetail(rawInput) {
  const input = ProfileColumnDetailSchema.parse(rawInput);
  const viewName = datasetViewName(input.datasetId);
  const col = quoteIdentifier(input.column);
  const binCount = input.binCount ?? 20;
  return runCancellableRead(input.cancelToken, async (conn) => {
    const distinctRows = await measureRows(
      conn,
      `SELECT approx_count_distinct(${col}) AS distinct_approx FROM ${quoteIdentifier(viewName)}`
    );
    const distinctApprox = Number(distinctRows[0]?.distinct_approx ?? 0);
    const topRows = await measureRows(
      conn,
      `SELECT approx_top_k(${col}, ${input.topK ?? 10}) AS top_values FROM ${quoteIdentifier(viewName)}`
    );
    const topValues = normalizeTopValues(topRows[0]?.top_values);
    let histogram = [];
    try {
      const histRows = await measureRows(
        conn,
        `FROM histogram(${quoteIdentifier(viewName)}, ${col}, bin_count := ${binCount})`
      );
      histogram = histRows.map((row) => ({
        bin: String(row.bin ?? row.x ?? ""),
        count: Number(row.count ?? row.y ?? 0)
      }));
    } catch {
      histogram = [];
    }
    return {
      column: input.column,
      distinctApprox,
      topValues,
      histogram
    };
  });
}
var countCache = /* @__PURE__ */ new Map();
function countKey(viewName, where) {
  return `${viewName}::${(where ?? "").trim()}`;
}
function invalidateCountCache(viewName) {
  for (const key of countCache.keys()) {
    if (key.startsWith(`${viewName}::`)) {
      countCache.delete(key);
    }
  }
}
async function countRows(rawInput) {
  const input = CountRowsSchema.parse(rawInput);
  const viewName = datasetViewName(input.datasetId);
  const where = input.where?.trim();
  const key = countKey(viewName, where);
  if (!input.force) {
    const cached = countCache.get(key);
    if (cached) return cached.total;
  }
  return runCancellableRead(input.cancelToken, async (conn) => {
    const filter = where ? ` WHERE ${where}` : "";
    const rows = await measureRows(
      conn,
      `SELECT count(*) AS total FROM ${quoteIdentifier(viewName)}${filter}`
    );
    const total = Number(rows[0]?.total ?? 0);
    countCache.set(key, { total, cachedAt: Date.now() });
    return total;
  });
}
async function fetchKeysetPage(rawInput) {
  const input = KeysetPageSchema.parse(rawInput);
  return runCancellableRead(input.cancelToken, async (conn) => {
    const dataset = await getDatasetById(conn, input.datasetId);
    if (!dataset) {
      throw new Error("Dataset not found.");
    }
    const cachePath = await assertManagedCachePath(dataset.cachePath);
    const { sql: sql3, params } = buildKeysetPage(cachePath, input);
    const start = performance.now();
    const reader = params.length > 0 ? await conn.runAndReadAll(sql3, params) : await conn.runAndReadAll(sql3);
    const cols = reader.getColumnsObjectJS();
    const types = reader.columnTypes();
    const durationMs = Math.round(performance.now() - start);
    const rowidCol = cols.rowid ?? [];
    const rowCount = rowidCol.length;
    pushMetric({
      sql: truncateSql(sql3),
      durationMs,
      timestamp: Date.now(),
      rowCount
    });
    const arrow = encodeColumnsToArrowIPC(cols, types);
    let nextCursor = null;
    if (rowCount === input.limit) {
      const lastIdx = rowCount - 1;
      const sortValues = input.sortKeys.map((k) => {
        const colVals = cols[k.column];
        return colVals ? toCursorValue(colVals[lastIdx]) : null;
      });
      nextCursor = {
        sortValues,
        rowid: Number(rowidCol[lastIdx])
      };
    }
    return { arrow, nextCursor, rowCount };
  });
}
function buildKeysetPage(cachePath, input) {
  const limit = Math.max(1, Math.trunc(input.limit));
  const inner = `(
        SELECT *, file_row_number AS rowid
        FROM read_parquet(${quoteSqlString(cachePath)}, file_row_number = true)
      ) AS _kp`;
  const projection = input.columns?.length ? `${input.columns.map(quoteIdentifier).join(", ")}, rowid` : "* EXCLUDE (file_row_number)";
  const orderParts = input.sortKeys.map((k) => `${quoteIdentifier(k.column)} ${k.direction}`);
  orderParts.push("rowid ASC");
  const filters = [];
  if (input.where?.trim()) {
    filters.push(`(${input.where})`);
  }
  const params = [];
  if (input.cursor) {
    const { sortValues, rowid } = input.cursor;
    const keyCount = input.sortKeys.length;
    const orClauses = [];
    for (let k = 0; k < keyCount; k += 1) {
      const ands = [];
      for (let i = 0; i < k; i += 1) {
        params.push(sortValues[i]);
        ands.push(`${quoteIdentifier(input.sortKeys[i].column)} = $${params.length}`);
      }
      params.push(sortValues[k]);
      const strict = input.sortKeys[k].direction === "ASC" ? ">" : "<";
      ands.push(`${quoteIdentifier(input.sortKeys[k].column)} ${strict} $${params.length}`);
      orClauses.push(`(${ands.join(" AND ")})`);
    }
    const tieAnds = [];
    for (let i = 0; i < keyCount; i += 1) {
      params.push(sortValues[i]);
      tieAnds.push(`${quoteIdentifier(input.sortKeys[i].column)} = $${params.length}`);
    }
    params.push(rowid);
    tieAnds.push(`rowid > $${params.length}`);
    orClauses.push(`(${tieAnds.join(" AND ")})`);
    filters.push(`(${orClauses.join(" OR ")})`);
  }
  const whereSql = filters.length > 0 ? `
      WHERE ${filters.join(" AND ")}` : "";
  const sql3 = `
      SELECT ${projection}
      FROM ${inner}${whereSql}
      ORDER BY ${orderParts.join(", ")}
      LIMIT ${limit}
  `.trim();
  return { sql: sql3, params };
}
function numOrNull(value) {
  if (value === null || value === void 0) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
function toCursorValue(value) {
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}
function normalizeTopValues(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const rec = entry;
      return {
        value: rec.value ?? rec.key ?? rec[Object.keys(rec)[0]] ?? null,
        count: numOrNull(rec.count ?? rec.n)
      };
    }
    return { value: entry ?? null, count: null };
  });
}
async function close() {
  writeQueue.clear();
  readQueue.clear();
  cancelledTokens.clear();
  activeTokenConns.clear();
  countCache.clear();
  readConns = [];
  writeConn = null;
  instance = null;
  initPromise = null;
  readConnIndex = 0;
  activeDbPath = null;
  activeDatasetsDir = null;
}
electron.app.on("quit", () => {
  close().catch((error) => {
    console.error("[duckdb-service] cleanup error:", error);
  });
});
var MODEL_DOWNLOADS = [
  {
    key: "gemma-4-e4b-it-q4_k_m",
    file: "gemma-4-e4b-it-q4_k_m.gguf",
    uri: "hf:bartowski/google_gemma-4-E4B-it-GGUF:Q4_K_M",
    sha256: "",
    // TODO: paste sha256 from `pnpm run models:hash`
    bytes: 534e7,
    label: "Gemma 4 E4B Instruct (GGUF q4)",
    family: "Gemma 4",
    sizeLabel: "E4B",
    optional: false
  },
  {
    key: "granite-4.1-3b-instruct-q4_k_m",
    file: "granite-4.1-3b-instruct-q4_k_m.gguf",
    // Repo has no "-instruct-" in its name — Granite 4.1 3B IS the instruct
    // model (finetuned from the separate "-Base" checkpoint); IBM just doesn't
    // suffix the flagship chat variant. Verified at huggingface.co/ibm-granite/granite-4.1-3b-GGUF.
    uri: "hf:ibm-granite/granite-4.1-3b-GGUF:Q4_K_M",
    sha256: "",
    bytes: 21e8,
    // TODO: paste exact sha256 from `pnpm run models:hash`
    label: "Granite 4.1 3B Instruct (GGUF q4, Apache 2.0)",
    family: "Granite 4.1",
    sizeLabel: "3B",
    optional: true
  },
  {
    key: "qwen3-embedding-0.6b-q8_0",
    file: "qwen3-embedding-0.6b-q8_0.gguf",
    uri: "hf:Qwen/Qwen3-Embedding-0.6B-GGUF:Q8_0",
    sha256: "",
    // TODO: paste sha256 from `pnpm run models:hash`
    bytes: 4e8,
    label: "Qwen3 Embedding 0.6B (GGUF Q8_0)",
    family: "Qwen3 Embedding",
    sizeLabel: "0.6B",
    optional: false
  }
];
function llmDir() {
  return path__default.default.join(electron.app.getPath("userData"), "models", "llm");
}
function entryFor(key) {
  const entry = MODEL_DOWNLOADS.find((m) => m.key === key);
  if (!entry) throw new Error(`Unknown model key: ${key}`);
  return entry;
}
function abortError() {
  const error = new Error("Model download aborted");
  error.name = "AbortError";
  return error;
}
function presenceFor(entry) {
  const p = path__default.default.join(llmDir(), entry.file);
  const present = fs3.existsSync(p);
  return {
    key: entry.key,
    file: entry.file,
    label: entry.label,
    optional: entry.optional,
    present,
    sizeBytes: present ? fs3.statSync(p).size : 0,
    path: p
  };
}
async function sha256OfFile(filePath) {
  const hash = crypto$1.createHash("sha256");
  await promises.pipeline(fs3.createReadStream(filePath), hash);
  return hash.digest("hex");
}
function hfTokens() {
  const token = process.env.HF_TOKEN?.trim() || process.env.HUGGING_FACE_TOKEN?.trim();
  return token ? { huggingFace: token } : void 0;
}
var inFlightDownloads = /* @__PURE__ */ new Map();
function listModelPresence() {
  return MODEL_DOWNLOADS.map(presenceFor);
}
function isModelPresent(key) {
  const entry = entryFor(key);
  return fs3.existsSync(path__default.default.join(llmDir(), entry.file));
}
async function downloadModel(input) {
  const entry = entryFor(input.key);
  const existing = inFlightDownloads.get(entry.key);
  if (existing) return attachToInFlightDownload(existing, input);
  const dir = llmDir();
  const dest = path__default.default.join(dir, entry.file);
  if (input.signal?.aborted) throw abortError();
  if (fs3.existsSync(dest)) {
    const size = fs3.statSync(dest).size;
    if (entry.bytes === 0 || size === entry.bytes) {
      input.onProgress?.({
        key: entry.key,
        receivedBytes: size,
        totalBytes: size,
        percent: 100,
        done: true
      });
      return presenceFor(entry);
    }
  }
  fs3.mkdirSync(dir, { recursive: true });
  const listeners = /* @__PURE__ */ new Set();
  if (input.onProgress) listeners.add(input.onProgress);
  let lastProgress = {
    key: entry.key,
    receivedBytes: 0,
    totalBytes: entry.bytes,
    percent: entry.bytes ? 0 : -1,
    done: false
  };
  let lastEmit = 0;
  const emitProgress = (downloadedSize, totalSize, done) => {
    const now = Date.now();
    if (!done && now - lastEmit < 100) return;
    lastEmit = now;
    lastProgress = {
      key: entry.key,
      receivedBytes: downloadedSize,
      totalBytes: totalSize,
      percent: totalSize > 0 ? Math.min(100, Math.floor(downloadedSize / totalSize * 100)) : -1,
      done
    };
    for (const listener of listeners) listener(lastProgress);
  };
  const { createModelDownloader } = await import('node-llama-cpp');
  const downloader = await createModelDownloader({
    modelUri: entry.uri,
    dirPath: dir,
    // Pin the on-disk name so it matches what llama-service.ts loads by exact
    // filename, and so a manifest entry can only write to this one path.
    fileName: entry.file,
    // Present + exact remote size → skip re-download (default, made explicit).
    skipExisting: true,
    // Remove the partial temp file if we cancel/abort (default, made explicit).
    deleteTempFileOnCancel: true,
    // We surface our own progress bar; keep node's CLI renderer quiet.
    showCliProgress: false,
    tokens: hfTokens(),
    onProgress: ({ totalSize, downloadedSize }) => {
      emitProgress(downloadedSize, totalSize || entry.bytes || 0, false);
    }
  });
  const ownController = new AbortController();
  const cancel = () => {
    void downloader.cancel({ deleteTempFile: true }).catch(() => {
    });
    ownController.abort();
  };
  if (input.signal) {
    if (input.signal.aborted) cancel();
    else input.signal.addEventListener("abort", cancel, { once: true });
  }
  const promise = (async () => {
    try {
      await downloader.download({ signal: ownController.signal });
    } catch (err) {
      if (ownController.signal.aborted) throw abortError();
      throw err;
    }
    if (entry.sha256) {
      const sha = await sha256OfFile(dest);
      if (sha !== entry.sha256) {
        await fs.rm(dest, { force: true });
        throw new Error(
          `${entry.key}: sha256 mismatch (got ${sha}, expected ${entry.sha256}) \u2014 deleted, refusing to install`
        );
      }
    } else {
      console.warn(
        `[model-download] ${entry.key}: integrity UNVERIFIED \u2014 no sha256 pinned in the registry. node-llama-cpp verified the download against the remote content-length, but the weights were NOT authenticated by hash. Run \`pnpm run models:hash\` and paste the sha256 into MODEL_DOWNLOADS before a verified release.`
      );
    }
    const size = fs3.existsSync(dest) ? fs3.statSync(dest).size : 0;
    emitProgress(size, size, true);
    return presenceFor(entry);
  })();
  inFlightDownloads.set(entry.key, {
    promise,
    listeners,
    // Live view: emitProgress REASSIGNS the local `lastProgress` binding, so a
    // plain property here would freeze the initial 0% snapshot and late
    // attachers would be synced to 0% instead of the current byte count.
    get lastProgress() {
      return lastProgress;
    },
    cancel
  });
  try {
    return await promise;
  } finally {
    inFlightDownloads.delete(entry.key);
  }
}
async function attachToInFlightDownload(existing, input) {
  const listener = input.onProgress;
  if (listener) {
    listener(existing.lastProgress);
    existing.listeners.add(listener);
  }
  const onAbort = () => existing.cancel();
  if (input.signal) {
    if (input.signal.aborted) onAbort();
    else input.signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await existing.promise;
  } finally {
    if (listener) existing.listeners.delete(listener);
    if (input.signal) input.signal.removeEventListener("abort", onAbort);
  }
}
async function deleteModel(key) {
  const entry = entryFor(key);
  const dest = path__default.default.join(llmDir(), entry.file);
  if (!fs3.existsSync(dest)) return { deleted: false };
  await fs.rm(dest, { force: true });
  return { deleted: true };
}

// electron/llama-service.ts
var DEFAULT_LLM_MODEL = MODEL_DOWNLOADS[0].file;
var KNOWN_MODELS = MODEL_DOWNLOADS.map((m) => ({
  id: m.file,
  label: m.label,
  family: m.family,
  sizeLabel: m.sizeLabel
}));
var DEFAULT_CONTEXT_SIZE = 4096;
var DEFAULT_MAX_TOKENS = 512;
var DEFAULT_STRUCTURED_MAX_TOKENS = 1536;
function repairTruncatedJson(raw) {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) s = fence[1].trim();
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  if (escaped) s = s.slice(0, -1);
  if (inString) s += '"';
  s = s.replace(/,\s*$/, "");
  while (stack.length) s += stack.pop();
  return s;
}
var llamaPromise = null;
var model = null;
var loadedModelPath = null;
var sharedContext = null;
async function getSharedContext() {
  if (sharedContext) return sharedContext;
  sharedContext = await model.createContext({ contextSize: DEFAULT_CONTEXT_SIZE });
  return sharedContext;
}
async function disposeSharedContext() {
  clearWarmSessions();
  if (sharedContext) {
    try {
      await sharedContext.dispose();
    } catch {
    }
    sharedContext = null;
  }
}
var WARM_MAX = 2;
var warmSessions = /* @__PURE__ */ new Map();
function clearWarmSessions() {
  for (const entry of warmSessions.values()) {
    try {
      entry.sequence.dispose();
    } catch {
    }
  }
  warmSessions.clear();
}
function dropWarmSession(entry) {
  for (const [key, value] of warmSessions) {
    if (value === entry) {
      warmSessions.delete(key);
      break;
    }
  }
  try {
    entry.sequence.dispose();
  } catch {
  }
}
async function getWarmSession(systemPrefix) {
  const key = `${loadedModelPath ?? ""}::${systemPrefix}`;
  const existing = warmSessions.get(key);
  if (existing) {
    warmSessions.delete(key);
    warmSessions.set(key, existing);
    return existing;
  }
  try {
    const { LlamaChatSession } = await import('node-llama-cpp');
    const context = await getSharedContext();
    const sequence = context.getSequence();
    const session4 = new LlamaChatSession({
      contextSequence: sequence,
      systemPrompt: systemPrefix,
      autoDisposeSequence: false
    });
    await session4.preloadPrompt("");
    const entry = { session: session4, sequence, baseline: session4.getChatHistory() };
    warmSessions.set(key, entry);
    while (warmSessions.size > WARM_MAX) {
      const oldest = warmSessions.keys().next().value;
      if (oldest === void 0) break;
      const old = warmSessions.get(oldest);
      warmSessions.delete(oldest);
      try {
        old?.sequence.dispose();
      } catch {
      }
    }
    return entry;
  } catch {
    return null;
  }
}
var queueTail = Promise.resolve();
function enqueue(task) {
  const run = queueTail.then(task, task);
  queueTail = run.then(
    () => void 0,
    () => void 0
  );
  return run;
}
function modelDir() {
  return path__default.default.join(electron.app.getPath("userData"), "models", "llm");
}
function modelPath(file) {
  return path__default.default.join(modelDir(), file);
}
function gpuExplicitlyEnabled() {
  const value = process.env.DN_LLAMA_GPU?.trim().toLowerCase();
  if (!value) return false;
  return ["1", "true", "yes", "on", "auto", "vulkan", "cuda", "metal"].includes(value);
}
async function getLlamaInstance() {
  if (!llamaPromise) {
    llamaPromise = (async () => {
      const { getLlama } = await import('node-llama-cpp');
      if (!gpuExplicitlyEnabled()) {
        return getLlama({ gpu: false });
      }
      try {
        return await getLlama();
      } catch (error) {
        console.warn("[llama] GPU init failed, falling back to CPU:", error);
        return getLlama({ gpu: false });
      }
    })();
    llamaPromise.catch(() => {
      llamaPromise = null;
    });
  }
  return llamaPromise;
}
function abortError2() {
  const error = new Error("Llama generation aborted");
  error.name = "AbortError";
  return error;
}
async function ensureModel(file = DEFAULT_LLM_MODEL) {
  const llama = await getLlamaInstance();
  const target = modelPath(file);
  if (!fs3.existsSync(target)) {
    throw new Error(`Missing GGUF model: ${target}. Download it while online into ${modelDir()}.`);
  }
  if (model && loadedModelPath === target) {
    return { model: target };
  }
  if (model) {
    await disposeSharedContext();
    await model.dispose();
    model = null;
    loadedModelPath = null;
  }
  model = await llama.loadModel({ modelPath: target });
  loadedModelPath = target;
  return { model: target };
}
async function getLoadedModel(file = DEFAULT_LLM_MODEL) {
  await ensureModel(file);
  return { model, modelPath: loadedModelPath ?? modelPath(file) };
}
function enqueueLlamaTask(task) {
  return enqueue(task);
}
function getSharedLlama() {
  return getLlamaInstance();
}
async function generate(input) {
  return enqueue(async () => {
    const start = Date.now();
    await ensureModel();
    if (input.signal?.aborted) throw abortError2();
    const effectivePrompt = input.systemPrefix ? `${input.systemPrefix}

${input.prompt}` : input.prompt;
    if (input.systemPrefix) {
      const warm = await getWarmSession(input.systemPrefix);
      if (warm) {
        try {
          warm.session.setChatHistory(warm.baseline);
          const user = input.system ? `${input.system}

${input.prompt}` : input.prompt;
          let warmFinish = "stop";
          let warmText = "";
          try {
            warmText = await warm.session.prompt(user, {
              maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
              temperature: input.temperature ?? 0,
              topP: input.topP,
              signal: input.signal,
              onTextChunk: (chunk) => input.onToken?.(chunk)
            });
          } catch (error) {
            if (input.signal?.aborted) warmFinish = "abort";
            else throw error;
          }
          const warmCompletion = countTokens(warmText);
          return {
            text: warmText,
            model: loadedModelPath ?? "",
            finishReason: warmFinish === "abort" ? "abort" : warmCompletion >= (input.maxTokens ?? DEFAULT_MAX_TOKENS) ? "length" : "stop",
            promptTokens: countTokens(`${input.systemPrefix}
${user}`),
            completionTokens: warmCompletion,
            elapsedMs: Date.now() - start
          };
        } catch {
          if (input.signal?.aborted) throw abortError2();
          dropWarmSession(warm);
        }
      }
    }
    const context = await getSharedContext();
    const sequence = context.getSequence();
    try {
      const { LlamaChatSession } = await import('node-llama-cpp');
      const session4 = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: input.system
      });
      let finishReason = "stop";
      let text3 = "";
      try {
        text3 = await session4.prompt(effectivePrompt, {
          maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: input.temperature ?? 0,
          topP: input.topP,
          signal: input.signal,
          onTextChunk: (chunk) => input.onToken?.(chunk)
        });
      } catch (error) {
        if (input.signal?.aborted) {
          finishReason = "abort";
        } else {
          throw error;
        }
      }
      const promptTokens = countTokens(
        input.system ? `${input.system}
${effectivePrompt}` : effectivePrompt
      );
      const completionTokens = countTokens(text3);
      return {
        text: text3,
        model: loadedModelPath ?? "",
        finishReason: finishReason === "abort" ? "abort" : completionTokens >= (input.maxTokens ?? DEFAULT_MAX_TOKENS) ? "length" : "stop",
        promptTokens,
        completionTokens,
        elapsedMs: Date.now() - start
      };
    } finally {
      sequence.dispose();
    }
  });
}
async function generateStructured(input) {
  return enqueue(async () => {
    await ensureModel();
    const llama = await getLlamaInstance();
    if (input.signal?.aborted) throw abortError2();
    const grammar = await llama.createGrammarForJsonSchema(
      input.jsonSchema
    );
    const effectivePrompt = input.systemPrefix ? `${input.systemPrefix}

${input.prompt}` : input.prompt;
    if (input.systemPrefix) {
      const warm = await getWarmSession(input.systemPrefix);
      if (warm) {
        try {
          warm.session.setChatHistory(warm.baseline);
          const user = input.system ? `${input.system}

${input.prompt}` : input.prompt;
          const raw = await warm.session.prompt(user, {
            grammar,
            maxTokens: input.maxTokens ?? DEFAULT_STRUCTURED_MAX_TOKENS,
            temperature: input.temperature ?? 0,
            signal: input.signal
          });
          try {
            return grammar.parse(raw);
          } catch (parseErr) {
            try {
              return JSON.parse(repairTruncatedJson(raw));
            } catch {
              throw parseErr;
            }
          }
        } catch {
          if (input.signal?.aborted) throw abortError2();
          dropWarmSession(warm);
        }
      }
    }
    const context = await getSharedContext();
    const sequence = context.getSequence();
    try {
      const { LlamaChatSession } = await import('node-llama-cpp');
      const session4 = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: input.system
      });
      const raw = await session4.prompt(effectivePrompt, {
        grammar,
        maxTokens: input.maxTokens ?? DEFAULT_STRUCTURED_MAX_TOKENS,
        temperature: input.temperature ?? 0,
        signal: input.signal
      });
      try {
        return grammar.parse(raw);
      } catch (parseErr) {
        try {
          return JSON.parse(repairTruncatedJson(raw));
        } catch {
          throw parseErr;
        }
      }
    } finally {
      sequence.dispose();
    }
  });
}
function listModels() {
  return KNOWN_MODELS.map((m) => {
    const p = modelPath(m.id);
    return { ...m, path: p, present: fs3.existsSync(p) };
  });
}
async function isAvailable(file = DEFAULT_LLM_MODEL) {
  try {
    if (!fs3.existsSync(modelPath(file))) return false;
    await ensureModel(file);
    return true;
  } catch {
    return false;
  }
}
async function dispose() {
  clearWarmSessions();
  try {
    if (model) {
      await model.dispose();
    }
  } catch (error) {
    console.warn("[llama] model dispose error:", error);
  } finally {
    model = null;
    loadedModelPath = null;
  }
  try {
    if (llamaPromise) {
      const llama = await llamaPromise;
      await llama.dispose();
    }
  } catch {
  } finally {
    llamaPromise = null;
  }
}
function countTokens(text3) {
  if (!text3) return 0;
  return Math.max(1, Math.ceil(text3.length / 4));
}

// electron/chat-session-service.ts
var MAX_LIVE_SESSIONS = 2;
var CHAT_CONTEXT_SIZE = 4096;
var CHAT_MAX_TOKENS = 1024;
var TOOL_MAX_ROWS = 50;
var TOOL_MAX_CHARS = 8e3;
var TOOL_SUMMARY_MAX_CHARS = 300;
var SIDECALL_TRANSCRIPT_MAX_CHARS = 4e3;
var DEFAULT_SYSTEM_PROMPT = [
  "Tu es Moudir, analyste de donn\xE9es hors-ligne. Tu travailles sur des donn\xE9es locales via DuckDB.",
  "Outils disponibles:",
  "- run_sql(sql): ex\xE9cute une requ\xEAte SQL DuckDB en lecture seule et retourne les lignes.",
  "- get_schema(): liste les jeux de donn\xE9es enregistr\xE9s avec leurs colonnes et types.",
  "- profile_column(table, column): statistiques d'une colonne (min, max, distincts, nulls).",
  "- make_chart(chart_type, x, y, aggregate, title): pr\xE9pare un graphique affich\xE9 par l'application.",
  "Commence par get_schema si tu ne connais pas les tables.",
  "R\xE9ponds dans la langue de l'utilisateur (fran\xE7ais par d\xE9faut), de fa\xE7on concise.",
  "Ne cite que des chiffres provenant des r\xE9sultats d'outils."
].join("\n");
var sessions = /* @__PURE__ */ new Map();
function requireSession(conversationId2) {
  const entry = sessions.get(conversationId2);
  if (!entry) {
    throw new Error(
      `No open chat session for conversation "${conversationId2}" \u2014 call chat:open first.`
    );
  }
  sessions.delete(conversationId2);
  sessions.set(conversationId2, entry);
  entry.lastUsed = Date.now();
  return entry;
}
async function disposeNative(entry) {
  try {
    entry.sequence.dispose();
  } catch {
  }
  try {
    await entry.context.dispose();
  } catch {
  }
}
async function evictOverCap() {
  while (sessions.size > MAX_LIVE_SESSIONS) {
    const oldestId = sessions.keys().next().value;
    if (oldestId === void 0) break;
    const entry = sessions.get(oldestId);
    sessions.delete(oldestId);
    if (entry) await disposeNative(entry);
  }
}
function toFunctionCall(row) {
  const parts = row.parts ?? {};
  return {
    type: "functionCall",
    name: typeof parts.name === "string" && parts.name.length > 0 ? parts.name : "tool",
    params: parts.params ?? {},
    result: parts.result ?? row.content
  };
}
function toChatHistory(systemPrompt, rows) {
  const items = [{ type: "system", text: systemPrompt }];
  let pendingCalls = [];
  for (const row of rows) {
    if (row.role === "tool") {
      pendingCalls = [...pendingCalls, toFunctionCall(row)];
      continue;
    }
    if (row.role === "assistant") {
      items.push({ type: "model", response: [...pendingCalls, row.content] });
      pendingCalls = [];
      continue;
    }
    if (pendingCalls.length > 0) {
      items.push({ type: "model", response: [...pendingCalls] });
      pendingCalls = [];
    }
    items.push({ type: "user", text: row.content });
  }
  if (pendingCalls.length > 0) {
    const last = items.at(-1);
    if (last?.type === "model") {
      items[items.length - 1] = { type: "model", response: [...last.response, ...pendingCalls] };
    } else {
      items.push({ type: "model", response: [...pendingCalls] });
    }
  }
  return items;
}
function truncateText(text3, max) {
  return text3.length > max ? `${text3.slice(0, max)}\u2026` : text3;
}
function quoteIdentifier2(name) {
  return `"${name.replaceAll('"', '""')}"`;
}
function formatCell(value) {
  if (value === null || value === void 0) return "NULL";
  if (value instanceof Date) return value.toISOString();
  return truncateText(String(value), 120);
}
function injectLimit(sql3) {
  const trimmed = sql3.trim().replace(/;+\s*$/, "");
  if (/\blimit\s+\d+/i.test(trimmed)) return trimmed;
  const upper = trimmed.toUpperCase();
  const limitable = ["SELECT", "WITH", "FROM", "TABLE", "VALUES", "PIVOT", "UNPIVOT"].some(
    (k) => upper.startsWith(k)
  );
  if (!limitable) return trimmed;
  return `${trimmed} LIMIT ${TOOL_MAX_ROWS + 1}`;
}
function formatRows(rows) {
  const overRowCap = rows.length > TOOL_MAX_ROWS;
  const visible = rows.slice(0, TOOL_MAX_ROWS);
  if (visible.length === 0) return "0 ligne.";
  const columns = Object.keys(visible[0]);
  const lines = [columns.join(" | ")];
  for (const row of visible) {
    lines.push(columns.map((c) => formatCell(row[c])).join(" | "));
  }
  let body = lines.join("\n");
  const overCharCap = body.length > TOOL_MAX_CHARS;
  if (overCharCap) body = body.slice(0, TOOL_MAX_CHARS);
  const header = overRowCap ? `${TOOL_MAX_ROWS}+ lignes (r\xE9sultat tronqu\xE9 aux ${TOOL_MAX_ROWS} premi\xE8res)` : `${visible.length} ligne(s)`;
  const notice = overRowCap || overCharCap ? "\n[R\xE9sultat tronqu\xE9]" : "";
  return `${header}
${body}${notice}`;
}
async function runSqlTool(params) {
  const rows = await runReadOnlyQuery(injectLimit(params.sql));
  return formatRows(rows);
}
async function getSchemaTool() {
  const datasets = await listDatasets();
  if (datasets.length === 0) {
    return "Aucun jeu de donn\xE9es enregistr\xE9. L'utilisateur doit d'abord importer un fichier.";
  }
  const lines = datasets.map(
    (d) => `${d.viewName} (\xAB ${d.displayName} \xBB, ${d.rowCount} lignes): ${d.columns.map((c) => `${c.name} ${c.type}`).join(", ")}`
  );
  return truncateText(lines.join("\n"), TOOL_MAX_CHARS);
}
async function profileColumnTool(params) {
  const table = quoteIdentifier2(params.table);
  const column = quoteIdentifier2(params.column);
  const rows = await runReadOnlyQuery(
    `SELECT min(${column}) AS "min", max(${column}) AS "max", count(DISTINCT ${column}) AS "distincts", count(*) - count(${column}) AS "nulls", count(*) AS "total" FROM ${table}`
  );
  const r = rows[0] ?? {};
  return `${params.column} (${params.table}): min=${formatCell(r.min)}, max=${formatCell(r.max)}, distincts=${formatCell(r.distincts)}, nulls=${formatCell(r.nulls)}, total=${formatCell(r.total)}`;
}
async function makeChartTool(params) {
  return `Graphique pr\xE9par\xE9: ${params.title}`;
}
async function buildTools(onEvent) {
  const { defineChatSessionFunction } = await import('node-llama-cpp');
  const wrap = (name, handler) => {
    return async (params) => {
      const start = Date.now();
      let result;
      try {
        result = await handler(params);
      } catch (error) {
        result = `Erreur ${name}: ${error instanceof Error ? error.message : String(error)}`;
      }
      onEvent({
        name,
        params,
        resultSummary: truncateText(result, TOOL_SUMMARY_MAX_CHARS),
        durationMs: Date.now() - start
      });
      return result;
    };
  };
  return {
    run_sql: defineChatSessionFunction({
      description: "Ex\xE9cute une requ\xEAte SQL DuckDB en lecture seule (SELECT/WITH/SUMMARIZE/DESCRIBE) et retourne les lignes.",
      params: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "La requ\xEAte SQL DuckDB en lecture seule \xE0 ex\xE9cuter."
          }
        }
      },
      handler: wrap("run_sql", runSqlTool)
    }),
    get_schema: defineChatSessionFunction({
      description: "Liste les jeux de donn\xE9es enregistr\xE9s avec leurs colonnes et types. \xC0 appeler avant d'\xE9crire du SQL.",
      params: { type: "object", properties: {} },
      handler: wrap("get_schema", getSchemaTool)
    }),
    profile_column: defineChatSessionFunction({
      description: "Statistiques d'une colonne d'une table: min, max, valeurs distinctes, nulls, total.",
      params: {
        type: "object",
        properties: {
          table: { type: "string", description: "Nom de la table (vue DuckDB) \xE0 profiler." },
          column: { type: "string", description: "Nom de la colonne \xE0 profiler." }
        }
      },
      handler: wrap("profile_column", profileColumnTool)
    }),
    make_chart: defineChatSessionFunction({
      description: "Pr\xE9pare un graphique que l'application affichera \xE0 l'utilisateur. N'ex\xE9cute rien: fournis les colonnes et le type de graphique.",
      params: {
        type: "object",
        properties: {
          chart_type: {
            enum: ["bar", "line", "area", "pie", "scatter", "heatmap"],
            description: "Type de graphique."
          },
          x: { type: "string", description: "Colonne pour l'axe X (dimension)." },
          y: { type: "string", description: "Colonne pour l'axe Y (mesure)." },
          aggregate: {
            enum: ["none", "count", "sum", "avg", "min", "max"],
            description: "Agr\xE9gation appliqu\xE9e \xE0 la mesure Y."
          },
          title: { type: "string", description: "Titre court du graphique." }
        }
      },
      handler: wrap("make_chart", async (params) => makeChartTool(params))
    })
  };
}
async function openSession(input) {
  const systemPrompt = input.systemPrompt?.trim() ? input.systemPrompt.trim() : DEFAULT_SYSTEM_PROMPT;
  const { model: model2, modelPath: modelPath3 } = await getLoadedModel(input.modelFile);
  for (const [id, entry] of [...sessions]) {
    if (entry.modelPath !== modelPath3) {
      sessions.delete(id);
      await disposeNative(entry);
    }
  }
  const existing = sessions.get(input.conversationId);
  if (existing) {
    if (input.history) existing.session.setChatHistory(toChatHistory(systemPrompt, input.history));
    requireSession(input.conversationId);
    return { model: modelPath3, reused: true };
  }
  const { LlamaChatSession } = await import('node-llama-cpp');
  const context = await model2.createContext({ contextSize: CHAT_CONTEXT_SIZE });
  const sequence = context.getSequence();
  const session4 = new LlamaChatSession({
    contextSequence: sequence,
    systemPrompt,
    autoDisposeSequence: false
  });
  if (input.history) session4.setChatHistory(toChatHistory(systemPrompt, input.history));
  sessions.set(input.conversationId, {
    session: session4,
    context,
    sequence,
    modelPath: modelPath3,
    systemPrompt,
    lastUsed: Date.now()
  });
  await evictOverCap();
  return { model: modelPath3, reused: false };
}
async function promptSession(input) {
  const entry = requireSession(input.conversationId);
  return enqueueLlamaTask(async () => {
    if (input.signal?.aborted) {
      const error = new Error("Chat prompt aborted");
      error.name = "AbortError";
      throw error;
    }
    const toolEvents = [];
    const functions = await buildTools((event) => {
      toolEvents.push(event);
      input.onTool?.(event);
    });
    const text3 = await entry.session.prompt(input.text, {
      functions,
      documentFunctionParams: true,
      maxTokens: CHAT_MAX_TOKENS,
      onTextChunk: (chunk) => input.onToken?.(chunk),
      signal: input.signal,
      // Return the partial text on abort instead of throwing away the turn.
      stopOnAbortSignal: true
    });
    entry.lastUsed = Date.now();
    return { text: text3, toolEvents };
  });
}
async function preloadSessionPrompt(conversationId2, text3) {
  const entry = requireSession(conversationId2);
  await enqueueLlamaTask(async () => {
    await entry.session.preloadPrompt(text3);
  });
}
function getSessionHistory(conversationId2) {
  return requireSession(conversationId2).session.getChatHistory();
}
function transcriptFor(conversationId2) {
  const entry = sessions.get(conversationId2);
  if (!entry) {
    throw new Error(
      `No open chat session for conversation "${conversationId2}" \u2014 call chat:open first.`
    );
  }
  const history = entry.session.getChatHistory();
  const lines = [];
  for (const item of history) {
    if (item.type === "user") lines.push(`Utilisateur: ${item.text}`);
    else if (item.type === "model") {
      const text3 = item.response.filter((part) => typeof part === "string").join(" ").trim();
      if (text3) lines.push(`Moudir: ${text3}`);
    }
  }
  const joined = lines.join("\n");
  return joined.length > SIDECALL_TRANSCRIPT_MAX_CHARS ? joined.slice(-SIDECALL_TRANSCRIPT_MAX_CHARS) : joined;
}
async function generateTitle(conversationId2) {
  const transcript = transcriptFor(conversationId2);
  const result = await generateStructured({
    prompt: `Conversation:
${transcript}

Donne un titre tr\xE8s court (3 \xE0 6 mots, m\xEAme langue que la conversation). R\xE9ponds en JSON: {"title": "..."}`,
    jsonSchema: {
      type: "object",
      properties: { title: { type: "string", maxLength: 80 } },
      required: ["title"]
    },
    maxTokens: 64
  });
  const title = typeof result?.title === "string" ? result.title.trim() : "";
  return title.length > 0 ? truncateText(title, 120) : "Nouvelle conversation";
}
async function suggestFollowUps(conversationId2) {
  const transcript = transcriptFor(conversationId2);
  const result = await generateStructured({
    prompt: `Conversation:
${transcript}

Propose 2 \xE0 3 questions de suivi courtes que l'utilisateur pourrait poser ensuite (m\xEAme langue que la conversation). R\xE9ponds en JSON: {"questions": ["...", "..."]}`,
    jsonSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: { type: "string", maxLength: 160 },
          minItems: 2,
          maxItems: 3
        }
      },
      required: ["questions"]
    },
    maxTokens: 192
  });
  if (!Array.isArray(result?.questions)) return [];
  return result.questions.filter((q) => typeof q === "string" && q.trim().length > 0).map((q) => truncateText(q.trim(), 200)).slice(0, 3);
}
async function disposeSession(conversationId2) {
  const entry = sessions.get(conversationId2);
  if (!entry) return false;
  sessions.delete(conversationId2);
  await disposeNative(entry);
  return true;
}
async function disposeAll() {
  const entries = [...sessions.values()];
  sessions.clear();
  for (const entry of entries) {
    await disposeNative(entry);
  }
}
var nowMs = drizzleOrm.sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
var conversation = sqliteCore.sqliteTable(
  "moudir_conversation",
  {
    id: sqliteCore.text("id").primaryKey(),
    title: sqliteCore.text("title").notNull(),
    createdAt: sqliteCore.integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    updatedAt: sqliteCore.integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    pinned: sqliteCore.integer("pinned", { mode: "boolean" }).notNull().default(false),
    /** Dataset the conversation was anchored to (context restore hint). */
    datasetId: sqliteCore.text("dataset_id"),
    /** GGUF model file the conversation ran on (display + continuity hint). */
    model: sqliteCore.text("model")
  },
  (table) => [sqliteCore.index("moudir_conversation_updated_idx").on(table.pinned, table.updatedAt)]
);
var message = sqliteCore.sqliteTable(
  "moudir_message",
  {
    id: sqliteCore.integer("id").primaryKey({ autoIncrement: true }),
    conversationId: sqliteCore.text("conversation_id").notNull(),
    role: sqliteCore.text("role").notNull(),
    content: sqliteCore.text("content").notNull(),
    /** Opaque JSON: tool calls, artifacts, chart specs — renderer-owned shape. */
    parts: sqliteCore.text("parts", { mode: "json" }).$type(),
    createdAt: sqliteCore.integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs)
  },
  (table) => [sqliteCore.index("moudir_message_conversation_idx").on(table.conversationId, table.id)]
);
var SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS moudir_conversation (
  id text PRIMARY KEY,
  title text NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  pinned integer DEFAULT 0 NOT NULL,
  dataset_id text,
  model text
);
CREATE INDEX IF NOT EXISTS moudir_conversation_updated_idx
  ON moudir_conversation (pinned, updated_at);

CREATE TABLE IF NOT EXISTS moudir_message (
  id integer PRIMARY KEY AUTOINCREMENT,
  conversation_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  parts text,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS moudir_message_conversation_idx
  ON moudir_message (conversation_id, id);
`;
var MAX_UNPINNED_CONVERSATIONS = 200;
var DB_FILE = "chat.db";
var baseDir = null;
var handle = null;
function configureChatStore(databasesDir) {
  baseDir = databasesDir;
}
function open() {
  if (handle) return handle;
  if (!baseDir) throw new Error("chat-store: configureChatStore() was not called");
  fs3.mkdirSync(baseDir, { recursive: true });
  const sqlite = new Database2__default.default(path__default.default.join(baseDir, DB_FILE));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL);
  handle = { db: betterSqlite3.drizzle({ client: sqlite, schema: { conversation, message } }), sqlite };
  return handle;
}
function toMeta(row, messageCount) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    pinned: row.pinned,
    datasetId: row.datasetId,
    model: row.model,
    messageCount
  };
}
function createConversation(input) {
  const { db } = open();
  const now = /* @__PURE__ */ new Date();
  const [row] = db.insert(conversation).values({
    id: input.id,
    title: input.title,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    datasetId: input.datasetId ?? null,
    model: input.model ?? null
  }).returning().all();
  pruneUnpinned();
  return toMeta(row, 0);
}
function listConversations(limit = 100, search) {
  const { db } = open();
  const cappedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const term = search?.trim();
  const counts = db.select({
    conversationId: message.conversationId,
    n: drizzleOrm.sql`count(*)`.as("n")
  }).from(message).groupBy(message.conversationId).all();
  const countById = new Map(counts.map((c) => [c.conversationId, Number(c.n)]));
  let rows;
  if (term) {
    const pattern = `%${term.replaceAll(/[%_]/g, (m) => `\\${m}`)}%`;
    const matchingIds = db.selectDistinct({ conversationId: message.conversationId }).from(message).where(drizzleOrm.like(message.content, pattern)).all().map((r) => r.conversationId);
    rows = db.select().from(conversation).where(
      drizzleOrm.or(
        drizzleOrm.like(conversation.title, pattern),
        matchingIds.length ? drizzleOrm.sql`${conversation.id} IN (${drizzleOrm.sql.join(
          matchingIds.map((id) => drizzleOrm.sql`${id}`),
          drizzleOrm.sql`, `
        )})` : drizzleOrm.sql`0`
      )
    ).orderBy(drizzleOrm.desc(conversation.pinned), drizzleOrm.desc(conversation.updatedAt)).limit(cappedLimit).all();
  } else {
    rows = db.select().from(conversation).orderBy(drizzleOrm.desc(conversation.pinned), drizzleOrm.desc(conversation.updatedAt)).limit(cappedLimit).all();
  }
  return rows.map((row) => toMeta(row, countById.get(row.id) ?? 0));
}
function renameConversation(id, title) {
  const { db } = open();
  db.update(conversation).set({ title, updatedAt: /* @__PURE__ */ new Date() }).where(drizzleOrm.eq(conversation.id, id)).run();
}
function setConversationPinned(id, pinned) {
  const { db } = open();
  db.update(conversation).set({ pinned }).where(drizzleOrm.eq(conversation.id, id)).run();
}
function deleteConversation(id) {
  const { db } = open();
  db.delete(message).where(drizzleOrm.eq(message.conversationId, id)).run();
  db.delete(conversation).where(drizzleOrm.eq(conversation.id, id)).run();
}
function pruneUnpinned() {
  const { sqlite } = open();
  sqlite.prepare(
    `DELETE FROM moudir_conversation
       WHERE pinned = 0
         AND id NOT IN (
           SELECT id FROM moudir_conversation WHERE pinned = 0
           ORDER BY updated_at DESC LIMIT ?
         )`
  ).run(MAX_UNPINNED_CONVERSATIONS);
  sqlite.prepare(
    `DELETE FROM moudir_message
       WHERE conversation_id NOT IN (SELECT id FROM moudir_conversation)`
  ).run();
}
function appendMessage(input) {
  const { db } = open();
  const now = /* @__PURE__ */ new Date();
  const [row] = db.insert(message).values({
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    parts: input.parts ?? null,
    createdAt: now
  }).returning().all();
  db.update(conversation).set({ updatedAt: now }).where(drizzleOrm.eq(conversation.id, input.conversationId)).run();
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    parts: row.parts,
    createdAt: row.createdAt.getTime()
  };
}
function getMessages(conversationId2, limit = 500) {
  const { db } = open();
  const cappedLimit = Math.max(1, Math.min(2e3, Math.floor(limit)));
  return db.select().from(message).where(drizzleOrm.and(drizzleOrm.eq(message.conversationId, conversationId2))).orderBy(message.id).limit(cappedLimit).all().map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    parts: row.parts,
    createdAt: row.createdAt.getTime()
  }));
}
function closeChatStore() {
  handle?.sqlite.close();
  handle = null;
}
var DEFAULT_EMBED_MODEL_ENTRY = MODEL_DOWNLOADS.find(
  (m) => m.key === "qwen3-embedding-0.6b-q8_0"
);
if (!DEFAULT_EMBED_MODEL_ENTRY) {
  throw new Error(
    "embed-service.ts: MODEL_DOWNLOADS is missing the 'qwen3-embedding-0.6b-q8_0' entry"
  );
}
var DEFAULT_EMBED_MODEL = DEFAULT_EMBED_MODEL_ENTRY.file;
var embedModel = null;
var embedContext = null;
var loadedEmbedModelPath = null;
function modelDir2() {
  return path__default.default.join(electron.app.getPath("userData"), "models", "llm");
}
function modelPath2(file) {
  return path__default.default.join(modelDir2(), file);
}
async function ensureEmbedModel(file = DEFAULT_EMBED_MODEL) {
  const target = modelPath2(file);
  if (!fs3.existsSync(target)) {
    throw new Error(
      `Missing GGUF embedding model: ${target}. Download it while online into ${modelDir2()}.`
    );
  }
  if (embedModel && embedContext && loadedEmbedModelPath === target) {
    return;
  }
  if (embedModel) {
    await disposeEmbed();
  }
  const llama = await getSharedLlama();
  embedModel = await llama.loadModel({ modelPath: target });
  embedContext = await embedModel.createEmbeddingContext();
  loadedEmbedModelPath = target;
}
async function embedBatch(texts) {
  if (texts.length === 0) return [];
  await ensureEmbedModel();
  const context = embedContext;
  const embeddings = await Promise.all(texts.map((text3) => context.getEmbeddingFor(text3)));
  return embeddings.map((embedding) => Float32Array.from(embedding.vector));
}
async function isEmbedAvailable(file = DEFAULT_EMBED_MODEL) {
  try {
    if (!fs3.existsSync(modelPath2(file))) return false;
    await ensureEmbedModel(file);
    return true;
  } catch {
    return false;
  }
}
async function disposeEmbed() {
  try {
    if (embedContext) {
      await embedContext.dispose();
    }
  } catch (error) {
    console.warn("[embed] embedding context dispose error:", error);
  } finally {
    embedContext = null;
  }
  try {
    if (embedModel) {
      await embedModel.dispose();
    }
  } catch (error) {
    console.warn("[embed] model dispose error:", error);
  } finally {
    embedModel = null;
    loadedEmbedModelPath = null;
  }
}

// electron/ipc-concurrency.ts
var ConcurrencyLimitError = class extends Error {
  constructor(label, maxConcurrent, maxQueue) {
    super(
      `Too many concurrent "${label}" requests (limit ${maxConcurrent} in-flight, ${maxQueue} queued). Try again shortly.`
    );
    this.code = "E_CONCURRENCY_LIMIT";
    this.name = "ConcurrencyLimitError";
  }
};
var TaskTimeoutError = class extends Error {
  constructor(label, timeoutMs) {
    super(`Operation "${label}" timed out after ${timeoutMs}ms.`);
    this.code = "E_TASK_TIMEOUT";
    this.name = "TaskTimeoutError";
  }
};
function createConcurrencyLimiter(options) {
  const label = options.label;
  const maxConcurrent = Math.max(1, Math.floor(options.maxConcurrent));
  const maxQueue = Math.max(0, Math.floor(options.maxQueue));
  let active = 0;
  const queue = [];
  function release() {
    active -= 1;
    const next = queue.shift();
    if (next) {
      next.start();
    }
  }
  function launch(task) {
    active += 1;
    return (async () => {
      try {
        return await task();
      } finally {
        release();
      }
    })();
  }
  function run(task) {
    if (active < maxConcurrent) {
      return launch(task);
    }
    if (queue.length >= maxQueue) {
      return Promise.reject(new ConcurrencyLimitError(label, maxConcurrent, maxQueue));
    }
    return new Promise((resolve2, reject) => {
      queue.push({
        start: () => {
          launch(task).then(resolve2, reject);
        }
      });
    });
  }
  function stats() {
    return { label, active, queued: queue.length, maxConcurrent, maxQueue };
  }
  return { run, stats };
}
function withTimeout(task, options) {
  const { label, timeoutMs } = options;
  const setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = options.clearTimeoutFn ?? ((h) => clearTimeout(h));
  const controller = new AbortController();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return task(controller.signal);
  }
  return new Promise((resolve2, reject) => {
    let settled = false;
    const handle2 = setTimeoutFn(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(new TaskTimeoutError(label, timeoutMs));
    }, timeoutMs);
    const finish = () => {
      if (handle2 !== void 0) clearTimeoutFn(handle2);
    };
    task(controller.signal).then(
      (value) => {
        if (settled) return;
        settled = true;
        finish();
        resolve2(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        finish();
        reject(error);
      }
    );
  });
}
function runBounded(limiter, task, timeout) {
  return limiter.run(() => withTimeout(task, timeout));
}
function parseIpc(schema, input, channel) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
    throw new Error(`Invalid IPC payload for "${channel}": ${detail}`);
  }
  return result.data;
}
var MAX_SQL_CHARS = 2e5;
var MAX_PROMPT_CHARS = 1e6;
var datasetId = z.z.string().min(1).max(512);
var cancelToken = z.z.string().max(512).optional();
var requestId = z.z.string().max(512).optional();
var SqlSchema = z.z.string().min(1).max(MAX_SQL_CHARS);
var RegisterCsvSchema = z.z.object({
  filePath: z.z.string().min(1),
  displayName: z.z.string().optional(),
  hasHeader: z.z.boolean().optional(),
  delimiter: z.z.string().max(8).optional(),
  sampleSize: z.z.number().optional(),
  previewLimit: z.z.number().optional(),
  encoding: z.z.enum(["utf-8", "utf-16", "latin-1"]).optional(),
  storeRejects: z.z.boolean().optional()
});
var RegisterParquetSchema = z.z.object({
  filePath: z.z.string().min(1),
  displayName: z.z.string().optional(),
  previewLimit: z.z.number().optional()
});
var DatasetOnlySchema2 = z.z.object({ datasetId });
var PreviewDatasetSchema2 = z.z.object({
  datasetId,
  limit: z.z.number().optional(),
  offset: z.z.number().optional()
});
var ExportDatasetSchema2 = z.z.object({ datasetId, targetPath: z.z.string().min(1) });
var ProfileDatasetSchema2 = z.z.object({ datasetId, cancelToken });
var ProfileColumnDetailSchema2 = z.z.object({
  datasetId,
  column: z.z.string().min(1),
  topK: z.z.number().optional(),
  binCount: z.z.number().optional(),
  cancelToken
});
var CountRowsSchema2 = z.z.object({
  datasetId,
  where: z.z.string().max(MAX_SQL_CHARS).optional(),
  force: z.z.boolean().optional(),
  cancelToken
});
var KeysetPageSchema2 = z.z.object({
  datasetId,
  sortKeys: z.z.array(z.z.object({ column: z.z.string().min(1), direction: z.z.enum(["ASC", "DESC"]).optional() })).max(64),
  limit: z.z.number(),
  where: z.z.string().max(MAX_SQL_CHARS).optional(),
  cursor: z.z.object({ sortValues: z.z.array(z.z.unknown()), rowid: z.z.number() }).optional(),
  columns: z.z.array(z.z.string()).max(4096).optional(),
  cancelToken
});
var LlamaGenerateSchema = z.z.object({
  requestId,
  system: z.z.string().max(MAX_PROMPT_CHARS).optional(),
  prompt: z.z.string().min(1).max(MAX_PROMPT_CHARS),
  systemPrefix: z.z.string().max(MAX_PROMPT_CHARS).optional(),
  maxTokens: z.z.number().optional(),
  temperature: z.z.number().optional(),
  topP: z.z.number().optional()
});
var LlamaGenerateStructuredSchema = z.z.object({
  requestId,
  system: z.z.string().max(MAX_PROMPT_CHARS).optional(),
  prompt: z.z.string().min(1).max(MAX_PROMPT_CHARS),
  systemPrefix: z.z.string().max(MAX_PROMPT_CHARS).optional(),
  jsonSchema: z.z.record(z.z.string(), z.z.unknown()),
  maxTokens: z.z.number().optional(),
  temperature: z.z.number().optional()
});
var LlamaEnsureModelSchema = z.z.object({ file: z.z.string().max(512).optional() }).optional();
var LlamaEmbedSchema = z.z.object({ texts: z.z.array(z.z.string()).min(1).max(256) });
var RequestIdSchema = z.z.string().min(1).max(512);
var ModelKeySchema = z.z.enum([
  "gemma-4-e4b-it-q4_k_m",
  "granite-4.1-3b-instruct-q4_k_m",
  "qwen3-embedding-0.6b-q8_0"
]);
var ModelDownloadSchema = z.z.object({ key: ModelKeySchema, requestId });
var conversationId = z.z.string().min(1).max(128);
var messageParts = z.z.unknown().optional().refine((v) => v === void 0 || JSON.stringify(v).length <= 2e6, {
  message: "parts too large"
});
var ChatCreateConversationSchema = z.z.object({
  id: conversationId,
  title: z.z.string().min(1).max(300),
  datasetId: z.z.string().max(512).nullish(),
  model: z.z.string().max(300).nullish()
});
var ChatListConversationsSchema = z.z.object({
  limit: z.z.number().optional(),
  search: z.z.string().max(500).optional()
}).optional();
var ChatRenameSchema = z.z.object({
  id: conversationId,
  title: z.z.string().min(1).max(300)
});
var ChatPinSchema = z.z.object({ id: conversationId, pinned: z.z.boolean() });
var ChatConversationIdSchema = z.z.object({ id: conversationId });
var ChatAppendMessageSchema = z.z.object({
  conversationId,
  role: z.z.enum(["user", "assistant", "tool"]),
  content: z.z.string().max(MAX_PROMPT_CHARS),
  parts: messageParts
});
var ChatGetMessagesSchema = z.z.object({
  conversationId,
  limit: z.z.number().optional()
});
var ChatOpenSchema = z.z.object({
  conversationId,
  modelFile: z.z.string().max(512).optional(),
  systemPrompt: z.z.string().max(32e3).optional(),
  history: z.z.array(
    z.z.object({
      role: z.z.enum(["user", "assistant", "tool"]),
      content: z.z.string().max(MAX_PROMPT_CHARS)
    })
  ).max(2e3).optional()
});
var ChatPromptSchema = z.z.object({
  conversationId,
  text: z.z.string().min(1).max(MAX_PROMPT_CHARS),
  requestId
});
var ChatPreloadSchema = z.z.object({
  conversationId,
  text: z.z.string().min(1).max(MAX_PROMPT_CHARS)
});
var ChatSessionIdSchema = z.z.object({ conversationId });
var MAX_CLIPBOARD_IMAGE_CHARS = 3e7;
var ClipboardImageSchema = z.z.object({
  dataUrl: z.z.string().min(1).max(MAX_CLIPBOARD_IMAGE_CHARS).refine((value) => value.startsWith("data:image/"), {
    message: "must be a data:image/ URL"
  })
});
z.z.object({
  port: z.z.number().int().min(0).max(65535).optional(),
  pairingCode: z.z.string().max(256).optional(),
  guestCode: z.z.string().max(256).optional(),
  room: z.z.string().max(256).optional(),
  advertise: z.z.boolean().optional(),
  discover: z.z.boolean().optional()
}).optional();
var AUTH_DB_KEY_ENV = "DN_AUTH_DB_KEY";
var ENCRYPT_AUTH_DB_ENV = "DN_ENCRYPT_AUTH_DB";
var WRAPPED_KEY_FILE_NAME = "auth-db-key.enc";
var DEK_BYTES = 32;
function getWrappedKeyPath(userDataDir) {
  return path__default.default.join(path__default.default.resolve(userDataDir), WRAPPED_KEY_FILE_NAME);
}
function isEncryptionEnabledByFlag(env2 = process.env) {
  const raw = env2[ENCRYPT_AUTH_DB_ENV];
  if (raw === void 0) return true;
  const normalized = raw.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "off";
}
function loadOrCreateWrappedDek(userDataDir, safeStorage2) {
  if (!safeStorage2.isEncryptionAvailable()) {
    return null;
  }
  const keyPath = getWrappedKeyPath(userDataDir);
  if (fs3.existsSync(keyPath)) {
    try {
      const wrapped2 = fs3.readFileSync(keyPath);
      const hex = safeStorage2.decryptString(wrapped2).trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        return hex.toLowerCase();
      }
    } catch {
      return null;
    }
  }
  const dekHex = crypto__default.default.randomBytes(DEK_BYTES).toString("hex");
  const wrapped = safeStorage2.encryptString(dekHex);
  fs3.mkdirSync(path__default.default.dirname(keyPath), { recursive: true });
  fs3.writeFileSync(keyPath, wrapped, { mode: 384 });
  return dekHex;
}
function ensureAuthDbKeyEnv(userDataDir, safeStorage2, env2 = process.env) {
  const existing = env2[AUTH_DB_KEY_ENV];
  if (existing && /^[0-9a-f]{64}$/i.test(existing.trim())) {
    return existing.trim().toLowerCase();
  }
  if (!isEncryptionEnabledByFlag(env2)) {
    return null;
  }
  const dekHex = loadOrCreateWrappedDek(userDataDir, safeStorage2);
  if (dekHex) {
    env2[AUTH_DB_KEY_ENV] = dekHex;
  }
  return dekHex;
}
function normalizePath(filePath) {
  return path__default.default.resolve(filePath);
}
function isPathInside(childPath, parentPath) {
  const child2 = normalizePath(childPath);
  const parent = normalizePath(parentPath);
  const relative = path__default.default.relative(parent, child2);
  return relative === "" || !relative.startsWith("..") && !path__default.default.isAbsolute(relative);
}
function isAllowedAppOrigin(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol === "file:") return true;
    if (url.hostname === "localhost") return true;
    if (url.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}
function wantsMicrophone(details) {
  if (!details) return true;
  if (Array.isArray(details.mediaTypes)) {
    return details.mediaTypes.includes("audio");
  }
  if (details.mediaType) {
    return details.mediaType === "audio" || details.mediaType === "unknown";
  }
  return true;
}
var _dataDir, _allowedReadPaths, _allowedWritePaths, _allowedDirectoryPaths;
var PathAccessController = class {
  constructor(dataDir) {
    __privateAdd(this, _dataDir);
    __privateAdd(this, _allowedReadPaths, /* @__PURE__ */ new Set());
    __privateAdd(this, _allowedWritePaths, /* @__PURE__ */ new Set());
    __privateAdd(this, _allowedDirectoryPaths, /* @__PURE__ */ new Set());
    __privateSet(this, _dataDir, normalizePath(dataDir));
  }
  get dataDir() {
    return __privateGet(this, _dataDir);
  }
  isInsideDataDir(filePath) {
    return isPathInside(filePath, __privateGet(this, _dataDir));
  }
  /** Remember a user-selected file/dir for reads (e.g. from an open dialog). */
  rememberReadPath(filePath) {
    const resolved = normalizePath(filePath);
    __privateGet(this, _allowedReadPaths).add(resolved);
    __privateGet(this, _allowedDirectoryPaths).add(resolved);
  }
  /** Remember a user-selected save target for writes (e.g. from a save dialog). */
  rememberSavePath(filePath) {
    __privateGet(this, _allowedWritePaths).add(normalizePath(filePath));
  }
  /** Remember a user-selected directory (open-directory dialog). */
  rememberDirectory(dirPath) {
    __privateGet(this, _allowedDirectoryPaths).add(normalizePath(dirPath));
  }
  assertAllowedReadPath(filePath) {
    const resolved = normalizePath(filePath);
    if (__privateGet(this, _allowedReadPaths).has(resolved) || this.isInsideDataDir(resolved)) {
      return resolved;
    }
    for (const allowedDir of __privateGet(this, _allowedDirectoryPaths)) {
      if (isPathInside(resolved, allowedDir)) {
        return resolved;
      }
    }
    throw new Error(`Blocked read access to untrusted path: ${resolved}`);
  }
  assertAllowedWritePath(filePath) {
    const resolved = normalizePath(filePath);
    if (__privateGet(this, _allowedWritePaths).has(resolved) || this.isInsideDataDir(resolved)) {
      return resolved;
    }
    throw new Error(`Blocked write access to untrusted path: ${resolved}`);
  }
  assertAllowedDeletePath(filePath) {
    const resolved = normalizePath(filePath);
    if (!this.isInsideDataDir(resolved)) {
      throw new Error(`Blocked delete access outside app data dir: ${resolved}`);
    }
    return resolved;
  }
  assertAllowedDirectoryPath(dirPath) {
    const resolved = normalizePath(dirPath);
    if (__privateGet(this, _allowedDirectoryPaths).has(resolved) || this.isInsideDataDir(resolved)) {
      return resolved;
    }
    throw new Error(`Blocked directory access to untrusted path: ${resolved}`);
  }
};
_dataDir = new WeakMap();
_allowedReadPaths = new WeakMap();
_allowedWritePaths = new WeakMap();
_allowedDirectoryPaths = new WeakMap();
var CROSS_ORIGIN_ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": ["same-origin"],
  "Cross-Origin-Embedder-Policy": ["require-corp"],
  "Cross-Origin-Resource-Policy": ["same-origin"]
};
function withCrossOriginIsolationHeaders(responseHeaders) {
  const managed = /* @__PURE__ */ new Set([
    "cross-origin-opener-policy",
    "cross-origin-embedder-policy",
    "cross-origin-resource-policy"
  ]);
  const next = {};
  for (const [key, value] of Object.entries(responseHeaders ?? {})) {
    if (!managed.has(key.toLowerCase())) {
      next[key] = value;
    }
  }
  for (const [key, value] of Object.entries(CROSS_ORIGIN_ISOLATION_HEADERS)) {
    next[key] = [...value];
  }
  return next;
}
var CSP_CONNECT_SRC = [
  "'self'",
  "blob:",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "ws://localhost:3000",
  "ws://127.0.0.1:3000",
  // LAN collaboration peers are discovered dynamically (any host:port).
  "ws:",
  "wss:"
].join(" ");
function rendererCspDirectives(options) {
  const scriptSrc = ["'self'", "'wasm-unsafe-eval'"];
  if (!options.strict) scriptSrc.push("'unsafe-inline'");
  if (options.dev) scriptSrc.push("'unsafe-eval'");
  const styleSrc = options.strict ? ["'self'"] : ["'self'", "'unsafe-inline'"];
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    `connect-src ${CSP_CONNECT_SRC}`,
    "manifest-src 'self'"
  ].join("; ");
}
function buildRendererCsp(options) {
  return {
    enforce: rendererCspDirectives({ strict: false, dev: options.dev }),
    reportOnly: rendererCspDirectives({ strict: true, dev: options.dev })
  };
}
var STATIC_SECURITY_HEADERS = {
  "X-Content-Type-Options": ["nosniff"],
  "X-Frame-Options": ["SAMEORIGIN"],
  "Referrer-Policy": ["no-referrer"],
  "Permissions-Policy": [
    "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()"
  ],
  "X-DNS-Prefetch-Control": ["off"]
};
function withRendererSecurityHeaders(responseHeaders, options) {
  const next = withCrossOriginIsolationHeaders(responseHeaders);
  const managed = /* @__PURE__ */ new Set([
    "content-security-policy",
    "content-security-policy-report-only",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "x-dns-prefetch-control",
    "x-powered-by"
  ]);
  for (const key of Object.keys(next)) {
    if (managed.has(key.toLowerCase())) delete next[key];
  }
  const csp = buildRendererCsp({ dev: options.dev });
  {
    next["Content-Security-Policy"] = [csp.enforce];
  }
  next["Content-Security-Policy-Report-Only"] = [csp.reportOnly];
  for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    next[key] = [...value];
  }
  return next;
}
var LOOPBACK_HOSTNAMES = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
function isLoopbackHostname(hostname) {
  if (!hostname) return false;
  return LOOPBACK_HOSTNAMES.has(hostname.trim().toLowerCase());
}
function assertLoopbackHostname(hostname) {
  if (!isLoopbackHostname(hostname)) {
    throw new Error(
      `Refusing to bind the embedded server to non-loopback host "${hostname}". Data Navigator is localhost-only; set BETTER_AUTH_BASE_URL to a loopback origin.`
    );
  }
  return hostname;
}
var SECRET_FILE_NAME = "better-auth-secret";
function loadOrCreateAuthSecret(userDataDir) {
  const secretPath = path__default.default.join(normalizePath(userDataDir), SECRET_FILE_NAME);
  if (fs3.existsSync(secretPath)) {
    const existing = fs3.readFileSync(secretPath, "utf8").trim();
    if (existing.length >= 32) {
      return existing;
    }
  }
  const secret = crypto__default.default.randomBytes(32).toString("hex");
  fs3.mkdirSync(path__default.default.dirname(secretPath), { recursive: true });
  fs3.writeFileSync(secretPath, secret, { encoding: "utf8", mode: 384 });
  return secret;
}
function ensureAuthSecretEnv(userDataDir) {
  const existing = process.env.BETTER_AUTH_SECRET;
  if (existing && existing.trim().length >= 32) {
    return existing;
  }
  const secret = loadOrCreateAuthSecret(userDataDir);
  process.env.BETTER_AUTH_SECRET = secret;
  return secret;
}
var PRODUCTION_FUSE_CONFIG = {
  /** Disallow `ELECTRON_RUN_AS_NODE` — no arbitrary Node execution via the app. */
  RunAsNode: false};
var nowMs2 = drizzleOrm.sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
var appSetting = sqliteCore.sqliteTable(
  "app_setting",
  {
    namespace: sqliteCore.text("namespace").notNull(),
    key: sqliteCore.text("key").notNull(),
    value: sqliteCore.text("value", { mode: "json" }).$type().notNull(),
    createdAt: sqliteCore.integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs2),
    updatedAt: sqliteCore.integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs2)
  },
  (table) => [
    sqliteCore.primaryKey({ columns: [table.namespace, table.key], name: "app_setting_pk" }),
    sqliteCore.index("app_setting_namespace_idx").on(table.namespace)
  ]
);
var analyticsSnapshotHistory = sqliteCore.sqliteTable(
  "analytics_snapshot_history",
  {
    id: sqliteCore.integer("id").primaryKey({ autoIncrement: true }),
    tableName: sqliteCore.text("table_name").notNull(),
    label: sqliteCore.text("label").notNull(),
    fileName: sqliteCore.text("file_name"),
    savedAt: sqliteCore.integer("saved_at", { mode: "timestamp_ms" }).notNull().default(nowMs2),
    sizeBytes: sqliteCore.integer("size_bytes").notNull(),
    /** Denormalized for the history list — avoids parsing `payload` per row just to render a card. */
    totalTransactions: sqliteCore.integer("total_transactions").notNull().default(0),
    successRate: sqliteCore.real("success_rate").notNull().default(0),
    payload: sqliteCore.text("payload", { mode: "json" }).$type().notNull()
  },
  (table) => [
    sqliteCore.index("analytics_snapshot_history_table_saved_idx").on(table.tableName, table.savedAt)
  ]
);
var SCHEMA_SQL2 = `
CREATE TABLE IF NOT EXISTS app_setting (
  namespace text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  PRIMARY KEY (namespace, key)
);
CREATE INDEX IF NOT EXISTS app_setting_namespace_idx ON app_setting (namespace);

CREATE TABLE IF NOT EXISTS analytics_snapshot_history (
  id integer PRIMARY KEY AUTOINCREMENT,
  table_name text NOT NULL,
  label text NOT NULL,
  file_name text,
  saved_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  size_bytes integer NOT NULL,
  total_transactions integer DEFAULT 0 NOT NULL,
  success_rate real DEFAULT 0 NOT NULL,
  payload text NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_snapshot_history_table_saved_idx
  ON analytics_snapshot_history (table_name, saved_at);
`;
var KEEP_NEWEST_PER_TABLE = 20;
var MAX_SNAPSHOT_AGE_MS = 90 * 24 * 60 * 60 * 1e3;
var DB_FILES = {
  settings: "settings.db",
  analytics: "analytics.db"
};
var ANALYTICS_SNAPSHOT_NS = "analytics_snapshot";
var ANALYTICS_NAMESPACES = /* @__PURE__ */ new Set([ANALYTICS_SNAPSHOT_NS]);
function domainForNamespace(namespace) {
  return ANALYTICS_NAMESPACES.has(namespace) ? "analytics" : "settings";
}
var handles = /* @__PURE__ */ new Map();
var baseDir2 = null;
function configureSettingsStore(databasesDir) {
  baseDir2 = databasesDir;
}
function openDomain(domain) {
  const cached = handles.get(domain);
  if (cached) return cached;
  if (!baseDir2) {
    throw new Error("settings-store: configureSettingsStore() was not called");
  }
  fs3.mkdirSync(baseDir2, { recursive: true });
  const sqlite = new Database2__default.default(path__default.default.join(baseDir2, DB_FILES[domain]));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL2);
  const handle2 = {
    db: betterSqlite3.drizzle({ client: sqlite, schema: { appSetting, analyticsSnapshotHistory } }),
    sqlite
  };
  handles.set(domain, handle2);
  return handle2;
}
function getSetting(namespace, key) {
  const { db } = openDomain(domainForNamespace(namespace));
  const row = db.select().from(appSetting).where(drizzleOrm.and(drizzleOrm.eq(appSetting.namespace, namespace), drizzleOrm.eq(appSetting.key, key))).get();
  if (!row) return { value: null, updatedAt: null };
  return { value: row.value, updatedAt: new Date(row.updatedAt).toISOString() };
}
function setSetting(namespace, key, value) {
  const { db } = openDomain(domainForNamespace(namespace));
  const now = /* @__PURE__ */ new Date();
  db.insert(appSetting).values({ namespace, key, value, createdAt: now, updatedAt: now }).onConflictDoUpdate({
    target: [appSetting.namespace, appSetting.key],
    set: { value, updatedAt: now }
  }).run();
  return now.toISOString();
}
function deleteSetting(namespace, key) {
  const { db } = openDomain(domainForNamespace(namespace));
  db.delete(appSetting).where(drizzleOrm.and(drizzleOrm.eq(appSetting.namespace, namespace), drizzleOrm.eq(appSetting.key, key))).run();
}
function exportSettings(namespace) {
  const out = {};
  const collect = (domain) => {
    var _a;
    const { db } = openDomain(domain);
    const query = db.select().from(appSetting);
    const rows = namespace ? query.where(drizzleOrm.eq(appSetting.namespace, namespace)).all() : query.all();
    for (const row of rows) {
      out[_a = row.namespace] ?? (out[_a] = {});
      out[row.namespace][row.key] = row.value;
    }
  };
  if (namespace) {
    collect(domainForNamespace(namespace));
  } else {
    collect("settings");
    collect("analytics");
  }
  return out;
}
var HISTORY_META_COLUMNS = {
  id: analyticsSnapshotHistory.id,
  tableName: analyticsSnapshotHistory.tableName,
  label: analyticsSnapshotHistory.label,
  fileName: analyticsSnapshotHistory.fileName,
  savedAt: analyticsSnapshotHistory.savedAt,
  sizeBytes: analyticsSnapshotHistory.sizeBytes,
  totalTransactions: analyticsSnapshotHistory.totalTransactions,
  successRate: analyticsSnapshotHistory.successRate
};
function toMeta2(row) {
  return { ...row, savedAt: row.savedAt.getTime() };
}
function pruneAnalyticsSnapshotHistory(tableName) {
  const { sqlite } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  const cutoff = Date.now() - MAX_SNAPSHOT_AGE_MS;
  const result = sqlite.prepare(
    `DELETE FROM analytics_snapshot_history
       WHERE table_name = ?
         AND id != COALESCE(
           (SELECT id FROM analytics_snapshot_history WHERE table_name = ? ORDER BY saved_at DESC LIMIT 1),
           -1
         )
         AND (
           id NOT IN (
             SELECT id FROM analytics_snapshot_history WHERE table_name = ? ORDER BY saved_at DESC LIMIT ?
           )
           OR saved_at < ?
         )`
  ).run(tableName, tableName, tableName, KEEP_NEWEST_PER_TABLE, cutoff);
  return result.changes;
}
function saveAnalyticsSnapshotHistory(input) {
  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  const savedAt = new Date(input.savedAt ?? Date.now());
  const sizeBytes = Buffer.byteLength(JSON.stringify(input.payload ?? null), "utf8");
  const [row] = db.insert(analyticsSnapshotHistory).values({
    tableName: input.tableName,
    label: input.label,
    fileName: input.fileName ?? null,
    savedAt,
    sizeBytes,
    totalTransactions: input.totalTransactions ?? 0,
    successRate: input.successRate ?? 0,
    payload: input.payload ?? null
  }).returning(HISTORY_META_COLUMNS).all();
  pruneAnalyticsSnapshotHistory(input.tableName);
  return toMeta2(row);
}
function listAnalyticsSnapshotHistory(tableName, limit = 20, offset = 0) {
  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  const boundedLimit = Math.min(Math.max(1, limit), 200);
  const boundedOffset = Math.max(0, offset);
  const query = db.select(HISTORY_META_COLUMNS).from(analyticsSnapshotHistory);
  const rows = (tableName ? query.where(drizzleOrm.eq(analyticsSnapshotHistory.tableName, tableName)) : query).orderBy(drizzleOrm.desc(analyticsSnapshotHistory.savedAt)).limit(boundedLimit).offset(boundedOffset).all();
  return rows.map(toMeta2);
}
function getAnalyticsSnapshotHistoryById(id) {
  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  const row = db.select().from(analyticsSnapshotHistory).where(drizzleOrm.eq(analyticsSnapshotHistory.id, id)).get();
  if (!row) return void 0;
  return { ...toMeta2(row), payload: row.payload };
}
function deleteAnalyticsSnapshotHistoryById(id) {
  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  db.delete(analyticsSnapshotHistory).where(drizzleOrm.eq(analyticsSnapshotHistory.id, id)).run();
}
var MIGRATION_NS = "__migration";
var MIGRATION_KEY = "auth_app_setting_v1";
function migrateLegacyAppSettings(authDbPath) {
  if (getSetting(MIGRATION_NS, MIGRATION_KEY).value) return { migrated: 0 };
  let migrated = 0;
  if (fs3.existsSync(authDbPath)) {
    try {
      const source = new Database2__default.default(authDbPath, { readonly: true });
      try {
        const rows = source.prepare("SELECT namespace, key, value FROM app_setting").all();
        for (const row of rows) {
          if (row.namespace === MIGRATION_NS) continue;
          if (getSetting(row.namespace, row.key).value !== null) continue;
          let parsed;
          try {
            parsed = JSON.parse(row.value);
          } catch {
            parsed = row.value;
          }
          setSetting(row.namespace, row.key, parsed);
          migrated += 1;
        }
      } finally {
        source.close();
      }
    } catch (error) {
      console.warn("[settings-store] legacy app_setting lift skipped:", error);
    }
  }
  setSetting(MIGRATION_NS, MIGRATION_KEY, { done: true, migrated, at: Date.now() });
  return { migrated };
}
var HISTORY_MIGRATION_KEY = "analytics_snapshot_history_v1";
function migrateLegacyAnalyticsSnapshotKV() {
  if (getSetting(MIGRATION_NS, HISTORY_MIGRATION_KEY).value) return { migrated: 0 };
  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  const rows = db.select().from(appSetting).where(drizzleOrm.eq(appSetting.namespace, ANALYTICS_SNAPSHOT_NS)).all();
  let migrated = 0;
  for (const row of rows) {
    const value = row.value;
    const tableName = value && typeof value.tableName === "string" && value.tableName ? value.tableName : row.key;
    const fileName = value && typeof value.fileName === "string" ? value.fileName : null;
    const kpi = value && typeof value.kpi === "object" ? value.kpi : null;
    const totalTransactions = typeof kpi?.totalTransactions === "number" ? kpi.totalTransactions : 0;
    const successRate = typeof kpi?.successRate === "number" ? kpi.successRate : 0;
    saveAnalyticsSnapshotHistory({
      tableName,
      label: fileName ?? "Migrated snapshot",
      fileName,
      payload: value,
      totalTransactions,
      successRate,
      savedAt: row.updatedAt.getTime()
    });
    migrated += 1;
  }
  setSetting(MIGRATION_NS, HISTORY_MIGRATION_KEY, { done: true, migrated, at: Date.now() });
  return { migrated };
}
function closeSettingsStore() {
  for (const { sqlite } of handles.values()) {
    try {
      sqlite.close();
    } catch {
    }
  }
  handles.clear();
}

// electron/workers/duckdb-utility-protocol.ts
function isErrorResponse(value) {
  return value.ok === false && value.kind === "error";
}

// electron/workers/duckdb-utility-broker.ts
var REQUEST_TIMEOUT_MS = 12e4;
var FORK_SPAWN_TIMEOUT_MS = 15e3;
var UTILITY_MEMORY_LIMIT = "2GB";
function getDuckDBRootDir2() {
  return path__default.default.join(electron.app.getPath("userData"), "data-navigator");
}
function getDatasetsDirPath2() {
  return path__default.default.join(getDuckDBRootDir2(), "datasets");
}
function getTmpSpillDir() {
  return path__default.default.join(getDuckDBRootDir2(), "tmp");
}
function getUtilityModulePath() {
  return path__default.default.join(__dirname, "workers", "duckdb.utility.js");
}
function isEnabled() {
  return process.env.DN_DUCKDB_UTILITY === "1";
}
var child = null;
var readyPromise = null;
var nextId = 1;
var pending = /* @__PURE__ */ new Map();
function rejectAllPending(error) {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  pending.clear();
}
function teardown(error) {
  rejectAllPending(error);
  child = null;
  readyPromise = null;
}
function onChildMessage(message2) {
  if (typeof message2 !== "object" || message2 === null) return;
  const response = message2;
  if (typeof response.id !== "number") return;
  const entry = pending.get(response.id);
  if (!entry) return;
  pending.delete(response.id);
  clearTimeout(entry.timer);
  entry.resolve(response);
}
function ensureSpawned() {
  if (child && readyPromise) return readyPromise;
  readyPromise = new Promise((resolve2, reject) => {
    let settled = false;
    const forked = electron.utilityProcess.fork(getUtilityModulePath(), [], {
      serviceName: "data-navigator-duckdb",
      // Keep the child lean; it must never inherit a debug/inspect posture.
      stdio: "inherit"
    });
    child = forked;
    const spawnTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      teardown(new Error("DuckDB utility process failed to spawn in time."));
      reject(new Error("DuckDB utility process failed to spawn in time."));
    }, FORK_SPAWN_TIMEOUT_MS);
    forked.on("spawn", () => {
      if (settled) return;
      settled = true;
      clearTimeout(spawnTimer);
      resolve2();
    });
    forked.on("message", onChildMessage);
    forked.on("exit", (code) => {
      const err = new Error(`DuckDB utility process exited (code ${code}).`);
      if (!settled) {
        settled = true;
        clearTimeout(spawnTimer);
        reject(err);
      }
      teardown(err);
    });
    forked.on("error", (type, location) => {
      const err = new Error(`DuckDB utility process error (${type}) at ${location}.`);
      if (!settled) {
        settled = true;
        clearTimeout(spawnTimer);
        reject(err);
      }
      teardown(err);
    });
  });
  return readyPromise;
}
function request(message2) {
  const id = nextId++;
  const full = { ...message2, id };
  return new Promise((resolve2, reject) => {
    const active = child;
    if (!active) {
      reject(new Error("DuckDB utility process not available."));
      return;
    }
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DuckDB utility request "${full.kind}" timed out.`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve: resolve2, reject, timer });
    active.postMessage(full);
  });
}
var initialized = false;
async function ensureInitialized() {
  await ensureSpawned();
  if (initialized) return;
  const cores = os3__default.default.availableParallelism?.() ?? 4;
  const threads = Math.max(1, Math.min(cores - 1, 6));
  const response = await request({
    kind: "init",
    userDataDir: electron.app.getPath("userData"),
    datasetsDir: getDatasetsDirPath2(),
    tmpSpillDir: getTmpSpillDir(),
    threads,
    memoryLimit: UTILITY_MEMORY_LIMIT
  });
  if (isErrorResponse(response)) {
    throw new Error(`DuckDB utility init failed: ${response.message}`);
  }
  initialized = true;
}
async function runReadOnlyQuery2(sql3) {
  await ensureInitialized();
  const response = await request({ kind: "runReadOnlyQuery", sql: sql3 });
  if (isErrorResponse(response)) {
    throw new Error(response.message);
  }
  if (response.kind !== "runReadOnlyQuery") {
    throw new Error(`Unexpected response kind: ${response.kind}`);
  }
  return response.rows;
}
function dispose2() {
  const active = child;
  initialized = false;
  if (active) {
    try {
      active.kill();
    } catch {
    }
  }
  teardown(new Error("DuckDB utility broker disposed."));
}

// electron/main.ts
if (require_electron_squirrel_startup()) {
  electron.app.quit();
}
function bootLog(message2) {
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${message2}
`;
  const nodeFs = __require("fs");
  try {
    nodeFs.appendFileSync(path__default.default.join(electron.app.getPath("userData"), "boot.log"), line);
    return;
  } catch {
  }
  try {
    const os4 = __require("os");
    nodeFs.appendFileSync(path__default.default.join(os4.tmpdir(), "data-navigator-boot.log"), line);
  } catch {
  }
}
process.on("unhandledRejection", (reason) => {
  const detail = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  bootLog(`unhandledRejection: ${detail}`);
  console.error("[electron] unhandled promise rejection:", reason);
});
bootLog(`main.js loaded; isPackaged=${electron.app.isPackaged}`);
var isDev = !electron.app.isPackaged;
var mainWindow = null;
authClient.setupMain({
  getWindow: () => mainWindow,
  // Keep better-auth's own CSP rewriter OFF — this app owns the CSP in
  // electron/security.ts (see withRendererSecurityHeaders). Explicit so a future
  // edit can't silently activate a competing onHeadersReceived CSP handler.
  csp: false
});
if (electron.app.isPackaged && process.env.DN_ENABLE_AUTO_UPDATE === "1") {
  import('update-electron-app').then(({ updateElectronApp }) => {
    updateElectronApp({
      repo: "aliammari1/data-navigator",
      updateInterval: "1 hour"
    });
  }).catch((error) => {
    console.warn("[electron] auto-update setup failed:", error);
  });
}
electron.app.enableSandbox();
if (!electron.app.requestSingleInstanceLock()) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
if (electron.app.isPackaged) {
  const hasDebugFlag = process.argv.some(
    (arg) => arg.startsWith("--inspect") || arg.startsWith("--remote-debugging-port")
  );
  if (hasDebugFlag) {
    console.error("[electron] refusing to run a packaged build with a debug flag");
    electron.app.quit();
  }
}
var DATA_DIR = path__default.default.join(electron.app.getPath("userData"), "data-navigator");
var DATABASES_DIR = path__default.default.join(electron.app.getPath("userData"), "databases");
var AUTH_DB_FILENAME = "data-navigator-auth.sqlite";
var pathAccess = new PathAccessController(DATA_DIR);
async function ensureDataDir() {
  await fs__default.default.mkdir(DATA_DIR, { recursive: true });
}
async function ensureParentDirectory2(filePath) {
  await fs__default.default.mkdir(path__default.default.dirname(path__default.default.resolve(filePath)), { recursive: true });
}
function assertAllowedReadPath(filePath) {
  return pathAccess.assertAllowedReadPath(filePath);
}
function assertAllowedWritePath(filePath) {
  return pathAccess.assertAllowedWritePath(filePath);
}
function assertAllowedDeletePath(filePath) {
  return pathAccess.assertAllowedDeletePath(filePath);
}
function assertAllowedDirectoryPath(dirPath) {
  return pathAccess.assertAllowedDirectoryPath(dirPath);
}
function assertTrustedSender(event) {
  const frameUrl = event.senderFrame?.url;
  const webContentsUrl = event.sender.getURL();
  const url = frameUrl || webContentsUrl;
  if (!isAllowedAppOrigin(url)) {
    throw new Error(`Blocked IPC call from untrusted sender: ${url}`);
  }
}
async function withTrustedSender(event, handler) {
  assertTrustedSender(event);
  return handler();
}
var HEAVY_QUERY_MAX_CONCURRENT = 4;
var HEAVY_QUERY_MAX_QUEUE = 24;
var HEAVY_QUERY_TIMEOUT_MS = 12e4;
var heavyQueryLimiter = createConcurrencyLimiter({
  label: "duckdb-heavy-query",
  maxConcurrent: HEAVY_QUERY_MAX_CONCURRENT,
  maxQueue: HEAVY_QUERY_MAX_QUEUE
});
async function withBoundedHeavyQuery(event, label, handler) {
  return withTrustedSender(
    event,
    () => runBounded(heavyQueryLimiter, handler, {
      label,
      timeoutMs: HEAVY_QUERY_TIMEOUT_MS
    })
  );
}
async function installReactDevTools() {
  if (!isDev) return;
  try {
    const { installExtension: installExtension2, REACT_DEVELOPER_TOOLS: REACT_DEVELOPER_TOOLS2 } = await Promise.resolve().then(() => (init_dist2(), dist_exports));
    const extension = await installExtension2(REACT_DEVELOPER_TOOLS2);
    console.log(`[electron] Installed ${extension.name}`);
  } catch (error) {
    console.warn("[electron] React DevTools install failed:", error);
  }
}
electron.ipcMain.handle(
  "settings:get",
  async (event, namespace, key) => withTrustedSender(event, () => getSetting(namespace, key))
);
electron.ipcMain.handle(
  "settings:set",
  async (event, namespace, key, value) => withTrustedSender(event, () => setSetting(namespace, key, value))
);
electron.ipcMain.handle(
  "settings:delete",
  async (event, namespace, key) => withTrustedSender(event, () => deleteSetting(namespace, key))
);
electron.ipcMain.handle(
  "settings:export",
  async (event, namespace) => withTrustedSender(event, () => exportSettings(namespace))
);
electron.ipcMain.handle(
  "analyticsSnapshots:save",
  async (event, input) => withTrustedSender(event, () => saveAnalyticsSnapshotHistory(input))
);
electron.ipcMain.handle(
  "analyticsSnapshots:list",
  async (event, tableName, limit, offset) => withTrustedSender(event, () => listAnalyticsSnapshotHistory(tableName, limit, offset))
);
electron.ipcMain.handle(
  "analyticsSnapshots:get",
  async (event, id) => withTrustedSender(event, () => getAnalyticsSnapshotHistoryById(id))
);
electron.ipcMain.handle(
  "analyticsSnapshots:delete",
  async (event, id) => withTrustedSender(event, () => deleteAnalyticsSnapshotHistoryById(id))
);
electron.ipcMain.handle(
  "clipboard:writeImage",
  async (event, input) => withTrustedSender(event, () => {
    const { dataUrl } = parseIpc(ClipboardImageSchema, input, "clipboard:writeImage");
    const image = electron.nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) {
      throw new Error("clipboard:writeImage received an unreadable image data URL");
    }
    electron.clipboard.writeImage(image);
  })
);
electron.ipcMain.handle(
  "chatHistory:create",
  async (event, input) => withTrustedSender(
    event,
    () => createConversation(parseIpc(ChatCreateConversationSchema, input, "chatHistory:create"))
  )
);
electron.ipcMain.handle(
  "chatHistory:list",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatListConversationsSchema, input, "chatHistory:list");
    return listConversations(parsed?.limit ?? 100, parsed?.search);
  })
);
electron.ipcMain.handle(
  "chatHistory:rename",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatRenameSchema, input, "chatHistory:rename");
    renameConversation(parsed.id, parsed.title);
  })
);
electron.ipcMain.handle(
  "chatHistory:pin",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatPinSchema, input, "chatHistory:pin");
    setConversationPinned(parsed.id, parsed.pinned);
  })
);
electron.ipcMain.handle(
  "chatHistory:delete",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatConversationIdSchema, input, "chatHistory:delete");
    deleteConversation(parsed.id);
  })
);
electron.ipcMain.handle(
  "chatHistory:appendMessage",
  async (event, input) => withTrustedSender(
    event,
    () => appendMessage(parseIpc(ChatAppendMessageSchema, input, "chatHistory:appendMessage"))
  )
);
electron.ipcMain.handle(
  "chatHistory:messages",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatGetMessagesSchema, input, "chatHistory:messages");
    return getMessages(parsed.conversationId, parsed.limit);
  })
);
electron.ipcMain.handle(
  "fs:getDataDir",
  async (event) => withTrustedSender(event, async () => {
    await ensureDataDir();
    return DATA_DIR;
  })
);
electron.ipcMain.handle(
  "fs:readFile",
  async (event, filePath) => withTrustedSender(event, async () => {
    const safePath = assertAllowedReadPath(filePath);
    const data = await fs__default.default.readFile(safePath);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  })
);
electron.ipcMain.handle(
  "fs:writeFile",
  async (event, filePath, data) => withTrustedSender(event, async () => {
    const safePath = assertAllowedWritePath(filePath);
    await ensureParentDirectory2(safePath);
    await fs__default.default.writeFile(safePath, Buffer.from(data));
  })
);
electron.ipcMain.handle(
  "fs:deleteFile",
  async (event, filePath) => withTrustedSender(event, async () => {
    const safePath = assertAllowedDeletePath(filePath);
    try {
      await fs__default.default.unlink(safePath);
      return true;
    } catch {
      return false;
    }
  })
);
electron.ipcMain.handle(
  "fs:listFiles",
  async (event, dir) => withTrustedSender(event, async () => {
    const target = dir ? assertAllowedDirectoryPath(dir) : DATA_DIR;
    try {
      return await fs__default.default.readdir(target);
    } catch {
      return [];
    }
  })
);
async function walkFilesRecursive(rootDir) {
  const out = [];
  const entries = await fs__default.default.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path__default.default.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkFilesRecursive(full));
      continue;
    }
    if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}
electron.ipcMain.handle(
  "fs:listFilesRecursive",
  async (event, dir) => withTrustedSender(event, async () => {
    try {
      const safeDir = assertAllowedDirectoryPath(dir);
      return await walkFilesRecursive(safeDir);
    } catch {
      return [];
    }
  })
);
electron.ipcMain.handle(
  "fs:fileExists",
  async (event, filePath) => withTrustedSender(event, async () => {
    try {
      const safePath = assertAllowedReadPath(filePath);
      return fs3.existsSync(safePath);
    } catch {
      return false;
    }
  })
);
electron.ipcMain.handle(
  "fs:openDialog",
  async (event, options) => withTrustedSender(event, async () => {
    const result = await electron.dialog.showOpenDialog(options);
    const opensDirectory = options.properties?.includes("openDirectory");
    for (const filePath of result.filePaths) {
      if (opensDirectory) {
        pathAccess.rememberDirectory(filePath);
      } else {
        pathAccess.rememberReadPath(filePath);
      }
    }
    return {
      canceled: result.canceled,
      filePaths: result.filePaths
    };
  })
);
electron.ipcMain.handle(
  "fs:saveDialog",
  async (event, options) => withTrustedSender(event, async () => {
    const result = await electron.dialog.showSaveDialog(options);
    if (result.filePath) {
      pathAccess.rememberSavePath(result.filePath);
    }
    return {
      canceled: result.canceled,
      filePath: result.filePath
    };
  })
);
electron.ipcMain.handle(
  "duckdb:init",
  async (event) => withTrustedSender(event, async () => {
    await init();
    return { success: true };
  })
);
electron.ipcMain.handle(
  "duckdb:registerCSVPathDataset",
  async (event, input) => withTrustedSender(event, async () => {
    const parsed = parseIpc(RegisterCsvSchema, input, "duckdb:registerCSVPathDataset");
    const safePath = assertAllowedReadPath(parsed.filePath);
    return registerCSVPathDataset({ ...parsed, filePath: safePath });
  })
);
electron.ipcMain.handle(
  "duckdb:registerParquetPathDataset",
  async (event, input) => withTrustedSender(event, async () => {
    const parsed = parseIpc(RegisterParquetSchema, input, "duckdb:registerParquetPathDataset");
    const safePath = assertAllowedReadPath(parsed.filePath);
    return registerParquetPathDataset({ ...parsed, filePath: safePath });
  })
);
electron.ipcMain.handle(
  "duckdb:listDatasets",
  async (event) => withTrustedSender(event, () => listDatasets())
);
electron.ipcMain.handle(
  "duckdb:previewDataset",
  async (event, input) => withTrustedSender(
    event,
    () => previewDataset(parseIpc(PreviewDatasetSchema2, input, "duckdb:previewDataset"))
  )
);
electron.ipcMain.handle(
  "duckdb:summarizeDataset",
  async (event, input) => withTrustedSender(
    event,
    () => summarizeDataset(parseIpc(DatasetOnlySchema2, input, "duckdb:summarizeDataset"))
  )
);
electron.ipcMain.handle(
  "duckdb:exportDataset",
  async (event, input) => withTrustedSender(event, async () => {
    const parsed = parseIpc(ExportDatasetSchema2, input, "duckdb:exportDataset");
    const safeTargetPath = assertAllowedWritePath(parsed.targetPath);
    return exportDataset({ ...parsed, targetPath: safeTargetPath });
  })
);
electron.ipcMain.handle(
  "duckdb:deleteDataset",
  async (event, input) => withTrustedSender(
    event,
    () => deleteDataset(parseIpc(DatasetOnlySchema2, input, "duckdb:deleteDataset"))
  )
);
electron.ipcMain.handle(
  "duckdb:getStatus",
  async (event) => withTrustedSender(event, () => getStatus())
);
electron.ipcMain.handle(
  "duckdb:getQueryMetrics",
  async (event) => withTrustedSender(event, () => getQueryMetrics())
);
electron.ipcMain.handle(
  "duckdb:clearQueryMetrics",
  async (event) => withTrustedSender(event, () => {
    clearQueryMetrics();
    return { success: true };
  })
);
function installMediaPermissionHandlers() {
  electron.session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) => {
      if (permission !== "media") return false;
      const mediaDetails = details;
      const origin = mediaDetails?.securityOrigin ?? requestingOrigin;
      return isAllowedAppOrigin(origin);
    }
  );
  electron.session.defaultSession.setPermissionRequestHandler(
    (webContents2, permission, callback, details) => {
      if (permission !== "media") {
        callback(false);
        return;
      }
      const mediaDetails = details;
      const pageUrl = mediaDetails?.requestingUrl ?? mediaDetails?.securityOrigin ?? webContents2.getURL();
      if (!isAllowedAppOrigin(pageUrl)) {
        callback(false);
        return;
      }
      const types = mediaDetails?.mediaTypes ?? [];
      const wantsVideo = types.includes("video");
      const wantsAudio = types.includes("audio") || wantsMicrophone(mediaDetails);
      const what = wantsVideo && wantsAudio ? "la cam\xE9ra et le microphone" : wantsVideo ? "la cam\xE9ra" : "le microphone";
      console.log("[electron] media permission request \u2192 prompting", { pageUrl, types });
      const parent = electron.BrowserWindow.fromWebContents(webContents2) ?? void 0;
      const opts = {
        type: "question",
        buttons: ["Autoriser", "Refuser"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: "Autorisation requise",
        message: `Data Navigator souhaite acc\xE9der \xE0 ${what}.`,
        detail: "Le traitement est 100 % local et hors ligne \u2014 aucune image ni aucun son ne quitte votre appareil. Vous pouvez r\xE9autoriser \xE0 tout moment."
      };
      const prompt = parent ? electron.dialog.showMessageBox(parent, opts) : electron.dialog.showMessageBox(opts);
      prompt.then((r) => callback(r.response === 0)).catch(() => callback(false));
    }
  );
}
electron.ipcMain.handle(
  "duckdb:runReadOnlyQuery",
  async (event, sql3) => withBoundedHeavyQuery(event, "duckdb:runReadOnlyQuery", async () => {
    const safeSql = parseIpc(SqlSchema, sql3, "duckdb:runReadOnlyQuery");
    if (isEnabled()) {
      try {
        return await runReadOnlyQuery2(safeSql);
      } catch (error) {
        console.warn(
          "[electron] duckdb utility read failed; falling back to in-main path:",
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    return runReadOnlyQuery(safeSql);
  })
);
electron.ipcMain.handle(
  "duckdb:runReadOnlyQueryArrow",
  async (event, sql3, cancelToken2) => withBoundedHeavyQuery(
    event,
    "duckdb:runReadOnlyQueryArrow",
    () => runReadOnlyQueryArrow(
      parseIpc(SqlSchema, sql3, "duckdb:runReadOnlyQueryArrow"),
      cancelToken2
    )
  )
);
electron.ipcMain.handle(
  "duckdb:profileDataset",
  async (event, input) => withBoundedHeavyQuery(
    event,
    "duckdb:profileDataset",
    () => profileDataset(parseIpc(ProfileDatasetSchema2, input, "duckdb:profileDataset"))
  )
);
electron.ipcMain.handle(
  "duckdb:profileColumnDetail",
  async (event, input) => withTrustedSender(
    event,
    () => profileColumnDetail(
      parseIpc(ProfileColumnDetailSchema2, input, "duckdb:profileColumnDetail")
    )
  )
);
electron.ipcMain.handle(
  "duckdb:countRows",
  async (event, input) => withTrustedSender(
    event,
    () => countRows(parseIpc(CountRowsSchema2, input, "duckdb:countRows"))
  )
);
electron.ipcMain.handle(
  "duckdb:fetchKeysetPage",
  async (event, input) => withBoundedHeavyQuery(
    event,
    "duckdb:fetchKeysetPage",
    () => fetchKeysetPage(parseIpc(KeysetPageSchema2, input, "duckdb:fetchKeysetPage"))
  )
);
electron.ipcMain.handle(
  "duckdb:cancelQueries",
  async (event, token) => withTrustedSender(event, () => {
    cancelQueries(token);
    return { success: true };
  })
);
electron.ipcMain.handle(
  "duckdb:resetCancelToken",
  async (event, token) => withTrustedSender(event, () => {
    resetCancelToken(token);
    return { success: true };
  })
);
var llamaAbortControllers = /* @__PURE__ */ new Map();
electron.ipcMain.handle(
  "llama:ensureModel",
  async (event, input) => withTrustedSender(
    event,
    () => ensureModel(parseIpc(LlamaEnsureModelSchema, input, "llama:ensureModel")?.file)
  )
);
electron.ipcMain.handle(
  "llama:generate",
  async (event, input) => withTrustedSender(event, () => {
    parseIpc(LlamaGenerateSchema, input, "llama:generate");
    const requestId2 = input?.requestId;
    const controller = new AbortController();
    if (requestId2) llamaAbortControllers.set(requestId2, controller);
    return generate({
      system: input?.system,
      prompt: input?.prompt,
      systemPrefix: input?.systemPrefix,
      maxTokens: input?.maxTokens,
      temperature: input?.temperature,
      topP: input?.topP,
      signal: controller.signal,
      onToken: requestId2 ? (chunk) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("llama:token", { id: requestId2, chunk });
        }
      } : void 0
    }).finally(() => {
      if (requestId2) llamaAbortControllers.delete(requestId2);
    });
  })
);
electron.ipcMain.handle(
  "llama:generateStructured",
  async (event, input) => withTrustedSender(event, () => {
    parseIpc(LlamaGenerateStructuredSchema, input, "llama:generateStructured");
    const requestId2 = input?.requestId;
    const controller = new AbortController();
    if (requestId2) llamaAbortControllers.set(requestId2, controller);
    return generateStructured({
      system: input?.system,
      prompt: input?.prompt,
      systemPrefix: input?.systemPrefix,
      jsonSchema: input?.jsonSchema,
      maxTokens: input?.maxTokens,
      temperature: input?.temperature,
      signal: controller.signal
    }).finally(() => {
      if (requestId2) llamaAbortControllers.delete(requestId2);
    });
  })
);
electron.ipcMain.handle(
  "llama:abort",
  async (event, requestId2) => withTrustedSender(event, () => {
    parseIpc(RequestIdSchema, requestId2, "llama:abort");
    const controller = llamaAbortControllers.get(requestId2);
    if (controller) {
      controller.abort();
      llamaAbortControllers.delete(requestId2);
      return true;
    }
    return false;
  })
);
electron.ipcMain.handle(
  "llama:listModels",
  async (event) => withTrustedSender(event, () => listModels())
);
electron.ipcMain.handle(
  "llama:isAvailable",
  async (event, input) => withTrustedSender(
    event,
    () => isAvailable(parseIpc(LlamaEnsureModelSchema, input, "llama:isAvailable")?.file)
  )
);
electron.ipcMain.handle(
  "llama:embed",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(LlamaEmbedSchema, input, "llama:embed");
    return embedBatch(parsed.texts);
  })
);
electron.ipcMain.handle(
  "llama:ensureEmbedModel",
  async (event, input) => withTrustedSender(
    event,
    () => ensureEmbedModel(
      parseIpc(LlamaEnsureModelSchema, input, "llama:ensureEmbedModel")?.file
    )
  )
);
electron.ipcMain.handle(
  "llama:isEmbedAvailable",
  async (event) => withTrustedSender(event, () => isEmbedAvailable())
);
var chatAbortControllers = /* @__PURE__ */ new Map();
electron.ipcMain.handle(
  "chat:open",
  async (event, input) => withTrustedSender(
    event,
    () => openSession(parseIpc(ChatOpenSchema, input, "chat:open"))
  )
);
electron.ipcMain.handle(
  "chat:prompt",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatPromptSchema, input, "chat:prompt");
    const requestId2 = parsed.requestId;
    const controller = new AbortController();
    if (requestId2) chatAbortControllers.set(requestId2, controller);
    return promptSession({
      conversationId: parsed.conversationId,
      text: parsed.text,
      requestId: requestId2,
      signal: controller.signal,
      onToken: requestId2 ? (chunk) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("chat:token", { requestId: requestId2, chunk });
        }
      } : void 0,
      onTool: requestId2 ? (toolEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("chat:tool", { requestId: requestId2, event: toolEvent });
        }
      } : void 0
    }).finally(() => {
      if (requestId2) chatAbortControllers.delete(requestId2);
    });
  })
);
electron.ipcMain.handle(
  "chat:abort",
  async (event, requestId2) => withTrustedSender(event, () => {
    parseIpc(RequestIdSchema, requestId2, "chat:abort");
    const controller = chatAbortControllers.get(requestId2);
    if (controller) {
      controller.abort();
      chatAbortControllers.delete(requestId2);
      return true;
    }
    return false;
  })
);
electron.ipcMain.handle(
  "chat:preload",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatPreloadSchema, input, "chat:preload");
    return preloadSessionPrompt(parsed.conversationId, parsed.text);
  })
);
electron.ipcMain.handle(
  "chat:history",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatSessionIdSchema, input, "chat:history");
    return getSessionHistory(parsed.conversationId);
  })
);
electron.ipcMain.handle(
  "chat:title",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatSessionIdSchema, input, "chat:title");
    return generateTitle(parsed.conversationId);
  })
);
electron.ipcMain.handle(
  "chat:followups",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatSessionIdSchema, input, "chat:followups");
    return suggestFollowUps(parsed.conversationId);
  })
);
electron.ipcMain.handle(
  "chat:dispose",
  async (event, input) => withTrustedSender(event, () => {
    const parsed = parseIpc(ChatSessionIdSchema, input, "chat:dispose");
    return disposeSession(parsed.conversationId);
  })
);
var modelDownloadAbortControllers = /* @__PURE__ */ new Map();
electron.ipcMain.handle(
  "models:listPresence",
  async (event) => withTrustedSender(event, () => listModelPresence())
);
electron.ipcMain.handle(
  "models:isPresent",
  async (event, key) => withTrustedSender(
    event,
    () => isModelPresent(parseIpc(ModelKeySchema, key, "models:isPresent"))
  )
);
electron.ipcMain.handle(
  "models:download",
  async (event, input) => withTrustedSender(event, () => {
    parseIpc(ModelDownloadSchema, input, "models:download");
    const requestId2 = input?.requestId;
    const controller = new AbortController();
    if (requestId2) modelDownloadAbortControllers.set(requestId2, controller);
    return downloadModel({
      key: input?.key,
      requestId: requestId2,
      signal: controller.signal,
      onProgress: requestId2 ? (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("models:progress", { id: requestId2, progress });
        }
      } : void 0
    }).finally(() => {
      if (requestId2) modelDownloadAbortControllers.delete(requestId2);
    });
  })
);
electron.ipcMain.handle(
  "models:abort",
  async (event, requestId2) => withTrustedSender(event, () => {
    const controller = modelDownloadAbortControllers.get(requestId2);
    if (controller) {
      controller.abort();
      modelDownloadAbortControllers.delete(requestId2);
      return true;
    }
    return false;
  })
);
electron.ipcMain.handle(
  "models:delete",
  async (event, key) => withTrustedSender(
    event,
    () => deleteModel(parseIpc(ModelKeySchema, key, "models:delete"))
  )
);
async function createWindow() {
  await ensureDataDir();
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    // Responsive floor: below this the sidebar/topbar have no fallback. Matches
    // the redesign's design floor (blueprint §2). Hide the stock English menu
    // (it also exposed DevTools/zoom). backgroundColor avoids a white flash
    // before the dark dashboard paints (--surface-0).
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: "#0b0e15",
    show: false,
    webPreferences: {
      preload: path__default.default.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Renderer sandbox ON (Chromium OS-level sandbox). The preload uses only
      // contextBridge/ipcRenderer/webUtils, which remain available to sandboxed
      // preloads. If auth/IPC ever regresses, reverting this line is step one.
      sandbox: true,
      // Explicit secure defaults (defense-in-depth — don't rely on version defaults).
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      nodeIntegrationInSubFrames: false,
      experimentalFeatures: false,
      // Middle-click auxclick can open links in a new window and subvert the
      // navigation guards below — disable it.
      disableBlinkFeatures: "Auxclick",
      // No spellcheck: its dictionary fetch is silent network egress, which
      // breaks the offline/no-runtime-network guarantee.
      spellcheck: false
    }
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  const isAllowedNavigation = (target) => {
    if (isAllowedAppOrigin(target)) return true;
    try {
      return new URL(target).protocol === `${ELECTRON_AUTH_PROTOCOL}:`;
    } catch {
      return false;
    }
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void electron.shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      console.warn("[electron] blocked navigation to:", url);
    }
  });
  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      console.warn("[electron] blocked redirect to:", url);
    }
  });
  mainWindow.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  if (isDev) {
    await installReactDevTools();
    await mainWindow.loadURL("http://localhost:3000/dashboard");
    mainWindow.webContents.openDevTools();
  } else {
    try {
      const serverUrl = await startNextJSServer();
      console.log("[electron] Next.js server started at:", serverUrl);
      const dashboardUrl = new URL("/dashboard", serverUrl).toString();
      await mainWindow.loadURL(dashboardUrl);
    } catch (error) {
      console.error("[electron] Error starting Next.js server:", error);
      electron.dialog.showErrorBox(
        "Data Navigator failed to start",
        `The local application server could not start, so the app cannot open.

${error instanceof Error ? error.message : String(error)}

See boot.log in the app data folder for details.`
      );
      electron.app.quit();
    }
  }
  let loadRetries = 0;
  const MAX_LOAD_RETRIES = 5;
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      if (loadRetries >= MAX_LOAD_RETRIES) {
        console.error(
          `[electron] Failed to load ${validatedURL} after ${MAX_LOAD_RETRIES} retries: ${errorDescription} (code ${errorCode})`
        );
        return;
      }
      loadRetries += 1;
      const delay = Math.min(1e3 * loadRetries, 5e3);
      console.warn(
        `[electron] Load failed (${errorDescription}), retrying in ${delay}ms (attempt ${loadRetries}/${MAX_LOAD_RETRIES})...`
      );
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          void mainWindow.loadURL(validatedURL);
        }
      }, delay);
    }
  );
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
async function startNextJSServer() {
  try {
    bootLog("startNextJSServer: begin");
    const authUrl = new URL(BETTER_AUTH_BASE_URL);
    const hostname = assertLoopbackHostname(authUrl.hostname);
    const nextJSPort = authUrl.port ? Number(authUrl.port) : 3e3;
    const webDir = path__default.default.join(electron.app.getAppPath(), "app");
    process.env.BETTER_AUTH_URL = BETTER_AUTH_BASE_URL;
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = BETTER_AUTH_BASE_URL;
    process.env.APP_USER_DATA = electron.app.getPath("userData");
    process.env.PORT = nextJSPort.toString();
    ensureAuthSecretEnv(electron.app.getPath("userData"));
    if (isAuthDbEncryptionRequested()) {
      const { safeStorage: safeStorage2 } = __require("electron");
      ensureAuthDbKeyEnv(electron.app.getPath("userData"), safeStorage2);
    }
    const trustedOrigins = [
      BETTER_AUTH_BASE_URL,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      // Exact custom-protocol origin only — the `://*` wildcard widened trusted
      // redirect targets (open-redirect sink for the OAuth callback).
      `${ELECTRON_AUTH_PROTOCOL}://`
    ];
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = Array.from(new Set(trustedOrigins)).join(",");
    const standaloneStartServer = path__default.default.join(
      webDir,
      "node_modules",
      "next",
      "dist",
      "server",
      "lib",
      "start-server.js"
    );
    const startServerEntry = fs3.existsSync(standaloneStartServer) ? standaloneStartServer : "next/dist/server/lib/start-server";
    bootLog(`webDir=${webDir}`);
    bootLog(`appPath=${electron.app.getAppPath()}`);
    bootLog(
      `standaloneStartServer=${standaloneStartServer} exists=${fs3.existsSync(standaloneStartServer)}`
    );
    bootLog(`startServerEntry=${startServerEntry}`);
    const { startServer } = __require(startServerEntry);
    bootLog("required startServer OK");
    await startServer({
      dir: webDir,
      isDev: false,
      hostname,
      port: nextJSPort,
      customServer: true,
      allowRetry: false,
      keepAliveTimeout: 5e3,
      minimalMode: true
    });
    bootLog(`startServer resolved; listening at ${BETTER_AUTH_BASE_URL}`);
    return BETTER_AUTH_BASE_URL;
  } catch (error) {
    bootLog(
      `ERROR: ${error instanceof Error ? `${error.message}
${error.stack}` : String(error)}`
    );
    console.error("[electron] Error starting Next.js server:", error);
    throw error;
  }
}
electron.app.whenReady().then(async () => {
  if (electron.app.isPackaged && PRODUCTION_FUSE_CONFIG.RunAsNode === false && process.env.ELECTRON_RUN_AS_NODE) {
    console.warn(
      "[electron] ELECTRON_RUN_AS_NODE is set in a packaged build \u2014 fuses may not be enforced."
    );
  }
  configureSettingsStore(DATABASES_DIR);
  configureChatStore(DATABASES_DIR);
  try {
    const authDbPath = path__default.default.join(electron.app.getPath("userData"), "data", AUTH_DB_FILENAME);
    const { migrated } = migrateLegacyAppSettings(authDbPath);
    bootLog(`settings-store: ready at ${DATABASES_DIR}; legacy lift migrated ${migrated} rows`);
  } catch (error) {
    bootLog(
      `settings-store: init/migration error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  try {
    const { migrated } = migrateLegacyAnalyticsSnapshotKV();
    bootLog(`settings-store: analytics snapshot history lift migrated ${migrated} rows`);
  } catch (error) {
    bootLog(
      `settings-store: analytics snapshot history lift error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  installMediaPermissionHandlers();
  electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: withRendererSecurityHeaders(details.responseHeaders, {
        dev: isDev})
    });
  });
  console.log(
    "[electron] microphone access status:",
    process.platform === "darwin" || process.platform === "win32" ? electron.systemPreferences.getMediaAccessStatus("microphone") : "unknown"
  );
  bootLog("whenReady: before duckdbService.init()");
  try {
    await init();
    bootLog("whenReady: duckdbService.init() OK");
  } catch (error) {
    bootLog(
      `whenReady: duckdbService.init() FAILED: ${error instanceof Error ? `${error.message}
${error.stack}` : String(error)}`
    );
  }
  await createWindow();
  bootLog("whenReady: createWindow() returned");
  electron.app.on("activate", async () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
}).catch((error) => {
  bootLog(
    `whenReady: TOP-LEVEL REJECTION: ${error instanceof Error ? `${error.message}
${error.stack}` : String(error)}`
  );
});
electron.app.on("before-quit", () => {
  dispose2();
  close().catch((error) => {
    console.error("[electron] DuckDB cleanup error:", error);
  });
  disposeAll().catch((error) => {
    console.error("[electron] chat-session cleanup error:", error);
  });
  dispose().catch((error) => {
    console.error("[electron] llama cleanup error:", error);
  });
  disposeEmbed().catch((error) => {
    console.error("[electron] embed cleanup error:", error);
  });
  closeSettingsStore();
  closeChatStore();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
