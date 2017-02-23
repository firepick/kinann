var Network = require("./Network");
var Layer = require("./Layer");

(function(exports) {
    ////////////////// constructor
    function Sequential(nIn, layers = [], options = {}) {
        var that = this;
        Object.defineProperty(that, "super", {
            value: Object.getPrototypeOf(Object.getPrototypeOf(that)), // TODO: use ECMAScript 2015 super 
        });
        that.super.constructor.call(that, nIn, options);
        that.type = "Sequential";
        layers.map((layer) => that.add(layer));

        return that;
    }
    Sequential.prototype = Object.create(Network.prototype);

    Sequential.prototype.expressions = function(exprIn) {
        var that = this;
        var layers = that.layers;
        var inOut = exprIn || that.exprIn;
        for (var iLayer = 0; iLayer < layers.length; iLayer++) {
            inOut = layers[iLayer].expressions(inOut);
        }
        return inOut;
    }

    module.exports = exports.Sequential = Sequential;
})(typeof exports === "object" ? exports : (exports = {}));
