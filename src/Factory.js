const mathjs = require("mathjs");
const Example = require("./Example");
const MapLayer = require("./MapLayer");
const Layer = require("./Layer");
const Sequential = require("./Sequential");
const Variable = require("./Variable");
const Network = require("./Network");

(function(exports) {

    class Factory {
        constructor(vars,options={}) {
            this.vars = vars;
            this.nIn = this.vars.length;
            this.nOut = options.nOut || this.nIn;
            if (this.nIn < this.nOut) {
                throw new Error("Factory cannot generate networks with more outputs than inputs");
            }
            this.power = options.power || 1;
            this.fourier = options.fourier || 0;
            this.tolerance = options.tolerance || 0.001;
            return this;
        }

        static fromJSON(json) {
            var json = typeof json === 'string' ? JSON.parse(json) : json;
            var obj = Network.fromJSON(json);
            return obj;
        }

        mapIdentity(iIn) {
            return new Function("eIn", "return  eIn[" +iIn+ "]");
        }

        mapPower(iIn,power) {
            var body = "return \"(\" + eIn[" +iIn+ "]+\"^" +power+ ")\"";
            return new Function("eIn", body);
        }

        mapSigmoid(iIn,scale) {
            var body = "return \"tanh(\" + eIn[" +iIn+ "]+\"*" +scale+ ")\"";
            return new Function("eIn", body);
        }

        mapFourier(iIn,n,freq,phase) {
            var mult = n === 1 ? freq : ("(" + n +"*"+freq+")");
            var body = "return \"(sin((\" + eIn[" +iIn+ "]+\"*" +mult+ "+" +phase+ ")))\"";
            return new Function("eIn", body);
        }

        createNetwork(options={}) {
            var nvars = this.vars.length;
            var fmap = options.fmap || this.vars.map((v,iv) => this.mapIdentity(iv));
            var power = options.power || this.power;
            var fourier = options.fourier || this.fourier;
            var mapWeights = Object.assign({}, options.mapWeights);
            for (var iv = 0; iv < nvars; iv++) {
                for (var iDeg = 2; iDeg <= power; iDeg++) {
                    fmap.push(this.mapPower(iv, iDeg)); // polynomial
                }
                for (var nFreq = 1; nFreq <= fourier; nFreq++) {
                    var w0xf = "w0x" + iv + "f";            // frequency weight
                    var w0xp = "w0x" + iv + "p" + nFreq;    // phase weight
                    mapWeights[w0xf] = 1;
                    mapWeights[w0xp] = 0;
                    fmap.push(this.mapFourier(iv, nFreq, w0xf, w0xp));
                }
            }

            var mapOpts = {
                weights: mapWeights,
            };
            var layers = options.layers || [
                new MapLayer(fmap,mapOpts),
                new Layer(this.nOut, {
                    activation: Layer.ACT_IDENTITY,
                }),
            ];
            var network = new Sequential(nvars, layers);

            var examples = this.createExamples(options);
            options.onExamples && options.onExamples(examples);
            network.normalizeInput(examples);

            network.initialize();
            network.compile();

            var preTrain = options.preTrain == null ? true : options.preTrain;
            if (preTrain) {
                var trainOpts = Object.assign({},options);
                var tolerance = trainOpts.tolerance || this.tolerance;
                trainOpts.targetCost = tolerance * tolerance / 4;
                var result = network.train(examples, trainOpts);
                options.onTrain && options.onTrain(result);
            }

            return network;
        } // createNetwork

        inverseNetwork(network, options={}) {
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
                power: this.power,
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
        } // inverseNetwork

        createExamples(options={}) {
            var power = options.power || this.power;
            var transform = options.transform || ((data) => data);
            var examples = [];
            var addExample = (data) => {
                examples.push( new Example(data, transform(data).slice(0, this.nOut)) );
            };
            addExample(this.vars.map((v) => v.min)); // normalization bound
            addExample(this.vars.map((v) => v.max)); // normalization bound

            if (options.outline == null || options.outline) {
                addExample(this.vars.map((v) => v.median));
                var addv = (thatv) => {
                    addExample(this.vars.map((v) => v === thatv ? v.min : v.max));
                    addExample(this.vars.map((v) => v === thatv ? v.max : v.min));
                    if (power > 1) {
                        addExample(this.vars.map((v) => v === thatv ? v.median : v.min));
                        addExample(this.vars.map((v) => v === thatv ? v.median : v.max));
                    }
                };
                this.vars.map((v,i) => addv(v));
            }

            if (options.nRandom) {
                for (var iR = 0; iR < options.nRandom; iR++) {
                    addExample(this.vars.map((v) => v.sample()));
                }
            }
            return examples;
        }

    } // class Factory

    module.exports = exports.Factory = Factory;
})(typeof exports === "object" ? exports : (exports = {}));

