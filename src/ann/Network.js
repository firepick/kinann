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
        that.fNormIn && (obj.fNormIn = that.fNormIn.map((f) => f.toString()));
        that.weights && (obj.weights = that.weights);
        that.gradExpr && (obj.gradExpr = that.gradExpr);
        that.costFunExpr && (obj.costFunExpr = that.costFunExpr);
        return JSON.stringify(obj);
    }

    Network.fromJSON = function(json) {
        var obj = JSON.parse(json);
        var network = null;
        if (obj.type === "Sequential") {
            var Sequential = require("./Sequential");
            var layers = obj.layers.map((l) => Layer.fromJSON(l));
            network = new Sequential(obj.nIn, layers, obj);
        }
        if (network) {
            obj.gradExpr && (network.gradExpr = obj.gradExpr);
            obj.costFunExpr && (network.costFunExpr = obj.costFunExpr);
            obj.fNormIn && (network.fNormIn = obj.fNormIn.map((f) => (new Function("return " + f))()));
            if (obj.weights) {
                network.weights = obj.weights;
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
        that.nOut = that.layers[that.layers.length - 1].length;
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

    Network.prototype.propagate = function(learningRate) { // see compile
        var that = this;
        if (!that.memoizeActivate) {
            throw new Error("compile() must be called before propagate()");
        }
        var gradC = that.costGradient();
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
        var inStats = Network.exampleStats(examples, "input");
        return that.fNormIn = MapLayer.mapFun(that.nIn, inStats, normStats, normalizeInput);
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

        var done = false;
        for (var iEpoch = 0; !done && iEpoch < nEpochs; iEpoch++) {
            done = true;
            shuffle && Network.shuffle(examples);
            for (var iEx = 0; iEx < examples.length; iEx++) {
                var example = examples[iEx];
                that.activate(example.input, example.target);
                var cost = that.cost();
                (cost > minCost) && (done = false);
                that.propagate(result.learningRate);
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

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Network", function() {
    var should = require("should");
    var Network = exports.Network; // require("./Network");
    var Sequential = require("./Sequential");
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
    it("Network.compile(exprIn, options) compiles the feed-forward activate() function ", function() {
        var network = new Sequential(2, [new Layer(2)]);
        var scope = {
            x0: 5,
            x1: 7,
            w0b0: 0.1,
            w0b1: 0.2,
            w0b2: 0.3,
            w0r0c0: 1,
            w0r0c1: 2,
            w0r1c0: 3,
            w0r1c1: 4,
        };
        network.initialize(scope);
        network.compile();

        var outputs = network.activate([5, 7])
        should.deepEqual(outputs, [19 + 0.1, 43 + 0.2]);
    })
    it("Network.costExpr(exprIn) returns formula for network cost", function() {
        var network = new Sequential(2, [
            new Layer(2, logistic_opts),
            new Layer(2, identity_opts),
        ]);

        var costExpr = network.costExpr(["x0", "x1"]);
        should.deepEqual(costExpr,
            "((w1b0+w1r0c0/(1+exp(-(w0b0+w0r0c0*x0+w0r0c1*x1)))+w1r0c1/(1+exp(-(w0b1+w0r1c0*x0+w0r1c1*x1)))-yt0)^2" +
            "+(w1b1+w1r1c0/(1+exp(-(w0b0+w0r0c0*x0+w0r0c1*x1)))+w1r1c1/(1+exp(-(w0b1+w0r1c0*x0+w0r1c1*x1)))-yt1)^2)/2"
        );
    })
    it("Network.initialize(weights,options) initializes weights", function() {
        var network = new Sequential(2, [new Layer(2, logistic_opts)]);

        // each added layer has allocated a new id
        var identity = new Layer(2);
        identity.id.should.equal(0); // default id
        network.add(identity); // update id
        identity.id.should.equal(1); // new layer id

        // initialize all weights
        var weights = network.initialize();
        assertRandom(weights, 1.5);
        var keys = Object.keys(weights);
        keys.length.should.equal(12); // 2 layers * (2 inputs + 2 outputs + 2 offsets)

        // initialize overwrites all existing weights
        var weights2 = network.initialize();
        keys.map((key) => weights2[key].should.not.equal(weights[key]));

        // initialize only overwrites MISSING weights 
        var w0r0c0 = weights2.w0r0c0;
        delete weights2.w0r0c0;
        var weights3 = network.initialize(weights2);
        keys.map((key) => {
            key === "w0r0c0" && weights3[key].should.not.equal(w0r0c0);
            key !== "w0r0c0" && weights3[key].should.equal(weights2[key]);
        });
    })
    it("Network.costGradientExpr(exprIn) returns cost gradient expression vector", function() {
        var network = new Sequential(2, [new Layer(2, identity_opts)]);
        var weights = network.initialize();
        var gradC = network.costGradientExpr();
        should.deepEqual(gradC, {
            w0b0: '(2 * (w0b0 - yt0 + w0r0c0 * x0 + w0r0c1 * x1) + 0) / 2',
            w0b1: '(2 * (w0b1 - yt1 + w0r1c0 * x0 + w0r1c1 * x1) + 0) / 2',
            w0r0c0: '(2 * (x0 + 0) * (w0b0 - yt0 + w0r0c0 * x0 + w0r0c1 * x1) + 0) / 2',
            w0r0c1: '(2 * (x1 + 0) * (w0b0 - yt0 + w0r0c0 * x0 + w0r0c1 * x1) + 0) / 2',
            w0r1c0: '(2 * (x0 + 0) * (w0b1 - yt1 + w0r1c0 * x0 + w0r1c1 * x1) + 0) / 2',
            w0r1c1: '(2 * (x1 + 0) * (w0b1 - yt1 + w0r1c0 * x0 + w0r1c1 * x1) + 0) / 2',
        });
    })
    it("Network.activate(ipnuts, targets) computes activation outputs", function() {
        var network = new Sequential(2, [new Layer(2)]);
        var scope = {
            x0: 5,
            x1: 7,
            w0b0: 0.1,
            w0b1: 0.2,
            w0b2: 0.3,
            w0r0c0: 1,
            w0r0c1: 2,
            w0r1c0: 3,
            w0r1c1: 4,
        };
        network.initialize(scope);
        network.compile();

        var outputs = network.activate([5, 7])
        should.deepEqual(outputs, [19.1, 43.2]);

        var outputs2 = network.activate([5, 7], [19.1 + .01, 43.2 + .02]);
        should.deepEqual(outputs2, outputs);
    })
    it("Network.cost() returns activation cost", function() {
        var network = new Sequential(2, [new Layer(2, identity_opts)]);
        var scope = {
            w0b0: 0.1,
            w0b1: 0.2,
            w0b2: 0.3,
            w0r0c0: 1,
            w0r0c1: 2,
            w0r1c0: 3,
            w0r1c1: 4,
        };
        var weights = network.initialize(scope);
        network.compile();

        // targeted activation is required for cost()
        var inputs = [5, 7];
        var targets = [19.1, 43.2];
        network.activate(inputs, targets);
        network.cost().should.equal(0); // cost at target

        network.activate(inputs, [19, 43.2]);
        mathjs.round(network.cost(), 3).should.equal(0.005); // near target

        network.activate(inputs, [18, 43.2]);
        mathjs.round(network.cost(), 3).should.equal(0.605); // far from target
    })
    it("Network.costGradient() returns activation cost gradient vector", function() {
        var network = new Sequential(2, [new Layer(2, identity_opts)]);
        var scope = {
            w0b0: 0.1,
            w0b1: 0.2,
            w0b2: 0.3,
            w0r0c0: 1,
            w0r0c1: 2,
            w0r1c0: 3,
            w0r1c1: 4,
        };
        var weights = network.initialize(scope);
        network.compile();

        // targeted activation is required for costGradient()
        var inputs = [5, 7];
        var targets = [19.1, 43.2];
        network.activate(inputs, targets);

        // when outputs===target, gradient is zero
        var gradC = network.costGradient();
        should.deepEqual(gradC, {
            w0b0: 0,
            w0b1: 0,
            w0b2: 0,
            w0r0c0: 0,
            w0r0c1: 0,
            w0r1c0: 0,
            w0r1c1: 0,
        });

        // gradient near target value
        network.activate(inputs, [targets[0] - 0.1, targets[1]]);
        var gradC = network.costGradient();
        should.deepEqual(gradC, {
            w0b0: 0.10000000000000142,
            w0b1: 0,
            w0b2: 0,
            w0r0c0: 0.5000000000000071,
            w0r0c1: 0.70000000000001,
            w0r1c0: 0,
            w0r1c1: 0,
        });
    })
    it("Network.shuffle(a) permutes array", function() {
        var a = [1, 2, 3, 4, 5, 6, 7, 8];
        var b = [1, 2, 3, 4, 5, 6, 7, 8];
        Network.shuffle(b);
        should(
            a[0] !== b[0] ||
            a[1] !== b[1] ||
            a[2] !== b[2] ||
            a[3] !== b[3] ||
            a[4] !== b[4] ||
            a[5] !== b[5] ||
            a[6] !== b[6]
        ).equal(true);
        should.deepEqual(a, b.sort());
    })
    it("Network.propagate(learningRate) back-propagates gradient descent weight changes", function() {
        var network = new Sequential(2, [
            new Layer(2, identity_opts),
        ]);
        network.initialize();
        network.compile();
        var f0 = (x) => 3 * x + 8;
        var f1 = (x) => 0;
        var input = [5, 5];
        var target = [f0(input[0]), f1(input[0])];

        network.activate(input, target); // activate to determine initial cost
        var cost = network.cost();

        // train network 
        var learningRate = Network.LEARNING_RATE;
        for (var iEpoch = 0; iEpoch < 10; iEpoch++) {
            var prevCost = cost;

            // train network via back-propagation of gradient descent deltas
            network.propagate(learningRate);
            network.activate(input, target);

            cost = network.cost();
            if (cost > prevCost) {
                learningRate /= 5;
            }
            iEpoch < 5 || cost.should.below(prevCost); // we are getting better!
        }
    })
    it("Network.train(examples, options) trains neural net", function() {
        this.timeout(60 * 1000);
        var nHidden = 2;
        var network = new Sequential(2, [
            //new Layer(nHidden, logistic_opts),
            new Layer(2, identity_opts),
        ]);
        network.initialize();
        network.compile();
        var f0 = (x) => (3 * x + 8);
        var f1 = (x) => 0;
        var examples = [-5, 5, 4, -4, 3, -3, 2, -2, 1, -1, 0].map((x) => {
            return {
                input: [x, 0],
                target: [f0(x), f1(x)]
            }
        });

        options = {
            normInStd: 0.3, // standard deviation of normalized input
            normInMean: 0, // mean of normalized input
            maxEpochs: Network.MAX_EPOCHS, // maximum number of training epochs
            minCost: Network.MIN_COST, // stop training if cost for all examples drops below minCost
            learningRate: Network.LEARNING_RATE, // initial learning rate or function(lr)
            learningRateDecay: 0.99985, // exponential learning rate decay
            learningRateMin: 0.001, // minimum learning rate
            shuffle: true, // shuffle examples for each epoch
        }
        var result = network.train(examples, options);
        var tests = [-5, -3.1, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.1, 5].map((x) => {
            return {
                input: [x, 0],
                target: [f0(x), f1(x)]
            }
        });

        for (var iTest = 0; iTest < tests.length; iTest++) {
            var test = tests[iTest];
            var outputs = network.activate(test.input, test.target);
            network.cost().should.below(options.minCost);
        }
    })
    it("exampleStats(stats, key)", function() {
        var examples = [{
                akey: [1, 10]
            },
            {
                akey: [2, 20]
            },
            {
                akey: [3, 30]
            },
        ];
        var stats = Network.exampleStats(examples, "akey");
        stats.length.should.equal(2);
        stats[0].max.should.equal(3);
        stats[0].min.should.equal(1);
        stats[0].mean.should.equal(2);
        stats[0].std.should.approximately(mathjs.sqrt(1 / 3), 0.0001);
        stats[1].max.should.equal(30);
        stats[1].min.should.equal(10);
        stats[1].mean.should.equal(20);
        stats[1].std.should.approximately(10 * mathjs.sqrt(1 / 3), 0.0001);
    })
    it("Network can be serialized", function() {
        var network = new Sequential(2, [
            new Layer(2, identity_opts),
        ]);
        network.initialize();
        network.compile();
        var examples = [{
                input: [1, 2],
                target: [10, 200]
            },
            {
                input: [4, 3],
                target: [40, 300]
            },
            {
                input: [-3, -4],
                target: [-30, -400]
            },
        ];
        network.train(examples);
        var json = network.toJSON();

        // de-serialized network should be trained
        var network2 = Network.fromJSON(json);
        network2.toJSON().should.equal(json);
        should.deepEqual(network.activate([2, 3]), network2.activate([2, 3]));
    })
    it("Network.train(examples, options) trains polynomial neural net", function() {
        this.timeout(60 * 1000);
        var nInputs = 3;
        var nOutputs = nInputs;
        var boundaries = [{
                input: [0, 0, 0]
            }, // cube vertex
            {
                input: [200, 200, 10]
            }, // cube vertex
        ];
        var examples = boundaries.concat([{
                input: [0, 0, 10]
            }, // cube vertex
            {
                input: [0, 200, 10]
            }, // cube vertex
            {
                input: [200, 200, 0]
            }, // cube vertex
            {
                input: [0, 200, 0]
            }, // cube vertex
            //{ input:[200,0,10] }, // cube vertex
            //{ input: [200,0,0] }, // cube vertex
            //{ input:[100,100,5] }, // center
            {
                input: [100, 100, 0]
            }, // midpoint bottom
            {
                input: [100, 100, 10]
            }, // midpoint top
            {
                input: [100, 200, 5]
            }, // midpoint side
            {
                input: [100, 0, 5]
            }, // midpoint side
            {
                input: [200, 100, 5]
            }, // midpoint side
            {
                input: [0, 100, 5]
            }, // midpoint side
        ]);
        var tests = [{
                input: [190, 180, 3.5]
            },
            {
                input: [200, 0, 4]
            },
            {
                input: [100, 0, 0]
            },
            {
                input: [1, 1, 2]
            },
            {
                input: [200, 0, 0]
            },
        ];
        var makeExample = function(ex, f) {
            ex.target = f(ex.input);
        };

        var buildNetwork = function() {
            var layers = [
                new MapLayer([
                    (eIn) => eIn[0], // x0
                    (eIn) => eIn[1], // x1
                    (eIn) => eIn[2], // x2
                    (eIn) => "(" + eIn[0] + "^2)", // quadratic x0 input 
                    (eIn) => "(" + eIn[1] + "^2)", // quadratic x1 input
                    (eIn) => "(" + eIn[2] + "^2)", // quadratic x2 input
                ]),
                new Layer(nOutputs, identity_opts),
            ];
            return new Sequential(nInputs, layers);
        };
        var options = {};
        var msStart = new Date();
        var network0 = buildNetwork();
        network0.initialize();
        network0.compile(); // pre-compilation saves time
        network0.normalizeInput(boundaries); // input normalization only requires boundary examples
        var verbose = true;
        var result = {};
        var preTrain = true; // pre-training usually helps
        if (preTrain) {
            var fideal = (input) => input;
            var examples0 = JSON.parse(JSON.stringify(examples));
            var tests0 = JSON.parse(JSON.stringify(tests));
            examples0.map((ex) => makeExample(ex, fideal));
            tests0.map((ex) => makeExample(ex, fideal));
            var result = network0.train(examples0, options);
            var test = tests0[0];
            var outputs = network0.activate(test.input, test.target);
            verbose && console.log("pre-train epochs:" + result.epochs, "outputs:" + outputs);
        }
        var preTrainJson = network0.toJSON();
        verbose && console.log("pre-train elapsed:" + (new Date() - msStart), "learningRate:" + result.learningRate);

        // build a new network using preTrainJson saves ~1500ms
        var msStart = new Date();
        var network = Network.fromJSON(preTrainJson);
        var theta = 1 * mathjs.PI / 180;
        var fskew = (input) => [input[0] + input[1] * mathjs.sin(theta), input[1] * mathjs.cos(theta), input[2]];
        examples.map((ex) => makeExample(ex, fskew));
        tests.map((ex) => makeExample(ex, fskew));
        var result = network.train(examples, options);
        verbose && console.log("learningRate:" + result.learningRate, "epochs:" + result.epochs, "minCost:" + result.minCost);

        for (var iTest = 0; iTest < tests.length; iTest++) {
            var test = tests[iTest];
            outputs = network.activate(test.input, test.target);
            var error = mathjs.sqrt(2 * network.cost() / nOutputs);
            verbose && console.log("fskew epochs:" + result.epochs,
                "error:" + error,
                "output:" + JSON.stringify(outputs),
                "target:" + JSON.stringify(test.target),
                "input:" + test.input
            );
            error.should.below(0.02);
        }
        //verbose && console.log("activate:", network.memoizeActivate.toString());
        verbose && console.log("elapsed:", new Date() - msStart);
        //verbose && console.log(network.weights);
    })
})
