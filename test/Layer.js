var should = require("should");
var mathjs = require("mathjs");
var Layer = require("../src/Layer");
var MapLayer = require("../src/MapLayer");

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Layer", function() {
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

        var json = JSON.stringify(layer);
        var layer2 = Layer.fromJSON(json); // deserialize layer

        layer2.id.should.equal(5);
        var eIn = ["x0", "x1"];
        should.deepEqual(layer2.expressions(eIn), layer.expressions(eIn));
    })
})
