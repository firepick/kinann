var mathjs = require("mathjs");
var Equations = require("./Equations");
var Layer = require("./Layer");
var MapLayer = require("./MapLayer");
var Example = require("./Example");

(function(exports) { class Network {
    constructor(nIn) {
        this.nIn = nIn;
        this.exprIn = Array(nIn).fill().map((e, i) => "x" + i);
        this.layers = [];
        this.inputs = Array(nIn).fill().map((x, i) => "x" + i);
    }

    add(layer, options = {}) {
        var idBase = options.idBase || 0;
        layer.id = idBase + this.layers.length;
        this.layers.push(layer);
        this.nOut = layer.nOut;
        return layer;
    }

    toJSON(type) {
        var obj = {
            type: this.type || "Network",
            nIn: this.nIn,
            nOut: this.nOut,
        }
        obj.layers = this.layers.map((l) => l.toJSON());
        this.inStats && (obj.inStats = this.inStats);
        this.fNormIn && (obj.fNormIn = this.fNormIn.map((f) => f.toString()));
        this.weights && (obj.weights = this.weights);
        this.gradExpr && (obj.gradExpr = this.gradExpr);
        this.costFunExpr && (obj.costFunExpr = this.costFunExpr);
        return obj;
    }

    static fromJSON(json) {
        var json = typeof json === 'string' ? JSON.parse(json) : json;
        var network = null;
        if (json.type === "Sequential") {
            var Sequential = require("./Sequential");
            var layers = json.layers.map((l) => Layer.fromJSON(l));
            network = new Sequential(json.nIn, layers, json);
        }
        if (network) {
            json.gradExpr && (network.gradExpr = json.gradExpr);
            json.costFunExpr && (network.costFunExpr = json.costFunExpr);
            json.fNormIn && (network.fNormIn = json.fNormIn.map((f) => (new Function("return " + f))()));
            json.inStats && (network.inStats = json.inStats);
            if (json.weights) {
                network.weights = json.weights;
                network.compile();
            }
        }
        return network;
    }

    initialize(weights = {}, options = {}) {
        var layers = this.layers;
        var nIn = this.nIn;
        for (var iLayer = 0; iLayer < layers.length; iLayer++) {
            layers[iLayer].initializeLayer(nIn, weights, options);
            nIn = layers[iLayer].nOut;
        }
        return this.weights = weights;
    }

    costExpr(exprIn, options = {}) {
        var costExpr = "";
        var exprs = this.expressions(exprIn);
        var metric = options.metric || "quadratic";
        if (metric === "quadratic") {
            for (var iOut = 0; iOut < exprs.length; iOut++) {
                costExpr.length && (costExpr += "+");
                costExpr += "(" + exprs[iOut] + "-yt" + iOut + ")^2"
            }
            costExpr = "(" + costExpr + ")/2"; // 2 disappears with derivative
        } else {
            throw new Error("Unsupported cost metric:" + metric);
        }
        return costExpr;
    }

    costGradientExpr(exprIn, options = {}) {
        // NOTE: computing the cost gradient expression can take 700ms or more
        if (this.weights == null) {
            throw new Error("initialize() must be called before costGradientExpr()");
        }
        var costExpr = this.costFunExpr = this.costExpr(exprIn);
        var weights = this.weights;
        var keys = Object.keys(weights).sort();
        var gradExpr = {};
        for (var iw = 0; iw < keys.length; iw++) {
            var weight = keys[iw];
            gradExpr[weight] = mathjs.derivative(costExpr, weight).toString();
        }
        this.keys = keys;
        return this.gradExpr = gradExpr;
    }

    compile(exprsIn, options = {}) {
        this.eq = new Equations();
        var nIn = this.nIn;
        this.nOut = this.layers[this.layers.length - 1].nOut;
        var exprs = this.expressions(exprsIn);
        this.outputNames = exprs.map((expr,i) => this.eq.set("y"+i, expr));
        this.memoActivate = this.eq.compile();
        this.scope = Object.create(this.weights);

        this.gradExpr = this.gradExpr || this.costGradientExpr(exprsIn, options);
        this.eq.set("cost", this.costFunExpr);
        this.gradFun = {};
        this.fmemo_gradient = {};
        this.keys = Object.keys(this.weights);
        for (var iKey = 0; iKey < this.keys.length; iKey++) {
            var key = this.keys[iKey];
            this.fmemo_gradient[key] = this.eq.derivative("cost", key);
        }

        this.memoPropagate = this.eq.compile();

        return this;
    }

    activate(input, target) { // see compile()
        if (input.length !== this.nIn) {
            throw new Error("activation vector input length expected:"+this.nIn + " actual:"+input.length);
        }
        if (!this.memoActivate) {
            throw new Error("compile() before activate()");
        }
        input.forEach((x, i) => this.scope["x" + i] = this.fNormIn ? this.fNormIn[i](x) : x);
        this.target = target;
        if (target) {
            target.forEach((yt, i) => this.scope["yt" + i] = yt);
            this.memoPropagate(this.scope);
        } else {
            this.memoActivate(this.scope);
        }
        return this.outputNames.map((y) => this.scope[y]);
    }

    costGradient() { // see compile()
        if (this.scope.yt0 == null) {
            throw new Error("activate(input, target) must be called before costGradient()");
        }
        var grad = {};
        this.keys.forEach((key) => grad[key] = this.scope[this.fmemo_gradient[key]]);
        return grad;
    }

    cost() { // see compile()
        if (this.scope.cost == null) {
            throw new Error("activate(input, target) must be called before costGradient()");
        }
        return this.scope.cost;
    }

    propagate(learningRate, gradC) { // see compile
        if (!this.memoPropagate) {
            throw new Error("compile() must be called before propagate()");
        }
        gradC = gradC || this.costGradient();
        this.keys.forEach((key) => this.weights[key] -= learningRate * gradC[key])
        return this;
    }

    static exampleStats(examples, key = "input") {
        var ex0 = examples[0];
        var n = ex0[key].length;
        var results = ex0[key].map((x) => {
            return {
                max: x,
                min: x,
                mean: x,
                std: 0,
            }
        });
        for (var iEx = 1; iEx < examples.length; iEx++) {
            var v = examples[iEx][key];
            for (var i = n; i-- > 0;) {
                var r = results[i];
                var x = v[i];
                r.max = mathjs.max(r.max, x);
                r.min = mathjs.min(r.min, x);
                r.mean += x;
            }
        }
        for (var i = n; i-- > 0;) {
            results[i].mean /= examples.length;
        }
        for (var iEx = 1; iEx < examples.length; iEx++) {
            var v = examples[iEx][key];
            for (var i = n; i-- > 0;) {
                var r = results[i];
                var dx = v[i] - r.mean;
                r.std += dx * dx;
            }
        }
        for (var i = n; i-- > 0;) {
            var r = results[i];
            r.std = mathjs.sqrt(r.std / examples.length);
        }
        return results;
    }
    expressions(exprIn) {
        throw new Error("Abstract method not implemented: expressions()");
    }
    normalizeInput(examples, options = {}) {
        var normStats = options.normStats || {
            max: 1,
            min: -1
        };
        var normalizeInput = options.normalizeInput || "mapminmax";
        this.inStats = Network.exampleStats(examples, "input");
        return this.fNormIn = MapLayer.mapFun(this.nIn, this.inStats, normStats, normalizeInput);
    }
    train(examples, options = {}) {
        if (!this.scope) {
            throw new Error("compile() network before train()");
        }

        var result = {};

        this.fNormIn || this.normalizeInput(examples, options);
        var nEpochs = options.maxEpochs || Network.MAX_EPOCHS;
        var targetCost = options.targetCost || Network.MIN_COST;
        var learningRate = options.learningRate || Network.LEARNING_RATE;
        if (typeof learningRate === "number") {
            var tHalfLife = nEpochs / 2;
            var lrMin = options.learningRateMin || learningRate / 10;
            var lrDecay = options.learningRateDecay || (1 - mathjs.log(2) / tHalfLife);
            var lrFun = (lr = learningRate) => lrDecay * lr + (1 - lrDecay) * lrMin;
        } else if (typeof learningRate === "function") {
            var lrFun = learningRate;
        } else {
            throw new Error("learningRate must be number or function");
        }
        result.targetCost = targetCost;
        result.learningRate = lrFun();
        var shuffle = options.shuffle == null ? true : options.shuffle;
        var prevCost = null;

        // Pre-scale learning rate so that learning converges
        var lrPreScale = options.learningRatePreScale == null ?
            Network.LEARNING_RATE_PRESCALE : options.learningRatePreScale;
        for (var iEx = 0; iEx < lrPreScale; iEx++) {
            var example = examples[iEx % examples.length];
            this.activate(example.input, example.target);
            var cost = this.cost();
            if (iEx && prevCost < cost) { // dampen learning rate
                var costRatio = cost / prevCost;
                if (costRatio > 3000) {
                    result.learningRate = result.learningRate * 0.3;
                } else if (costRatio > 1000) {
                    result.learningRate = result.learningRate * 0.4;
                } else if (costRatio > 300) {
                    result.learningRate = result.learningRate * 0.5;
                } else if (costRatio > 100) {
                    result.learningRate = result.learningRate * 0.6;
                } else if (costRatio > 30) {
                    result.learningRate = result.learningRate * 0.7;
                } else if (costRatio > 10) {
                    result.learningRate = result.learningRate * 0.8;
                } else if (costRatio > 3) {
                    result.learningRate = result.learningRate * 0.9;
                } else {
                    // do nothing--it might self-correct
                }
                //console.log("Learning rate prescale:" + iEx, "cost/prevCost:"+cost/prevCost, "new learningRate:" + result.learningRate);
            }
            this.propagate(result.learningRate);
            prevCost = cost;
        }

        var defaultBatch =  examples.length > 10 
            ? 2  // mini-batch gradient descent (normal)
            : 1; // stochastic gradient descent for few examples
        var batch = options.batch || defaultBatch;
        var iBatch = 0;
        var batchScale = 1/batch;
        var batchGradC;
        var done = false;
        var maxCostLimit = null;
        for (var iEpoch = 0; !done && iEpoch < nEpochs; iEpoch++) {
            done = true;
            shuffle && Example.shuffle(examples);
            result.maxCost = 0;
            for (var iEx = 0; iEx < examples.length; iEx++) {
                var example = examples[iEx];
                this.activate(example.input, example.target);
                var cost = this.cost();
                result.maxCost = mathjs.max(result.maxCost, cost);
                (cost > targetCost) && (done = false);
                var gradC = this.costGradient();
                if (iBatch === 0) {
                    batchGradC = gradC;
                } else {
                    for (var ik = this.keys.length; ik-- > 0;) {
                        var k = this.keys[ik];
                        batchGradC[k] = batchGradC[k] + gradC[k];
                    }
                }
                iBatch = (iBatch + 1) % batch;
                if (iBatch === 0) {
                    for (var ik = this.keys.length; ik-- > 0;) {
                        var k = this.keys[ik];
                        batchGradC[k] *= batchScale;
                    }
                    this.propagate(result.learningRate, batchGradC);
                }
            }
            result.epochs = iEpoch;
            options.onEpoch && options.onEpoch(result);
            maxCostLimit = maxCostLimit || result.maxCost; 
            if (result.epochs > 100 && result.maxCost > maxCostLimit) { // not converging
                result.maxCostLimit = maxCostLimit;
                result.error = new Error("Network training exceeded maxCost limit:"+JSON.stringify(result));
                return result;
            }
            const maxCostWeight = 0.1;
            maxCostLimit = maxCostLimit * (1-maxCostWeight) + result.maxCost * maxCostWeight; // exponential average
            result.learningRate = lrFun(result.learningRate);
        }
        if (nEpochs <= result.epochs + 1) { // convergence too slow
            result.error = new Error("Network training exceeded epoch limit:"+JSON.stringify(result));
        }

        return result;
    }

    ////////////////// class

    static get MAX_EPOCHS() { return 500; }
    static get MIN_COST() { return 0.00005; }
    static get LEARNING_RATE() { return 0.5; }
    static get LEARNING_RATE_PRESCALE() { return 8; }
} //// CLASS

    module.exports = exports.Network = Network;
})(typeof exports === "object" ? exports : (exports = {}));
