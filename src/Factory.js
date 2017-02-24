var mathjs = require("mathjs");
var Example = require("./Example");
var MapLayer = require("./MapLayer");
var Layer = require("./Layer");
var Sequential = require("./Sequential");
var Variable = require("./Variable");

(function(exports) {

    ////////////////// constructor
    function Factory(vars,options={}) {
        var that = this;
        that.vars = vars;
        that.nIn = that.vars.length;
        that.nOut = options.nOut || that.nIn;
        if (that.nIn < that.nOut) {
            throw new Error("Factory cannot generate networks with more outputs than inputs");
        }
        that.degree = options.degree || 1;
        that.tolerance = options.tolerance || 0.001;
        return that;
    }

    Factory.prototype.createNetwork = function(options={}) {
        var that = this;
        var nvars = that.vars.length;
        var fmap = that.vars.map((v,i) => (eIn) => eIn[i]);
        var degree = options.degree || that.degree;
        for (var i = 1; i < degree; i++) {
            let iDeg = i+1; // inner scope 
            var fpoly = that.vars.map((v,i) => (eIn) => "(" + eIn[i] + "^" + iDeg + ")");
            fmap = fmap.concat(fpoly);
        }

        var network = new Sequential(nvars, [
            new MapLayer(fmap),
            new Layer(that.nOut, {
                activation: Layer.ACT_IDENTITY,
            }),
        ]);

        var examples = that.createExamples(options);
        options.onExamples && options.onExamples(examples);
        network.normalizeInput(examples);

        network.initialize();
        network.compile();

        var preTrain = options.preTrain == null ? true : options.preTrain;
        if (preTrain) {
            var trainOpts = Object.assign({},options);
            var tolerance = trainOpts.tolerance || that.tolerance;
            trainOpts.minCost = tolerance * tolerance / 2;
            var result = network.train(examples, trainOpts);
            options.onTrain && options.onTrain(result);
        }

        return network;
    }
    Factory.prototype.inverseNetwork = function(network, options={}) {
        var that = this;
        var opts = Object.assign({}, options); 
        var inStats = network.inStats;
        if (inStats == null) {
            throw new Error("only normalized networks are invertible");
        }
        var minInput = inStats.map((stats) => stats.min);
        var minOutput = network.activate(minInput);
        var maxInput = inStats.map((stats) => stats.max);
        var maxOutput = network.activate(maxInput);

        var vars = inStats.map((stats,i) => new Variable([minOutput[i], maxOutput[i]]) );

        var invFactory = new Factory(vars, {
            degree: that.degree,
        });
        var invNetwork = invFactory.createNetwork({
            preTrain: false,
        });

        var invExamples = [];
        invExamples.push(new Example(minOutput, minInput)); // boundary
        invExamples.push(new Example(maxOutput, maxInput)); // boundary
        invNetwork.initialize();
        invNetwork.compile();
        invNetwork.normalizeInput(invExamples);
        
        // add enough training examples to ensure accuracy 
        var nExamples = opts.nExamples || 90; 
        for (var iEx = 0; iEx < nExamples; iEx++) {
            var target = inStats.map((stats) => 
                mathjs.random( 
                    mathjs.min(stats.min, stats.max),
                    mathjs.max(stats.min, stats.max)
            ));
            invExamples.push(new Example(network.activate(target),target));
        }
        options.onExamples && options.onExamples(invExamples);

        var result = invNetwork.train(invExamples, opts);
        opts.onTrain && opts.onTrain(result);
        return invNetwork;
    }
    Factory.prototype.createExamples = function(options={}) {
        var that = this;
        var degree = options.degree || that.degree;
        var transform = options.transform || ((data) => data);
        var examples = [];
        function addExample (data) {
            examples.push( new Example(data, transform(data).slice(0, that.nOut)) );
        };
        addExample(that.vars.map((v) => v.min));
        addExample(that.vars.map((v) => v.max));
        addExample(that.vars.map((v) => v.median));
        function addv(thatv) {
            addExample(that.vars.map((v) => v === thatv ? v.min : v.max));
            addExample(that.vars.map((v) => v === thatv ? v.max : v.min));
            if (degree > 1) {
                addExample(that.vars.map((v) => v === thatv ? v.median : v.min));
                addExample(that.vars.map((v) => v === thatv ? v.median : v.max));
            }
            
        };
        that.vars.map((v,i) => addv(v));
        return examples;
    }

    module.exports = exports.Factory = Factory;
})(typeof exports === "object" ? exports : (exports = {}));

