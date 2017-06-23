var should = require("should");
var Network = require("../src/Network");
var Layer = require("../src/Layer");
var Sequential = require("../src/Sequential");

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Sequential", function() {
    it("Sequential(nIn, layers) creates a network aggregated as a sequence of layers", function() {
        var network = new Sequential(2, [
            new Layer(2, {
                activation: Layer.ACT_LOGISTIC
            }),
            new Layer(2, {
                activation: Layer.ACT_IDENTITY,
                id: 1
            }),
        ]);

        // expressions are aggregated
        var exprs = network.expressions();
        should.deepEqual(exprs, [
            "w1b0+w1r0c0/(1+exp(-(w0b0+w0r0c0*x0+w0r0c1*x1)))+w1r0c1/(1+exp(-(w0b1+w0r1c0*x0+w0r1c1*x1)))",
            "w1b1+w1r1c0/(1+exp(-(w0b0+w0r0c0*x0+w0r0c1*x1)))+w1r1c1/(1+exp(-(w0b1+w0r1c0*x0+w0r1c1*x1)))",
        ]);
    })
})