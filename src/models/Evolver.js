var mathjs = require("mathjs");
var Example = require("../Example");
var Variable = require("../Variable");

(function(exports) { class Evolver {
    constructor (genes, examples, options={}) {
        this.startRate = this.rate = options.rate || .002; 
        this.minRate = options.minRate || .002;
        this.genes = genes;
        this.anneal = options.anneal || 1;
        this.maxAge = options.maxAge || this.genes.length * 15;
        this.costGoal = options.costGoal || this.rate * 2;
        this.maxEpochs = options.maxEpochs || this.maxAge * 20;
        this.minEpochs = options.minEpochs || 2*this.maxAge;
        Object.defineProperty(this, "costMap", {
            value: new WeakMap(),
        });
        Object.defineProperty(this, "examples", {
            value: examples,
        });
        Object.defineProperty(this, "onEpoch", {
            value: options.onEpoch,
        });
        Object.defineProperty(this, "gaussian", {
            value: Variable.createGaussian(),
        });
    }   

    costOf(model) {
        var cost = this.costMap.get(model);
        if (cost == null) {
            cost = model.cost(this.examples);
            this.costMap.set(model, cost);
        }
        return cost;
    }

    mutateValue(v, rate) {
        var dv = rate * v;
        return v + this.gaussian.sample() * dv;
    }

    mutateAll(model) {
        var rate = this.rate / this.genes.length;
        var newGenes = this.genes.reduce((acc, gene) => 
            Object.assign(acc, {[gene]: this.mutateValue(model[gene], rate)}), 
            {});
        return model.clone(newGenes);
    }
    
    mutateGene(model, gene) {
        var oldValue = model[gene];
        var newValue = this.mutateValue(oldValue);
        return [
            model.clone({ [gene]: newValue }),
            model.clone({ [gene]: 2*oldValue - newValue }),
        ];
    }

    crossover(...models) {
        var n = this.genes.length;
        var newGenes = this.genes.reduce((acc, gene) => 
            Object.assign(acc, {
                [gene]: models.reduce((sum,model) => sum + model[gene], 0)/n
            }));
            return models[0].clone(newGenes);
        return new this.constructor(modelOpts);
    }

    mutateModel(model1, model2, gene) {
        var mutants = this.mutateGene(model1, gene); 
        var costs = mutants.map((m) => this.costOf(m));
        var mutant = costs[0] < costs[1] ? mutants[0] : mutants[1];
        if (this.costOf(mutant) < this.costOf(model2)) {
            return mutant; // singe gene mutation succeeded
        }
        mutant = this.crossover(model1, model2);
        if (this.costOf(mutant) < this.costOf(model2)) {
            return mutant; // crossover is better than worst parent
        }
        mutant = this.mutateAll(model1);
        if (this.costOf(mutant) < this.costOf(model2)) {
            //console.log("mutate all!", this.costOf(model2), this.costOf(mutant));
            return mutant; // mutation of all genes succeded 
        } 
        return model2; // do no harm
    }

    evolve(model) {
        this.rate = this.startRate;
        var models = [model, model];
        var result = {
            model: model,
            cost: this.costOf(model),
            rate: this.rate,
        };
        if (result.cost === Number.MAX_VALUE) {
            throw new Error("cannot compute cost for evolving model:" + JSON.stringify(model));
        }

        result.age = 0;
        for (var iEpoch = 0; iEpoch < this.maxEpochs; iEpoch++) {
            var genes = Example.shuffle(this.genes.map((k) => k));
            while (genes.length) {
                var gene = genes.pop();
                if (this.costOf(models[0]) <= this.costOf(models[1])) {
                    result.model = models[0];
                    models[1] = this.mutateModel(result.model, models[1], gene);
                    result.age++; // survivor!
                } else {
                    result.model = models[1];
                    models[1] = this.mutateModel(result.model, models[0], gene);
                    models[0] = result.model; // promote
                    result.age = 0;
                }
                result.epochs = iEpoch;
                result.cost = this.costOf(result.model);
                result.rate = this.rate;
            }
            this.rate = this.rate * this.anneal + this.minRate * (1 - this.anneal);
            this.onEpoch && this.onEpoch(result);
            if (result.cost < this.costGoal || (result.age >= this.maxAge && iEpoch >= this.minEpochs)) {
                return result;
            }
        }

        result.error = new Error("evolve did not converge");
        return result;
    }
} //// CLASS 

    module.exports = exports.Evolver = Evolver;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("Evolver", function() {
    var should = require("should");
    var Evolver = exports.Evolver;
    class Line {
        constructor(a,b) {
            this.a = a;
            this.b = b;
            this.genes = ["a","b"];
        }
        calculate(x) {
            return this.a * x + this.b;
        }
        clone(genes) {
            return new Line(genes.a, genes.b);
        }
        cost(examples) {
            return examples.reduce((acc, ex) => {
                var x = ex.input[0];
                var y = this.calculate(x);
                var diff = y - ex.target[0];
                return mathjs.max(diff*diff, acc);
            }, 0);
        }
    }

    it("evolve(model) returns mutation of given model that fits examples", function() {
        var line = new Line(2,5);
        var examples = [];
        var evolver = new Evolver(line.genes, examples);
        var mutant = evolver.mutateAll(line);
        mutant.a.should.not.equal(line.a);
        mutant.b.should.not.equal(line.b);
    })
    it("TESTTESTevolve(model) returns mutation of given model that fits examples", function() {
        var verbose = false;
        var lineTarget = new Line(32,150);
        var examples = [1,100,200].map((x) => new Example([x], [lineTarget.calculate(x)]));
        var lineStart = new Line(32.5,149);
        var evolver = new Evolver(lineStart.genes, examples, {
            rate: 0.01, // mutation rate
            minRate: 0.001, // minimum mutation rate
            anneal: 0.985, // mutation rate annealing factor
            minEpochs: 1000, // minimum epochs required for maxAge
            maxAge: 200, // survivor age convergence after minEpochs
            costGoal: 0.01, // quick termination cost
            onEpoch: (result) => // epoch iteration callback
                verbose && result.epochs % 50 == 0 && 
                console.log("evolve", JSON.stringify(result)),
        });
        var result = evolver.evolve(lineStart);
        verbose && console.log("evolve result", JSON.stringify(result));
        verbose && console.log("evolver", JSON.stringify(evolver));
        var lineEvolved = result.model;
        lineEvolved.a.should.approximately(lineTarget.a, 0.1);
        lineEvolved.b.should.approximately(lineTarget.b, 0.1);
    })
});
