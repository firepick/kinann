var mathjs = require("mathjs");
var Layer = require("./Layer");

(function(exports) {
    class MapLayer extends Layer {
        constructor(fmap, options = {}) {
            super(fmap.length, options);
            this.type = "MapLayer";
            this.weights = options.weights || {};
            this.fmap = fmap;
        }

        toJSON() {
            var obj = {
                type: "MapLayer",
                id: this.id,
                weights: this.weights,
            };
            this.fmap && (obj.fmap = this.fmap.map((f) => f.toString()));
            return obj;
        }

        static fromJSON(json) {
            var json = typeof json === 'string' ? JSON.parse(json) : json;
            if (json.type !== "MapLayer") {
                return null;
            }
            var fmap = json.fmap.map((f) => (new Function("return " + f))());
            return new MapLayer(fmap, json);
        }

        initializeLayer(nIn, weights = {}, options = {}) {
            return Object.assign(weights, Object.assign({}, this.weights, weights));
        }

        expressions(exprIn) {
            if (!exprIn instanceof Array) {
                throw new Error("Expected input expression vector");
            }
            return this.fmap.map((f, i) => f(exprIn, i));
        }

        static validateStats(stats = {}) {
            var min = stats.min == null ? -1 : stats.min;
            var max = stats.max == null ? 1 : stats.max;
            return {
                min: min,
                max: max,
                mean: stats.mean == null ? ((min + max) / 2) : stats.mean,
                std: stats.std == null ? ((max - min) / mathjs.sqrt(12)) : stats.std,
            }
        }

        static mapExpr(n, statsIn, statsOut, fun = "mapidentity") {
            (statsIn instanceof Array) || (statsIn = Array(n).fill(statsIn || {}));
            (statsOut instanceof Array) || (statsOut = Array(n).fill(statsOut || {}));
            var si = statsIn.map((s) => MapLayer.validateStats(s));
            var so = statsOut.map((s) => MapLayer.validateStats(s));
            var mapFun = fun;
            if (typeof mapFun === "string") {
                mapFun = fun.indexOf("map") === 0 && MapLayer[fun.toUpperCase()];
                if (!mapFun) {
                    throw new Error("mapFun() unknown mapping function:" + fun);
                }
            }
            if (typeof mapFun !== "function") {
                throw new Error("mapFun(,,,?) expected mapping function");
            }
            return statsIn.map((f, i) => new Function("eIn", "return " + '"' + mapFun(si[i], so[i], '("+eIn[' + i + ']+")') + '"'));
        }

        static mapFun(n, statsIn, statsOut, fun = "mapidentity") {
            (statsIn instanceof Array) || (statsIn = Array(n).fill(statsIn || {}));
            (statsOut instanceof Array) || (statsOut = Array(n).fill(statsOut || {}));
            var si = statsIn.map((s) => MapLayer.validateStats(s));
            var so = statsOut.map((s) => MapLayer.validateStats(s));
            var mapFun = fun;
            if (typeof mapFun === "string") {
                mapFun = fun.indexOf("map") === 0 && MapLayer[fun.toUpperCase()];
                if (!mapFun) {
                    throw new Error("mapFun() unknown mapping function:" + fun);
                }
            }
            if (typeof mapFun !== "function") {
                throw new Error("mapFun(,,,?) expected mapping function");
            }
            return statsIn.map((f, i) => new Function("x", "return " + mapFun(si[i], so[i], "x")));
        }

        static MAPIDENTITY(si, so, x) {
            return x;
        }

        static MAPSTD(si, so, x) {
            var scale = so.std / si.std;
            var body = si.mean ? "(" + x + " - " + si.mean + ")" : x;
            scale != 1 && (body += "*" + scale);
            so.mean && (body += "+" + so.mean);
            return body;
        }

        static MAPMINMAX(si, so, x) {
            var dsi = si.max - si.min;
            var dso = so.max - so.min;
            var simean = (si.max + si.min) / 2;
            var somean = (so.max + so.min) / 2;
            var scale = dsi ? dso / dsi : 1;
            var body = simean ? "(" + x + " - " + simean + ")" : x;
            scale != 1 && (body += "*" + scale);
            somean && (body += "+" + somean);
            return body;
        }
    } //// CLASS

    module.exports = exports.MapLayer = MapLayer;
})(typeof exports === "object" ? exports : (exports = {}));