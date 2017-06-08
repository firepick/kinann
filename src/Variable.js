var mathjs = require("mathjs");

(function(exports) {

    // CLASS
    function Variable(values, distribution = Variable.UNIFORM) {
        var that = this;
        that.max = mathjs.max(values);
        that.min = mathjs.min(values);
        that.values = Object.assign([], values);
        that.distribution = distribution;
        if (distribution === Variable.UNIFORM) {
            that.sample = Variable.prototype.sampleUniform;
            that.mean = that.median = (that.min + that.max) / 2;
        } else if (distribution === Variable.DISCRETE) {
            that.sample = Variable.prototype.sampleDiscrete;
            that.median = mathjs.median(that.values);
            that.mean = mathjs.mean(that.values);
        } else if (distribution === Variable.GAUSSIAN) {
            that.sample = Variable.prototype.sampleGaussian;
            that.median = (that.min + that.max) / 2;
            that.sigma = that.max - that.min;
            that.data = [];
        } else {
            throw new Error("Variable has unknown distribution:" + distribution);
        }
        return that;
    }
    Variable.prototype.sampleUniform = function() {
        var that = this;
        return mathjs.random(that.min, that.max);
    }
    Variable.prototype.sampleDiscrete = function() {
        var that = this;
        return mathjs.pickRandom(that.values);
    }
    Variable.prototype.sampleGaussian = function() {
        var that = this;
        if (that.data.length === 0) {
            var N = 25;
            for (var i = N; i-- > 0;) { // generate N*2 numbers
                do {
                    var x1 = 2.0 * mathjs.random() - 1.0;
                    var x2 = 2.0 * mathjs.random() - 1.0;
                    var w = x1 * x1 + x2 * x2;
                } while (w >= 1.0);
                w = mathjs.sqrt((-2.0 * mathjs.log(w)) / w);
                that.data.push(x1 * w * that.sigma + that.median);
                that.data.push(x2 * w * that.sigma + that.median);
            }
        }
        return that.data.pop();
    }

    ///// CLASS
    Variable.createGaussian = function(stdDev = 1, mean = 0) {
        var sd2 = stdDev / 2;
        return new Variable([mean - sd2, mean + sd2], Variable.GAUSSIAN);
    }
    Variable.UNIFORM = "uniform";
    Variable.DISCRETE = "discrete";
    Variable.GAUSSIAN = "gaussian";

    module.exports = exports.Variable = Variable;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Variable", function() {
    var should = require("should");
    var Variable = exports.Variable;

    it("Variable(values) defines a continuous variable", function() {
        new Variable([30, 1]).should.properties({
            min: 1,
            max: 30,
        });
    })
    it("sample() returns a sample value", function() {
        var vdefault = new Variable([30, 1]);
        var vuniform = new Variable([30, 1], Variable.UNIFORM);
        var vdiscrete = new Variable([10, 20, 30], Variable.DISCRETE);

        var sPrev = null;
        vdefault.median.should.equal(31 / 2);
        for (var i = 0; i < 20; i++) {
            var s = vdefault.sample();
            s.should.not.below(vdefault.min);
            s.should.not.above(vdefault.max);
            s.should.not.equal(sPrev);
            sPrev = s;
        }
        vdefault.sample.toString().should.equal(vuniform.sample.toString());
        vuniform.median.should.equal(31 / 2);

        var s = Array(100).fill().map((v, i) => vdiscrete.sample()).sort();
        s[0].should.equal(10);
        s[mathjs.round(s.length / 2)].should.equal(20);
        vdiscrete.median.should.equal(20);
        s[s.length - 1].should.equal(30);
    });
    it("Variable([A,B],Variable.UNIFORM) create uniform variable over interval [A,B)", function() {
        var distribution = new Variable([1, 10], Variable.UNIFORM);
        var data = Array(1000).fill().map(() => distribution.sample());
        distribution.mean.should.equal(5.5);
        distribution.median.should.equal(5.5);
        distribution.min.should.equal(1);
        distribution.max.should.equal(10);
        mathjs.median(data).should.approximately(5.5, 0.5);
        mathjs.mean(data).should.approximately(5.5, 0.5);
        mathjs.std(data).should.approximately(9 / mathjs.sqrt(12), 0.5);
    });
    it("Variable([A,B],Variable.DISCRETE) create discrete variable over given values", function() {
        var distribution = new Variable([1, 2, 3, 10], Variable.DISCRETE);
        var data = Array(1000).fill().map(() => distribution.sample());
        mathjs.median(data).should.approximately(2.5, 0.5);
        mathjs.mean(data).should.approximately(4, 0.5);
        mathjs.std(data).should.approximately(4, 0.8); // by definition 
    });
    it("Variable([A,B],Variable.GAUSSIAN) create Gaussian variable with mean (A+B)/2 and stadev |A-B|", function() {
        var distribution = new Variable([1, 10], Variable.GAUSSIAN);
        var data = Array(1000).fill().map(() => distribution.sample());
        mathjs.median(data).should.approximately(5.5, 1.2);
        mathjs.mean(data).should.approximately(5.5, 1.0);
        mathjs.std(data).should.approximately(9, 0.7);

        // createGaussian is an alternate constructor
        var gauss = Variable.createGaussian(9, 5.5);
        should.deepEqual(gauss, distribution);
    });
})