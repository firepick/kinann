var mathjs = require("mathjs");
var Variable = require("./Variable");

(function(exports) { class Layer {
    constructor(nOut = 2, options = {}) {
        var that = this;
        that.type = "Layer";
        that.id = options.id || 0;
        that.nOut = nOut;
        that.activation = options.activation || "identity";
        return that;
    }
    toJSON() {
        var that = this;
        return that;
    }
    static fromJSON(json) { // layer factory
        json = typeof json === 'string' ? JSON.parse(json) : json;
        if (json.type === "Layer") {
            return new Layer(json.nOut, json);
        }
        if (json.type === "MapLayer") {
            var MapLayer = require("./MapLayer");
            return MapLayer.fromJSON(json);
        }
        return null;
    }
    initializeLayer(nIn, weights = {}, options = {}) {
        var that = this;
        var xavier = 2 / (nIn + that.nOut);
        var gaussw = Variable.createGaussian(xavier);
        var gaussb = Variable.createGaussian(1);
        for (var r = 0; r < that.nOut; r++) {
            var bkey = Layer.weight(that.id, r);
            weights[bkey] == null && (weights[bkey] = gaussb.sample());
            for (var c = 0; c < nIn; c++) {
                var wkey = Layer.weight(that.id, r, c);
                weights[wkey] == null && (weights[wkey] = gaussw.sample());
            }
        }

        return weights;
    };
    expressions(exprIn) {
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
    static weight(layer, row, col) {
        return col == null ?
            "w" + layer + "b" + row : // offset
            "w" + layer + "r" + row + "c" + col; // matrix weight
    }

    static get ACT_LOGISTIC() { return "logistic"; } // activation function is logistic sigmoid
    static get ACT_IDENTITY() { return "identity"; } // activation function is identity
    static get ACT_SOFTMAX() { return "softmax"; } // activation function is soft maximum
} //// CLASS

    module.exports = exports.Layer = Layer;
})(typeof exports === "object" ? exports : (exports = {}));
