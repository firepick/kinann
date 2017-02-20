var mathjs = require("mathjs");

(function(exports) {
    ////////////////// constructor
    Layer = function(nOut = 2, options = {}) {
        var that = this;
        that.id = options.id || 0;
        that.nOut = nOut;
        that.activation = options.activation || "identity";
        return that;
    }
    Layer.prototype.toJSON = function() {
        var that = this;
        return JSON.stringify({
            type: "Layer",
            id: that.id,
            nOut: that.nOut,
            activation: that.activation,
        });
    }
    Layer.fromJSON = function(json) { // layer factory
        var obj = JSON.parse(json);
        if (obj.type === "Layer") {
            return new Layer(obj.nOut, obj);
        }
        if (obj.type === "MapLayer") {
            var MapLayer = require("./MapLayer");
            return MapLayer.fromJSON(json);
        }
        return null;
    }
    Layer.prototype.initialize = function(nIn, weights = {}, options = {}) {
        var that = this;
        var xavier = 2 / (nIn + that.nOut);
        var wInit = Layer.randomGaussian(nIn * that.nOut, xavier); // weight initializations
        var bInit = Layer.randomGaussian(that.nOut, 1); // offset initializations
        var iInit = 0;
        for (var r = 0; r < that.nOut; r++) {
            var bkey = Layer.weight(that.id, r);
            weights[bkey] == null && (weights[bkey] = bInit[r]);
            for (var c = 0; c < nIn; c++) {
                var wkey = Layer.weight(that.id, r, c);
                weights[wkey] == null && (weights[wkey] = wInit[iInit++]);
            }
        }

        return weights;
    };
    Layer.prototype.expressions = function(exprIn) {
        var that = this;
        var outputs = [];
        if (!exprIn instanceof Array) {
            throw new Error("Expected input expression vector");
        }
        var nIn = exprIn.length;
        for (var r = 0; r < that.nOut; r++) {
            var dot = Layer.weight(that.id, r);
            for (var c = 0; c < nIn; c++) {
                dot.length && (dot += "+");
                if (exprIn[c].indexOf("1/(1+exp(-(") === 0) { // logistic optimization
                    dot += Layer.weight(that.id, r, c) + exprIn[c].substring(1);
                } else {
                    dot += Layer.weight(that.id, r, c) + "*" + exprIn[c];
                }
            }
            outputs.push(dot);
        }
        if (that.activation === "logistic") {
            outputs = outputs.map((expr) => "1/(1+exp(-(" + expr + ")))");
        } else if (that.activation === "softmax") {
            outputs = outputs.map((expr) => "exp(" + expr + ")");
            var denominator = "(" + outputs.join("+") + ")";
            outputs = outputs.map((expr) => expr + "/" + denominator);
        } else if (that.activation === "identity") {
            // done
        } else {
            throw new Error("Unknown activation:" + that.activation);
        }
        return outputs; // output activation expressions
    }

    /////////////////// class
    Layer.randomGaussian = function(n = 1, sigma = 1, mu = 0) {
        var that = this;
        var list = [];
        while (list.length < n) {
            do {
                var x1 = 2.0 * mathjs.random() - 1.0;
                var x2 = 2.0 * mathjs.random() - 1.0;
                var w = x1 * x1 + x2 * x2;
            } while (w >= 1.0);
            w = mathjs.sqrt((-2.0 * mathjs.log(w)) / w);
            list.push(x1 * w * sigma + mu);
            list.length < n && list.push(x2 * w * sigma + mu);
        }
        return list;
    }
    Layer.weight = (layer, row, col) => {
        return col == null ?
            "w" + layer + "b" + row : // offset
            "w" + layer + "r" + row + "c" + col; // matrix weight
    }

    Layer.ACT_LOGISTIC = "logistic"; // activation function is logistic sigmoid
    Layer.ACT_IDENTITY = "identity"; // activation function is identity
    Layer.ACT_SOFTMAX = "softmax"; // activation function is soft maximum

    module.exports = exports.Layer = Layer;
})(typeof exports === "object" ? exports : (exports = {}));
