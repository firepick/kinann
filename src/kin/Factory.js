var mathjs = require("mathjs");
var Kinann = require("../../index");

(function(exports) {
    ////////////////// constructor
    function Factory(axes,options={}) {
        var that = this;
        that.axes = axes;
        that.degree = options.degree || 1;
        that.tolerance = options.tolerance || 0.001;
        that.examples = that.createExamples(options);
        return that;
    }

    Factory.prototype.createNetwork = function(options={}) {
        var that = this;
        var nAxes = that.axes.length;
        var fmap = that.axes.map((axis,i) => (eIn) => eIn[i]);
        var degree = options.degree || that.degree;
        for (var i = 1; i < degree; i++) {
            let iDeg = i+1; // inner scope 
            var fpoly = that.axes.map((axis,i) => (eIn) => "(" + eIn[i] + "^" + iDeg + ")");
            fmap = fmap.concat(fpoly);
        }

        var network = new Kinann.Sequential(nAxes, [
            new Kinann.MapLayer(fmap),
            new Kinann.Layer(nAxes, {
                activation: Kinann.Layer.ACT_IDENTITY,
            }),
        ]);

        network.normalizeInput(that.examples);

        network.initialize();
        network.compile();

        var preTrain = options.preTrain == null ? true : options.preTrain;
        if (preTrain) {
            var trainOpts = Object.assign({},options);
            var tolerance = trainOpts.tolerance || that.tolerance;
            trainOpts.minCost = tolerance * tolerance / 2;
            var result = network.train(that.examples, trainOpts);
            options.onResult && options.onResult(result);
        }

        return network;
    }
    Factory.prototype.createExamples = function(options={}) {
        var that = this;
        var degree = options.degree || that.degree;
        var examples = [];
        function addExample (data) {
            examples.push( { input:data, target:data } );
        };
        addExample(that.axes.map((axis) => axis.minPos));
        addExample(that.axes.map((axis) => axis.maxPos));
        addExample(that.axes.map((axis) => (axis.maxPos+axis.minPos)/2));
        function addAxis(thatAxis) {
            addExample(that.axes.map((axis) => axis === thatAxis ? axis.minPos : axis.maxPos));
            addExample(that.axes.map((axis) => axis === thatAxis ? axis.maxPos : axis.minPos));
            if (degree > 1) {
                addExample(that.axes.map((axis) => axis === thatAxis ? (axis.maxPos+axis.minPos)/2 : axis.minPos));
                addExample(that.axes.map((axis) => axis === thatAxis ? (axis.maxPos+axis.minPos)/2 : axis.maxPos));
            }
        };
        that.axes.map((axis,i) => addAxis(axis));
        return examples;
    }

    module.exports = exports.Factory = Factory;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Factory", function() {
    var should = require("should");
    var Factory = exports.Factory;
    var testAxes = [
        {minPos: 3, maxPos: 300},
        {minPos: 2, maxPos: 200},
        {minPos: 1, maxPos: 10},
    ];
    
    it("Factory(axes, options) creates Factory kinmatic model", function() {
        var c3 = new Factory(testAxes);
        should.deepEqual(c3.axes, testAxes);
    })
    it("examples returns pre-training examples", function() {
        var c3 = new Factory(testAxes);
        should.deepEqual(c3.createExamples(), [
            { input:[3,2,1], target:[3,2,1] }, // minPos
            { input:[300,200,10], target:[300,200,10] }, // maxPos
            { input:[303/2,202/2,11/2], target:[303/2,202/2,11/2] }, // middle pos
            { input:[3,200,10], target:[3,200,10] }, // maxPos neighbor
            { input:[300,2,1], target:[300,2,1] }, // minPos neighbor
            { input:[300,2,10], target:[300,2,10] }, // maxPos neighbor
            { input:[3,200,1], target:[3,200,1] }, // minPos neighbor
            { input:[300,200,1], target:[300,200,1] }, // maxPos neighbor
            { input:[3,2,10], target:[3,2,10] }, // minPos neighbor
        ]);
    });
    it("createExamples(options?) creates training examples", function() {
        var c3 = new Factory(testAxes);
        should.deepEqual(c3.createExamples(), c3.examples);
    })
    it("createNetwork() can create a linear Kinann neural network", function() {
        this.timeout(60*1000);
        var c3 = new Factory(testAxes);
        var network = c3.createNetwork({ degree: 1, preTrain: false });

        network.nIn.should.equal(3);
        network.nOut.should.equal(3);
        network.layers.length.should.equal(2);
        should.deepEqual(network.layers[0].expressions(["x0","x1","x2"]), [
            "x0", // linear feed-forward inputs
            "x1", // linear feed-forward inputs
            "x2", // linear feed-forward inputs
        ]);

        network.fNormIn[0](3).should.equal(-1);
        network.fNormIn[0](300).should.equal(1);
        network.fNormIn[1](2).should.equal(-1);
        network.fNormIn[1](200).should.equal(1);
        network.fNormIn[2](1).should.equal(-1);
        network.fNormIn[2](10).should.equal(1);
    })
    it("createNetwork() returns training results", function() {
        this.timeout(60*1000);
        var c3 = new Factory(testAxes);
        var result = {}
        var network = c3.createNetwork({
            onResult: (r) => (result = r),
        });
        result.minCost.should.equal(0.0000005); // cost = (tolerance ^ 2)/2
        result.epochs.should.below(100); // training should converge quickly
        result.learningRate.should.below(0.5); // learningRate is typically ~0.15
    })
    it("createNetwork(options) can create a polynomial Kinann neural network", function() {
        this.timeout(60*1000);
        var c3 = new Factory(testAxes);
        var network = c3.createNetwork({ 
            degree: 3, // cubic polynomial
            preTrain: false,
        });

        network.nOut.should.equal(3);
        network.layers[0].nOut.should.equal(9); 
        network.layers.length.should.equal(2);
        should.deepEqual(network.layers[0].expressions(["x0","x1","x2"]), [
            "x0", // linear feed-forward inputs
            "x1", // linear feed-forward inputs
            "x2", // linear feed-forward inputs
            "(x0^2)", // polynomial feed-forward inputs
            "(x1^2)", // polynomial feed-forward inputs
            "(x2^2)", // polynomial feed-forward inputs
            "(x0^3)", // polynomial feed-forward inputs
            "(x1^3)", // polynomial feed-forward inputs
            "(x2^3)", // polynomial feed-forward inputs
        ]);
    })
    it("pre-trained quadratic Kinann neural network is accurate to +/-0.001", function() {
        this.timeout(60*1000);

        var xyza = [
            {minPos: 0, maxPos: 300}, // x-axis
            {minPos: 0, maxPos: 200}, // y-axis
            {minPos: 0, maxPos: 10}, // z-axis
            {minPos: 0, maxPos: 360}, // a-axis
        ];
        var c4 = new Factory(xyza, {degree: 2});
        var network = c4.createNetwork(); 

        var tolerance = 0.001;
        function testCoord(coord) {
            var output = network.activate(coord);
            output.map((y,i) => y.should.approximately(coord[i], tolerance));
        }
        testCoord([0,0,0,0]);
        testCoord([300,200,10,360]);
        testCoord([10,20,5,270]);
        testCoord([75,50,5,45]);
        testCoord([277,75,8,190]);
    })
    it("pre-trained linear Kinann neural network is accurate to +/-0.001", function() {
        this.timeout(60*1000);

        var xyza = [
            {minPos: 0, maxPos: 300}, // x-axis
            {minPos: 0, maxPos: 200}, // y-axis
            {minPos: 0, maxPos: 10}, // z-axis
            {minPos: 0, maxPos: 360}, // a-axis
        ];
        var c4 = new Factory(xyza);
        var network = c4.createNetwork(); 

        var tolerance = 0.001;
        function testCoord(coord) {
            var output = network.activate(coord);
            output.map((y,i) => y.should.approximately(coord[i], tolerance));
        }
        testCoord([0,0,0,0]);
        testCoord([300,200,10,360]);
        testCoord([10,20,5,270]);
        testCoord([75,50,5,45]);
        testCoord([277,75,8,190]);
    })
})
