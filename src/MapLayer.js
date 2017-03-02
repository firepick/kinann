var mathjs = require("mathjs");

(function(exports) {
    ////////////////// constructor
    function MapLayer(fmap, options = {}) {
        var that = this;
        that.type = "MapLayer";
        that.id = options.id || 0;
        that.nOut = fmap.length;
        that.weights = options.weights || {};
        that.fmap = fmap;
        return that;
    }

    MapLayer.prototype.toJSON = function() {
        var that = this;
        return {
            type: "MapLayer",
            id: that.id,
            weights: that.weights,
            fmap: that.fmap.map((f) => f.toString()),
        };
    }

    MapLayer.fromJSON = function(json) {
        var json = typeof json === 'string' ? JSON.parse(json) : json;
        if (json.type !== "MapLayer") {
            return null;
        }
        var fmap = json.fmap.map((f) => (new Function("return " + f))());
        return new MapLayer(fmap, json);
    }

    MapLayer.prototype.initialize = function(nIn, weights = {}, options = {}) {
        var that = this;
        Object.keys(that.weights).forEach((key) => (
            weights[key] == null && (weights[key] = that.weights[key])));
        return weights;
    }

    MapLayer.prototype.expressions = function(exprIn) {
        var that = this;
        if (!exprIn instanceof Array) {
            throw new Error("Expected input expression vector");
        }
        return that.fmap.map((f, i) => f(exprIn,i));
    }

    MapLayer.validateStats = function(stats = {}) {
        var min = stats.min == null ? -1 : stats.min;
        var max = stats.max == null ? 1 : stats.max;
        return {
            min: min,
            max: max,
            mean: stats.mean == null ? ((min + max) / 2) : stats.mean,
            std: stats.std == null ? ((max - min) / mathjs.sqrt(12)) : stats.std,
        }
    }

    MapLayer.mapExpr = function(n, statsIn, statsOut, fun = "mapidentity") {
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

    MapLayer.mapFun = function(n, statsIn, statsOut, fun = "mapidentity") {
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

    MapLayer.MAPIDENTITY = function(si, so, x) {
        return x;
    }

    MapLayer.MAPSTD = function(si, so, x) {
        var scale = so.std / si.std;
        var body = si.mean ? "(" + x + " - " + si.mean + ")" : x;
        scale != 1 && (body += "*" + scale);
        so.mean && (body += "+" + so.mean);
        return body;
    }

    MapLayer.MAPMINMAX = function(si, so, x) {
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

    module.exports = exports.MapLayer = MapLayer;
})(typeof exports === "object" ? exports : (exports = {}));
