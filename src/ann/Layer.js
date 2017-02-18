var should = require("should");
var mathjs = require("mathjs");
var MapLayer = require("./MapLayer");

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

    module.exports = exports.Layer = Layer;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Learn", function() {
    var Layer = exports.Layer; // require("./Layer");
    var logistic_opts = {
        activation: "logistic"
    };
    var identity_opts = {
        activation: "identity",
        id: 1,
    };

    function assertRandom(weights, variance) {
        var wkeys = Object.keys(weights);
        var w = [];
        for (var iw = 0; iw < wkeys.length; iw++) {
            w.push(weights[wkeys[iw]]);
        }
        w = w.sort();
        for (var iw = 0; iw < wkeys.length - 1; iw++) {
            w[iw].should.not.equal(w[iw + 1]);
            w[iw].should.not.equal(0);
            (typeof w[iw]).should.equal("number");
        }
        mathjs.var(w).should.below(variance);
        mathjs.var(w).should.above(0);
    }
    it("randomGaussian(n, sigma, mu) returns n random numbers with Gaussian distribution", function() {
        var list = Layer.randomGaussian(1000);
        mathjs.mean(list).should.approximately(0, 0.10);
        mathjs.std(list).should.approximately(1, 0.1);
        var list = Layer.randomGaussian(1000, 2, 3);
        mathjs.mean(list).should.approximately(3, 0.21);
        mathjs.std(list).should.approximately(2, 0.15);
    })
    it("Layer(nOut, id, options) creates neural network layer", function() {
        var nOut = 2;
        // create layer with default identity activation typically used for regression output
        var defaultActivation = new Layer(nOut);
        var vsOut = defaultActivation.expressions(["x0", "x1", "x2"]);
        should.deepEqual(vsOut, [
            "w0b0+w0r0c0*x0+w0r0c1*x1+w0r0c2*x2",
            "w0b1+w0r1c0*x0+w0r1c1*x1+w0r1c2*x2",
        ]);

        // create layer with logistic sigmoid activation typically used for hidden layer(s)
        var nOut = 3;
        var hidden = new Layer(nOut, logistic_opts);
        var vsHidden = hidden.expressions(["x0", "x1"]);
        should.deepEqual(vsHidden, [
            "1/(1+exp(-(w0b0+w0r0c0*x0+w0r0c1*x1)))",
            "1/(1+exp(-(w0b1+w0r1c0*x0+w0r1c1*x1)))",
            "1/(1+exp(-(w0b2+w0r2c0*x0+w0r2c1*x1)))",
        ]);

        // create layer with softmax activation typically used for categorization output
        var nOut = 2;
        var softmax = new Layer(nOut, {
            activation: "softmax",
            id: 1,
        });
        var vsSoftmax = softmax.expressions(["x0", "x1"]); // functional input resolution
        should.deepEqual(vsSoftmax, [
            "exp(w1b0+w1r0c0*x0+w1r0c1*x1)/(exp(w1b0+w1r0c0*x0+w1r0c1*x1)+exp(w1b1+w1r1c0*x0+w1r1c1*x1))",
            "exp(w1b1+w1r1c0*x0+w1r1c1*x1)/(exp(w1b0+w1r0c0*x0+w1r0c1*x1)+exp(w1b1+w1r1c0*x0+w1r1c1*x1))",
        ]);

        // layer output expressions can be chained
        var identity = new Layer(2, identity_opts);
        var vsOut = identity.expressions(vsHidden);
        should.deepEqual(vsOut, [
            "w1b0+w1r0c0/(1+exp(-(w0b0+w0r0c0*x0+w0r0c1*x1)))+w1r0c1/(1+exp(-(w0b1+w0r1c0*x0+w0r1c1*x1)))+w1r0c2/(1+exp(-(w0b2+w0r2c0*x0+w0r2c1*x1)))",
            "w1b1+w1r1c0/(1+exp(-(w0b0+w0r0c0*x0+w0r0c1*x1)))+w1r1c1/(1+exp(-(w0b1+w0r1c0*x0+w0r1c1*x1)))+w1r1c2/(1+exp(-(w0b2+w0r2c0*x0+w0r2c1*x1)))",
        ]);
    })
    it("Layer.initialize(nIn, weights, options) initializes layer weights", function() {
        // create layer with logistic sigmoid activation typically used for hidden layer(s)
        var nIn = 2;
        var nOut = 3;
        var hidden = new Layer(nOut, logistic_opts);

        // default initialization is with random gaussian distribution 
        // having xavier variance and 0 mean
        var weightsIn = {};
        var weights = hidden.initialize(nIn, {});
        var wkeys = Object.keys(weights).sort();
        should.deepEqual(wkeys, [
            "w0b0",
            "w0b1",
            "w0b2",
            "w0r0c0",
            "w0r0c1",
            "w0r1c0",
            "w0r1c1",
            "w0r2c0",
            "w0r2c1",
        ]);
        assertRandom(weights, 1.5);

        // weights can be copied
        var hidden2 = new Layer(nOut, logistic_opts);
        var weights2 = hidden2.initialize(nIn, weights);
        should.deepEqual(hidden2, hidden);
    })
    it("Layer can be serialized", function() {
        var layer = new Layer(3, {
            id: 5,
            activation: "logistic",
        });

        var json = layer.toJSON(); // serialize layer
        var layer2 = Layer.fromJSON(json); // deserialize layer

        layer2.id.should.equal(5);
        var eIn = ["x0", "x1"];
        should.deepEqual(layer2.expressions(eIn), layer.expressions(eIn));
    })
})
