var should = require("should");

var core = require('mathjs/core');
var mathjs = core.create();
//mathjs.import(require('mathjs/lib/type/matrix/Matrix'));
//mathjs.import(require('mathjs/lib/type/matrix/DenseMatrix'));
//mathjs.import(require('mathjs/lib/function/arithmetic/add'));
//mathjs.import(require('mathjs/lib/function/arithmetic/subtract'));
//mathjs.import(require('mathjs/lib/function/arithmetic/multiply'));
//mathjs.import(require('mathjs/lib/function/matrix/inv'));
//mathjs.import(require('mathjs/lib/function/matrix/transpose'));
//mathjs.import(require('mathjs/lib/function/matrix/det'));
//mathjs.import(require('mathjs/lib/function/matrix/eye'));
mathjs.import(require('mathjs/lib/type/fraction'));
mathjs.import(require('mathjs/lib/type/complex'));
//mathjs.import(require('mathjs/lib/type'));
//mathjs.import(require('mathjs/lib/function'));
//mathjs.import(require('mathjs/lib/function/utils'));
mathjs.import(require('mathjs/lib/function/algebra'));
mathjs.import(require('mathjs/lib/function/trigonometry'));
mathjs.import(require('mathjs/lib/function/arithmetic'));
//mathjs.import(require('mathjs/lib/function/bitwise'));
//mathjs.import(require('mathjs/lib/function/combinatorics'));
mathjs.import(require('mathjs/lib/function/complex'));
//mathjs.import(require('mathjs/lib/function/geometry'));
//mathjs.import(require('mathjs/lib/function/logical'));
//mathjs.import(require('mathjs/lib/function/matrix'));
mathjs.import(require('mathjs/lib/function/probability'));
//mathjs.import(require('mathjs/lib/function/relational'));
//mathjs.import(require('mathjs/lib/function/special'));
//mathjs.import(require('mathjs/lib/function/statistics'));
//mathjs.import(require('mathjs/lib/function/string'));
//mathjs.import(require('mathjs/lib/function/unit'));
mathjs.import(require('mathjs/lib/expression'));
mathjs.import(require('mathjs/lib/constants'));
//mathjs  = require("mathjs");

var Kinann = require("../index");
var Factory = Kinann.Factory;
var Example = Kinann.Example;

(typeof describe === 'function') && describe("Factory", function() {
    function vassertEqual(vactual, vexpected, tol=.001) {
        vactual.map((xa,i) => xa.should.approximately(vexpected[i], tol));
    }
    it("asdf", function() {
        function testbundle() {
            var root = mathjs.derivative("exp(-x)","x");
            console.log(root.toString());
        }

        testbundle();
        should(1).equal(1);
    })
    it("Train Kinann network to correct Y-axis skew", function() {
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
        vassertEqual(measuredNet.activate([0,0,0,0]), [0,0,0,0]);
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
