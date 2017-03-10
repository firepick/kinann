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
        that.power = options.power || 1;
        that.fourier = options.fourier || 0;
        that.tolerance = options.tolerance || 0.001;
        return that;
    }

    Factory.prototype.mapIdentity = function(iIn) {
        var that = this;
        return new Function("eIn", "return  eIn[" +iIn+ "]");
    }
    Factory.prototype.mapPower = function(iIn,power) {
        var that = this;
        var body = "return \"(\" + eIn[" +iIn+ "]+\"^" +power+ ")\"";
        return new Function("eIn", body);
    }
    Factory.prototype.mapSigmoid = function(iIn,scale) {
        var that = this;
        var body = "return \"tanh(\" + eIn[" +iIn+ "]+\"*" +scale+ ")\"";
        return new Function("eIn", body);
    }
    Factory.prototype.mapFourier = function(iIn,n,freq,phase) {
        var that = this;
        var mult = n === 1 ? freq : ("(" + n +"*"+freq+")");
        var body = "return \"(sin((\" + eIn[" +iIn+ "]+\"*" +mult+ "+" +phase+ ")))\"";
        return new Function("eIn", body);
    }

    Factory.prototype.createNetwork = function(options={}) {
        var that = this;
        var nvars = that.vars.length;
        var fmap = options.fmap || that.vars.map((v,iv) => that.mapIdentity(iv));
        var power = options.power || that.power;
        var fourier = options.fourier || that.fourier;
        var mapWeights = Object.assign({}, options.mapWeights);
        for (var iv = 0; iv < nvars; iv++) {
            for (var iDeg = 2; iDeg <= power; iDeg++) {
                fmap.push(that.mapPower(iv, iDeg)); // polynomial
            }
            for (var nFreq = 1; nFreq <= fourier; nFreq++) {
                var w0xf = "w0x" + iv + "f";            // frequency weight
                var w0xp = "w0x" + iv + "p" + nFreq;    // phase weight
                mapWeights[w0xf] = 1;
                mapWeights[w0xp] = 0;
                fmap.push(that.mapFourier(iv, nFreq, w0xf, w0xp));
            }
        }

        var mapOpts = {
            weights: mapWeights,
        };
        var network = new Sequential(nvars, [
            new MapLayer(fmap,mapOpts),
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
            trainOpts.targetCost = tolerance * tolerance / 4;
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
            power: that.power,
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
        var nExamples = opts.nExamples || 150; 
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
        var power = options.power || that.power;
        var transform = options.transform || ((data) => data);
        var examples = [];
        function addExample (data) {
            examples.push( new Example(data, transform(data).slice(0, that.nOut)) );
        };
        addExample(that.vars.map((v) => v.min)); // normalization bound
        addExample(that.vars.map((v) => v.max)); // normalization bound

        if (options.outline == null || options.outline) {
            addExample(that.vars.map((v) => v.median));
            function addv(thatv) {
                addExample(that.vars.map((v) => v === thatv ? v.min : v.max));
                addExample(that.vars.map((v) => v === thatv ? v.max : v.min));
                if (power > 1) {
                    addExample(that.vars.map((v) => v === thatv ? v.median : v.min));
                    addExample(that.vars.map((v) => v === thatv ? v.median : v.max));
                }
            };
            that.vars.map((v,i) => addv(v));
        }

        if (options.nRandom) {
            for (var iR = 0; iR < options.nRandom; iR++) {
                addExample(that.vars.map((v) => v.sample()));
            }
        }
        return examples;
    }

    module.exports = exports.Factory = Factory;
})(typeof exports === "object" ? exports : (exports = {}));

