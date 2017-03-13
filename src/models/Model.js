var mathjs = require("mathjs");
var Variable = require("../Variable");

(function(exports) { class Model {
    constructor (options={}) {
        Object.defineProperty(this, "cost", {
            value: options.cost || this.driveCost,
            writable: true,
        });
        Object.defineProperty(this, "verbose", {
            value: options.verbose,
        });
        Object.defineProperty(this, "mutableKeys", {
            value: null,
            writable: true,
        });
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

    mutate(options={}) {
        var variable = options.variable || Variable.createGaussian();
        var mutationRate = options.mutationRate || 0.01;
        var mutateValue = function(v) {
            var dv = mutationRate * v;
            var vnew = v + variable.sample() * dv;
            return vnew;
        }
        var modelOpts = Object.assign({}, this);
        modelOpts.cost = this.cost;
        var mutableKeys = options.keys || this.mutableKeys || (this.mutableKeys = Object.keys(this));
        if (options.mutation === "all") {
            mutableKeys.forEach((key) => modelOpts[key] = mutateValue(this[key]));
            var result = new this.constructor(modelOpts);
        } else if (options.mutation === "keyPair") {
            var key = mathjs.pickRandom(mutableKeys);
            var oldValue = this[key];
            modelOpts[key] = mutateValue(this[key]); // +mutation
            var mutantA = new this.constructor(modelOpts);
            modelOpts[key] = 2*oldValue - modelOpts[key]; // -mutation
            var mutantB = new this.constructor(modelOpts);
            var result = [mutantA, mutantB];
        } else { // single mutation on one key
            var key = mathjs.pickRandom(mutableKeys);
            modelOpts[key] = mutateValue(this[key]);
            var result = new this.constructor(modelOpts);
        }
        return result;
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

    crossover(...parents) {
        var n = parents.length+1;
        var modelOpts = {};
        var mutableKeys = this.mutableKeys || (this.mutableKeys = Object.keys(this));
        mutableKeys.forEach((key) => {
            modelOpts[key] = parents.reduce((acc,model) => acc + model[key], this[key])/n;
        });
        return new this.constructor(modelOpts);
    }

    evolve(examples, options={}) {
        var that = this;
        var mutationRate = options.mutationRate || .01;
        var anneal = options.anneal || 1;
        var maxEpochs = options.maxEpochs || 1000;
        var models = [that, that];
        var dmutation = mutationRate / maxEpochs;
        var maxAge = options.maxAge || 20;
        var costMap = new WeakMap();
        var modelCost = (model) => {
            let cost = costMap.get(model);
            if (cost == null) {
                cost = model.cost(examples);
                costMap.set(model, cost);
            }
            return cost;
        }
        var result = {
            model: that,
            cost: modelCost(that),
            mutationRate: mutationRate,
        };
        if (result.cost === Number.MAX_VALUE) {
            throw new Error("cannot compute cost for evolving model:" + JSON.stringify(that));
        }

        var mutateModel = function(model, m=mutationRate) {
            let iterations = 0;
            if (modelCost(model) === Number.MAX_VALUE){
                throw new Error("cannot mutate invalid model" + JSON.stringify(model));
            }
            var mutant = null;
            do {
                if (++iterations > 100) {
                    throw new Error("cannot mutate:" + JSON.stringify(model));
                }
                var mutants = model.mutate({
                    examples: examples,
                    mutationRate:m,
                    mutation: "keyPair",
                });
                var costs = mutants.map((m) => modelCost(m));
                if (costs[0] < costs[1]) {
                    var cost = costs[0];
                    mutant = mutants[0];
                } else {
                    cost = costs[1];
                    var mutant = mutants[1];
                }
            } while (cost === Number.MAX_VALUE);
            return mutant;
        }

        result.age = 0;
        for (var iEpoch = 0; iEpoch < maxEpochs; iEpoch++) {
            mutationRate -= anneal * dmutation; 
            if (modelCost(models[0]) > modelCost(models[1])) {
                result.model = models[1];
                if (iEpoch %2) {
                    models[0] = mutateModel(result.model)
                } else {
                    models[0] = models[0].crossover(models[1]);
                }
                result.age = 0;
            } else {
                result.model = models[0];
                result.age++;
                models[1] = mutateModel(result.model);
            }
            result.epochs = iEpoch;
            result.cost = modelCost(result.model);
            result.mutationRate = mutationRate;
            options.onEpoch && options.onEpoch(result);
            if (result.age >= maxAge) {
                return result;
            }
        }

        result.error = new Error("evolve did not converge");
        return result;
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
            super(options);
            this.a = options.a || 10;
            this.b = options.b || 20;
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
        var rd = new Model();
        should.deepEqual(mathjs.round(rd.toDrive([0,0,0]), 13), [0,0,0]);
        should.deepEqual(mathjs.round(rd.toDrive([1,1,1]), 4), [1,1,-1]);
        should.deepEqual(mathjs.round(rd.toDrive([10,20,30]), 4), [10,20,-30]);
    });
    it("mutate(options) generates a slightly different model", function() {
        var sub = new SubModel({a:1,b:2});
        sub.should.properties({
            a: 1,
            b: 2,
        });
        var mutationRate = 0.01;
        var mutant = sub.mutate({
            mutationRate: 0.01, // default
            mutation: "all", // mutate all keys
        });
        var tolerance = 5*mutationRate;
        mutant.a.should.approximately(sub.a, tolerance*sub.a);
        mutant.b.should.approximately(sub.b, tolerance*sub.b);
        mutant.a.should.not.equal(sub.a);
        mutant.b.should.not.equal(sub.b);

        var mutant = sub.mutate();
        var tolerance = 5*mutationRate;
        mutant.a.should.approximately(sub.a, tolerance*sub.a);
        mutant.b.should.approximately(sub.b, tolerance*sub.b);
        if (sub.a === mutant.a) {
            mutant.b.should.not.equal(sub.b);
        } else {
            mutant.b.should.equal(sub.b);
        }
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
    it("crossover(...parents) blends models", function() {
        var model1 = new SubModel({a:1,b:10});
        var model2 = new SubModel({a:2,b:20});
        var model3 = new SubModel({a:6,b:60});
        model1.crossover(model2, model3).should.properties({
            a: 3,
            b: 30,
        });
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
            mutationRate: 0.001, // gaussian standard deviation of fractional mutationRate change 
            anneal: 1, // adjust mutationRate over maxEpochs [0..1]. 0:no annealing, 1:linear annealing to 0
            maxAge: 20, // candidate model must survive this many epochs
            maxEpochs: 500, // when to give up
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
});
