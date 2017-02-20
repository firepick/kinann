var mathjs = require("mathjs");
var Kinann = require("../index");

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Factory", function() {
    var should = require("should");
    var Factory = Kinann.Factory;
    var Example = Kinann.Example;
    var testAxes = [
        {minPos: 3, maxPos: 300},
        {minPos: 2, maxPos: 200},
        {minPos: 1, maxPos: 10},
    ];
    function vassertEqual(vactual, vexpected, tol=.001) {
        vactual.map((xa,i) => xa.should.approximately(vexpected[i], tol));
    }
    
    it("Factory(axes, options) creates Factory kinmatic model", function() {
        var factory = new Factory(testAxes);
        should.deepEqual(factory.axes, testAxes);
    })
    it("examples returns pre-training examples", function() {
        var factory = new Factory(testAxes);
        should.deepEqual(factory.createExamples(), [
            new Example([3,2,1], [3,2,1]), // minPos
            new Example([300,200,10], [300,200,10]), // maxPos
            new Example([303/2,202/2,11/2], [303/2,202/2,11/2]), // middle pos
            new Example([3,200,10], [3,200,10]), // maxPos neighbor
            new Example([300,2,1], [300,2,1]), // minPos neighbor
            new Example([300,2,10], [300,2,10]), // maxPos neighbor
            new Example([3,200,1], [3,200,1]), // minPos neighbor
            new Example([300,200,1], [300,200,1]), // maxPos neighbor
            new Example([3,2,10], [3,2,10]), // minPos neighbor
        ]);
    });
    it("TESTTESTcreateExamples(options?) creates training examples", function() {
        var factory = new Factory(testAxes);
        function testExamples(examples, f, tol=.001) {
            examples.map((ex) => {
                ex.target.map((x,i) => x.should.approximately(f(ex.input[i]), tol));
            });
            examples.length.should.equal(9);
        }
        testExamples(factory.createExamples(), (x) => x); // default is identity
        testExamples(factory.createExamples({transform:(data)=>data}), (x) => x); // transform is identity
        testExamples(factory.createExamples({transform:(data)=>data.map((x) => 2*x)}), (x) => 2*x); // transform is scale by 2
        testExamples(factory.createExamples({transform:(data)=>data.map((x) => -x)}), (x) => -x); // transform is negative
    })
    it("TESTTESTcreateNetwork() can create a linear Kinann neural network for identity transform", function() {
        this.timeout(60*1000);
        var factory = new Factory(testAxes);
        var network = factory.createNetwork({ degree: 1 });

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
        vassertEqual(network.activate([300,200,10]), [300,200,10]);
        vassertEqual(network.activate([3,2,1]), [3,2,1]);
    })
    it("TESTTESTcreateNetwork() can create a linear Kinann neural network for negative transform", function() {
        this.timeout(60*1000);
        var factory = new Factory(testAxes);
        var network = factory.createNetwork({ 
            transform: (data) => data.map((x) => -x) 
        });
        vassertEqual(network.activate([300,200,10]), [-300,-200,-10]);
    })
    it("createNetwork() returns training results", function() {
        this.timeout(60*1000);
        var factory = new Factory(testAxes);
        var result = {}
        var network = factory.createNetwork({
            onTrain: (r) => (result = r),
        });
        result.minCost.should.equal(0.0000005); // cost = (tolerance ^ 2)/2
        result.epochs.should.below(100); // training should converge quickly
        result.learningRate.should.below(0.5); // learningRate is typically ~0.15
    })
    it("createNetwork(options) can create a polynomial Kinann neural network", function() {
        this.timeout(60*1000);
        var factory = new Factory(testAxes);
        var network = factory.createNetwork({ 
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
        var factory = new Factory(xyza, {degree: 2});
        var network = factory.createNetwork(); 

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
        var factory = new Factory(xyza);
        var network = factory.createNetwork(); 

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
    it("TESTTESTinverseNetwork(network) returns inverse of network for invertible function", function() {
        this.timeout(60*1000);
        var factory = new Factory(testAxes);
        var network = factory.createNetwork({ // original network adds 1
            transform: (data) => data.map((x) => 1+x)  // output = input + 1
        });

        var result;
        var examples;
        var invNetwork = factory.inverseNetwork(network, { // inverse network should subtract 1
            onTrain: (r) => (result = r),
            onExamples: (eg) => (examples = eg),
        });

        result.epochs.should.below(100); // convergence
        examples.length.should.equal(82);
        vassertEqual(invNetwork.activate([4,3,2]), [3,2,1]);
        vassertEqual(invNetwork.activate([301,201,11]), [300,200,10]);
        vassertEqual(invNetwork.activate([43,27,9]), [42,26,8]);
        vassertEqual(invNetwork.activate([275,17,2]), [274,16,1]);
    })
    it("TESTTESTTrain Kinann network to correct XY skew", function() {
        this.timeout(60*1000);

        var xyza = [
            {minPos: 0, maxPos: 300}, // x-axis
            {minPos: 0, maxPos: 200}, // y-axis
            {minPos: 0, maxPos: 10}, // z-axis
            {minPos: 0, maxPos: 360}, // a-axis
        ];
        var factory = new Factory(xyza);

        // calibration requires a network trained to model actual machine positions
        var measuredNet = factory.createNetwork({
            transform: (expected) => { // return measured position
                var yskew = 30;
                return [ // simulate measurement of machine with 30-degree y-skew
                    expected[0] + expected[1] * mathjs.sin(yskew * mathjs.PI/180), // x
                    expected[1] * mathjs.cos(yskew * mathjs.PI/180), // y
                    expected[2], // z
                    expected[3], // a
                ]
            }
        });
        vassertEqual(measuredNet.activate([0,0,0]), [0,0,0,0]);
        vassertEqual(measuredNet.activate([300,200,10,360]), [400,173.205,10,360]);
        vassertEqual(measuredNet.activate([10,10,10,10]), [15,8.66,10,10]);

        // the calibrated network is the inverse of the measured network
        var calibratedNet = factory.inverseNetwork(measuredNet);
        vassertEqual(calibratedNet.activate([300,200,10,360]), [184.530,230.94,10,360]);
        vassertEqual(calibratedNet.activate([10,10,10,10]), [4.227,11.547,10,10]);
        vassertEqual(measuredNet.activate(calibratedNet.activate([0,0,0,0])), [0,0,0,0]);
        vassertEqual(measuredNet.activate(calibratedNet.activate([300,200,10,0])), [300,200,10,0]);
    })
})
