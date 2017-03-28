var should = require("should");
var mathjs = require("mathjs");
var Layer = require("../src/Layer");
var MapLayer = require("../src/MapLayer");
var Factory = require("../src/Factory");

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Learn", function() {
    var UNISTD = 0.5773502691896258; // standard deviation of [-1,1]
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
    it("MapLayer(fmap) creates an unweighted mapping layer", function() {
        var map = new MapLayer([
            (eIn) => eIn[0],
            (eIn) => eIn[1],
            (eIn) => "((" + eIn[0] + ")^2)",
            (eIn) => "((" + eIn[1] + ")^2)",
        ]);
        should.deepEqual(map.expressions(["x0", "x1", "x2"]), [
            "x0",
            "x1",
            "((x0)^2)",
            "((x1)^2)",
        ]);
        map.nOut.should.equal(4);
    });
    it("MapLayer(fmap,options) creates a weighted mapping layer", function() {
        var options = {
            weights: {
                gain1:1,
                gain2:2,
            }
        }
        var vars = [
            (eIn) => eIn[0],
            (eIn) => eIn[1],
            (eIn) => "(" + eIn[0] + "*gain1)",
            (eIn) => "(" + eIn[1] + "*gain2)",
        ];
        var map = new MapLayer(vars, options);
        should.deepEqual(map.expressions(["x0", "x1", "x2"]), [
            "x0",
            "x1",
            "(x0*gain1)",
            "(x1*gain2)",
        ]);
        map.nOut.should.equal(4);
        should.deepEqual(map.initializeLayer(4), {
            gain1: 1,
            gain2: 2,
        });
    });
    it("MapLayer can be serialized", function() {
        var options = {
            id: 3,
            weights: {
                gain1:1,
                gain2:2,
            },
        }
        var vars = [
            (eIn,i) => eIn[i] + "+" + i,
            (eIn,i) => eIn[i] + "+" + i,
            (eIn,i) => "(" + eIn[0] + "^2)",
        ];
        var layer = new MapLayer(vars, options);

        var json = JSON.stringify(layer); // serialize layer
        var layer2 = MapLayer.fromJSON(json); // deserialize layer

        layer2.id.should.equal(3);
        var eIn = ["x0", "x1"];
        var expr = layer.expressions(eIn);
        var expr2 = layer2.expressions(eIn);
        //console.log(expr2);
        should.deepEqual(expr2, expr);
        should.deepEqual(expr, [
            "x0+0",
            "x1+1",
            "(x0^2)",
        ]);
        should.deepEqual(expr2.weights, expr.weights);
    })
    it("MapLayer.validateStats(stats) applies statistic defaults", function() {
        var normStats = MapLayer.validateStats();
        should.deepEqual(normStats, {
            max: 1,
            min: -1,
            mean: 0,
            std: UNISTD,
        });
        should.deepEqual(normStats, MapLayer.validateStats(normStats));

        should.deepEqual(MapLayer.validateStats({
            min: 0,
            max: 4
        }), {
            max: 4,
            min: 0,
            mean: 2,
            std: 2 * UNISTD,
        });
    })
    it("MapLayer.mapFun(n,statsIn,statsOut,'mapStd') creates normalization function vector", function() {
        var stats = [{
            min: 0,
            max: 200,
            std: 10 * UNISTD, // narrow distribution
        }, {
            min: -10,
            max: -5,
            std: 5 * UNISTD, // wide distribution
        }];

        // CAUTION: mapStd is not recommended for kinematic normalization,
        // since it is difficult to match up input and output ranges.
        // Since kinematic motion is normally restricted to clearly defined ranges,
        // mapMinMax is preferred for normalization.
        var fun = MapLayer.mapFun(2, stats, null, 'mapStd');

        // narrow input distribution will overshoot uniform distribution min/max
        fun[0](0).should.equal(-10);
        fun[0](200).should.equal(10);

        // wide input distribution will undershoot uniform distribution min/max
        fun[1](-10).should.equal(-0.5);
        fun[1](-5).should.equal(0.5);
    })
    it("MapLayer.mapFun(n,statsIn,statsOut,'mapMinMax') creates normalization function vector", function() {
        var stats = [{
            min: 0,
            max: 200,
        }, {
            min: -10,
            max: -5,
        }];
        var fun = MapLayer.mapFun(2, stats, null, 'mapMinMax');
        fun[0](0).should.equal(-1);
        fun[0](200).should.equal(1);
        fun[1](-10).should.equal(-1);
        fun[1](-5).should.equal(1);

        var fun = MapLayer.mapFun(2, null, stats, 'mapMinMax');
        fun[0](-1).should.equal(0);
        fun[0](1).should.equal(200);
        fun[1](-1).should.equal(-10);
        fun[1](1).should.equal(-5);

        var fun = MapLayer.mapFun(2, null, null, 'mapMinMax');
        fun[0](0).should.equal(0);
        fun[0](200).should.equal(200);
        fun[1](-10).should.equal(-10);
        fun[1](-5).should.equal(-5);
    })
    it("MapLayer.mapExpr(n,statsIn,statsOut,'mapMinMax') creates normalization expression vector", function() {
        var stats = [{
            min: 0,
            max: 200,
        }, {
            min: -10,
            max: -5,
        }];
        var fun = MapLayer.mapExpr(2, stats, null, 'mapMinMax');
        var layer = new MapLayer(fun);
        var y = ["y0", "y1"];
        should.deepEqual(layer.expressions(y), [
            "((y0) - 100)*0.01",
            "((y1) - -7.5)*0.4",
        ]);
    })
})
