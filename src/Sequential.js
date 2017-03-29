var Network = require("./Network");
var Layer = require("./Layer");

(function(exports) { class Sequential extends Network {
    constructor(nIn, layers = [], options = {}) {
        super(nIn, options);
        this.type = "Sequential";
        layers.map((layer) => this.add(layer));
    }

    expressions(exprIn) {
        var layers = this.layers;
        var inOut = exprIn || this.exprIn;
        for (var iLayer = 0; iLayer < layers.length; iLayer++) {
            inOut = layers[iLayer].expressions(inOut);
        }
        return inOut;
    }
} //// CLASS

    module.exports = exports.Sequential = Sequential;
})(typeof exports === "object" ? exports : (exports = {}));
