var mathjs = require("mathjs");
var Variable = require("../Variable");
var Example = require("../Example");
var Evolver = require("./Evolver");

(function(exports) { class Model {
    constructor (genes, options={}) {
        Object.defineProperty(this, "cost", {
            value: options.cost || this.driveCost,
            writable: true,
        });
        Object.defineProperty(this, "verbose", {
            value: options.verbose,
        });
        Object.defineProperty(this, "genes", {
            value: genes,
            writable: true,
        });
        Object.defineProperty(this, "$expressions", {
            value: this.worldExpressions,
            writable: true,
        });
        if (!(genes instanceof Array) || !genes.length) {
            throw new Error("Model constructuor expects Array of mutable key names");
        }
    }   

    toWorld(drive) {
        if (drive == null) {
            this.verbose && console.log("ERROR: toWorld(null)");
            return null;
        }
        return drive.map((v,i) => i === 2 ? -v : v);
    }

    toDrive(world) {
        if (world == null) {
            this.verbose && console.log("ERROR: toDrive(null)");
            return null;
        }
        return world.map((v,i) => i === 2 ? -v : v);
    };

    clone(genes) {
        return new this.constructor(Object.assign({}, this, genes));
    }

    initializeLayer(nIn, weights, options) {
        return this.genes.reduce((acc, gene) => Object.assign(acc, {[gene]:this[gene]}), weights);
    }

    expressions() {
        return this.$expressions();
        return this.$expressions().map((expr) => ((eIn) => expr));
    }

    worldExpression() {
        throw new Error("worldExpressions() not implemented");
    }

    driveCost(examples) {
        return examples.reduce((acc,ex) => {
            if (ex == null || ex.input == null || ex.target == null) {
                throw new Error("cannot compute driveCost() for invalid example:" + JSON.stringify(ex));
            }
            var drive = this.toDrive(ex.target);
            if (drive == null) {
                return Number.MAX_VALUE;
            }
            var diff = mathjs.subtract(drive,ex.input);
            var square = diff.map((v) => v*v);
            return mathjs.max(square.concat(acc));
        }, 0);
    }

    worldCost(examples) {
        return examples.reduce((acc,ex) => {
            if (ex == null || ex.input == null || ex.target == null) {
                throw new Error("cannot compute worldCost() for invalid example:" + JSON.stringify(ex));
            }
            var world = this.toWorld(ex.input);
            if (world == null) {
                return Number.MAX_VALUE;
            }
            var diff = mathjs.subtract(world,ex.target);
            var square = diff.map((v) => v*v);
            return mathjs.max(square.concat(acc));
        }, 0);
    }

    evolve(examples, options={}) {
        var evolver = new Evolver(this.genes, examples, options);
        return evolver.evolve(this);
    }
} // class

    ///////////// CLASS ////////////

    module.exports = exports.Model = Model;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("Model", function() {
    var should = require("should");
    Model = exports.Model;
    var Factory = require("../Factory");
    var Variable = require("../Variable");
    var Example = require("../Example");
    var rounder = (key,value) => typeof value == "number" ? mathjs.round(value,3) : value;
    class SubModel extends Model {
        constructor(options={}) {
            super(["a","b"], options);
            this.a = options.a || 10;
            this.b = options.b || 20;
        }
        worldExpressions() {
            return [ "abc", "def" ];
        }
        toWorld(drive) {
            return drive.map((v) => v+this.a);
        }
        toDrive(drive) {
            return drive.map((v) => v-this.a);
        }
    }

    it("SubModel() extends Model", function() {
        var sub = new SubModel({a:1,b:2});
        sub.b.should.equal(2);
        should.deepEqual(Object.keys(sub), ["a","b"]);
        should.deepEqual(sub.toWorld([1,2,3]), [2,3,4]);
    });
    it("toWorld(drive) transforms drive coordinates to world", function() {
        var rd = new SubModel();
        should.deepEqual(mathjs.round(rd.toWorld([0,0,0]), 13), [10,10,10]);
        should.deepEqual(mathjs.round(rd.toWorld([1,1,1]), 4), [11,11,11]);
        should.deepEqual(mathjs.round(rd.toWorld([10,20,30]), 4), [20,30,40]);
    });
    it("toDrive(world) transforms world to drive coordinates ", function() {
        var rd = new SubModel();
        should.deepEqual(mathjs.round(rd.toDrive([0,0,0]), 13), [-10,-10,-10]);
        should.deepEqual(mathjs.round(rd.toDrive([1,1,1]), 4), [-9,-9,-9]);
        should.deepEqual(mathjs.round(rd.toDrive([10,20,30]), 4), [0,10,20]);
    });
    it("worldCost(examples) returns toWorld() fitness comparison", function() {
        var mIdeal = new SubModel({a:1,b:2});
        var ma1 = new SubModel({
            a: mIdeal.a + 1,
        });
        var ma2 = new SubModel({
            a: mIdeal.a + 2,
        });
        should.deepEqual(mIdeal.toWorld([1,2,3]), [2,3,4]);
        should.deepEqual(ma1.toWorld([1,2,3]), [3,4,5]);
        should.deepEqual(ma2.toWorld([1,2,3]), [4,5,6]);
        var examples = [
            [1,2,3], 
            [3,1,2], 
            [2,1,3], 
        ].map((input) => new Example(input, mIdeal.toWorld(input)));
        mIdeal.worldCost(examples).should.equal(0);
        ma1.worldCost(examples).should.equal(1); // diff 1
        ma2.worldCost(examples).should.equal(4); // diff 2
    });
    it("driveCost(examples) returns toDrive() fitness comparison", function() {
        var mIdeal = new SubModel({a:1,b:2});
        var ma1 = new SubModel({
            a: mIdeal.a + 1,
        });
        var ma2 = new SubModel({
            a: mIdeal.a + 2,
        });
        should.deepEqual(mIdeal.toDrive([1,2,3]), [0,1,2]);
        should.deepEqual(ma1.toDrive([1,2,3]), [-1,0,1]);
        should.deepEqual(ma2.toDrive([1,2,3]), [-2,-1,0]);
        var examples = [
            [1,2,3], 
            [3,1,2], 
            [2,1,3], 
        ].map((input) => new Example(input, mIdeal.toWorld(input)));
        mIdeal.driveCost(examples).should.equal(0);
        ma1.driveCost(examples).should.equal(1); // diff 1
        ma2.driveCost(examples).should.equal(4); // diff 2
        ma2.cost(examples).should.equal(4); // diff 2
    });
    it("evolve(examples) returns a model evolved to fit the given examples", function() {
        this.timeout(60*1000);
        var verbose = false;

        var modelDesign = new SubModel({a:100, b:200});

        // simulate a measured model that differs from the design model
        var modelMeasured = new SubModel({a:102, b:202});
        var rnd = new Variable([-100, 100]);

        // collect examples that map drive position to measured world position
        var measurements = [];
        for (var iex = 0; iex < 10; iex++) {
            var drivePos = Array(3).fill().map(() => rnd.sample());
            measurements.push(new Example(drivePos, modelMeasured.toWorld(drivePos)));
        }
        verbose && console.log("modelMeasured", JSON.stringify(modelMeasured, rounder));

        // The cost() function reveals that the design model doesn't match measured data
        modelDesign.cost(measurements).should.approximately(4, .0000000000001);

        // set up evolution parameters
        var visitor = (resultEvolve) => verbose && (resultEvolve.epochs % 10 === 0) && 
                console.log("evolve...", JSON.stringify(resultEvolve, rounder));
        var evolveOptions = {
            onEpoch: visitor, // monitor training progress
        };
        
        // evolve the design model to fit the measurements
        var resultEvolve = modelDesign.evolve(measurements, evolveOptions);
        verbose && console.log("evolve resultEvolve", JSON.stringify(resultEvolve, rounder));

        // the evolved model will fit the measurements better than the design model
        var modelEvolved = resultEvolve.model;
        should.deepEqual(undefined, resultEvolve.error);
        modelEvolved.cost(measurements).should.below(0.01);
    });
    it("initializeLayer(nIn, weights) initializes layer", function() {
        var sub = new SubModel({a:3, b:4});
        var nIn = 123; // dummy value
        var weights = {};
        var w = sub.initializeLayer(nIn, weights);
        should.deepEqual(weights, {
            a: 3,
            b: 4,
        });
        weights.should.equal(w);
    });
    it("expressions() returns worldExpression functions", function() {
        var sub = new SubModel({a:3, b:4});
        var exprs = sub.expressions();
        exprs.forEach((expr) => should(typeof expr).equal("function"));
        should.deepEqual(exprs.map((expr) => expr(undefined)), ["abc", "def"]);
    });
});
