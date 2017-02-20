var mathjs = require("mathjs");
var Optimizer = require("../src/Optimizer");
var Layer = require("../src/Layer");
var MapLayer = require("../src/MapLayer");
var should = require("should");
var Network = require("../src/Network");
var Sequential = require("../src/Sequential");

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Network", function() {
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
    it("Network.normalizeInput(examples, options) normalizes input", function() {
        this.timeout(60 * 1000);
        
        // input normalization only requires boundary examples
        var boundaries = [{
                input: [3, 2, 1] // cube vertex
            }, {
                input: [300, 200, 10] // cube vertex
            }, 
        ];
        var network = new Sequential(3, [
            new Layer(3, {activation: Layer.ACT_IDENTITY}),
        ]);
        network.initialize();
        network.compile(); // pre-compilation saves time
        network.normalizeInput(boundaries, {
            normalizeInput: "mapminmax", // (default) map minimum/maximum to [-1,1]
        }); 

        // normalization statistics are retained in the network
        var inStats = network.inStats;
        inStats.length.should.equal(network.nIn);
        inStats.map((stats) => stats.should.properties(["max","min","mean","std"]));
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
                input: [0, 0, 0] // cube vertex
            }, {
                input: [200, 200, 10] // cube vertex
            }, 
        ];
        var examples = boundaries.concat([{
                input: [0, 0, 10] // cube vertex
            }, {
                input: [0, 200, 10] // cube vertex
            }, {
                input: [200, 200, 0] // cube vertex
            }, {
                input: [0, 200, 0] // cube vertex
            }, {
                input: [100, 100, 0] // bottom 
            }, {
                input: [100, 100, 10] // top
            }, {
                input: [100, 200, 5] // side
            }, {
                input: [100, 0, 5] // side
            }, {
                input: [200, 100, 5] // side
            }, {
                input: [0, 100, 5] // side
            }, 
        ]);
        var tests = [{
                input: [190, 180, 3.5]
            }, {
                input: [200, 0, 4]
            }, {
                input: [100, 0, 0]
            }, {
                input: [1, 1, 2]
            }, {
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
        var verbose = false;
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
            error.should.below(0.01);
        }
        //verbose && console.log("activate:", network.memoizeActivate.toString());
        verbose && console.log("elapsed:", new Date() - msStart);
        //verbose && console.log(network.weights);
    })
})
