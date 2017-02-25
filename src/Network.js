var mathjs = require("mathjs");
var Optimizer = require("./Optimizer");
var Layer = require("./Layer");
var MapLayer = require("./MapLayer");

(function(exports) {
    ////////////////// constructor
    function Network(nIn) {
        var that = this;
        that.nIn = nIn;
        that.exprIn = Array(nIn).fill().map((e, i) => "x" + i);
        that.layers = [];
        that.inputs = Array(nIn).fill().map((x, i) => "x" + i);
        return that;
    }

    Network.prototype.add = function(layer, options = {}) {
        var that = this;
        var idBase = options.idBase || 0;
        layer.id = idBase + that.layers.length;
        that.layers.push(layer);
        that.nOut = layer.nOut;
        return layer;
    }

    Network.prototype.toJSON = function(type) {
        var that = this;
        var obj = {
            type: that.type || "Network",
            nIn: that.nIn,
            nOut: that.nOut,
        }
        obj.layers = that.layers.map((l) => l.toJSON());
        that.inStats && (obj.inStats = that.inStats);
        that.fNormIn && (obj.fNormIn = that.fNormIn.map((f) => f.toString()));
        that.weights && (obj.weights = that.weights);
        that.gradExpr && (obj.gradExpr = that.gradExpr);
        that.costFunExpr && (obj.costFunExpr = that.costFunExpr);
        return obj;
    }

    Network.fromJSON = function(json) {
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

    Network.prototype.initialize = function(weights = {}, options = {}) {
        var that = this;
        var layers = that.layers;
        var nIn = that.nIn;
        for (var iLayer = 0; iLayer < layers.length; iLayer++) {
            layers[iLayer].initialize(nIn, weights, options);
            nIn = layers[iLayer].nOut;
        }
        return that.weights = weights;
    }

    Network.prototype.costExpr = function(exprIn, options = {}) {
        var that = this;
        var costExpr = "";
        var exprs = that.expressions(exprIn);
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

    Network.prototype.costGradientExpr = function(exprIn, options = {}) {
        // NOTE: computing the cost gradient expression can take 700ms or more
        var that = this;
        if (that.weights == null) {
            throw new Error("initialize() must be called before costGradientExpr()");
        }
        var costExpr = that.costFunExpr = that.costExpr(exprIn);
        var weights = that.weights;
        var keys = Object.keys(weights).sort();
        var gradExpr = {};
        for (var iw = 0; iw < keys.length; iw++) {
            var weight = keys[iw];
            gradExpr[weight] = mathjs.derivative(costExpr, weight).toString();
        }
        that.keys = keys;
        return that.gradExpr = gradExpr;
    }

    Network.prototype.compile = function(exprsIn, options = {}) {
        var that = this;
        that.opt = new Optimizer();
        var nIn = that.nIn;
        that.nOut = that.layers[that.layers.length - 1].nOut;
        var exprs = that.expressions(exprsIn);
        that.fmemo_outputs = that.opt.optimize(exprs);
        that.memoizeActivate = that.opt.compile();
        that.scope = Object.create(that.weights);

        that.gradExpr = that.gradExpr || that.costGradientExpr(exprsIn, options);
        that.gradFun = {};
        that.fmemo_gradient = {};
        that.keys = Object.keys(that.weights);
        for (var iKey = 0; iKey < that.keys.length; iKey++) {
            var key = that.keys[iKey];
            var partial = that.gradExpr[key];
            that.fmemo_gradient[key] = that.opt.optimize(partial);
        }

        that.fmemo_cost = that.opt.optimize(that.costFunExpr);
        that.memoizePropagate = that.opt.compile();

        return that;
    }

    Network.prototype.activate = function(input, target) { // see compile()
        var that = this;
        if (input.length !== that.nIn) {
            throw new Error("activation vector input length expected:"+that.nIn + " actual:"+input.length);
        }
        if (!that.memoizeActivate) {
            throw new Error("compile() before activate()");
        }
        input.map((x, i) => that.scope["x" + i] = that.fNormIn ? that.fNormIn[i](x) : x);
        that.target = target;
        if (target) {
            target.map((y, i) => that.scope["yt" + i] = y);
            that.memoizePropagate(that.scope);
        } else {
            that.memoizeActivate(that.scope);
        }
        return that.fmemo_outputs.map((f, i) => that.scope["y" + i] = that.scope[f]);
    }

    Network.prototype.costGradient = function() { // see compile()
        var that = this;
        if (that.scope.yt0 == null) {
            throw new Error("activate(input, target) must be called before costGradient()");
        }
        var grad = {};
        that.keys.map((key) => grad[key] = that.scope[that.fmemo_gradient[key]]);
        return grad;
    }

    Network.prototype.cost = function() { // see compile()
        var that = this;
        if (that.scope.yt0 == null) {
            throw new Error("activate(input, target) must be called before costGradient()");
        }
        return that.scope[that.fmemo_cost];
    }

    Network.prototype.propagate = function(learningRate, gradC) { // see compile
        var that = this;
        if (!that.memoizeActivate) {
            throw new Error("compile() must be called before propagate()");
        }
        gradC = gradC || that.costGradient();
        that.keys.map((key) => that.weights[key] -= learningRate * gradC[key])
        return that;
    }

    Network.exampleStats = function(examples, key = "input") {
        var that = this;
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

    Network.prototype.normalizeInput = function(examples, options = {}) {
        var that = this;
        var normStats = options.normStats || {
            max: 1,
            min: -1
        };
        var normalizeInput = options.normalizeInput || "mapminmax";
        that.inStats = Network.exampleStats(examples, "input");
        return that.fNormIn = MapLayer.mapFun(that.nIn, that.inStats, normStats, normalizeInput);
    }
    Network.prototype.train = function(examples, options = {}) {
        var that = this;

        if (!that.scope) {
            throw new Error("compile() network before train()");
        }

        var result = {};

        that.fNormIn || that.normalizeInput(examples, options);
        var nEpochs = options.maxEpochs || Network.MAX_EPOCHS;
        var minCost = options.minCost || Network.MIN_COST;
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
        result.minCost = minCost;
        result.learningRate = lrFun();
        var shuffle = options.shuffle == null ? true : options.shuffle;
        var prevCost = null;

        // Pre-scale learning rate so that learning converges
        var lrPreScale = options.learningRatePreScale == null ?
            Network.LEARNING_RATE_PRESCALE : options.learningRatePreScale;
        for (var iEx = 0; iEx < lrPreScale; iEx++) {
            var example = examples[iEx % examples.length];
            that.activate(example.input, example.target);
            var cost = that.cost();
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
            that.propagate(result.learningRate);
            prevCost = cost;
        }

        var batch = options.batch || 1;
        var iBatch = 0;
        var batchScale = 1/batch;
        var batchGradC;
        var done = false;
        for (var iEpoch = 0; !done && iEpoch < nEpochs; iEpoch++) {
            done = true;
            shuffle && Network.shuffle(examples);
            for (var iEx = 0; iEx < examples.length; iEx++) {
                var example = examples[iEx];
                that.activate(example.input, example.target);
                var cost = that.cost();
                (cost > minCost) && (done = false);
                var gradC = that.costGradient();
                if (iBatch === 0) {
                    batchGradC = gradC;
                } else {
                    for (var ik = that.keys.length; ik-- > 0;) {
                        var k = that.keys[ik];
                        batchGradC[k] = batchGradC[k] + gradC[k];
                    }
                }
                iBatch = (iBatch + 1) % batch;
                if (iBatch === 0) {
                    for (var ik = that.keys.length; ik-- > 0;) {
                        var k = that.keys[ik];
                        batchGradC[k] *= batchScale;
                    }
                    that.propagate(result.learningRate, batchGradC);
                }
            }
            result.epochs = iEpoch;
            result.learningRate = lrFun(result.learningRate);
        }

        return result;
    }

    ////////////////// class
    Network.shuffle = function(a) {
        for (var i = a.length; i--;) {
            var j = mathjs.floor(mathjs.random() * (i + 1));
            var tmp = a[i];
            a[i] = a[j];
            a[j] = tmp;
        }
        return a;
    }

    Network.MAX_EPOCHS = 10000;
    Network.MIN_COST = 0.00005;
    Network.LEARNING_RATE = 0.5;
    Network.LEARNING_RATE_PRESCALE = 8;

    module.exports = exports.Network = Network;
})(typeof exports === "object" ? exports : (exports = {}));
