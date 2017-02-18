var should = require("should");
var Network = require("./Network");
var Layer = require("./Layer");

(function(exports) {
    ////////////////// constructor
    function Sequential(nIn, layers = [], options = {}) {
        var that = this;
        that.type = "Sequential";
        that.super = Object.getPrototypeOf(Object.getPrototypeOf(that)); // TODO: use ECMAScript 2015 super 
        that.super.constructor.call(that, nIn, options);
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

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Sequential", function() {
    var Sequential = exports.Sequential; // require("./Sequential");
    var logistic_opts = {
        activation: "logistic"
    };
    var identity_opts = {
        activation: "identity",
        id: 1,
    };

    it("Sequential(nIn, layers) creates a network aggregated as a sequence of layers", function() {
        var network = new Sequential(2, [
            new Layer(2, logistic_opts),
            new Layer(2, identity_opts),
        ]);

        // expressions are aggregated
        var exprs = network.expressions();
        should.deepEqual(exprs, [
            "w1b0+w1r0c0/(1+exp(-(w0b0+w0r0c0*x0+w0r0c1*x1)))+w1r0c1/(1+exp(-(w0b1+w0r1c0*x0+w0r1c1*x1)))",
            "w1b1+w1r1c0/(1+exp(-(w0b0+w0r0c0*x0+w0r0c1*x1)))+w1r1c1/(1+exp(-(w0b1+w0r1c0*x0+w0r1c1*x1)))",
        ]);
    })
})
