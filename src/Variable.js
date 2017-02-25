var mathjs = require("mathjs");

(function(exports) {

    // CLASS
    function Variable(values, distribution=Variable.UNIFORM) {
        var that = this;
        that.max = mathjs.max(values);
        that.min = mathjs.min(values);
        that.values = Object.assign([], values);
        that.distribution = distribution;
        if (distribution === Variable.UNIFORM) {
            Variable.prototype.sample = () => mathjs.random(that.min, that.max);
            that.median = (that.min+that.max)/2;
        } else if (distribution === Variable.DISCRETE) {
            Variable.prototype.sample = () => mathjs.pickRandom(that.values);
            that.median = that.values.sort()[mathjs.round((values.length-1)/2)];
        } else {
            throw new Error("Variable has unknown distribution:"+distribution);
        }
        return that;
    }
    Variable.UNIFORM = "uniform";
    Variable.DISCRETE = "discrete";
    
    module.exports = exports.Variable = Variable;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Variable", function() {
    var should = require("should");
    var Variable = exports.Variable;

    it("Variable(values) defines a continuous variable", function() {
        new Variable([30,1]).should.properties({
            min: 1,
            max: 30,
        });
    })
    it("sample() returns a sample value", function() {
        var v = new Variable([30,1]);
        var sPrev = null;
        v.median.should.equal(31/2);
        for (var i=0; i<20; i++) {
            var s = v.sample();
            s.should.not.below(v.min);
            s.should.not.above(v.max);
            s.should.not.equal(sPrev);
            sPrev = s;
        }
        var vuniform = new Variable([30,1], Variable.UNIFORM);
        v.sample.toString().should.equal(vuniform.sample.toString());
        vuniform.median.should.equal(31/2);

        var vdiscrete = new Variable([10,20,30], Variable.DISCRETE);
        var s = Array(100).fill().map((v,i) => vdiscrete.sample()).sort();
        s[0].should.equal(10);
        s[mathjs.round(s.length/2)].should.equal(20);
        vdiscrete.median.should.equal(20);
        s[s.length-1].should.equal(30);
    });
})
